import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { PostgresResearchStore } from "@/features/security/store";
import { hashRateLimitKey } from "@/features/security/auth";

async function loadPasswordModule() {
  try {
    return await import("@/features/auth/password");
  } catch {
    return undefined;
  }
}

test("passwords enforce a documented length and byte limit", async () => {
  const password = await loadPasswordModule();
  assert.ok(password, "password auth helpers should be implemented");
  assert.throws(() => password.validatePassword("short"), /password_too_short/);
  assert.throws(() => password.validatePassword("x".repeat(14)), /password_too_short/);
  assert.throws(() => password.validatePassword("x".repeat(129)), /password_too_long/);
  assert.equal(password.validatePassword("correct horse battery staple"), "correct horse battery staple");
  assert.equal(password.validatePassword("é".repeat(15)), "é".repeat(15), "Unicode code points count as characters");
});

test("password hashes use salted scrypt and reject incorrect or malformed credentials", async () => {
  const password = await loadPasswordModule();
  assert.ok(password, "password auth helpers should be implemented");
  const first = await password.hashPassword("correct horse battery staple");
  const second = await password.hashPassword("correct horse battery staple");
  assert.match(first, /^scrypt\$32768\$8\$3\$/);
  assert.notEqual(first, second, "each account must receive a unique salt");
  assert.doesNotMatch(first, /correct horse battery staple/);
  assert.equal(await password.verifyPassword("correct horse battery staple", first), true);
  assert.equal(await password.verifyPassword("incorrect password here", first), false);
  assert.equal(await password.verifyPassword("correct horse battery staple", "invalid$hash"), false);
  assert.equal(await password.verifyPassword("correct horse battery staple", undefined), false);
});

test("password account routes are exposed without changing wallet or operator auth endpoints", async () => {
  const [register, login, profile, wallet] = await Promise.all([
    import("@/app/api/auth/register/route").catch(() => undefined),
    import("@/app/api/auth/login/route").catch(() => undefined),
    import("@/app/api/auth/profile/route").catch(() => undefined),
    import("@/app/api/auth/wallet/status/route").catch(() => undefined),
  ]);
  assert.equal(typeof register?.POST, "function", "registration must be available");
  assert.equal(typeof login?.POST, "function", "password sign-in must be available");
  assert.equal(typeof profile?.GET, "function", "authenticated account profile must be available");
  assert.equal(typeof wallet?.GET, "function", "built-in wallet status must have a stable endpoint");
});

