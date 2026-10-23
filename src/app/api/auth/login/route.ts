import { NextResponse } from "next/server";
import { apiError } from "@/features/security/api";
import { hashRateLimitKey, readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import { hasAuthSessionConfiguration, normalizeEmailAddress } from "@/features/auth/core";
import { createNewAuthSession, setAuthSessionCookie } from "@/features/auth/session";
import { validateLoginPassword, verifyPassword } from "@/features/auth/password";
import { isConfiguredWalletAuthOrigin } from "@/features/security/wallet-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestIp(request: Request): string {
  const direct = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean).at(-1);
  return direct || forwarded || "unknown";
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isConfiguredWalletAuthOrigin(request.headers.get("origin"))) {
    return apiError(403, "origin_not_allowed", "Cross-origin sign-in requests are not allowed.");
  }
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.");

  let body: unknown;
  try {
    body = await readJsonBody(request, 4_096);
  } catch {
    return apiError(400, "invalid_request", "Enter your email address and password.");
  }
  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as { email?: unknown; password?: unknown }
    : {};
  const email = typeof input.email === "string" ? normalizeEmailAddress(input.email) : undefined;
  const password = validateLoginPassword(input.password);
  if (!email || password === undefined) return apiError(400, "invalid_credentials_input", "Enter your email address and password.");
  if (!hasAuthSessionConfiguration()) {
    return apiError(503, "auth_not_configured", "Account authentication is not configured on this server.");
  }

  try {
    const store = getResearchStore();
    const ipRate = await store.takeRateLimit(hashRateLimitKey(`veyra:auth:login:ip:${requestIp(request)}`), 30, 15 * 60_000);
    const emailRate = await store.takeRateLimit(hashRateLimitKey(`veyra:auth:login:email:${email}`), 10, 15 * 60_000);
    if (!ipRate.allowed || !emailRate.allowed) {
      return apiError(429, "rate_limit_exceeded", "Too many sign-in attempts. Try again later.", { "retry-after": "900" });
    }

    const credential = await store.getPasswordCredential(email);
    if (!await verifyPassword(password, credential?.passwordHash)) {
      return apiError(401, "invalid_credentials", "The email or password is incorrect.");
    }

    const session = createNewAuthSession();
    await store.createAuthSession({
      sessionHash: session.tokenHash,
      userId: credential!.userId,
      provider: "password",
      subject: email,
      email,
      expiresAt: session.expiresAt,
    });
    const response = NextResponse.json({
      authenticated: true,
      identity: { provider: "password", email, expiresAt: session.expiresAt },
      walletSession: { authenticated: false },
    }, { headers: { "cache-control": "no-store" } });
    setAuthSessionCookie(response, session.token);
    return response;
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return apiError(503, code, "Account sign-in is temporarily unavailable.");
  }
}
