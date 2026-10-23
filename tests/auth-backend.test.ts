import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PostgresResearchStore } from "@/features/security/store";
import { requireResearchAccess } from "@/features/security/api";
import { POST as requestEmailOtp } from "@/app/api/auth/email/otp/route";
import { GET as startGoogleLogin } from "@/app/api/auth/google/route";
import {
  createWalletLinkMessage,
  getAuthCapabilities,
  hashEmailOtp,
  emailLookupHash,
  normalizeEmailAddress,
  verifyGoogleIdToken,
} from "@/features/auth/core";
import {
  createGoogleOAuthState,
  createNewAuthSession,
  hashAuthSessionToken,
  verifyGoogleOAuthStateCookie,
} from "@/features/auth/session";

test("auth capabilities report configured providers without exposing credentials", () => {
  const blocked = getAuthCapabilities({} as NodeJS.ProcessEnv);
  assert.deepEqual(blocked, { wallet: false, password: false, google: false, email: false, database: false, embeddedWallet: false });
  assert.equal(getAuthCapabilities({
    VEYRA_USER_SESSION_SECRET: "s".repeat(40),
    VEYRA_AUTH_ORIGIN: "https://veyra.example/path",
  } as unknown as NodeJS.ProcessEnv).wallet, false);

  const ready = getAuthCapabilities({
    DATABASE_URL: "postgres://configured",
    VEYRA_USER_SESSION_SECRET: "s".repeat(40),
    VEYRA_AUTH_ORIGIN: "https://veyraapp.net",
    VEYRA_GOOGLE_CLIENT_ID: "client-id",
    VEYRA_GOOGLE_CLIENT_SECRET: "client-secret",
    RESEND_API_KEY: "provider-key",
    VEYRA_EMAIL_FROM: "VEYRA <auth@veyraapp.net>",
  } as unknown as NodeJS.ProcessEnv);
  assert.deepEqual(ready, { wallet: true, password: true, google: true, email: true, database: true, embeddedWallet: false });
  assert.doesNotMatch(JSON.stringify(ready), /client-secret|provider-key/);
});

test("email addresses normalize strictly and OTP digests are keyed and address-bound", () => {
  assert.equal(normalizeEmailAddress("  Owner@Example.COM "), "owner@example.com");
  assert.equal(normalizeEmailAddress("not-an-email"), undefined);
  const first = hashEmailOtp("owner@example.com", "123456", "x".repeat(32));
  assert.equal(first, hashEmailOtp("OWNER@example.com", "123456", "x".repeat(32)));
  assert.notEqual(first, hashEmailOtp("other@example.com", "123456", "x".repeat(32)));
  assert.notEqual(first, hashEmailOtp("owner@example.com", "123457", "x".repeat(32)));
  assert.notEqual(emailLookupHash("owner@example.com", "x".repeat(32)), emailLookupHash("owner@example.com", "y".repeat(32)));
});

test("Google ID tokens require a trusted signature, issuer, audience, expiry, and nonce", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const keyId = "test-key";
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", kid: keyId, typ: "JWT" });
  const claims = {
    iss: "https://accounts.google.com",
    aud: "veyra-client",
    sub: "google-subject-1",
    email: "owner@example.com",
    email_verified: true,
    nonce: "expected-nonce",
    iat: 1_800_000_000,
    exp: 1_800_000_300,
  };
  const signClaims = (payloadClaims: typeof claims) => {
    const signingInput = `${header}.${encode(payloadClaims)}`;
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    return `${signingInput}.${signer.sign(privateKey).toString("base64url")}`;
  };
  const token = signClaims(claims);
  const getKeys = async () => [{ ...jwk, kid: keyId, alg: "RS256", use: "sig" }];
  const options = { clientId: "veyra-client", nonce: "expected-nonce", now: 1_800_000_050_000, getKeys };

  assert.deepEqual(await verifyGoogleIdToken(token, options), {
    subject: "google-subject-1",
    email: "owner@example.com",
    emailVerified: true,
  });
  await assert.rejects(verifyGoogleIdToken(token, { ...options, nonce: "wrong-nonce" }), /nonce/i);
  await assert.rejects(verifyGoogleIdToken(token, { ...options, clientId: "other-client" }), /audience/i);
  await assert.rejects(verifyGoogleIdToken(signClaims({ ...claims, iss: "https://attacker.example" }), options), /issuer/i);
  await assert.rejects(verifyGoogleIdToken(signClaims({ ...claims, exp: 1_800_000_049 }), options), /expired/i);
  await assert.rejects(verifyGoogleIdToken(`${token.split(".").slice(0, 2).join(".")}.${Buffer.alloc(256).toString("base64url")}`, options), /signature/i);
});

