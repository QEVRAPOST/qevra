import { apiError, requireResearchAccess } from "@/features/security/api";
import { runIdSchema } from "@/features/security/schemas";
import { toResearchRunDetail } from "@/features/security/public-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireResearchAccess(request, 60, 60_000);
  if ("response" in access) return access.response;
  const { id } = await context.params;
  if (!runIdSchema.safeParse(id).success) return apiError(400, "invalid_run_id", "The research run ID is invalid.");

  try {
    const run = await access.store.getRun(id);
    if (!run) return apiError(404, "run_not_found", "The research run was not found.");
    return Response.json({ run: toResearchRunDetail(run) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return apiError(503, "persistence_unavailable", "Security research persistence is currently unavailable.");
  }
}
