import { NextResponse } from "next/server";
import { apiError } from "@/features/security/api";
import { hashRateLimitKey, readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import { hasAuthSessionConfiguration, normalizeEmailAddress } from "@/features/auth/core";
import { createNewAuthSession, setAuthSessionCookie } from "@/features/auth/session";
import { hashPassword, validatePassword } from "@/features/auth/password";
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
    return apiError(403, "origin_not_allowed", "Cross-origin registration requests are not allowed.");
  }
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.");

  let body: unknown;
  try {
    body = await readJsonBody(request, 4_096);
  } catch {
    return apiError(400, "invalid_request", "Enter a valid email address and password.");
  }
  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as { email?: unknown; password?: unknown }
    : {};
  const email = typeof input.email === "string" ? normalizeEmailAddress(input.email) : undefined;
  if (!email) return apiError(400, "invalid_email", "Enter a valid email address.");
  let password: string;
  try {
    password = validatePassword(input.password);
  } catch (error) {
    const code = error instanceof Error ? error.message : "password_invalid";
    const message = code === "password_too_short"
      ? "Use a password with at least 15 characters."
      : code === "password_too_long"
        ? "Use a password with no more than 128 characters."
        : "Enter a valid password.";
    return apiError(400, code, message);
  }

  if (!hasAuthSessionConfiguration()) {
    return apiError(503, "auth_not_configured", "Account authentication is not configured on this server.");
  }

  try {
    const store = getResearchStore();
    const ipRate = await store.takeRateLimit(hashRateLimitKey(`veyra:auth:register:ip:${requestIp(request)}`), 5, 60 * 60_000);
    const emailRate = await store.takeRateLimit(hashRateLimitKey(`veyra:auth:register:email:${email}`), 3, 24 * 60 * 60_000);
    if (!ipRate.allowed || !emailRate.allowed) {
      return apiError(429, "rate_limit_exceeded", "Too many registration attempts. Try again later.", { "retry-after": "3600" });
    }

    const passwordHash = await hashPassword(password);
    const session = createNewAuthSession();
    const account = await store.createPasswordAccount({
      email,
      passwordHash,
      sessionHash: session.tokenHash,
      expiresAt: session.expiresAt,
    });
    const response = NextResponse.json({
      authenticated: true,
      identity: { provider: "password", email, expiresAt: session.expiresAt },
      walletSession: { authenticated: false },
      account: {
        userId: account.userId,
        email: account.email,
        emailVerified: account.emailVerified,
        createdAt: account.createdAt,
      },
    }, { status: 201, headers: { "cache-control": "no-store" } });
    setAuthSessionCookie(response, session.token);
    return response;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return apiError(409, "account_already_exists", "An account already exists for this email. Sign in instead.");
    }
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "registration_unavailable";
    return apiError(503, code, "Account registration is temporarily unavailable.");
  }
}
