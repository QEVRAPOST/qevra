import { NextResponse } from "next/server";
import { clearAuthSessionCookie, AUTH_SESSION_COOKIE, hashAuthSessionToken } from "@/features/auth/session";
import { apiError } from "@/features/security/api";
import { readCookie } from "@/features/security/auth";
import { clearUserSessionCookie, isConfiguredWalletAuthOrigin, verifyUserSessionCookie } from "@/features/security/wallet-auth";
import { getResearchStore } from "@/features/security/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isConfiguredWalletAuthOrigin(request.headers.get("origin"))) {
    return apiError(403, "origin_not_allowed", "Cross-origin sign-out requests are not allowed.");
  }
  const token = readCookie(request, AUTH_SESSION_COOKIE);
  const tokenHash = token ? hashAuthSessionToken(token) : undefined;
  const walletSession = verifyUserSessionCookie(readCookie(request, "veyra_user_session"));
  let persistenceUnavailable = false;
  if (tokenHash || walletSession) {
    try {
      const store = getResearchStore();
      if (tokenHash) await store.revokeAuthSession(tokenHash);
      if (walletSession) await store.revokeWalletAuthSession(walletSession.sessionKey, new Date(walletSession.expiresAt * 1_000).toISOString());
    } catch {
      persistenceUnavailable = true;
    }
  }
  const response = NextResponse.json({ authenticated: false, revoked: !persistenceUnavailable }, {
    status: persistenceUnavailable ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
  clearAuthSessionCookie(response);
  clearUserSessionCookie(response);
  return response;
}
