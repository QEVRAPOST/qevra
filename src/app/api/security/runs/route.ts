import { randomUUID } from "node:crypto";
import { apiError, requireResearchAccess } from "@/features/security/api";
import { hashRateLimitKey, readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";
import { createQueuedRun } from "@/features/security/model";
import { getModelProvider } from "@/features/security/provider";
import { toResearchRunSummary } from "@/features/security/public-view";
import { createResearchRunRequestSchema, runListQuerySchema } from "@/features/security/schemas";
import { resolveResearchTopic } from "@/features/security/topics";
import { StoreNotConfiguredError } from "@/features/security/store";
import { resolveResearchRunCreationAccess, resolveResearchRunLimits } from "@/features/security/run-creation-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireResearchAccess(request, 60, 60_000);
  if ("response" in access) return access.response;
  const url = new URL(request.url);
  const query = runListQuerySchema.safeParse({ cursor: url.searchParams.get("cursor") ?? undefined, limit: url.searchParams.get("limit") ?? undefined });
  if (!query.success) return apiError(400, "invalid_query", "The run-list query is invalid.");

  try {
    const result = await access.store.listRuns(query.data.limit, query.data.cursor, access.ownerId);
    return Response.json({ runs: result.runs.map(toResearchRunSummary), nextCursor: result.nextCursor }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid run-list cursor.") return apiError(400, "invalid_cursor", "The run-list cursor is invalid.");
    return apiError(503, "persistence_unavailable", "Security research persistence is currently unavailable.");
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return apiError(403, "origin_not_allowed", "Cross-origin research requests are not allowed.");
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.");
  const access = await requireResearchAccess(request, 8, 60 * 60_000, "create-run", { deferWalletRateLimit: true });
  if ("response" in access) return access.response;
  const creationAccess = resolveResearchRunCreationAccess(access.role, access.ownerId);
  if (!creationAccess.allowed) {
    switch (creationAccess.reason) {
      case "wallet_authentication_required":
        return apiError(403, creationAccess.reason, "Only an authenticated wallet user may create research runs.");
      case "access_mode_not_configured":
        return apiError(503, "research_run_access_mode_not_configured", "Research run creation is disabled until an operator selects owner_only or public_limited access.");
      case "access_mode_invalid":
        return apiError(503, "research_run_access_mode_invalid", "Research run creation is disabled because the configured access mode is invalid.");
      case "owner_allowlist_not_configured":
        return apiError(503, "research_run_owner_allowlist_not_configured", "Research run creation is disabled until an operator configures a valid server-side wallet allowlist.");
      case "wallet_not_allowed":
        return apiError(403, "research_run_wallet_not_allowed", "This authenticated wallet is not allowed to create research runs.");
    }
  }
  if (access.role !== "user" || !access.ownerId) {
    return apiError(403, "wallet_authentication_required", "Only an authenticated wallet user may create research runs.");
  }
  const limits = resolveResearchRunLimits();
  if (limits.status !== "available") {
    const notConfigured = limits.status === "not_configured";
    return apiError(503, limits.reason,
      notConfigured
        ? "Research run creation is disabled until all bounded cooldown and quota limits are configured."
        : "Research run creation is disabled because a quota limit is invalid or exceeds its safety cap.");
  }

  let raw: unknown;
  try {
    raw = await readJsonBody(request, 4_096);
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith("request_body_") ? error.message : "invalid_json";
    return apiError(400, code, "The research request body is invalid.");
  }
  const parsed = createResearchRunRequestSchema.safeParse(raw);
  if (!parsed.success) return apiError(400, "invalid_research_request", "Choose an approved topic and provide a bounded research question.");

  const provider = getModelProvider();
  if (provider.status !== "available") {
    const message = provider.reason === "ai_billing_not_approved"
      ? "AI billing is disabled. The project owner must explicitly authorize a bounded research run before an operator may set QEVRA_AI_BILLING_APPROVED=true for that run."
      : provider.reason === "model_provider_credentials_missing"
        ? "Model provider credentials are missing. An operator must configure the credential and model in the private server and worker environment."
        : `The model provider is not ready (${provider.reason}). An operator must correct the private provider configuration before a run can be queued.`;
    return apiError(503, provider.reason, message);
  }

  try {
    if (await access.store.countLiveWorkers() === 0) {
      return apiError(503, "security_worker_not_running", "No live Security Swarm worker is registered. Start it with `bun --env-file=.qevra-data/phase2.env run security:worker` using the same private environment as the server.");
    }
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return apiError(503, code, "Security research persistence is currently unavailable.");
  }

  try {
    const attemptRate = await access.store.takeRateLimit(hashRateLimitKey(`create-run-attempt:${access.ownerId}`), 30, 60_000);
    if (!attemptRate.allowed) return apiError(429, "research_run_submission_rate_limited", "Too many research submissions were attempted. Wait one minute and try again.", { "retry-after": "60" });
    const topic = resolveResearchTopic(parsed.data.topicId, parsed.data.question);
    const run = createQueuedRun(randomUUID(), topic.id, topic.question, parsed.data.testIds);
    const admission = await access.store.admitResearchRun(run, access.ownerId, limits.limits);
    if (!admission.allowed) {
      const retryAfter = admission.reason === "wallet_cooldown"
        ? admission.snapshot.walletCooldownRemainingSeconds
        : admission.reason === "global_daily_quota" ? 86_400 : 3_600;
      const messages = {
        wallet_cooldown: `This wallet may create another research run in ${admission.snapshot.walletCooldownRemainingSeconds} seconds.`,
        global_hourly_quota: "The global hourly research quota is reached. Try again after the rolling hour.",
        global_daily_quota: "The global daily research quota is reached. Try again after the rolling 24-hour window.",
        max_active_runs: "The maximum number of active research runs is reached. Wait for an active run to finish.",
      } as const;
      return apiError(429, `research_run_${admission.reason}`, messages[admission.reason], { "retry-after": String(Math.max(1, retryAfter)) });
    }
    return Response.json({ run: toResearchRunSummary(run) }, {
      status: 202,
      headers: { "cache-control": "no-store", location: `/api/security/runs/${run.id}` },
    });
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return apiError(503, code, "The research run could not be queued because persistence is unavailable.");
  }
}
