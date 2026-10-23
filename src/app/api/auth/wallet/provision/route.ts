import { apiError } from "@/features/security/api";
import { getResearchStore } from "@/features/security/store";
import { getAuthSession } from "@/features/auth/server";
import { isConfiguredWalletAuthOrigin } from "@/features/security/wallet-auth";
import { readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isConfiguredWalletAuthOrigin(request.headers.get("origin"))) {
    return apiError(403, "origin_not_allowed", "Cross-origin wallet requests are not allowed.");
  }
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.");
  let body: unknown;
  try {
    body = await readJsonBody(request, 1_024);
  } catch {
    return apiError(400, "invalid_request", "Explicit wallet creation consent is required.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || (body as { consent?: unknown }).consent !== true) {
    return apiError(400, "wallet_consent_required", "Explicit wallet creation consent is required.");
  }
  try {
    const store = getResearchStore();
    const session = await getAuthSession(request, store);
    if (!session) return apiError(401, "authentication_required", "Sign in before requesting a wallet.");
    return apiError(503, "embedded_wallet_blocked", "Built-in wallet creation is blocked until the provider integration and user recovery/export flow are verified.");
  } catch {
    return apiError(503, "persistence_unavailable", "Wallet provisioning cannot be checked right now.");
  }
}
