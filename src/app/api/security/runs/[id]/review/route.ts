import { apiError, requireResearchAccess } from "@/features/security/api";
import { readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";
import { OWNER_REVIEW_DISCLAIMER } from "@/features/security/public-view";
import { humanReviewRequestSchema, runIdSchema } from "@/features/security/schemas";
import type { ResearchHumanReviewResponse } from "@/types/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return apiError(403, "origin_not_allowed", "Cross-origin research requests are not allowed.");
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.");

  const access = await requireResearchAccess(request, 20, 60 * 60_000, "human-review");
  if ("response" in access) return access.response;
  if (access.role !== "user" || !access.ownerId) {
    return apiError(403, "wallet_user_authentication_required", "A verified wallet-user session is required to review an owned report.");
  }

  const { id } = await context.params;
  if (!runIdSchema.safeParse(id).success) return apiError(400, "invalid_run_id", "The research run ID is invalid.");

  try {
    const run = await access.store.getRun(id, access.ownerId);
    if (!run) return apiError(404, "run_not_found", "The research run was not found.");
    if (run.status !== "completed") {
      return apiError(409, "research_run_not_completed", "Only a completed research report can receive an owner self-review.");
    }

    let raw: unknown;
    try {
      raw = await readJsonBody(request, 2_048);
    } catch {
      return apiError(400, "invalid_human_review", "The human review request body is invalid.");
    }
    const parsed = humanReviewRequestSchema.safeParse(raw);
    if (!parsed.success) return apiError(400, "invalid_human_review", "Choose a supported evidence assessment and provide at most 1,000 characters of notes.");

    const review = await access.store.saveHumanReview(id, access.ownerId, parsed.data.decision, parsed.data.notes);
    if (!review) {
      const currentRun = await access.store.getRun(id, access.ownerId);
      if (!currentRun) return apiError(404, "run_not_found", "The research run was not found.");
      if (currentRun.status !== "completed") return apiError(409, "research_run_not_completed", "Only a completed research report can receive an owner self-review.");
      return apiError(409, "human_review_conflict", "The report owner self-review could not be updated.");
    }

    const response: ResearchHumanReviewResponse = {
      review: {
        ...review,
        reviewKind: "owner_self_review",
        disclaimer: OWNER_REVIEW_DISCLAIMER,
      },
    };
    return Response.json(response, { headers: { "cache-control": "no-store" } });
  } catch {
    return apiError(503, "persistence_unavailable", "The owner self-review could not be saved because research persistence is unavailable.");
  }
}
