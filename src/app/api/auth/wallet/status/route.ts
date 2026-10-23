import { apiError } from "@/features/security/api";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import { getAuthSession } from "@/features/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const store = getResearchStore();
    const session = await getAuthSession(request, store);
    if (!session) return apiError(401, "authentication_required", "Sign in to view wallet status.", { "cache-control": "no-store" });
    const wallet = await store.getEmbeddedWallet(session.userId);
    if (!wallet) {
      return Response.json({ status: "blocked", reason: "provider_not_integrated", wallet: null }, {
        headers: { "cache-control": "no-store" },
      });
    }
    return Response.json({
      status: "active",
      wallet: { provider: wallet.provider, address: wallet.address as `0x${string}`, createdAt: wallet.createdAt },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return apiError(503, code, "Wallet status is temporarily unavailable.", { "cache-control": "no-store" });
  }
}