test("wallet linking challenge binds the configured origin, wallet, and chain to an explicit message", async () => {
  const account = privateKeyToAccount(`0x${"3".repeat(64)}`);
  const message = createWalletLinkMessage({
    address: account.address,
    chainId: 4_663,
    nonce: "a".repeat(32),
    origin: "https://veyraapp.net",
    now: 1_800_000_000_000,
  });
  assert.match(message, /link this wallet to your VEYRA account/i);
  assert.match(message, /Chain ID: 4663/);
  assert.match(message, /will not approve tokens or authorize transactions/);
  const signature = await account.signMessage({ message });
  assert.equal((await recoverMessageAddress({ message, signature })).toLowerCase(), account.address.toLowerCase());
});

test("social app sessions do not authorize wallet-owned research APIs", async () => {
  for (const cookie of ["veyra_auth_session=opaque-social-session-token", "veyra_auth_session=opaque-password-session-token"]) {
    const access = await requireResearchAccess(new Request("https://veyraapp.net/api/security/runs", { headers: { cookie } }));
    assert.equal("response" in access, true);
    if ("response" in access) assert.equal(access.response?.status, 401);
  }
});

test("app sessions use random opaque tokens and Google state is signed and expiring", () => {
  const session = createNewAuthSession(1_800_000_000_000);
  assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(session.tokenHash, hashAuthSessionToken(session.token));
  assert.notEqual(session.token, session.tokenHash);

  const env = { VEYRA_USER_SESSION_SECRET: "x".repeat(40) } as unknown as NodeJS.ProcessEnv;
  const state = createGoogleOAuthState(1_800_000_000_000, env);
  assert.ok(state);
  assert.equal(verifyGoogleOAuthStateCookie(state.cookieValue, state.state, 1_800_000_001_000, env)?.nonce, state.nonce);
  assert.equal(verifyGoogleOAuthStateCookie(state.cookieValue, "wrong-state", 1_800_000_001_000, env), undefined);
  assert.equal(verifyGoogleOAuthStateCookie(`${state.cookieValue}x`, state.state, 1_800_000_001_000, env), undefined);
  assert.equal(verifyGoogleOAuthStateCookie(state.cookieValue, state.state, 1_800_000_700_000, env), undefined);
});

