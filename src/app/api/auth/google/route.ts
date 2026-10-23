import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthCapabilities } from "@/features/auth/core";
import { safeAuthErrorRedirect } from "@/features/auth/http";
import { createGoogleOAuthState, createPkceChallenge, setGoogleStateCookie } from "@/features/auth/session";
import { apiError } from "@/features/security/api";
import { hashRateLimitKey } from "@/features/security/auth";
import { configuredWalletAuthOrigin, isConfiguredWalletAuthOrigin } from "@/features/security/wallet-auth";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = configuredWalletAuthOrigin();
  if (!origin) return apiError(503, "auth_origin_not_configured", "Authentication is not configured on this server.");
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && !isConfiguredWalletAuthOrigin(requestOrigin)) {
    return apiError(403, "origin_not_allowed", "Google sign-in must start from the configured VEYRA origin.");
  }
  const capabilities = getAuthCapabilities();
  if (!capabilities.google) return safeAuthErrorRedirect(origin, "google_not_configured");

  const clientId = process.env.VEYRA_GOOGLE_CLIENT_ID?.trim();
  const state = createGoogleOAuthState();
  if (!clientId || !state) return safeAuthErrorRedirect(origin, "google_not_configured");
  try {
    const store = getResearchStore();
    const rate = await store.takeRateLimit(hashRateLimitKey("veyra:google-oauth:start"), 100, 15 * 60_000);
    if (!rate.allowed) return safeAuthErrorRedirect(origin, "rate_limit_exceeded");
    await store.createGoogleOAuthState(
      createHash("sha256").update(state.state).digest("hex"), state.expiresAt,
    );
    const redirectUri = `${origin}/api/auth/google/callback`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: state.state,
      nonce: state.nonce,
      code_challenge: createPkceChallenge(state.codeVerifier),
      code_challenge_method: "S256",
    }).toString();
    const response = NextResponse.redirect(url);
    response.headers.set("cache-control", "no-store");
    setGoogleStateCookie(response, state.cookieValue);
    return response;
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return safeAuthErrorRedirect(origin, code);
  }
}
