import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Pool } from "pg";
import { evaluateResearchRunAdmission, resolveResearchRunCreationAccess, resolveResearchRunLimits } from "@/features/security/run-creation-policy";
import type { ResearchRunAdmissionLimits, ResearchRunAdmissionSnapshot } from "@/features/security/run-creation-policy";
import { createQueuedRun, type ResearchRunRecord } from "@/features/security/model";
import { PostgresResearchStore } from "@/features/security/store";

const walletA = "0x0000000000000000000000000000000000000001";
const walletB = "0x0000000000000000000000000000000000000002";
const accessEnv = (extra: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "test",
  QEVRA_RESEARCH_ACCESS_MODE: "public_limited",
  QEVRA_RESEARCH_RUN_OWNER_ALLOWLIST: "",
  QEVRA_RESEARCH_PER_WALLET_COOLDOWN_SECONDS: "3600",
  QEVRA_RESEARCH_GLOBAL_HOURLY_RUN_LIMIT: "20",
  QEVRA_RESEARCH_GLOBAL_DAILY_RUN_LIMIT: "60",
  QEVRA_RESEARCH_MAX_ACTIVE_RUNS: "1",
  ...extra,
});

const limits: ResearchRunAdmissionLimits = {
  walletCooldownSeconds: 3_600,
  globalHourlyRunLimit: 20,
  globalDailyRunLimit: 60,
  maxActiveRuns: 1,
};

test("public-limited admission allows independent authenticated wallets without an owner allowlist", () => {
  const env = accessEnv();
  assert.deepEqual(resolveResearchRunCreationAccess("user", walletA, env), { allowed: true, mode: "public_limited" });
  assert.deepEqual(resolveResearchRunCreationAccess("user", walletB, env), { allowed: true, mode: "public_limited" });
});

test("owner-only admission remains allowlisted and operators cannot create runs", () => {
  const env = accessEnv({
    QEVRA_RESEARCH_ACCESS_MODE: "owner_only",
    QEVRA_RESEARCH_RUN_OWNER_ALLOWLIST: `${walletA},${walletB}`,
  });
  assert.deepEqual(resolveResearchRunCreationAccess("user", walletA, env), { allowed: true, mode: "owner_only" });
  assert.deepEqual(resolveResearchRunCreationAccess("user", "0x0000000000000000000000000000000000000003", env), {
    allowed: false,
    reason: "wallet_not_allowed",
  });
  assert.deepEqual(resolveResearchRunCreationAccess("operator", walletA, env), {
    allowed: false,
    reason: "wallet_authentication_required",
  });
});

test("missing, invalid, or incomplete access configuration fails closed", () => {
  assert.deepEqual(resolveResearchRunCreationAccess("user", walletA, accessEnv({ QEVRA_RESEARCH_ACCESS_MODE: "" })), {
    allowed: false,
    reason: "access_mode_not_configured",
  });
  assert.deepEqual(resolveResearchRunCreationAccess("user", walletA, accessEnv({ QEVRA_RESEARCH_ACCESS_MODE: "open" })), {
    allowed: false,
    reason: "access_mode_invalid",
  });
  assert.deepEqual(resolveResearchRunCreationAccess("user", walletA, accessEnv({
    QEVRA_RESEARCH_ACCESS_MODE: "owner_only",
    QEVRA_RESEARCH_RUN_OWNER_ALLOWLIST: "",
  })), {
    allowed: false,
    reason: "owner_allowlist_not_configured",
  });
  assert.deepEqual(resolveResearchRunCreationAccess("user", "not-an-address", accessEnv()), {
    allowed: false,
    reason: "wallet_authentication_required",
  });
});

test("run limits require explicit bounded settings and reject unlimited or malformed quotas", () => {
  assert.deepEqual(resolveResearchRunLimits({ NODE_ENV: "test" }), {
    status: "not_configured",
    reason: "research_run_limits_not_configured",
  });
  assert.deepEqual(resolveResearchRunLimits(accessEnv({ QEVRA_RESEARCH_GLOBAL_DAILY_RUN_LIMIT: "999999" })), {
    status: "invalid",
    reason: "research_run_limits_invalid",
  });
  assert.deepEqual(resolveResearchRunLimits(accessEnv()), { status: "available", limits });
});