test("equal email claims from different providers do not merge identities", async () => {
  const identities = new Map<string, string>();
  const queries: string[] = [];
  const client = {
    release() {},
    async query(sql: string, values?: unknown[]) {
      queries.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK" || sql.startsWith("INSERT INTO veyra_auth_users")
        || sql.startsWith("DELETE FROM veyra_auth_users")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO veyra_auth_identities")) {
        const key = `${values?.[0]}:${values?.[1]}`;
        const current = identities.get(key);
        if (current) return { rows: [{ user_id: current }], rowCount: 1 };
        const userId = String(values?.[2]);
        identities.set(key, userId);
        return { rows: [{ user_id: userId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const fakePool = {
    on() {},
    async query(sql: string) { queries.push(sql); return { rows: [], rowCount: 0 }; },
    async connect() { return client; },
    async end() {},
  };
  const store = new PostgresResearchStore("postgres://auth-test.invalid/veyra", fakePool as never);
  const google = await store.createOrGetAuthIdentity({ provider: "google", subject: "google-sub", email: "same@example.com", emailVerified: true });
  const email = await store.createOrGetAuthIdentity({ provider: "email", subject: "same@example.com", email: "same@example.com", emailVerified: true });
  assert.notEqual(google.userId, email.userId);
  assert.ok(queries.some((sql) => sql.includes("PRIMARY KEY (provider, provider_subject)")));
  assert.ok(queries.every((sql) => !sql.includes("UNIQUE (email)")));
  await store.close();
});

test("database-backed app session restoration rejects expired and revoked rows", async () => {
  const statements: string[] = [];
  const fakePool = {
    on() {},
    async query(sql: string) {
      statements.push(sql);
      if (sql.includes("FROM veyra_auth_sessions")) return {
        rows: [{ user_id: "db-user", provider: "google", provider_subject: "google-sub", email: "owner@example.com", expires_at: new Date("2026-10-24T00:00:00.000Z") }],
        rowCount: 1,
      };
      return { rows: [], rowCount: 1 };
    },
    async end() {},
  };
  const store = new PostgresResearchStore("postgres://auth-session.invalid/veyra", fakePool as never);
  const session = await store.getAuthSession("a".repeat(64));
  assert.equal(session?.provider, "google");
  assert.equal(session?.userId, "db-user");
  assert.match(statements.at(-1) ?? "", /revoked_at IS NULL AND expires_at > now\(\)/);
  await store.revokeAuthSession("a".repeat(64));
  assert.match(statements.at(-1) ?? "", /SET revoked_at = now\(\)/);
  await store.close();
});

test("wallet sign-out revokes even a legacy wallet cookie without an app-session row", async () => {
  const revocations = new Map<string, string>();
  const statements: string[] = [];
  const client = {
    release() {},
    async query(sql: string, values?: unknown[]) {
      statements.push(sql);
      if (sql.startsWith("INSERT INTO veyra_auth_wallet_revocations")) {
        revocations.set(String(values?.[0]), String(values?.[1]));
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const fakePool = {
    on() {},
    async connect() { return client; },
    async query(sql: string, values?: unknown[]) {
      statements.push(sql);
      if (sql.includes("FROM veyra_auth_wallet_revocations")) {
        const expiresAt = revocations.get(String(values?.[0]));
        return { rows: [{ revoked: Boolean(expiresAt && Date.parse(expiresAt) > Date.now()) }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    async end() {},
  };
  const store = new PostgresResearchStore("postgres://wallet-revoke.invalid/veyra", fakePool as never);
  const walletSessionHash = "e".repeat(64);
  await store.revokeWalletAuthSession(walletSessionHash, new Date(Date.now() + 60_000).toISOString());
  assert.equal(await store.walletAuthSessionIsRevoked(walletSessionHash), true);
  assert.ok(statements.includes("BEGIN"));
  assert.ok(statements.includes("COMMIT"));
  await store.close();
});

test("email OTP challenges expire, consume once, and stop accepting after five attempts", async () => {
  let attempts = 0;
  let expectedHash = "";
  let consumed = false;
  const statements: string[] = [];
  const fakePool = {
    on() {},
    async query(sql: string, values?: unknown[]) {
      statements.push(sql);
      if (sql.includes("INSERT INTO veyra_auth_email_challenges")) {
        expectedHash = String(values?.[1]);
        attempts = 0;
        consumed = false;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("UPDATE veyra_auth_email_challenges")) {
        if (consumed || attempts >= 5) return { rows: [], rowCount: 0 };
        attempts += 1;
        const valid = String(values?.[1]) === expectedHash;
        if (valid) consumed = true;
        return { rows: [{ valid }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    async end() {},
  };
  const store = new PostgresResearchStore("postgres://email-otp.invalid/veyra", fakePool as never);
  const emailHash = "a".repeat(64);
  await store.createEmailOtpChallenge(emailHash, "b".repeat(64), new Date(Date.now() + 600_000).toISOString());
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal(await store.consumeEmailOtpChallenge(emailHash, "c".repeat(64)), false);
  assert.equal(await store.consumeEmailOtpChallenge(emailHash, "b".repeat(64)), false);
  assert.match(statements.at(-1) ?? "", /consumed_at IS NULL AND expires_at > now\(\) AND attempt_count < 5/);
  await store.close();
});

test("Google OAuth state persistence is atomically consumed once before token exchange", async () => {
  let storedState = "";
  let consumed = false;
  const statements: string[] = [];
  const fakePool = {
    on() {},
    async query(sql: string, values?: unknown[]) {
      statements.push(sql);
      if (sql.startsWith("INSERT INTO veyra_auth_google_states")) {
        storedState = String(values?.[0]);
        consumed = false;
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("DELETE FROM veyra_auth_google_states")) {
        if (consumed || values?.[0] !== storedState) return { rows: [], rowCount: 0 };
        consumed = true;
        return { rows: [{ state_hash: storedState }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    async end() {},
  };
  const store = new PostgresResearchStore("postgres://google-state.invalid/veyra", fakePool as never);
  const stateHash = "d".repeat(64);
  await store.createGoogleOAuthState(stateHash, new Date(Date.now() + 600_000).toISOString());
  assert.equal(await store.consumeGoogleOAuthState(stateHash), true);
  assert.equal(await store.consumeGoogleOAuthState(stateHash), false);
  assert.match(statements.at(-1) ?? "", /expires_at > now\(\)/);
  await store.close();
});

test("unconfigured Google and email providers are reported blocked without contacting providers", async () => {
  const names = [
    "DATABASE_URL",
    "VEYRA_USER_SESSION_SECRET",
    "VEYRA_AUTH_ORIGIN",
    "VEYRA_GOOGLE_CLIENT_ID",
    "VEYRA_GOOGLE_CLIENT_SECRET",
    "RESEND_API_KEY",
    "VEYRA_EMAIL_FROM",
    "NODE_ENV",
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]])) as Record<(typeof names)[number], string | undefined>;
  const originalFetch = globalThis.fetch;
  let providerRequests = 0;
  process.env.DATABASE_URL = "postgres://auth-provider-config.invalid/veyra";
  process.env.VEYRA_USER_SESSION_SECRET = "test-only-auth-secret-012345678901234567";
  process.env.VEYRA_AUTH_ORIGIN = "https://veyra.example";
  Reflect.set(process.env, "NODE_ENV", "test");
  delete process.env.VEYRA_GOOGLE_CLIENT_ID;
  delete process.env.VEYRA_GOOGLE_CLIENT_SECRET;
  delete process.env.RESEND_API_KEY;
  delete process.env.VEYRA_EMAIL_FROM;
  globalThis.fetch = async () => {
    providerRequests += 1;
    throw new Error("provider must not be contacted when configuration is missing");
  };
  try {
    const emailResponse = await requestEmailOtp(new Request("https://veyra.example/api/auth/email/otp", {
      method: "POST",
      headers: { origin: "https://veyra.example", "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com" }),
    }));
    assert.equal(emailResponse.status, 503);
    assert.equal((await emailResponse.json() as { error: { code: string } }).error.code, "email_auth_not_configured");

    const googleResponse = await startGoogleLogin(new Request("https://veyra.example/api/auth/google", {
      headers: { origin: "https://veyra.example" },
    }));
    assert.equal(googleResponse.status, 307);
    assert.match(googleResponse.headers.get("location") ?? "", /auth_error=google_not_configured/);
    assert.equal(providerRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else Reflect.set(process.env, name, previous[name]);
    }
  }
});
