import { NextResponse } from "next/server";
import {
  emailLookupHash,
  getAuthCapabilities,
  hashEmailOtp,
  hasAuthSessionConfiguration,
  normalizeEmailAddress,
} from "@/features/auth/core";
import { persistAuthSession } from "@/features/auth/server";
import { setAuthSessionCookie } from "@/features/auth/session";
import { apiError } from "@/features/security/api";
import { hashRateLimitKey, readJsonBody, requireJsonContentType } from "@/features/security/auth";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import { isConfiguredWalletAuthOrigin } from "@/features/security/wallet-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isConfiguredWalletAuthOrigin(request.headers.get("origin"))) {
    return apiError(403, "origin_not_allowed", "Email sign-in is only available to the configured VEYRA origin.");
  }
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.");
  if (!hasAuthSessionConfiguration() || !getAuthCapabilities().database) {
    return apiError(503, "email_auth_not_configured", "Email sign-in is not configured on this server.");
  }
  let body: unknown;
  try {
    body = await readJsonBody(request, 1_024);
  } catch {
    return apiError(400, "invalid_request", "The email verification request is invalid.");
  }
  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as { email?: unknown; code?: unknown } : {};
  const email = typeof input.email === "string" ? normalizeEmailAddress(input.email) : undefined;
  if (!email || typeof input.code !== "string" || !/^\d{6}$/.test(input.code)) {
    return apiError(400, "invalid_email_code", "Enter the email address and six-digit code.");
  }

  try {
    const store = getResearchStore();
    const emailHash = emailLookupHash(email, process.env.VEYRA_USER_SESSION_SECRET ?? "");
    const globalRate = await store.takeRateLimit(hashRateLimitKey("veyra:email-verify:global"), 300, 60 * 60_000);
    const emailRate = await store.takeRateLimit(hashRateLimitKey(`veyra:email-verify:${emailHash}`), 10, 15 * 60_000);
    if (!globalRate.allowed || !emailRate.allowed) {
      return apiError(429, "rate_limit_exceeded", "Too many email verification attempts. Try again later.", { "retry-after": "900" });
    }
    const codeHash = hashEmailOtp(email, input.code, process.env.VEYRA_USER_SESSION_SECRET ?? "");
    if (!(await store.consumeEmailOtpChallenge(emailHash, codeHash))) {
      return apiError(401, "email_code_invalid", "The sign-in code is invalid, expired, or already used.");
    }
    const identity = await store.createOrGetAuthIdentity({ provider: "email", subject: email, email, emailVerified: true });
    const session = await persistAuthSession(store, identity);
    const response = NextResponse.json({
      authenticated: true,
      identity: { provider: "email", email, expiresAt: session.expiresAt },
      walletSession: { authenticated: false },
    }, { headers: { "cache-control": "no-store" } });
    setAuthSessionCookie(response, session.token);
    return response;
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return apiError(503, code, "Email sign-in is temporarily unavailable.");
  }
}
