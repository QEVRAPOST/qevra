import assert from "node:assert/strict";
import { test } from "node:test";
import { Pool } from "pg";
import { privateKeyToAccount } from "viem/accounts";
import { createSession, hashRateLimitKey } from "@/features/security/auth";
import { getResearchStore } from "@/features/security/store";
import { POST as createWalletChallenge } from "@/app/api/auth/user/challenge/route";
import { GET as getOperatorSession } from "@/app/api/auth/session/route";
import {
  DELETE as logoutWalletUser,
  GET as getWalletUserSession,
  POST as completeWalletSignIn,
} from "@/app/api/auth/user/session/route";
import { GET as getCapabilities } from "@/app/api/security/capabilities/route";
import { POST as createResearchRun } from "@/app/api/security/runs/route";
import { GET as listResearchRuns } from "@/app/api/security/runs/route";
import { GET as getResearchRun } from "@/app/api/security/runs/[id]/route";
import { createUserSession, USER_SESSION_COOKIE } from "@/features/security/wallet-auth";

const origin = "http://localhost:3113";
const fakeDatabaseUrl = "postgres://mock.invalid/veyra";

test("wallet EIP-191 API restores the user session, scopes history, reports readiness, and logs out independently", async () => {
  const keys = [
    "DATABASE_URL",
    "NODE_ENV",
    "QEVRA_ACCESS_TOKEN",
    "QEVRA_SESSION_SECRET",
    "QEVRA_AI_API_KEY",
    "QEVRA_AI_MODEL",
    "QEVRA_AI_BILLING_APPROVED",
    "VEYRA_USER_SESSION_SECRET",
    "VEYRA_AUTH_ORIGIN",
    "QEVRA_RESEARCH_RUN_OWNER_ALLOWLIST",
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<(typeof keys)[number], string | undefined>;
  const originalQuery = Pool.prototype.query;
  const wallet = privateKeyToAccount(`0x${"4".repeat(64)}`);
  const operatorToken = "test-only-operator-access-token-not-a-secret";
  const operatorSessionSecret = "test-only-operator-session-secret-0123456789";
  const userSessionSecret = "test-only-wallet-session-secret-0123456789";
  let challenge: { nonceHash: string; wallet_address: string; chain_id: number; message: string; expires_at: Date } | undefined;
  let consumed = false;
  let liveWorkers = 1;
  const savedRuns = new Map<string, { ownerId: string; data: { id: string; createdAt: string; [key: string]: unknown } }>();
  const rateLimitCounts = new Map<string, number>();
  const statements: Array<{ sql: string; values?: unknown[] }> = [];

  process.env.DATABASE_URL = fakeDatabaseUrl;
  Reflect.set(process.env, "NODE_ENV", "test");
  process.env.QEVRA_ACCESS_TOKEN = operatorToken;
  process.env.QEVRA_SESSION_SECRET = operatorSessionSecret;
  process.env.QEVRA_AI_API_KEY = "test-only-provider-key";
  process.env.QEVRA_AI_MODEL = "test-only-model";
  process.env.QEVRA_AI_BILLING_APPROVED = "false";
  process.env.VEYRA_USER_SESSION_SECRET = userSessionSecret;
  process.env.VEYRA_AUTH_ORIGIN = origin;

  (Pool.prototype as unknown as {
    query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  }).query = async function (sql: string, values?: unknown[]) {
    statements.push({ sql, values });
    if (sql.includes("INSERT INTO qevra_rate_limits")) {
      const key = String(values?.[0]);
      const requestCount = (rateLimitCounts.get(key) ?? 0) + 1;
      rateLimitCounts.set(key, requestCount);
      return { rows: [{ request_count: requestCount }], rowCount: 1 };
    }
    if (sql.includes("SELECT count(*)::text AS count FROM qevra_security_workers")) return { rows: [{ count: String(liveWorkers) }], rowCount: 1 };
    if (sql.includes("INSERT INTO veyra_user_auth_challenges")) {
      challenge = {
        nonceHash: String(values?.[0]),
        wallet_address: String(values?.[1]),
        chain_id: Number(values?.[2]),
        message: String(values?.[3]),
        expires_at: new Date(String(values?.[4])),
      };
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("SELECT nonce_hash, wallet_address, chain_id, message, expires_at")) {
      return challenge && values?.[0] === challenge.nonceHash && challenge.expires_at.getTime() > Date.now()
        ? { rows: [{ nonce_hash: challenge.nonceHash, ...challenge }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (sql.includes("DELETE FROM veyra_user_auth_challenges")) {
      if (!challenge || consumed || values?.[0] !== challenge.nonceHash || challenge.expires_at.getTime() <= Date.now()) {
        return { rows: [], rowCount: 0 };
      }
      consumed = true;
      return { rows: [{ nonce_hash: challenge.nonceHash }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO qevra_research_runs")) {
      const data = JSON.parse(String(values?.[6])) as { id: string; createdAt: string; [key: string]: unknown };
      savedRuns.set(data.id, { ownerId: String(values?.[5]), data });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("SELECT data FROM qevra_research_runs WHERE id = $1 AND owner_id = $2")) {
      const saved = savedRuns.get(String(values?.[0]));
      return saved && saved.ownerId === values?.[1] ? { rows: [{ data: saved.data }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (sql.includes("SELECT data, created_at, id FROM qevra_research_runs")) {
      const ownerId = String(values?.[0]);
      const rows = [...savedRuns.values()]
        .filter((saved) => saved.ownerId === ownerId)
        .map((saved) => ({ data: saved.data, created_at: new Date(saved.data.createdAt), id: saved.data.id }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("FROM qevra_research_runs")) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 1 };
  } as typeof Pool.prototype.query;

  const store = getResearchStore();
  try {
    const signedOut = await getWalletUserSession(new Request(`${origin}/api/auth/user/session`));
    assert.deepEqual(await signedOut.json(), { configured: true, authenticated: false });

    const challengeResponse = await createWalletChallenge(new Request(`${origin}/api/auth/user/challenge`, {
      method: "POST",
      headers: { origin, host: "localhost:3113", "content-type": "application/json" },
      body: JSON.stringify({ networkId: "testnet", address: wallet.address }),
    }));
    assert.equal(challengeResponse.status, 200);
    const loginChallenge = await challengeResponse.json() as { nonce: string; message: string; expiresAt: string };
    assert.match(loginChallenge.nonce, /^[a-f0-9]{32}$/i);
    assert.match(loginChallenge.message, /Chain ID: 46630/);
    assert.ok(Date.parse(loginChallenge.expiresAt) > Date.now());
    assert.ok(Date.parse(loginChallenge.expiresAt) <= Date.now() + 5 * 60_000);

    // This fixture key is local to the test process; no injected owner wallet or funds are involved.
    const signature = await wallet.signMessage({ message: loginChallenge.message });
    const loginResponse = await completeWalletSignIn(new Request(`${origin}/api/auth/user/session`, {
      method: "POST",
      headers: { origin, host: "localhost:3113", "content-type": "application/json" },
      body: JSON.stringify({ address: wallet.address, nonce: loginChallenge.nonce, signature }),
    }));
    assert.equal(loginResponse.status, 200);
    const setCookie = loginResponse.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /veyra_user_session=/);
    assert.match(setCookie, /httponly/i);
    assert.match(setCookie, /samesite=strict/i);
    assert.doesNotMatch(setCookie, /qevra_session=/);
    const walletCookie = setCookie.split(";")[0]!;

    const restored = await getWalletUserSession(new Request(`${origin}/api/auth/user/session`, {
      headers: { cookie: walletCookie },
    }));
    const restoredBody = await restored.json() as { configured: boolean; authenticated: boolean; address?: string; expiresAt?: string };
    assert.equal(restoredBody.authenticated, true);
    assert.equal(restoredBody.address?.toLowerCase(), wallet.address.toLowerCase());
    assert.ok(Date.parse(restoredBody.expiresAt ?? "") > Date.now());

    const capabilitiesResponse = await getCapabilities(new Request(`${origin}/api/security/capabilities`, {
      headers: { cookie: walletCookie },
    }));
    assert.equal(capabilitiesResponse.status, 200);
    const capabilities = await capabilitiesResponse.json() as {
      provider: string;
      authentication: string;
      billing: string;
      persistence: string;
      worker: string;
      unavailableReason?: string;
    };
    assert.equal(capabilities.authentication, "available");
    assert.equal(capabilities.billing, "not_configured");
    assert.equal(capabilities.provider, "not_configured");
    assert.equal(capabilities.unavailableReason, "ai_billing_not_approved");
    assert.equal(capabilities.persistence, "available");
    assert.equal(capabilities.worker, "available");

    const historyResponse = await listResearchRuns(new Request(`${origin}/api/security/runs?limit=20`, {
      headers: { cookie: walletCookie },
    }));
    assert.ok(historyResponse);
    assert.equal(historyResponse.status, 200);
    assert.ok(statements.some(({ sql, values }) => sql.includes("WHERE owner_id = $1")
      && values?.[0] === wallet.address.toLowerCase()));

    const runRequest = () => new Request(`${origin}/api/security/runs`, {
      method: "POST",
      headers: { origin, host: "localhost:3113", cookie: walletCookie, "content-type": "application/json" },
      body: JSON.stringify({ topicId: "security-evidence" }),
    });

    delete process.env.QEVRA_RESEARCH_RUN_OWNER_ALLOWLIST;
    const ownerRestrictionMissing = await createResearchRun(runRequest());
    if (!ownerRestrictionMissing) throw new Error("missing owner allowlist should return a response");
    assert.equal(ownerRestrictionMissing.status, 503);
    assert.equal((await ownerRestrictionMissing.json() as { error: { code: string } }).error.code, "research_run_owner_allowlist_not_configured");
    assert.equal(rateLimitCounts.get(hashRateLimitKey(`create-run:${wallet.address.toLowerCase()}`)) ?? 0, 0);

    process.env.QEVRA_RESEARCH_RUN_OWNER_ALLOWLIST = `${wallet.address},not-an-address`;
    const invalidOwnerRestriction = await createResearchRun(runRequest());
    if (!invalidOwnerRestriction) throw new Error("invalid owner allowlist should return a response");
    assert.equal(invalidOwnerRestriction.status, 503);
    assert.equal((await invalidOwnerRestriction.json() as { error: { code: string } }).error.code, "research_run_owner_allowlist_not_configured");

    process.env.QEVRA_RESEARCH_RUN_OWNER_ALLOWLIST = wallet.address;
    const otherWallet = createUserSession("0x0000000000000000000000000000000000000002");
    assert.ok(otherWallet);
    const unauthorizedWallet = await createResearchRun(new Request(`${origin}/api/security/runs`, {
      method: "POST",
      headers: { origin, host: "localhost:3113", cookie: `${USER_SESSION_COOKIE}=${otherWallet.value}`, "content-type": "application/json" },
      body: JSON.stringify({ topicId: "security-evidence", ownerAddress: wallet.address }),
    }));
    if (!unauthorizedWallet) throw new Error("unauthorized wallet should return a response");
    assert.equal(unauthorizedWallet.status, 403);
    assert.equal((await unauthorizedWallet.json() as { error: { code: string } }).error.code, "research_run_wallet_not_allowed");
    assert.equal(rateLimitCounts.get(hashRateLimitKey(`create-run:${otherWallet.address.toLowerCase()}`)) ?? 0, 0);

    const operatorSession = createSession();
    assert.ok(operatorSession);
    const operatorBypass = await createResearchRun(new Request(`${origin}/api/security/runs`, {
      method: "POST",
      headers: { origin, host: "localhost:3113", cookie: `qevra_session=${operatorSession.value}`, "content-type": "application/json" },
      body: JSON.stringify({ topicId: "security-evidence", ownerAddress: wallet.address }),
    }));
    if (!operatorBypass) throw new Error("operator run request should return a response");
    assert.equal(operatorBypass.status, 403);
    assert.equal((await operatorBypass.json() as { error: { code: string } }).error.code, "wallet_authentication_required");
    assert.equal([...savedRuns.values()].length, 0);

    const billingBlocked = await createResearchRun(runRequest());
    if (!billingBlocked) throw new Error("billing gate should return a response");
    assert.equal(billingBlocked.status, 503);
    const billingError = await billingBlocked.json() as { error: { code: string; message: string } };
    assert.equal(billingError.error.code, "ai_billing_not_approved");
    assert.match(billingError.error.message, /QEVRA_AI_BILLING_APPROVED=true/);
    assert.equal(rateLimitCounts.get(hashRateLimitKey(`create-run:${wallet.address.toLowerCase()}`)) ?? 0, 0);
    assert.equal(statements.some(({ sql }) => sql.includes("INSERT INTO qevra_research_runs")), false);

    process.env.QEVRA_AI_BILLING_APPROVED = "true";
    liveWorkers = 0;
    const workerBlocked = await createResearchRun(runRequest());
    if (!workerBlocked) throw new Error("worker gate should return a response");
    assert.equal(workerBlocked.status, 503);
    const workerError = await workerBlocked.json() as { error: { code: string; message: string } };
    assert.equal(workerError.error.code, "security_worker_not_running");
    assert.match(workerError.error.message, /bun --env-file=\.qevra-data\/phase2\.env run security:worker/);
    assert.equal(rateLimitCounts.get(hashRateLimitKey(`create-run:${wallet.address.toLowerCase()}`)) ?? 0, 0);
    assert.equal(statements.some(({ sql }) => sql.includes("INSERT INTO qevra_research_runs")), false);

    liveWorkers = 1;
    const duplicateResponses = await Promise.all([
      createResearchRun(runRequest()),
      createResearchRun(runRequest()),
    ]);
    const availableRun = duplicateResponses.find((response) => response?.status === 202);
    const duplicateRun = duplicateResponses.find((response) => response?.status === 429);
    assert.ok(availableRun, "one authenticated owner submission should be queued");
    assert.ok(duplicateRun, "a concurrent duplicate owner submission should be rate limited");
    assert.equal(availableRun.status, 202);
    const createdRun = await availableRun.json() as { run: { id: string; status: string } };
    assert.equal(createdRun.run.status, "queued");
    assert.equal(duplicateRun.status, 429);
    assert.equal((await duplicateRun.json() as { error: { code: string } }).error.code, "rate_limit_exceeded");
    assert.equal(statements.filter(({ sql }) => sql.includes("INSERT INTO qevra_research_runs")).length, 1);
    assert.equal(savedRuns.size, 1);

    const ownedDetail = await getResearchRun(new Request(`${origin}/api/security/runs/${createdRun.run.id}`, {
      headers: { cookie: walletCookie },
    }), { params: Promise.resolve({ id: createdRun.run.id }) });
    if (!ownedDetail) throw new Error("owned research run should return a response");
    assert.equal(ownedDetail.status, 200);
    assert.equal((await ownedDetail.json() as { run: { id: string } }).run.id, createdRun.run.id);

    const foreignDetail = await getResearchRun(new Request(`${origin}/api/security/runs/${createdRun.run.id}`, {
      headers: { cookie: `${USER_SESSION_COOKIE}=${otherWallet.value}` },
    }), { params: Promise.resolve({ id: createdRun.run.id }) });
    if (!foreignDetail) throw new Error("foreign wallet lookup should return a response");
    assert.equal(foreignDetail.status, 404);
    assert.equal((await foreignDetail.json() as { error: { code: string } }).error.code, "run_not_found");

    const replay = await completeWalletSignIn(new Request(`${origin}/api/auth/user/session`, {
      method: "POST",
      headers: { origin, host: "localhost:3113", "content-type": "application/json" },
      body: JSON.stringify({ address: wallet.address, nonce: loginChallenge.nonce, signature }),
    }));
    assert.equal(replay.status, 401);
    assert.equal((await replay.json() as { error: { code: string } }).error.code, "wallet_challenge_consumed");

    const logoutResponse = await logoutWalletUser(new Request(`${origin}/api/auth/user/session`, {
      method: "DELETE",
      headers: { origin, host: "localhost:3113", cookie: `${walletCookie}; qevra_session=${operatorSession.value}` },
    }));
    assert.equal(logoutResponse.status, 200);
    const clearedCookie = logoutResponse.headers.get("set-cookie") ?? "";
    assert.match(clearedCookie, /veyra_user_session=/);
    assert.match(clearedCookie, /max-age=0/i);
    assert.doesNotMatch(clearedCookie, /qevra_session=/);

    const operatorStatus = await getOperatorSession(new Request(`${origin}/api/auth/session`, {
      headers: { cookie: `qevra_session=${operatorSession.value}` },
    }));
    assert.equal(operatorStatus.status, 200);
    assert.equal((await operatorStatus.json() as { authenticated: boolean }).authenticated, true);
    const loggedOut = await getWalletUserSession(new Request(`${origin}/api/auth/user/session`));
    assert.equal((await loggedOut.json() as { authenticated: boolean }).authenticated, false);
  } finally {
    await store.close();
    Pool.prototype.query = originalQuery;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else Reflect.set(process.env, key, previous[key]);
    }
  }
});
