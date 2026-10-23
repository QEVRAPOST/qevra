import { apiError } from "@/features/security/api";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import { getAuthSession } from "@/features/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const store = getResearchStore();
    const session = await getAuthSession(request, store);
    if (!session) return apiError(401, "authentication_required", "Sign in to view your account.", { "cache-control": "no-store" });
    const account = await store.getAccountProfile(session.userId);
    if (!account) return apiError(404, "account_not_found", "The signed-in account could not be found.", { "cache-control": "no-store" });
    return Response.json({
      account: {
        userId: account.userId,
        ...(account.email ? { email: account.email } : {}),
        emailVerified: account.emailVerified,
        createdAt: account.createdAt,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return apiError(503, code, "The account profile is temporarily unavailable.", { "cache-control": "no-store" });
  }
}