test("admission reports wallet cooldown, global hourly and daily quotas, and active-run limits", () => {
  const cases: Array<[ResearchRunAdmissionSnapshot, string]> = [
    [{ walletCooldownRemainingSeconds: 3_600, globalHourlyRuns: 0, globalDailyRuns: 0, activeRuns: 0 }, "wallet_cooldown"],
    [{ walletCooldownRemainingSeconds: 0, globalHourlyRuns: 20, globalDailyRuns: 20, activeRuns: 0 }, "global_hourly_quota"],
    [{ walletCooldownRemainingSeconds: 0, globalHourlyRuns: 0, globalDailyRuns: 60, activeRuns: 0 }, "global_daily_quota"],
    [{ walletCooldownRemainingSeconds: 0, globalHourlyRuns: 0, globalDailyRuns: 0, activeRuns: 1 }, "max_active_runs"],
  ];
  for (const [snapshot, blocker] of cases) {
    assert.deepEqual(evaluateResearchRunAdmission(snapshot, limits), { allowed: false, reason: blocker });
  }
  assert.deepEqual(evaluateResearchRunAdmission({ walletCooldownRemainingSeconds: 0, globalHourlyRuns: 0, globalDailyRuns: 0, activeRuns: 0 }, limits), { allowed: true });
});

test("database admission rejects exhausted wallet and global quotas without inserting another run", async () => {
  const now = Date.now();
  const seed = (ownerId: string, createdAt: number, status: "queued" | "completed") => {
    const run = createQueuedRun(randomUUID(), "robinhood-readonly-wallet", "Inspect the public chain configuration.");
    run.createdAt = new Date(createdAt).toISOString();
    run.updatedAt = run.createdAt;
    run.status = status;
    return { ownerId, run, createdAt, status };
  };
  const cases: Array<{
    name: string;
    rows: AdmissionRow[];
    ownerId: string;
    limits: ResearchRunAdmissionLimits;
    expected: string;
  }> = [
    { name: "wallet cooldown", rows: [seed(walletA, now, "completed")], ownerId: walletA, limits, expected: "wallet_cooldown" },
    {
      name: "hourly quota", rows: [seed(walletA, now, "completed")], ownerId: walletB,
      limits: { ...limits, globalHourlyRunLimit: 1, globalDailyRunLimit: 2 }, expected: "global_hourly_quota",
    },
    {
      name: "daily quota", rows: [seed(walletA, now - 2 * 60 * 60_000, "completed")], ownerId: walletB,
      limits: { ...limits, globalHourlyRunLimit: 2, globalDailyRunLimit: 1 }, expected: "global_daily_quota",
    },
    {
      name: "active-run cap", rows: [seed(walletA, now, "queued")], ownerId: walletB,
      limits, expected: "max_active_runs",
    },
  ];

  for (const item of cases) {
    const store = createAdmissionStore(item.rows);
    const candidate = createQueuedRun(randomUUID(), "robinhood-readonly-wallet", "Inspect the public chain configuration.");
    const result = await store.admitResearchRun(candidate, item.ownerId, item.limits);
    assert.equal(result.allowed, false, `${item.name} should reject a run`);
    if (!result.allowed) assert.equal(result.reason, item.expected, item.name);
    const ownRuns = (await store.listRuns(10, undefined, item.ownerId)).runs;
    assert.equal(ownRuns.length, item.ownerId === walletA ? 1 : 0, `${item.name} should not persist the candidate`);
  }
});

interface AdmissionRow {
  ownerId: string;
  run: ResearchRunRecord;
  createdAt: number;
  status: string;
}

