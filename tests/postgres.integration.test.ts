import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { createQueuedRun } from "@/features/security/model";
import { PostgresResearchStore } from "@/features/security/store";

const databaseUrl = process.env.QEVRA_PG_INTEGRATION_URL;
const localTestDatabase = (() => {
  if (!databaseUrl) return false;
  try {
    const parsed = new URL(databaseUrl);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
      && parsed.pathname === "/qevra_phase2";
  } catch {
    return false;
  }
})();

test("isolated PostgreSQL schema, durable history, leases, concurrency, and restart reclamation", { skip: !localTestDatabase }, async () => {
  const url = databaseUrl!;
  const pool = new Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 5_000 });
  const store = new PostgresResearchStore(url, pool);
  const firstId = randomUUID();
  const secondId = randomUUID();
  const thirdId = randomUUID();
  const workerOne = `integration-${randomUUID()}`;
  const workerTwo = `integration-${randomUUID()}`;
  const workerRestarted = `integration-${randomUUID()}`;

  try {
    await store.ensureSchema();
    const staleWorker = `stale-${randomUUID()}`;
    await pool.query(
      "INSERT INTO qevra_rate_limits (bucket_key, window_started_at, request_count) VALUES ($1, now() - interval '3 days', 1)",
      [`b${"a".repeat(63)}`],
    );
    await pool.query(
      `INSERT INTO qevra_security_workers (worker_id, started_at, heartbeat_at)
       VALUES ($1, now() - interval '3 days', now() - interval '3 days')`,
      [staleWorker],
    );
    const rateCheck = await store.takeRateLimit("c".repeat(64), 5, 60_000);
    assert.equal(rateCheck.allowed, true);
    const staleCounts = await pool.query<{ rate_limits: string; workers: string }>(
      `SELECT
         (SELECT count(*)::text FROM qevra_rate_limits WHERE bucket_key = $1) AS rate_limits,
         (SELECT count(*)::text FROM qevra_security_workers WHERE worker_id = $2) AS workers`,
      [`b${"a".repeat(63)}`, staleWorker],
    );
    assert.equal(staleCounts.rows[0]?.rate_limits, "0");
    assert.equal(staleCounts.rows[0]?.workers, "0");
    const first = createQueuedRun(firstId, "security-evidence", "PostgreSQL integration run one", [], new Date(Date.now() - 2_000));
    const second = createQueuedRun(secondId, "security-evidence", "PostgreSQL integration run two", [], new Date());
    await store.createRun(first);
    await store.createRun(second);

    assert.equal((await store.getRun(firstId))?.status, "queued");
    const [workerOneClaim, workerTwoClaim] = await Promise.all([
      store.claimNextRun(workerOne, 1),
      store.claimNextRun(workerTwo, 1),
    ]);
    const firstClaim = workerOneClaim ?? workerTwoClaim;
    const firstClaimOwner = workerOneClaim ? workerOne : workerTwo;
    assert.ok(firstClaim);
    assert.equal(firstClaim.id, firstId);
    assert.equal(firstClaim.attemptCount, 1);
    assert.equal(Number(Boolean(workerOneClaim)) + Number(Boolean(workerTwoClaim)), 1, "concurrent worker claims must respect the global active-job limit");
    assert.equal(await store.extendLease(firstId, firstClaimOwner), true);
    assert.equal(await store.extendLease(firstId, firstClaimOwner === workerOne ? workerTwo : workerOne), false);

    firstClaim.status = "failed";
    firstClaim.errorCode = "integration_failure_path";
    firstClaim.errorMessage = "Sanitized integration failure.";
    firstClaim.completedAt = new Date().toISOString();
    await store.saveRun(firstClaim);
    await store.releaseLease(firstId, firstClaimOwner);
    assert.equal((await store.getRun(firstId))?.errorCode, "integration_failure_path");

    const secondClaim = await store.claimNextRun(workerTwo, 1);
    assert.ok(secondClaim);
    assert.equal(secondClaim.id, secondId);
    await pool.query("UPDATE qevra_research_runs SET lease_until = now() - interval '1 second' WHERE id = $1", [secondId]);
    const reclaimed = await store.claimNextRun(workerRestarted, 1);
    assert.ok(reclaimed);
    assert.equal(reclaimed.id, secondId, "a restarted worker must reclaim an expired lease");
    assert.equal(reclaimed.attemptCount, 2);
    assert.equal(reclaimed.currentStage, "worker_claimed");

    await store.heartbeatWorker(workerRestarted);
    assert.ok(await store.countLiveWorkers() >= 1);
    const history = await store.listRuns(50);
    assert.ok(history.runs.some((run) => run.id === firstId));
    assert.ok(history.runs.some((run) => run.id === secondId));

    reclaimed.status = "failed";
    reclaimed.errorCode = "integration_cleanup";
    reclaimed.completedAt = new Date().toISOString();
    await store.saveRun(reclaimed);
    await store.releaseLease(secondId, workerRestarted);

    const third = createQueuedRun(thirdId, "security-evidence", "PostgreSQL bounded retry run");
    await store.createRun(third);
    const attemptOne = await store.claimNextRun(workerOne, 1);
    assert.equal(attemptOne?.id, thirdId);
    await pool.query("UPDATE qevra_research_runs SET lease_until = now() - interval '1 second' WHERE id = $1", [thirdId]);
    const attemptTwo = await store.claimNextRun(workerTwo, 1);
    assert.equal(attemptTwo?.attemptCount, 2);
    await pool.query("UPDATE qevra_research_runs SET lease_until = now() - interval '1 second' WHERE id = $1", [thirdId]);
    const attemptThree = await store.claimNextRun(workerRestarted, 1);
    assert.equal(attemptThree?.attemptCount, 3);
    await pool.query("UPDATE qevra_research_runs SET lease_until = now() - interval '1 second' WHERE id = $1", [thirdId]);
    assert.equal(await store.claimNextRun(workerOne, 1), undefined, "the retry limit must fail a repeatedly interrupted job");
    const retryLimited = await store.getRun(thirdId);
    assert.equal(retryLimited?.status, "failed");
    assert.equal(retryLimited?.errorCode, "worker_retry_limit_exceeded");

    await store.stopWorker(workerRestarted);
  } finally {
    await pool.query("DELETE FROM qevra_research_runs WHERE id = ANY($1::uuid[])", [[firstId, secondId, thirdId]]).catch(() => undefined);
    await pool.query("DELETE FROM qevra_security_workers WHERE worker_id = ANY($1::text[])", [[workerOne, workerTwo, workerRestarted]]).catch(() => undefined);
    await store.close().catch(() => undefined);
  }
});
