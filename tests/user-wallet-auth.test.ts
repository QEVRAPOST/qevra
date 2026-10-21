import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { createSession, verifySessionCookie } from "@/features/security/auth";
import {
  createUserSession,
  formatWalletChallenge,
  verifyUserSessionCookie,
  verifyWalletChallengeSignature,
} from "@/features/security/wallet-auth";
import { PostgresResearchStore } from "@/features/security/store";

const env = {
  QEVRA_SESSION_SECRET: "operator-secret-012345678901234567890123",
  VEYRA_USER_SESSION_SECRET: "user-session-secret-012345678901234567890123",
  VEYRA_AUTH_ORIGIN: "https://veyra.example",
  NODE_ENV: "test",
} as NodeJS.ProcessEnv;

test("user wallet challenges are explicit, chain-bound, and signature-verified locally", async () => {
  const account = privateKeyToAccount(`0x${"1".repeat(64)}`);
  const message = formatWalletChallenge({
    address: account.address,
    chainId: 46_630,
    nonce: "0123456789abcdef0123456789abcdef",
    issuedAt: "2026-10-21T00:00:00.000Z",
    expiresAt: "2026-10-21T00:05:00.000Z",
    origin: "https://veyra.example",
  });
  assert.match(message, /Chain ID: 46630/);
  assert.match(message, /will not approve tokens or authorize transactions/);
  const signature = await account.signMessage({ message });
  assert.equal(await verifyWalletChallengeSignature(account.address, message, signature), true);
  assert.equal(await verifyWalletChallengeSignature("0x0000000000000000000000000000000000000001", message, signature), false);
  assert.equal(await verifyWalletChallengeSignature(account.address, message, "0x1234"), false);
});

test("user sessions are isolated from operator sessions and expire or reject tampering", () => {
  const account = privateKeyToAccount(`0x${"2".repeat(64)}`);
  const session = createUserSession(account.address, env, 1_700_000_000_000);
  const operatorSession = createSession(env, 1_700_000_000_000);
  assert.ok(session);
  assert.ok(operatorSession);
  assert.equal(verifyUserSessionCookie(session.value, env, 1_700_000_001_000)?.address.toLowerCase(), account.address.toLowerCase());
  assert.equal(verifyUserSessionCookie(`${session.value}x`, env, 1_700_000_001_000), undefined);
  assert.equal(verifyUserSessionCookie(session.value, env, 1_800_000_000_000), undefined);
  assert.equal(verifyUserSessionCookie(operatorSession.value, env, 1_700_000_001_000), undefined);
  assert.equal(verifySessionCookie(session.value, env, 1_700_000_001_000), undefined);
});

test("wallet-owned run queries include the owner predicate and one-time challenge consumption is atomic", async () => {
  const statements: Array<{ sql: string; values?: unknown[] }> = [];
  let challengeDeleteCount = 0;
  const fakePool = {
    on() {},
    end: async () => {},
    query: async (sql: string, values?: unknown[]) => {
      statements.push({ sql, values });
      if (sql.startsWith("DELETE FROM veyra_user_auth_challenges")) {
        challengeDeleteCount += 1;
        return { rows: challengeDeleteCount === 1 ? [{ nonce_hash: "a".repeat(64) }] : [], rowCount: challengeDeleteCount === 1 ? 1 : 0 };
      }
      if (sql.includes("FROM qevra_research_runs") && sql.includes("owner_id = $1")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const store = new PostgresResearchStore("postgres://mock.invalid/veyra", fakePool as never);
  await store.listRuns(10, undefined, "0x0000000000000000000000000000000000000001");
  assert.ok(statements.some(({ sql, values }) => sql.includes("WHERE owner_id = $1")
    && values?.[0] === "0x0000000000000000000000000000000000000001"));
  assert.equal(await store.consumeWalletAuthChallenge("a".repeat(64)), true);
  assert.equal(await store.consumeWalletAuthChallenge("a".repeat(64)), false);
  await store.close();
});
