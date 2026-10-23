import { NextResponse } from "next/server";
import {
  emailLookupHash,
  generateEmailOtp,
  getAuthCapabilities,
  hashEmailOtp,
  normalizeEmailAddress,
} from "@/features/auth/core";
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
  if (!getAuthCapabilities().email) return apiError(503, "email_auth_not_configured", "Email code sign-in is not configured on this server.");

  let body: unknown;
  try {
    body = await readJsonBody(request, 1_024);
  } catch {
    return apiError(400, "invalid_request", "The email code request is invalid.");
  }
  const emailInput = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { email?: unknown }).email : undefined;
  const email = typeof emailInput === "string" ? normalizeEmailAddress(emailInput) : undefined;
  if (!email) return apiError(400, "invalid_email", "Enter a valid email address.");

  try {
    const store = getResearchStore();
    const emailHash = emailLookupHash(email, process.env.VEYRA_USER_SESSION_SECRET ?? "");
    const globalRate = await store.takeRateLimit(hashRateLimitKey("veyra:email-otp:global"), 100, 60 * 60_000);
    const emailRate = await store.takeRateLimit(hashRateLimitKey(`veyra:email-otp:${emailHash}`), 3, 15 * 60_000);
    if (!globalRate.allowed || !emailRate.allowed) {
      return apiError(429, "rate_limit_exceeded", "Too many email sign-in requests. Try again later.", { "retry-after": "900" });
    }

    const code = generateEmailOtp();
    const codeHash = hashEmailOtp(email, code, process.env.VEYRA_USER_SESSION_SECRET ?? "");
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    await store.createEmailOtpChallenge(emailHash, codeHash, expiresAt);
    let sent: Response;
    try {
      sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.VEYRA_EMAIL_FROM,
          to: [email],
          subject: "Your VEYRA sign-in code",
          text: `Your VEYRA sign-in code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      await store.deleteEmailOtpChallenge(emailHash);
      return apiError(502, "email_delivery_failed", "The sign-in code could not be delivered. Try again later.");
    }
    if (!sent.ok) {
      await store.deleteEmailOtpChallenge(emailHash);
      return apiError(502, "email_delivery_failed", "The sign-in code could not be delivered. Try again later.");
    }
    return NextResponse.json({ sent: true, expiresInSeconds: 600 }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "email_delivery_unavailable";
    return apiError(503, code, "Email sign-in is temporarily unavailable.");
  }
}
