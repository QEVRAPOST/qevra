import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyGoogleIdToken } from "@/features/auth/core";
import { safeAuthErrorRedirect } from "@/features/auth/http";
import { persistAuthSession } from "@/features/auth/server";
import {
  clearGoogleStateCookie,
  GOOGLE_STATE_COOKIE,
  setAuthSessionCookie,
  verifyGoogleOAuthStateCookie,
} from "@/features/auth/session";
import { readCookie } from "@/features/security/auth";
import { configuredWalletAuthOrigin } from "@/features/security/wallet-auth";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = configuredWalletAuthOrigin();
  if (!origin) return Response.json({ error: { code: "auth_origin_not_configured", message: "Authentication is not configured." } }, { status: 503 });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const cookie = readCookie(request, GOOGLE_STATE_COOKIE);
  const verifiedState = state ? verifyGoogleOAuthStateCookie(cookie, state) : undefined;
  if (oauthError || !code || !state || !verifiedState) return safeErrorRedirectAndClear(origin, "google_callback_invalid");

  try {
    const store = getResearchStore();
    const stateHash = createHash("sha256").update(state).digest("hex");
    if (!(await store.consumeGoogleOAuthState(stateHash))) return safeErrorRedirectAndClear(origin, "google_state_expired");

    const clientId = process.env.VEYRA_GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.VEYRA_GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return safeErrorRedirectAndClear(origin, "google_not_configured");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
        code_verifier: verifiedState.codeVerifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!tokenResponse.ok) return safeErrorRedirectAndClear(origin, "google_token_exchange_failed");
    const tokenBody: unknown = await tokenResponse.json();
    const idToken = tokenBody && typeof tokenBody === "object" ? (tokenBody as { id_token?: unknown }).id_token : undefined;
    if (typeof idToken !== "string") return safeErrorRedirectAndClear(origin, "google_token_missing");
    const claims = await verifyGoogleIdToken(idToken, { clientId, nonce: verifiedState.nonce });
    const identity = await store.createOrGetAuthIdentity({
      provider: "google",
      subject: claims.subject,
      email: claims.email,
      emailVerified: claims.emailVerified,
    });
    const session = await persistAuthSession(store, identity);
    const target = new URL("/app/security", origin);
    target.searchParams.set("auth", "1");
    const response = NextResponse.redirect(target);
    response.headers.set("cache-control", "no-store");
    clearGoogleStateCookie(response);
    setAuthSessionCookie(response, session.token);
    return response;
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "google_sign_in_failed";
    return safeErrorRedirectAndClear(origin, code);
  }
}

function safeErrorRedirectAndClear(origin: string, code: string): NextResponse {
  const response = safeAuthErrorRedirect(origin, code);
  clearGoogleStateCookie(response);
  return response;
}
