import "server-only";

import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { isGroqGptOssProfile } from "./groq-profile";
import type { ResearchHumanReviewRecord } from "@/types/integrations";
import type { ResearchRunRecord, StoredHumanReview } from "./model";
import {
  evaluateResearchRunAdmission,
  type ResearchRunAdmissionLimits,
  type ResearchRunAdmissionSnapshot,
  type ResearchRunAdmissionBlocker,
} from "./run-creation-policy";

const LEASE_SECONDS = 900;
const DEFAULT_MAX_RUN_ATTEMPTS = 3;

function maxRunAttempts(env: NodeJS.ProcessEnv): number {
  if (isGroqGptOssProfile(env.QEVRA_AI_MODEL, env.QEVRA_AI_BASE_URL)) return 1;
  const configured = env.QEVRA_MAX_RUN_ATTEMPTS?.trim();
  if (configured) {
    const parsed = Number(configured);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3 ? parsed : 1;
  }
  return DEFAULT_MAX_RUN_ATTEMPTS;
}

export class StoreNotConfiguredError extends Error {
  constructor() {
    super("The PostgreSQL database is not configured.");
    this.name = "StoreNotConfiguredError";
  }
}

export interface WalletAuthChallenge {
  nonceHash: string;
  address: string;
  chainId: number;
  message: string;
  expiresAt: string;
}

export type AuthIdentityProvider = "wallet" | "google" | "email" | "password";

export interface AuthIdentityInput {
  provider: AuthIdentityProvider;
  subject: string;
  email?: string;
  emailVerified: boolean;
}

export interface AuthIdentityRecord extends AuthIdentityInput {
  userId: string;
}

export interface AuthSessionRecord {
  userId: string;
  provider: AuthIdentityProvider;
  subject: string;
  email?: string;
  expiresAt: string;
}