test("auth capabilities distinguish email/password from external wallet and embedded wallet support", async () => {
  const { getAuthCapabilities } = await import("@/features/auth/core");
  const capabilities = getAuthCapabilities({
    DATABASE_URL: "postgresql://localhost/qevra",
    VEYRA_AUTH_ORIGIN: "https://veyra.example",
    VEYRA_USER_SESSION_SECRET: "a".repeat(32),
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(capabilities.password, true);
  assert.equal(capabilities.wallet, true, "EIP-191 login remains available");
  assert.equal(capabilities.embeddedWallet, false, "provider-backed wallet creation stays blocked until verified");
});

test("auth API contract exposes password account and built-in-wallet boundary methods", async () => {
  const { authContract } = await import("@/features/auth/client");
  assert.equal(typeof authContract.register, "function");
  assert.equal(typeof authContract.login, "function");
  assert.equal(typeof authContract.profile, "function");
  assert.equal(typeof authContract.builtInWalletStatus, "function");
  assert.equal(typeof authContract.provisionBuiltInWallet, "function");
  assert.equal(typeof authContract.createWalletLinkChallenge, "function");
  assert.equal(typeof authContract.verifyWalletLink, "function");
});

test("PostgreSQL schema adds unique password credentials and a provider-owned wallet binding", async () => {
  let schema = "";
  const fakePool = {
    on() {},
    async query(sql: string) {
      schema = sql;
      return { rows: [], rowCount: 0 };
    },
  } as unknown as import("pg").Pool;
  await new PostgresResearchStore("postgresql://localhost/qevra", fakePool).ensureSchema();
  assert.match(schema, /CREATE TABLE IF NOT EXISTS veyra_auth_password_credentials/);
  assert.match(schema, /email_normalized text NOT NULL UNIQUE/);
  assert.match(schema, /password_hash text NOT NULL/);
  assert.match(schema, /CHECK \(provider IN \('wallet', 'google', 'email', 'password'\)\)/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS veyra_auth_embedded_wallets/);
  assert.match(schema, /provider_wallet_id text NOT NULL/);
});

test("password registration rejects cross-origin requests and weak passwords before database access", async () => {
  const route = await import("@/app/api/auth/register/route").catch(() => undefined);
  assert.ok(route?.POST, "registration route must be implemented");
  const originalOrigin = process.env.VEYRA_AUTH_ORIGIN;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  try {
    process.env.VEYRA_AUTH_ORIGIN = "https://veyra.example";
    delete process.env.DATABASE_URL;
    const crossOrigin = await route.POST(new Request("https://veyra.example/api/auth/register", {
      method: "POST",
      headers: { origin: "https://attacker.example", host: "veyra.example", "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com", password: "correct horse battery staple" }),
    }));
    assert.equal(crossOrigin.status, 403);
    const weakPassword = await route.POST(new Request("https://veyra.example/api/auth/register", {
      method: "POST",
      headers: { origin: "https://veyra.example", host: "veyra.example", "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com", password: "short" }),
    }));
    assert.equal(weakPassword.status, 400);
  } finally {
    if (originalOrigin === undefined) delete process.env.VEYRA_AUTH_ORIGIN;
    else process.env.VEYRA_AUTH_ORIGIN = originalOrigin;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

test("built-in wallet provisioning requires login and explicit consent, then fails closed without a provider", async () => {
  const statusRoute = await import("@/app/api/auth/wallet/status/route").catch(() => undefined);
  const provisionRoute = await import("@/app/api/auth/wallet/provision/route").catch(() => undefined);
  assert.ok(statusRoute?.GET && provisionRoute?.POST, "wallet integration boundary routes must be implemented");
});

test("email/password registration, duplicate protection, login, profile, refresh, and logout persist safely", async () => {
  const [register, login, current, profile, logout] = await Promise.all([
    import("@/app/api/auth/register/route").catch(() => undefined),
    import("@/app/api/auth/login/route").catch(() => undefined),
    import("@/app/api/auth/current/route"),
    import("@/app/api/auth/profile/route").catch(() => undefined),
    import("@/app/api/auth/logout/route"),
  ]);
  assert.ok(register?.POST && login?.POST && profile?.GET, "account endpoints must be implemented");

  const keys = ["DATABASE_URL", "VEYRA_AUTH_ORIGIN", "VEYRA_USER_SESSION_SECRET"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<(typeof keys)[number], string | undefined>;
  const originalQuery = Pool.prototype.query;
  const originalConnect = Pool.prototype.connect;
  const users = new Map<string, Date>();
  const credentials = new Map<string, { userId: string; email: string; passwordHash: string; createdAt: Date }>();
  const sessions = new Map<string, { userId: string; provider: string; subject: string; email: string; expiresAt: Date; revoked: boolean }>();
  const rateCounts = new Map<string, number>();
  const origin = "https://veyra.example";
  const ip = "203.0.113.17";
  const query = async (statement: string, values: unknown[] = []) => {
    const sql = statement.replace(/\s+/g, " ").trim();
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS qevra_research_runs")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("INSERT INTO qevra_rate_limits")) {
      const key = String(values[0]);
      const count = (rateCounts.get(key) ?? 0) + 1;
      rateCounts.set(key, count);
      return { rows: [{ request_count: count }], rowCount: 1 };
    }
    if (sql.startsWith("INSERT INTO veyra_auth_users")) {
      const userId = String(values[0]);
      const createdAt = new Date();
      users.set(userId, createdAt);
      return { rows: [{ created_at: createdAt }], rowCount: 1 };
    }
    if (sql.startsWith("INSERT INTO veyra_auth_identities")) return { rows: [{ user_id: String(values[1]) }], rowCount: 1 };
    if (sql.startsWith("INSERT INTO veyra_auth_password_credentials")) {
      const userId = String(values[0]);
      const email = String(values[1]);
      if (credentials.has(email)) throw Object.assign(new Error("duplicate email"), { code: "23505" });
      credentials.set(email, { userId, email, passwordHash: String(values[2]), createdAt: users.get(userId) ?? new Date() });
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("INSERT INTO veyra_auth_sessions")) {
      const passwordProvider = sql.includes("'password'");
      const sessionHash = String(values[0]);
      const userId = String(values[1]);
      const provider = passwordProvider ? "password" : String(values[2]);
      const subject = passwordProvider ? String(values[2]) : String(values[3]);
      const email = passwordProvider ? subject : String(values[4] ?? "");
      const expiresAt = new Date(String(passwordProvider ? values[3] : values[6]));
      sessions.set(sessionHash, { userId, provider, subject, email, expiresAt, revoked: false });
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("SELECT user_id, email_normalized, password_hash, created_at")) {
      const credential = credentials.get(String(values[0]));
      return { rows: credential ? [{ user_id: credential.userId, email_normalized: credential.email, password_hash: credential.passwordHash, created_at: credential.createdAt }] : [], rowCount: credential ? 1 : 0 };
    }
    if (sql.startsWith("SELECT user_id, provider, provider_subject, email, expires_at")) {
      const session = sessions.get(String(values[0]));
      const valid = session && !session.revoked && session.expiresAt.getTime() > Date.now();
      return { rows: valid ? [{ user_id: session.userId, provider: session.provider, provider_subject: session.subject, email: session.email, expires_at: session.expiresAt }] : [], rowCount: valid ? 1 : 0 };
    }
    if (sql.startsWith("SELECT u.id AS user_id")) {
      const userId = String(values[0]);
      const credential = [...credentials.values()].find((row) => row.userId === userId);
      const createdAt = users.get(userId);
      return { rows: createdAt ? [{ user_id: userId, email: credential?.email ?? null, email_verified: false, created_at: createdAt }] : [], rowCount: createdAt ? 1 : 0 };
    }
    if (sql.startsWith("SELECT provider, provider_user_id, provider_wallet_id, address, created_at, verified_at")) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("UPDATE veyra_auth_sessions SET revoked_at")) {
      const session = sessions.get(String(values[0]));
      if (session) session.revoked = true;
      return { rows: [], rowCount: session ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  };

  process.env.DATABASE_URL = "postgresql://auth-test/qevra";
  process.env.VEYRA_AUTH_ORIGIN = origin;
  process.env.VEYRA_USER_SESSION_SECRET = "test-only-user-session-secret-0123456789";
  (Pool.prototype as unknown as { query: typeof query }).query = query;
  (Pool.prototype as unknown as { connect: () => Promise<{ query: typeof query; release: () => void }> }).connect = async () => ({
    query,
    release() {},
  });

  const request = (path: string, body: unknown) => new Request(`${origin}${path}`, {
    method: "POST",
    headers: { origin, host: "veyra.example", "x-real-ip": ip, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  try {
    const registered = await register.POST(request("/api/auth/register", {
      email: "Owner@Example.com",
      password: "correct horse battery staple",
    }));
    assert.equal(registered.status, 201);
    const registeredBody = await registered.json() as { identity?: { provider?: string; email?: string }; account?: { emailVerified?: boolean } };
    assert.equal(registeredBody.identity?.provider, "password");
    assert.equal(registeredBody.identity?.email, "owner@example.com");
    assert.equal(registeredBody.account?.emailVerified, false);
    assert.equal(JSON.stringify(registeredBody).includes("passwordHash"), false);

    const cookieLine = registered.headers.get("set-cookie") ?? "";
    assert.match(cookieLine, /veyra_auth_session=/);
    assert.match(cookieLine, /httponly/i);
    assert.match(cookieLine, /samesite=strict/i);
    const authCookie = cookieLine.match(/veyra_auth_session=([^;,\s]+)/)?.[1];
    assert.ok(authCookie);
    assert.equal(sessions.has(authCookie), false, "only a hash of the opaque session token is persisted");

    const restored = await current.GET(new Request(`${origin}/api/auth/current`, {
      headers: { cookie: `veyra_auth_session=${authCookie}` },
    }));
    const currentBody = await restored.json() as { authenticated?: boolean; identity?: { provider?: string } };
    assert.equal(currentBody.authenticated, true);
    assert.equal(currentBody.identity?.provider, "password");

    const walletStatusModule = await import("@/app/api/auth/wallet/status/route");
    const walletStatusResponse = await walletStatusModule.GET(new Request(`${origin}/api/auth/wallet/status`, {
      headers: { cookie: `veyra_auth_session=${authCookie}` },
    }));
    assert.deepEqual(await walletStatusResponse.json(), { status: "blocked", reason: "provider_not_integrated", wallet: null });

    const provisionModule = await import("@/app/api/auth/wallet/provision/route");
    const noConsent = await provisionModule.POST(new Request(`${origin}/api/auth/wallet/provision`, {
      method: "POST",
      headers: { origin, host: "veyra.example", cookie: `veyra_auth_session=${authCookie}`, "content-type": "application/json" },
      body: JSON.stringify({ consent: false }),
    }));
    assert.equal(noConsent.status, 400);
    const provision = await provisionModule.POST(new Request(`${origin}/api/auth/wallet/provision`, {
      method: "POST",
      headers: { origin, host: "veyra.example", cookie: `veyra_auth_session=${authCookie}`, "content-type": "application/json" },
      body: JSON.stringify({ consent: true }),
    }));
    assert.equal(provision.status, 503);
    assert.equal((await provision.json() as { error?: { code?: string } }).error?.code, "embedded_wallet_blocked");

    const profileResponse = await profile.GET(new Request(`${origin}/api/auth/profile`, {
      headers: { cookie: `veyra_auth_session=${authCookie}` },
    }));
    const profileBody = await profileResponse.json() as { account?: { email?: string; emailVerified?: boolean } };
    assert.equal(profileResponse.status, 200);
    assert.equal(profileBody.account?.email, "owner@example.com");
    assert.equal(profileBody.account?.emailVerified, false);

    const duplicate = await register.POST(request("/api/auth/register", {
      email: "owner@example.com",
      password: "another strong password here",
    }));
    assert.equal(duplicate.status, 409);

    const incorrect = await login.POST(request("/api/auth/login", {
      email: "owner@example.com",
      password: "incorrect password phrase",
    }));
    assert.equal(incorrect.status, 401);
    const incorrectBody = await incorrect.json() as { error?: { code?: string; message?: string } };
    assert.equal(incorrectBody.error?.code, "invalid_credentials");

    const signedIn = await login.POST(request("/api/auth/login", {
      email: "OWNER@example.com",
      password: "correct horse battery staple",
    }));
    assert.equal(signedIn.status, 200);
    const loginCookie = signedIn.headers.get("set-cookie")?.match(/veyra_auth_session=([^;,\s]+)/)?.[1];
    assert.ok(loginCookie);
    const refreshedPasswordSession = await current.GET(new Request(`${origin}/api/auth/current`, {
      headers: { cookie: `veyra_auth_session=${loginCookie}` },
    }));
    assert.equal((await refreshedPasswordSession.json() as { authenticated?: boolean }).authenticated, true);
    const loggedOut = await logout.POST(new Request(`${origin}/api/auth/logout`, {
      method: "POST",
      headers: { origin, host: "veyra.example", cookie: `veyra_auth_session=${loginCookie}` },
    }));
    assert.equal(loggedOut.status, 200);
    const afterLogout = await current.GET(new Request(`${origin}/api/auth/current`, {
      headers: { cookie: `veyra_auth_session=${loginCookie}` },
    }));
    assert.equal((await afterLogout.json() as { authenticated?: boolean }).authenticated, false);

    const blockedRateKey = hashRateLimitKey(`veyra:auth:login:ip:${ip}`);
    rateCounts.set(blockedRateKey, 30);
    const rateLimited = await login.POST(request("/api/auth/login", { email: "owner@example.com", password: "wrong password phrase" }));
    assert.equal(rateLimited.status, 429);
  } finally {
    (Pool.prototype as unknown as { query: typeof originalQuery }).query = originalQuery;
    (Pool.prototype as unknown as { connect: typeof originalConnect }).connect = originalConnect;
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
