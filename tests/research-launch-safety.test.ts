import assert from "node:assert/strict";
import { test } from "node:test";
import { Pool } from "pg";
import { requireResearchAccess } from "@/features/security/api";
import { getResearchStore } from "@/features/security/store";
import { resolveResearchRateLimit } from "@/features/security/rate-limit-policy";
import { createUserSession, USER_SESSION_COOKIE } from "@/features/security/wallet-auth";

test("wallet run creation permits one launch per hour while other rate limits stay unchanged", () => {
  assert.equal(resolveResearchRateLimit("user", "create-run", 8), 1);
  assert.equal(resolveResearchRateLimit("operator", "create-run", 8), 8);
  assert.equal(resolveResearchRateLimit("user", "capabilities", 60), 60);
});

test("the wallet create-run access bucket rejects the second launch in its persisted window", async () => {
  const keys = ["DATABASE_URL", "NODE_ENV", "VEYRA_USER_SESSION_SECRET", "VEYRA_AUTH_ORIGIN"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<(typeof keys)[number], string | undefined>;
  const originalQuery = Pool.prototype.query;
  const counts = new Map<string, number>();
  process.env.DATABASE_URL = "postgres://mock.invalid/veyra";
  Reflect.set(process.env, "NODE_ENV", "test");
  process.env.VEYRA_USER_SESSION_SECRET = "test-only-wallet-session-secret-0123456789";
  process.env.VEYRA_AUTH_ORIGIN = "http://localhost:3113";
  (Pool.prototype as unknown as {
    query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  }).query = async function (sql: string, values?: unknown[]) {
    if (sql.includes("INSERT INTO qevra_rate_limits")) {
      const key = String(values?.[0]);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { rows: [{ request_count: count }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  } as typeof Pool.prototype.query;

  const store = getResearchStore();
  try {
    const session = createUserSession("0x0000000000000000000000000000000000000001");
    assert.ok(session);
    const request = () => new Request("http://localhost:3113/api/security/runs", {
      headers: { cookie: `${USER_SESSION_COOKIE}=${session.value}` },
    });
    const first = await requireResearchAccess(request(), 8, 60 * 60_000, "create-run");
    assert.equal("response" in first, false);
    const second = await requireResearchAccess(request(), 8, 60 * 60_000, "create-run");
    assert.ok("response" in second && second.response);
    if (!("response" in second) || !second.response) return;
    assert.equal(second.response.status, 429);
    assert.equal(second.response.headers.get("retry-after"), "3600");
    assert.match((await second.response.json() as { error: { message: string } }).error.message, /one research run per wallet.*60-minute/i);
  } finally {
    await store.close();
    Pool.prototype.query = originalQuery;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else Reflect.set(process.env, key, previous[key]);
    }
  }
});