function createAdmissionStore(seed: AdmissionRow[] = []): PostgresResearchStore {
  const rows = [...seed];
  let lockTail: Promise<void> = Promise.resolve();
  const snapshot = (ownerId: string, cooldownSeconds: number) => {
    const now = Date.now();
    const owned = rows.filter((row) => row.ownerId === ownerId);
    const latest = Math.max(0, ...owned.map((row) => row.createdAt));
    return {
      wallet_cooldown_remaining_seconds: Math.max(0, Math.ceil((latest + cooldownSeconds * 1_000 - now) / 1_000)),
      global_hourly_runs: rows.filter((row) => row.createdAt >= now - 60 * 60_000).length,
      global_daily_runs: rows.filter((row) => row.createdAt >= now - 24 * 60 * 60_000).length,
      active_runs: rows.filter((row) => row.status === "queued" || row.status === "running").length,
    };
  };
  const query = async (sql: string, values?: unknown[]) => {
    if (sql.includes("research_run_admission_snapshot")) {
      return { rows: [snapshot(String(values?.[0]), Number(values?.[1]))], rowCount: 1 };
    }
    if (sql.includes("SELECT data FROM qevra_research_runs WHERE id = $1 AND owner_id = $2")) {
      const row = rows.find((entry) => entry.run.id === values?.[0] && entry.ownerId === values?.[1]);
      return { rows: row ? [{ data: row.run }] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes("SELECT data, created_at, id FROM qevra_research_runs")) {
      const ownerId = String(values?.[0]);
      const resultRows = rows.filter((entry) => entry.ownerId === ownerId).map((entry) => ({
        data: entry.run,
        created_at: new Date(entry.createdAt),
        id: entry.run.id,
      }));
      return { rows: resultRows, rowCount: resultRows.length };
    }
    if (sql.includes("INSERT INTO qevra_research_runs")) {
      rows.push({
        ownerId: String(values?.[5]),
        run: JSON.parse(String(values?.[6])) as ResearchRunRecord,
        createdAt: new Date(String(values?.[3])).getTime(),
        status: String(values?.[2]),
      });
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  };
  const pool = {
    on() { return this; },
    query,
    async connect() {
      let releaseLock: (() => void) | undefined;
      return {
        async query(sql: string, values?: unknown[]) {
          if (sql.includes("pg_advisory_xact_lock")) {
            const prior = lockTail;
            let release!: () => void;
            lockTail = new Promise<void>((resolve) => { release = resolve; });
            await prior;
            releaseLock = release;
            return { rows: [], rowCount: 1 };
          }
          const result = await query(sql, values);
          if (sql === "COMMIT" || sql === "ROLLBACK") releaseLock?.();
          return result;
        },
        release() { releaseLock?.(); },
      };
    },
  } as unknown as Pool;
  return new PostgresResearchStore("postgres://admission.test/veyra", pool);
}

test("database admission stores wallet ownership and isolates each wallet's report lookup", async () => {
  const store = createAdmissionStore();
  const run = createQueuedRun(randomUUID(), "robinhood-readonly-wallet", "Inspect read-only chain configuration.");
  const admitted = await store.admitResearchRun(run, walletA, limits);
  assert.equal(admitted.allowed, true);
  assert.equal((await store.getRun(run.id, walletA))?.id, run.id);
  assert.equal(await store.getRun(run.id, walletB), undefined);
});

test("concurrent wallet submissions cannot pass one global quota or active-run slot", async () => {
  const store = createAdmissionStore();
  const one = createQueuedRun(randomUUID(), "robinhood-readonly-wallet", "Inspect Robinhood chain metadata.");
  const two = createQueuedRun(randomUUID(), "robinhood-readonly-wallet", "Inspect Robinhood JSON-RPC metadata.");
  const strictLimits = { ...limits, globalHourlyRunLimit: 1, globalDailyRunLimit: 1, maxActiveRuns: 1 };
  const results = await Promise.all([
    store.admitResearchRun(one, walletA, strictLimits),
    store.admitResearchRun(two, walletB, strictLimits),
  ]);
  assert.equal(results.filter((result) => result.allowed).length, 1, JSON.stringify(results));
  assert.equal(results.filter((result) => !result.allowed).length, 1);
  assert.equal((await store.listRuns(10, undefined, walletA)).runs.length + (await store.listRuns(10, undefined, walletB)).runs.length, 1);
});
