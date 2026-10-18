import "server-only";

import { Pool, type PoolClient } from "pg";
import type { ResearchRunRecord } from "./model";

const LEASE_SECONDS = 900;
const MAX_RUN_ATTEMPTS = 3;

export class StoreNotConfiguredError extends Error {
  constructor() {
    super("The PostgreSQL database is not configured.");
    this.name = "StoreNotConfiguredError";
  }
}

let singleton: PostgresResearchStore | undefined;

export function getResearchStore(env: NodeJS.ProcessEnv = process.env): PostgresResearchStore {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new StoreNotConfiguredError();
  if (!singleton) singleton = new PostgresResearchStore(connectionString);
  return singleton;
}

export class PostgresResearchStore {
  private readonly pool: Pool;
  private schemaPromise?: Promise<void>;
  private lastOperationalCleanupAt = 0;

  constructor(connectionString: string, pool?: Pool) {
    this.pool = pool ?? new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      allowExitOnIdle: true,
    });
    // Idle pg Pool clients emit `error` when PostgreSQL restarts. Handle that
    // process-level event; active query failures still reject to the caller.
    this.pool.on("error", () => undefined);
  }

  async ensureSchema(): Promise<void> {
    if (!this.schemaPromise) {
      this.schemaPromise = this.createSchema().catch((error) => {
        this.schemaPromise = undefined;
        throw error;
      });
    }
    await this.schemaPromise;
  }

  private async createSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS qevra_research_runs (
        id uuid PRIMARY KEY,
        topic_id text NOT NULL,
        status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        lease_owner text,
        lease_until timestamptz,
        data jsonb NOT NULL
      );
      CREATE INDEX IF NOT EXISTS qevra_research_runs_created_idx
        ON qevra_research_runs (created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS qevra_research_runs_queue_idx
        ON qevra_research_runs (status, lease_until, created_at);
      CREATE TABLE IF NOT EXISTS qevra_rate_limits (
        bucket_key char(64) PRIMARY KEY,
        window_started_at timestamptz NOT NULL,
        request_count integer NOT NULL CHECK (request_count >= 0)
      );
      CREATE TABLE IF NOT EXISTS qevra_security_workers (
        worker_id text PRIMARY KEY,
        started_at timestamptz NOT NULL,
        heartbeat_at timestamptz NOT NULL
      );
    `);
  }

  async createRun(run: ResearchRunRecord): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO qevra_research_runs (id, topic_id, status, created_at, updated_at, data)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [run.id, run.topicId, run.status, run.createdAt, run.updatedAt, JSON.stringify(run)],
    );
  }

  async getRun(id: string): Promise<ResearchRunRecord | undefined> {
    await this.ensureSchema();
    const result = await this.pool.query<{ data: ResearchRunRecord }>(
      "SELECT data FROM qevra_research_runs WHERE id = $1",
      [id],
    );
    return result.rows[0]?.data;
  }

  async saveRun(run: ResearchRunRecord): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `UPDATE qevra_research_runs
       SET topic_id = $2, status = $3, updated_at = $4, data = $5::jsonb
       WHERE id = $1`,
      [run.id, run.topicId, run.status, run.updatedAt, JSON.stringify(run)],
    );
  }

  async listRuns(limit: number, cursor?: string): Promise<{ runs: ResearchRunRecord[]; nextCursor?: string }> {
    await this.ensureSchema();
    let result;
    if (cursor) {
      const decoded = Buffer.from(cursor, "base64url").toString("utf8");
      const separator = decoded.indexOf("\n");
      const timestamp = decoded.slice(0, separator);
      const id = decoded.slice(separator + 1);
      if (separator <= 0 || !Number.isFinite(Date.parse(timestamp)) || !/^[0-9a-f-]{36}$/i.test(id)) {
        throw new Error("Invalid run-list cursor.");
      }
      result = await this.pool.query<{ data: ResearchRunRecord; created_at: Date; id: string }>(
        `SELECT data, created_at, id FROM qevra_research_runs
         WHERE (created_at, id) < ($1::timestamptz, $2::uuid)
         ORDER BY created_at DESC, id DESC LIMIT $3`,
        [timestamp, id, limit + 1],
      );
    } else {
      result = await this.pool.query<{ data: ResearchRunRecord; created_at: Date; id: string }>(
        `SELECT data, created_at, id FROM qevra_research_runs
         ORDER BY created_at DESC, id DESC LIMIT $1`,
        [limit + 1],
      );
    }

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      runs: rows.map((row) => row.data),
      ...(hasMore && last ? { nextCursor: Buffer.from(`${last.created_at.toISOString()}\n${last.id}`).toString("base64url") } : {}),
    };
  }

  async claimNextRun(workerId: string, maxConcurrentRuns = 2): Promise<ResearchRunRecord | undefined> {
    if (!Number.isInteger(maxConcurrentRuns) || maxConcurrentRuns < 1 || maxConcurrentRuns > 4) {
      throw new Error("Invalid worker concurrency limit.");
    }
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize claims across workers so capacity checks and job reservation are atomic.
      await client.query("SELECT pg_advisory_xact_lock(20261018, 101)");
      const active = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM qevra_research_runs WHERE status = 'running' AND lease_until > now()",
      );
      if (Number(active.rows[0]?.count ?? 0) >= maxConcurrentRuns) {
        await client.query("COMMIT");
        return undefined;
      }
      const result = await client.query<{ id: string; data: ResearchRunRecord }>(
        `SELECT id, data FROM qevra_research_runs
         WHERE status = 'queued' OR (status = 'running' AND lease_until < now())
         ORDER BY created_at ASC, id ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return undefined;
      }

      const run = row.data;
      run.attemptCount ??= 0;
      if (run.attemptCount >= MAX_RUN_ATTEMPTS) {
        const failedAt = new Date().toISOString();
        run.status = "failed";
        run.currentStage = "failed";
        run.updatedAt = failedAt;
        run.completedAt = failedAt;
        run.errorCode = "worker_retry_limit_exceeded";
        run.errorMessage = "The research workflow stopped after repeated worker interruptions.";
        for (const agent of run.agents) {
          if (agent.status === "pending" || agent.status === "running") {
            agent.status = "blocked";
            agent.completedAt = failedAt;
            agent.errorCode = "worker_retry_limit_exceeded";
          }
        }
        run.events.push({ at: failedAt, stage: "failed", message: "The workflow reached its bounded worker retry limit." });
        await client.query(
          `UPDATE qevra_research_runs
           SET status = 'failed', updated_at = $2, lease_owner = NULL, lease_until = NULL, data = $3::jsonb
           WHERE id = $1`,
          [run.id, failedAt, JSON.stringify(run)],
        );
        await client.query("COMMIT");
        return undefined;
      }
      run.attemptCount += 1;
      run.status = "running";
      run.startedAt ??= new Date().toISOString();
      run.completedAt = undefined;
      run.errorCode = undefined;
      run.errorMessage = undefined;
      run.research = undefined;
      run.analysis = undefined;
      run.verification = undefined;
      run.findings = [];
      run.sources = [];
      run.assumptions = [];
      run.limitations = [];
      run.recommendations = [];
      for (const agent of run.agents) {
        agent.status = "pending";
        agent.startedAt = undefined;
        agent.completedAt = undefined;
        agent.errorCode = undefined;
        agent.output = undefined;
        agent.usage = undefined;
      }
      for (const test of run.tests) {
        if (test.status === "running") {
          test.status = "queued";
          test.startedAt = undefined;
        }
      }
      run.currentStage = "worker_claimed";
      run.updatedAt = new Date().toISOString();
      run.events.push({ at: run.updatedAt, stage: "worker_claimed", message: "A worker claimed this run." });

      await client.query(
        `UPDATE qevra_research_runs
         SET status = 'running', updated_at = $2, lease_owner = $3,
             lease_until = now() + ($4 * interval '1 second'), data = $5::jsonb
         WHERE id = $1`,
        [run.id, run.updatedAt, workerId, LEASE_SECONDS, JSON.stringify(run)],
      );
      await client.query("COMMIT");
      return run;
    } catch (error) {
      await safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async extendLease(runId: string, workerId: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `UPDATE qevra_research_runs SET lease_until = now() + ($3 * interval '1 second')
       WHERE id = $1 AND lease_owner = $2 AND status = 'running'`,
      [runId, workerId, LEASE_SECONDS],
    );
    return result.rowCount === 1;
  }

  async heartbeatWorker(workerId: string): Promise<void> {
    await this.ensureSchema();
    await this.cleanupOperationalRows();
    await this.pool.query(
      `INSERT INTO qevra_security_workers (worker_id, started_at, heartbeat_at)
       VALUES ($1, now(), now())
       ON CONFLICT (worker_id) DO UPDATE SET heartbeat_at = now()`,
      [workerId],
    );
  }

  async countLiveWorkers(staleAfterMs = 90_000): Promise<number> {
    await this.ensureSchema();
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM qevra_security_workers
       WHERE heartbeat_at >= now() - ($1 * interval '1 millisecond')`,
      [staleAfterMs],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async stopWorker(workerId: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query("DELETE FROM qevra_security_workers WHERE worker_id = $1", [workerId]);
  }

  async releaseLease(runId: string, workerId: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `UPDATE qevra_research_runs SET lease_owner = NULL, lease_until = NULL
       WHERE id = $1 AND lease_owner = $2 AND status IN ('completed', 'failed')`,
      [runId, workerId],
    );
  }

  async takeRateLimit(keyHash: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number }> {
    await this.ensureSchema();
    await this.cleanupOperationalRows();
    const result = await this.pool.query<{ request_count: number }>(
      `INSERT INTO qevra_rate_limits (bucket_key, window_started_at, request_count)
       VALUES ($1, now(), 1)
       ON CONFLICT (bucket_key) DO UPDATE SET
         request_count = CASE
           WHEN qevra_rate_limits.window_started_at + ($2 * interval '1 millisecond') <= now() THEN 1
           ELSE qevra_rate_limits.request_count + 1
         END,
         window_started_at = CASE
           WHEN qevra_rate_limits.window_started_at + ($2 * interval '1 millisecond') <= now() THEN now()
           ELSE qevra_rate_limits.window_started_at
         END
       RETURNING request_count`,
      [keyHash, windowMs],
    );
    const count = result.rows[0]?.request_count ?? limit + 1;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  }

  private async cleanupOperationalRows(): Promise<void> {
    const now = Date.now();
    if (now - this.lastOperationalCleanupAt < 60 * 60_000) return;
    await this.pool.query(`
      DELETE FROM qevra_rate_limits WHERE window_started_at < now() - interval '1 day';
      DELETE FROM qevra_security_workers WHERE heartbeat_at < now() - interval '1 day';
    `);
    this.lastOperationalCleanupAt = now;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

async function safeRollback(client: PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Keep the original transaction error.
  }
}
