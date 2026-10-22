import { randomUUID } from "node:crypto";
import { apiError, requireResearchAccess } from "@/features/security/api";
import { hashRateLimitKey, readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";
import { createQueuedRun } from "@/features/security/model";
import { getModelProvider } from "@/features/security/provider";
import { toResearchRunSummary } from "@/features/security/public-view";
import { createResearchRunRequestSchema, runListQuerySchema } from "@/features/security/schemas";
import { resolveResearchTopic } from "@/features/security/topics";
import { StoreNotConfiguredError } from "@/features/security/store";

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
  const access = await requireResearchAccess(request, 8, 60 * 60_000, "create-run");
  if ("response" in access) return access.response;

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
    const globalRate = await access.store.takeRateLimit(hashRateLimitKey("qevra:research-run-global"), 20, 60 * 60_000);
    if (!globalRate.allowed) return apiError(429, "global_run_quota_exceeded", "The service run quota is currently full. Try again later.", { "retry-after": "3600" });
    const topic = resolveResearchTopic(parsed.data.topicId, parsed.data.question);
    const run = createQueuedRun(randomUUID(), topic.id, topic.question, parsed.data.testIds);
    await access.store.createRun(run, access.ownerId);
    return Response.json({ run: toResearchRunSummary(run) }, {
      status: 202,
      headers: { "cache-control": "no-store", location: `/api/security/runs/${run.id}` },
    });
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return apiError(503, code, "The research run could not be queued because persistence is unavailable.");
  }
}
