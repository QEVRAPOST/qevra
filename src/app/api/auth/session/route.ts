import { NextResponse } from "next/server";
import { createSession, hasSessionConfiguration, readJsonBody, readCookie, requireJsonContentType, sameOrigin, setSessionCookie, verifyAccessToken, verifySessionCookie, hashRateLimitKey } from "@/features/security/auth";
import { apiError } from "@/features/security/api";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import { sessionRequestSchema } from "@/features/security/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return Response.json({
    configured: hasSessionConfiguration(),
    authenticated: Boolean(verifySessionCookie(readCookie(request, "qevra_session"))),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return apiError(403, "origin_not_allowed", "Cross-origin session requests are not allowed.");
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.");
  if (!hasSessionConfiguration()) return apiError(503, "authentication_not_configured", "Session authentication is not configured.");

  try {
    const store = getResearchStore();
    // Do not trust unverified X-Forwarded-For/X-Real-IP headers for security boundaries.
    const rate = await store.takeRateLimit(hashRateLimitKey("qevra:login-global"), 8, 15 * 60_000);
    if (!rate.allowed) return apiError(429, "rate_limit_exceeded", "Too many login attempts. Try again later.", { "retry-after": "900" });
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return apiError(503, code, "Session authentication is temporarily unavailable.");
  }

  try {
    const body = sessionRequestSchema.safeParse(await readJsonBody(request));
    if (!body.success || !verifyAccessToken(body.data.token)) {
      return apiError(401, "invalid_access_token", "The access token is invalid.");
    }
    const session = createSession();
    if (!session) return apiError(503, "authentication_not_configured", "Session authentication is not configured.");
    const response = NextResponse.json({ authenticated: true, expiresAt: new Date(session.expiresAt * 1_000).toISOString() }, {
      headers: { "cache-control": "no-store" },
    });
    setSessionCookie(response, session.value);
    return response;
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith("request_body_") ? error.message : "invalid_request";
    return apiError(400, code, "The session request body is invalid.");
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return apiError(403, "origin_not_allowed", "Cross-origin session requests are not allowed.");
  const response = NextResponse.json({ authenticated: false }, { headers: { "cache-control": "no-store" } });
  response.cookies.set("qevra_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
