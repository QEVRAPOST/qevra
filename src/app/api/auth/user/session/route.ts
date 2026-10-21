import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { apiError } from "@/features/security/api";
import { hashRateLimitKey, readCookie, readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import {
  clearUserSessionCookie,
  createUserSession,
  hasWalletAuthConfiguration,
  isConfiguredWalletAuthOrigin,
  setUserSessionCookie,
  verifyUserSessionCookie,
  verifyWalletChallengeSignature,
} from "@/features/security/wallet-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = verifyUserSessionCookie(readCookie(request, "veyra_user_session"));
  return Response.json({
    configured: hasWalletAuthConfiguration(),
    authenticated: Boolean(session),
    ...(session ? { address: session.address, expiresAt: new Date(session.expiresAt * 1_000).toISOString() } : {}),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isConfiguredWalletAuthOrigin(request.headers.get("origin"))) {
    return apiError(403, "origin_not_allowed", "Wallet sign-in is only available to the configured VEYRA origin.");
  }
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.");
  if (!hasWalletAuthConfiguration()) return apiError(503, "wallet_auth_not_configured", "Wallet sign-in is not configured.");

  let body: unknown;
  try {
    body = await readJsonBody(request, 2_048);
  } catch {
    return apiError(400, "invalid_request", "The wallet sign-in request is invalid.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError(400, "invalid_wallet_signature", "The wallet signature request is invalid.");
  }
  const input = body as { address?: unknown; nonce?: unknown; signature?: unknown };
  if (typeof input.address !== "string" || !isAddress(input.address)
    || typeof input.nonce !== "string" || !/^[a-f0-9]{32}$/i.test(input.nonce)
    || typeof input.signature !== "string" || !/^0x[0-9a-f]{130}$/i.test(input.signature)) {
    return apiError(400, "invalid_wallet_signature", "The wallet signature request is invalid.");
  }

  try {
    const store = getResearchStore();
    const address = getAddress(input.address);
    const globalRate = await store.takeRateLimit(hashRateLimitKey("veyra:wallet-session:global"), 60, 15 * 60_000);
    const walletRate = await store.takeRateLimit(hashRateLimitKey(`veyra:wallet-session:${address.toLowerCase()}`), 5, 10 * 60_000);
    if (!globalRate.allowed || !walletRate.allowed) {
      return apiError(429, "rate_limit_exceeded", "Too many wallet sign-in attempts. Try again later.", { "retry-after": "600" });
    }

    const nonceHash = createHash("sha256").update(input.nonce).digest("hex");
    const challenge = await store.getWalletAuthChallenge(nonceHash);
    if (!challenge || challenge.address.toLowerCase() !== address.toLowerCase()) {
      return apiError(401, "wallet_challenge_invalid", "The wallet sign-in challenge is invalid or expired.");
    }
    if (!(await verifyWalletChallengeSignature(address, challenge.message, input.signature))) {
      return apiError(401, "wallet_signature_invalid", "The wallet signature could not be verified.");
    }
    if (!(await store.consumeWalletAuthChallenge(nonceHash))) {
      return apiError(401, "wallet_challenge_consumed", "The wallet sign-in challenge has already been used.");
    }

    const session = createUserSession(address);
    if (!session) return apiError(503, "wallet_auth_not_configured", "Wallet sign-in is not configured.");
    const response = NextResponse.json({
      authenticated: true,
      address: session.address,
      expiresAt: new Date(session.expiresAt * 1_000).toISOString(),
    }, { headers: { "cache-control": "no-store" } });
    setUserSessionCookie(response, session.value);
    return response;
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return apiError(503, code, "Wallet sign-in is temporarily unavailable.");
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request) || !isConfiguredWalletAuthOrigin(request.headers.get("origin"))) {
    return apiError(403, "origin_not_allowed", "Cross-origin sign-out requests are not allowed.");
  }
  const response = NextResponse.json({ authenticated: false }, { headers: { "cache-control": "no-store" } });
  clearUserSessionCookie(response);
  return response;
}