export interface AuthPasswordCredentialRecord {
  userId: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface AuthAccountProfileRecord {
  userId: string;
  email?: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthEmbeddedWalletRecord {
  provider: "privy";
  providerUserId: string;
  providerWalletId: string;
  address: string;
  createdAt: string;
  verifiedAt: string;
}

export interface WalletLinkChallenge extends WalletAuthChallenge {
  userId: string;
}

export type ResearchRunAdmissionDecision =
  | { allowed: true; snapshot: ResearchRunAdmissionSnapshot }
  | { allowed: false; reason: ResearchRunAdmissionBlocker; snapshot: ResearchRunAdmissionSnapshot };

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
        owner_id text,
        lease_owner text,
        lease_until timestamptz,
        data jsonb NOT NULL
      );
      ALTER TABLE qevra_research_runs ADD COLUMN IF NOT EXISTS owner_id text;
      CREATE INDEX IF NOT EXISTS qevra_research_runs_created_idx
        ON qevra_research_runs (created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS qevra_research_runs_owner_created_idx
        ON qevra_research_runs (owner_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS qevra_research_runs_queue_idx
        ON qevra_research_runs (status, lease_until, created_at);
      CREATE TABLE IF NOT EXISTS qevra_security_human_reviews (
        run_id uuid PRIMARY KEY REFERENCES qevra_research_runs(id) ON DELETE CASCADE,
        reviewer_id text NOT NULL,
        decision text NOT NULL CHECK (decision IN ('evidence_supported', 'needs_investigation', 'insufficient_evidence')),
        notes text CHECK (notes IS NULL OR length(notes) BETWEEN 1 AND 1000),
        reviewed_at timestamptz NOT NULL DEFAULT now()
      );
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
      CREATE TABLE IF NOT EXISTS veyra_user_auth_challenges (
        nonce_hash char(64) PRIMARY KEY,
        wallet_address text NOT NULL,
        chain_id integer NOT NULL CHECK (chain_id IN (46630, 4663)),
        message text NOT NULL,
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS veyra_user_auth_challenges_expiry_idx
        ON veyra_user_auth_challenges (expires_at);
      CREATE TABLE IF NOT EXISTS veyra_auth_users (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS veyra_auth_identities (
        provider text NOT NULL CONSTRAINT veyra_auth_identities_provider_check
          CHECK (provider IN ('wallet', 'google', 'email', 'password')),
        provider_subject text NOT NULL,
        user_id uuid NOT NULL REFERENCES veyra_auth_users(id) ON DELETE CASCADE,
        email text,
        email_verified boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (provider, provider_subject)
      );
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'veyra_auth_identities'::regclass
            AND conname = 'veyra_auth_identities_provider_check'
            AND pg_get_constraintdef(oid) LIKE '%password%'
        ) THEN
          ALTER TABLE veyra_auth_identities DROP CONSTRAINT IF EXISTS veyra_auth_identities_provider_check;
          ALTER TABLE veyra_auth_identities ADD CONSTRAINT veyra_auth_identities_provider_check
            CHECK (provider IN ('wallet', 'google', 'email', 'password'));
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS veyra_auth_identities_user_idx ON veyra_auth_identities (user_id);
      CREATE TABLE IF NOT EXISTS veyra_auth_sessions (
        session_hash char(64) PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES veyra_auth_users(id) ON DELETE CASCADE,
        provider text NOT NULL CONSTRAINT veyra_auth_sessions_provider_check
          CHECK (provider IN ('wallet', 'google', 'email', 'password')),
        provider_subject text NOT NULL,
        email text,
        wallet_session_hash char(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz
      );
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'veyra_auth_sessions'::regclass
            AND conname = 'veyra_auth_sessions_provider_check'
            AND pg_get_constraintdef(oid) LIKE '%password%'
        ) THEN
          ALTER TABLE veyra_auth_sessions DROP CONSTRAINT IF EXISTS veyra_auth_sessions_provider_check;
          ALTER TABLE veyra_auth_sessions ADD CONSTRAINT veyra_auth_sessions_provider_check
            CHECK (provider IN ('wallet', 'google', 'email', 'password'));
        END IF;
      END $$;
      ALTER TABLE veyra_auth_sessions ADD COLUMN IF NOT EXISTS wallet_session_hash char(64);
      CREATE INDEX IF NOT EXISTS veyra_auth_sessions_user_idx ON veyra_auth_sessions (user_id, expires_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS veyra_auth_sessions_wallet_session_idx
        ON veyra_auth_sessions (wallet_session_hash) WHERE wallet_session_hash IS NOT NULL;
      CREATE TABLE IF NOT EXISTS veyra_auth_wallet_revocations (
        wallet_session_hash char(64) PRIMARY KEY,
        revoked_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS veyra_auth_email_challenges (
        email_hash char(64) PRIMARY KEY,
        code_hash char(64) NOT NULL,
        attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS veyra_auth_email_challenges_expiry_idx ON veyra_auth_email_challenges (expires_at);
      CREATE TABLE IF NOT EXISTS veyra_auth_google_states (
        state_hash char(64) PRIMARY KEY,
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS veyra_auth_google_states_expiry_idx ON veyra_auth_google_states (expires_at);
      CREATE TABLE IF NOT EXISTS veyra_auth_wallet_link_challenges (
        nonce_hash char(64) PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES veyra_auth_users(id) ON DELETE CASCADE,
        wallet_address text NOT NULL,
        chain_id integer NOT NULL CHECK (chain_id IN (46630, 4663)),
        message text NOT NULL,
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS veyra_auth_wallet_link_challenges_expiry_idx ON veyra_auth_wallet_link_challenges (expires_at);
      CREATE TABLE IF NOT EXISTS veyra_auth_password_credentials (
        user_id uuid PRIMARY KEY REFERENCES veyra_auth_users(id) ON DELETE CASCADE,
        email_normalized text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS veyra_auth_embedded_wallets (
        user_id uuid PRIMARY KEY REFERENCES veyra_auth_users(id) ON DELETE CASCADE,
        provider text NOT NULL CHECK (provider = 'privy'),
        provider_user_id text NOT NULL,
        provider_wallet_id text NOT NULL UNIQUE,
        address text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        verified_at timestamptz NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS veyra_auth_embedded_wallets_address_idx
        ON veyra_auth_embedded_wallets (lower(address));
    `);
  }

  async createPasswordAccount(input: {
    email: string;
    passwordHash: string;
    sessionHash: string;
    expiresAt: string;
  }): Promise<AuthAccountProfileRecord> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    const userId = randomUUID();
    try {
      await client.query("BEGIN");
      const user = await client.query<{ created_at: Date }>(
        "INSERT INTO veyra_auth_users (id) VALUES ($1) RETURNING created_at",
        [userId],
      );
      await client.query(
        `INSERT INTO veyra_auth_identities (provider, provider_subject, user_id, email, email_verified)
         VALUES ('password', $1, $2, $1, false)`,
        [input.email, userId],
      );
      await client.query(
        "INSERT INTO veyra_auth_password_credentials (user_id, email_normalized, password_hash) VALUES ($1, $2, $3)",
        [userId, input.email, input.passwordHash],
      );
      await client.query(
        `INSERT INTO veyra_auth_sessions (session_hash, user_id, provider, provider_subject, email, expires_at)
         VALUES ($1, $2, 'password', $3, $3, $4)`,
        [input.sessionHash, userId, input.email, input.expiresAt],
      );
      await client.query("COMMIT");
      return {
        userId,
        email: input.email,
        emailVerified: false,
        createdAt: user.rows[0]?.created_at.toISOString() ?? new Date().toISOString(),
      };
    } catch (error) {
      await safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async getPasswordCredential(email: string): Promise<AuthPasswordCredentialRecord | undefined> {
    await this.ensureSchema();
    const result = await this.pool.query<{
      user_id: string;
      email_normalized: string;
      password_hash: string;
      created_at: Date;
    }>(
      `SELECT user_id, email_normalized, password_hash, created_at
       FROM veyra_auth_password_credentials WHERE email_normalized = $1`,
      [email],
    );
    const row = result.rows[0];
    return row ? {
      userId: row.user_id,
      email: row.email_normalized,
      passwordHash: row.password_hash,
      createdAt: row.created_at.toISOString(),
    } : undefined;
  }

  async getAccountProfile(userId: string): Promise<AuthAccountProfileRecord | undefined> {
    await this.ensureSchema();
    const result = await this.pool.query<{
      user_id: string;
      email: string | null;
      email_verified: boolean;
      created_at: Date;
    }>(
      `SELECT u.id AS user_id,
              COALESCE(pc.email_normalized, ai.email) AS email,
              COALESCE(ai.email_verified, false) AS email_verified,
              u.created_at
       FROM veyra_auth_users u
       LEFT JOIN veyra_auth_password_credentials pc ON pc.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT email, email_verified FROM veyra_auth_identities
         WHERE user_id = u.id AND email IS NOT NULL
         ORDER BY email_verified DESC, created_at ASC LIMIT 1
       ) ai ON true
       WHERE u.id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return row ? {
      userId: row.user_id,
      ...(row.email ? { email: row.email } : {}),
      emailVerified: row.email_verified,
      createdAt: row.created_at.toISOString(),
    } : undefined;
  }

  async getEmbeddedWallet(userId: string): Promise<AuthEmbeddedWalletRecord | undefined> {
    await this.ensureSchema();
    const result = await this.pool.query<{
      provider: "privy";
      provider_user_id: string;
      provider_wallet_id: string;
      address: string;
      created_at: Date;
      verified_at: Date;
    }>(
      `SELECT provider, provider_user_id, provider_wallet_id, address, created_at, verified_at
       FROM veyra_auth_embedded_wallets WHERE user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return row ? {
      provider: row.provider,
      providerUserId: row.provider_user_id,
      providerWalletId: row.provider_wallet_id,
      address: row.address,
      createdAt: row.created_at.toISOString(),
      verifiedAt: row.verified_at.toISOString(),
    } : undefined;
  }

  async getLinkedWalletAddress(userId: string, requestedAddress?: string): Promise<string | undefined> {
    await this.ensureSchema();
    const result = requestedAddress
      ? await this.pool.query<{ provider_subject: string }>(
        `SELECT provider_subject FROM veyra_auth_identities
         WHERE provider = 'wallet' AND user_id = $1 AND lower(provider_subject) = lower($2)
         LIMIT 1`,
        [userId, requestedAddress],
      )
      : await this.pool.query<{ provider_subject: string }>(
        `SELECT provider_subject FROM veyra_auth_identities
         WHERE provider = 'wallet' AND user_id = $1
         ORDER BY created_at ASC LIMIT 1`,
        [userId],
      );
    return result.rows[0]?.provider_subject;
  }

  async createOrGetAuthIdentity(identity: AuthIdentityInput): Promise<AuthIdentityRecord> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    const candidateUserId = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO veyra_auth_users (id) VALUES ($1)", [candidateUserId]);
      const inserted = await client.query<{ user_id: string }>(
        `INSERT INTO veyra_auth_identities (provider, provider_subject, user_id, email, email_verified)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (provider, provider_subject) DO UPDATE
           SET email = COALESCE(EXCLUDED.email, veyra_auth_identities.email),
               email_verified = veyra_auth_identities.email_verified OR EXCLUDED.email_verified,
               updated_at = now()
         RETURNING user_id`,
        [identity.provider, identity.subject, candidateUserId, identity.email ?? null, identity.emailVerified],
      );
      const userId = inserted.rows[0]?.user_id;
      if (!userId) throw new Error("auth_identity_persist_failed");
      if (userId !== candidateUserId) {
        await client.query("DELETE FROM veyra_auth_users WHERE id = $1", [candidateUserId]);
      }
      await client.query("COMMIT");
      return { ...identity, userId };
    } catch (error) {
      await safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async createAuthSession(input: AuthSessionRecord & { sessionHash: string; walletSessionHash?: string }): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO veyra_auth_sessions (session_hash, user_id, provider, provider_subject, email, wallet_session_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [input.sessionHash, input.userId, input.provider, input.subject, input.email ?? null, input.walletSessionHash ?? null, input.expiresAt],
    );
  }

  async getAuthSession(sessionHash: string): Promise<AuthSessionRecord | undefined> {
    await this.ensureSchema();
    const result = await this.pool.query<{
      user_id: string;
      provider: AuthIdentityProvider;
      provider_subject: string;
      email: string | null;
      expires_at: Date;
    }>(
      `SELECT user_id, provider, provider_subject, email, expires_at
       FROM veyra_auth_sessions
       WHERE session_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [sessionHash],
    );
    const row = result.rows[0];
    return row ? {
      userId: row.user_id,
      provider: row.provider,
      subject: row.provider_subject,
      ...(row.email ? { email: row.email } : {}),
      expiresAt: row.expires_at.toISOString(),
    } : undefined;
  }

  async revokeAuthSession(sessionHash: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query("UPDATE veyra_auth_sessions SET revoked_at = now() WHERE session_hash = $1 AND revoked_at IS NULL", [sessionHash]);
  }

  async revokeWalletAuthSession(walletSessionHash: string, expiresAt: string): Promise<void> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE veyra_auth_sessions SET revoked_at = now() WHERE wallet_session_hash = $1 AND revoked_at IS NULL",
        [walletSessionHash],
      );
      await client.query(
        `INSERT INTO veyra_auth_wallet_revocations (wallet_session_hash, expires_at)
         VALUES ($1, $2) ON CONFLICT (wallet_session_hash) DO UPDATE
         SET revoked_at = now(), expires_at = GREATEST(veyra_auth_wallet_revocations.expires_at, EXCLUDED.expires_at)`,
        [walletSessionHash, expiresAt],
      );
      await client.query("COMMIT");
    } catch (error) {
      await safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async walletAuthSessionIsRevoked(walletSessionHash: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.pool.query<{ revoked: boolean }>(
      `SELECT (
         EXISTS (SELECT 1 FROM veyra_auth_sessions WHERE wallet_session_hash = $1 AND (revoked_at IS NOT NULL OR expires_at <= now()))
         OR EXISTS (SELECT 1 FROM veyra_auth_wallet_revocations WHERE wallet_session_hash = $1 AND expires_at > now())
       ) AS revoked`,
      [walletSessionHash],
    );
    return result.rows[0]?.revoked === true;
  }

  async attachWalletSessionToAuthSession(sessionHash: string, walletSessionHash: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `UPDATE veyra_auth_sessions SET wallet_session_hash = $2
       WHERE session_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [sessionHash, walletSessionHash],
    );
    return result.rowCount === 1;
  }

  async createEmailOtpChallenge(emailHash: string, codeHash: string, expiresAt: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO veyra_auth_email_challenges (email_hash, code_hash, attempt_count, expires_at, consumed_at)
       VALUES ($1, $2, 0, $3, NULL)
       ON CONFLICT (email_hash) DO UPDATE SET code_hash = EXCLUDED.code_hash,
         attempt_count = 0, expires_at = EXCLUDED.expires_at, consumed_at = NULL`,
      [emailHash, codeHash, expiresAt],
    );
  }

  async consumeEmailOtpChallenge(emailHash: string, codeHash: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.pool.query<{ valid: boolean }>(
      `UPDATE veyra_auth_email_challenges
       SET attempt_count = attempt_count + 1,
           consumed_at = CASE WHEN code_hash = $2 THEN now() ELSE consumed_at END
       WHERE email_hash = $1 AND consumed_at IS NULL AND expires_at > now() AND attempt_count < 5
       RETURNING (code_hash = $2) AS valid`,
      [emailHash, codeHash],
    );
    return result.rows[0]?.valid === true;
  }

  async deleteEmailOtpChallenge(emailHash: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query("DELETE FROM veyra_auth_email_challenges WHERE email_hash = $1", [emailHash]);
  }

  async createGoogleOAuthState(stateHash: string, expiresAt: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query("INSERT INTO veyra_auth_google_states (state_hash, expires_at) VALUES ($1, $2)", [stateHash, expiresAt]);
  }

  async consumeGoogleOAuthState(stateHash: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.pool.query(
      "DELETE FROM veyra_auth_google_states WHERE state_hash = $1 AND expires_at > now() RETURNING state_hash",
      [stateHash],
    );
    return result.rowCount === 1;
  }

  async createWalletLinkChallenge(challenge: WalletLinkChallenge): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO veyra_auth_wallet_link_challenges (nonce_hash, user_id, wallet_address, chain_id, message, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [challenge.nonceHash, challenge.userId, challenge.address, challenge.chainId, challenge.message, challenge.expiresAt],
    );
  }

  async getWalletLinkChallenge(nonceHash: string, userId: string): Promise<WalletLinkChallenge | undefined> {
    await this.ensureSchema();
    const result = await this.pool.query<{
      nonce_hash: string;
      user_id: string;
      wallet_address: string;
      chain_id: number;
      message: string;
      expires_at: Date;
    }>(
      `SELECT nonce_hash, user_id, wallet_address, chain_id, message, expires_at
       FROM veyra_auth_wallet_link_challenges WHERE nonce_hash = $1 AND user_id = $2 AND expires_at > now()`,
      [nonceHash, userId],
    );
    const row = result.rows[0];
    return row ? {
      nonceHash: row.nonce_hash.trim(),
      userId: row.user_id,
      address: row.wallet_address,
      chainId: row.chain_id,
      message: row.message,
      expiresAt: row.expires_at.toISOString(),
    } : undefined;
  }

  async consumeWalletLinkChallenge(nonceHash: string, userId: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `DELETE FROM veyra_auth_wallet_link_challenges
       WHERE nonce_hash = $1 AND user_id = $2 AND expires_at > now() RETURNING nonce_hash`,
      [nonceHash, userId],
    );
    return result.rowCount === 1;
  }

  async linkWalletIdentity(userId: string, address: string): Promise<boolean> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    const subject = address.toLowerCase();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ user_id: string }>(
        "SELECT user_id FROM veyra_auth_identities WHERE provider = 'wallet' AND provider_subject = $1 FOR UPDATE",
        [subject],
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return existing.rows[0].user_id === userId;
      }
      const inserted = await client.query(
        `INSERT INTO veyra_auth_identities (provider, provider_subject, user_id, email, email_verified)
         VALUES ('wallet', $1, $2, NULL, false) ON CONFLICT (provider, provider_subject) DO NOTHING RETURNING user_id`,
        [subject, userId],
      );
      if (inserted.rowCount !== 1) {
        const raced = await client.query<{ user_id: string }>(
          "SELECT user_id FROM veyra_auth_identities WHERE provider = 'wallet' AND provider_subject = $1",
          [subject],
        );
        await client.query("COMMIT");
        return raced.rows[0]?.user_id === userId;
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async createRun(run: ResearchRunRecord, ownerId?: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO qevra_research_runs (id, topic_id, status, created_at, updated_at, owner_id, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [run.id, run.topicId, run.status, run.createdAt, run.updatedAt, ownerId ?? null, JSON.stringify(run)],
    );
  }

  async getResearchRunAdmissionSnapshot(
    ownerId: string,
    walletCooldownSeconds: number,
  ): Promise<ResearchRunAdmissionSnapshot> {
    if (!/^0x[a-f0-9]{40}$/i.test(ownerId)) throw new Error("Invalid authenticated research owner.");
    if (!Number.isInteger(walletCooldownSeconds) || walletCooldownSeconds < 60 || walletCooldownSeconds > 86_400) {
      throw new Error("Invalid research wallet cooldown.");
    }
    await this.ensureSchema();
    const result = await this.pool.query<{
      wallet_cooldown_remaining_seconds: number | string;
      global_hourly_runs: number | string;
      global_daily_runs: number | string;
      active_runs: number | string;
    }>(
      `SELECT /* research_run_admission_snapshot */
         COALESCE(GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
           max(created_at) FILTER (WHERE owner_id = $1)
             + ($2::integer * interval '1 second') - now()
         ))))::integer, 0) AS wallet_cooldown_remaining_seconds,
         count(*) FILTER (WHERE created_at >= now() - interval '1 hour')::integer AS global_hourly_runs,
         count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::integer AS global_daily_runs,
         count(*) FILTER (WHERE status = 'queued' OR (status = 'running' AND (lease_until IS NULL OR lease_until > now())))::integer AS active_runs
       FROM qevra_research_runs`,
      [ownerId.toLowerCase(), walletCooldownSeconds],
    );
    const row = result.rows[0];
    return {
      walletCooldownRemainingSeconds: Number(row?.wallet_cooldown_remaining_seconds ?? 0),
      globalHourlyRuns: Number(row?.global_hourly_runs ?? 0),
      globalDailyRuns: Number(row?.global_daily_runs ?? 0),
      activeRuns: Number(row?.active_runs ?? 0),
    };
  }

  async admitResearchRun(
    run: ResearchRunRecord,
    ownerId: string,
    limits: ResearchRunAdmissionLimits,
  ): Promise<ResearchRunAdmissionDecision> {
    if (!/^0x[a-f0-9]{40}$/i.test(ownerId)) throw new Error("Invalid authenticated research owner.");
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Share the worker's lock so two API processes cannot over-admit while a worker claims capacity.
      await client.query("SELECT pg_advisory_xact_lock(20261018, 101)");
      const result = await client.query<{
        wallet_cooldown_remaining_seconds: number | string;
        global_hourly_runs: number | string;
        global_daily_runs: number | string;
        active_runs: number | string;
      }>(
        `SELECT /* research_run_admission_snapshot */
           COALESCE(GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
             max(created_at) FILTER (WHERE owner_id = $1)
               + ($2::integer * interval '1 second') - now()
           ))))::integer, 0) AS wallet_cooldown_remaining_seconds,
           count(*) FILTER (WHERE created_at >= now() - interval '1 hour')::integer AS global_hourly_runs,
           count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::integer AS global_daily_runs,
           count(*) FILTER (WHERE status = 'queued' OR (status = 'running' AND (lease_until IS NULL OR lease_until > now())))::integer AS active_runs
         FROM qevra_research_runs`,
        [ownerId, limits.walletCooldownSeconds],
      );
      const row = result.rows[0];
      const snapshot: ResearchRunAdmissionSnapshot = {
        walletCooldownRemainingSeconds: Number(row?.wallet_cooldown_remaining_seconds ?? 0),
        globalHourlyRuns: Number(row?.global_hourly_runs ?? 0),
        globalDailyRuns: Number(row?.global_daily_runs ?? 0),
        activeRuns: Number(row?.active_runs ?? 0),
      };
      const decision = evaluateResearchRunAdmission(snapshot, limits);
      if (!decision.allowed) {
        await client.query("COMMIT");
        return { ...decision, snapshot };
      }
      await client.query(
        `INSERT INTO qevra_research_runs (id, topic_id, status, created_at, updated_at, owner_id, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [run.id, run.topicId, run.status, run.createdAt, run.updatedAt, ownerId.toLowerCase(), JSON.stringify(run)],
      );
      await client.query("COMMIT");
      return { allowed: true, snapshot };
    } catch (error) {
      await safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async getRun(id: string, ownerId?: string): Promise<ResearchRunRecord | undefined> {
    await this.ensureSchema();
    const result = await this.pool.query<{ data: ResearchRunRecord }>(
      ownerId === undefined
        ? "SELECT data FROM qevra_research_runs WHERE id = $1"
        : "SELECT data FROM qevra_research_runs WHERE id = $1 AND owner_id = $2",
      ownerId === undefined ? [id] : [id, ownerId],
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

  async saveHumanReview(
    runId: string,
    reviewerId: string,
    decision: ResearchHumanReviewRecord["decision"],
    notes?: string,
  ): Promise<StoredHumanReview | undefined> {
    if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error("Invalid research run ID for human review.");
    if (!/^0x[a-f0-9]{40}$/i.test(reviewerId)) throw new Error("Invalid authenticated human reviewer.");
    const normalizedReviewerId = reviewerId.toLowerCase();
    await this.ensureSchema();
    const result = await this.pool.query<{
      run_id: string;
      reviewer_id: string;
      decision: ResearchHumanReviewRecord["decision"];
      notes: string | null;
      reviewed_at: Date | string;
    }>(
      `INSERT INTO qevra_security_human_reviews (run_id, reviewer_id, decision, notes, reviewed_at)
       SELECT run.id, run.owner_id, $3, $4, now()
       FROM qevra_research_runs AS run
       WHERE run.id = $1 AND run.owner_id = $2 AND run.status = 'completed'
       ON CONFLICT (run_id) DO UPDATE
         SET decision = EXCLUDED.decision, notes = EXCLUDED.notes, reviewed_at = now()
         WHERE qevra_security_human_reviews.reviewer_id = EXCLUDED.reviewer_id
       RETURNING run_id, reviewer_id, decision, notes, reviewed_at`,
      [runId, normalizedReviewerId, decision, notes ?? null],
    );
    const row = result.rows[0];
    return row ? {
      runId: row.run_id,
      reviewerId: row.reviewer_id,
      decision: row.decision,
      ...(row.notes ? { notes: row.notes } : {}),
      reviewedAt: new Date(row.reviewed_at).toISOString(),
    } : undefined;
  }

  async getHumanReview(runId: string, ownerId: string): Promise<StoredHumanReview | undefined> {
    if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error("Invalid research run ID for human review.");
    if (!/^0x[a-f0-9]{40}$/i.test(ownerId)) throw new Error("Invalid authenticated research owner.");
    await this.ensureSchema();
    const result = await this.pool.query<{
      run_id: string;
      reviewer_id: string;
      decision: ResearchHumanReviewRecord["decision"];
      notes: string | null;
      reviewed_at: Date | string;
    }>(
      `SELECT review.run_id, review.reviewer_id, review.decision, review.notes, review.reviewed_at
       FROM qevra_security_human_reviews AS review
       INNER JOIN qevra_research_runs AS run ON run.id = review.run_id
       WHERE review.run_id = $1 AND run.owner_id = $2 AND review.reviewer_id = $2`,
      [runId, ownerId.toLowerCase()],
    );
    const row = result.rows[0];
    return row ? {
      runId: row.run_id,
      reviewerId: row.reviewer_id,
      decision: row.decision,
      ...(row.notes ? { notes: row.notes } : {}),
      reviewedAt: new Date(row.reviewed_at).toISOString(),
    } : undefined;
  }

  async listRuns(limit: number, cursor?: string, ownerId?: string): Promise<{ runs: ResearchRunRecord[]; nextCursor?: string }> {
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
      result = ownerId === undefined
        ? await this.pool.query<{ data: ResearchRunRecord; created_at: Date; id: string }>(
          `SELECT data, created_at, id FROM qevra_research_runs
           WHERE (created_at, id) < ($1::timestamptz, $2::uuid)
           ORDER BY created_at DESC, id DESC LIMIT $3`,
          [timestamp, id, limit + 1],
        )
        : await this.pool.query<{ data: ResearchRunRecord; created_at: Date; id: string }>(
          `SELECT data, created_at, id FROM qevra_research_runs
           WHERE owner_id = $1 AND (created_at, id) < ($2::timestamptz, $3::uuid)
           ORDER BY created_at DESC, id DESC LIMIT $4`,
          [ownerId, timestamp, id, limit + 1],
        );
    } else {
      result = ownerId === undefined
        ? await this.pool.query<{ data: ResearchRunRecord; created_at: Date; id: string }>(
          `SELECT data, created_at, id FROM qevra_research_runs
           ORDER BY created_at DESC, id DESC LIMIT $1`,
          [limit + 1],
        )
        : await this.pool.query<{ data: ResearchRunRecord; created_at: Date; id: string }>(
          `SELECT data, created_at, id FROM qevra_research_runs
           WHERE owner_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
          [ownerId, limit + 1],
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
      if (run.attemptCount >= maxRunAttempts(process.env)) {
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

  async createWalletAuthChallenge(challenge: WalletAuthChallenge): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO veyra_user_auth_challenges (nonce_hash, wallet_address, chain_id, message, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [challenge.nonceHash, challenge.address, challenge.chainId, challenge.message, challenge.expiresAt],
    );
  }

  async getWalletAuthChallenge(nonceHash: string): Promise<WalletAuthChallenge | undefined> {
    await this.ensureSchema();
    const result = await this.pool.query<{
      nonce_hash: string;
      wallet_address: string;
      chain_id: number;
      message: string;
      expires_at: Date;
    }>(
      `SELECT nonce_hash, wallet_address, chain_id, message, expires_at
       FROM veyra_user_auth_challenges WHERE nonce_hash = $1 AND expires_at > now()`,
      [nonceHash],
    );
    const row = result.rows[0];
    return row ? {
      nonceHash: row.nonce_hash.trim(),
      address: row.wallet_address,
      chainId: row.chain_id,
      message: row.message,
      expiresAt: row.expires_at.toISOString(),
    } : undefined;
  }

  async consumeWalletAuthChallenge(nonceHash: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.pool.query(
      "DELETE FROM veyra_user_auth_challenges WHERE nonce_hash = $1 AND expires_at > now() RETURNING nonce_hash",
      [nonceHash],
    );
    return result.rowCount === 1;
  }

  private async cleanupOperationalRows(): Promise<void> {
    const now = Date.now();
    if (now - this.lastOperationalCleanupAt < 60 * 60_000) return;
    await this.pool.query(`
      DELETE FROM qevra_rate_limits WHERE window_started_at < now() - interval '1 day';
      DELETE FROM qevra_security_workers WHERE heartbeat_at < now() - interval '1 day';
      DELETE FROM veyra_user_auth_challenges WHERE expires_at < now();
      DELETE FROM veyra_auth_sessions WHERE expires_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days';
      DELETE FROM veyra_auth_email_challenges WHERE expires_at < now() OR consumed_at < now() - interval '1 day';
      DELETE FROM veyra_auth_google_states WHERE expires_at < now();
      DELETE FROM veyra_auth_wallet_link_challenges WHERE expires_at < now();
      DELETE FROM veyra_auth_wallet_revocations WHERE expires_at < now();
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
