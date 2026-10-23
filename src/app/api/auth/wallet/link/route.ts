import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { getAuthSession } from "@/features/auth/server";
import { apiError } from "@/features/security/api";
import { hashRateLimitKey, readCookie, readJsonBody, requireJsonContentType } from "@/features/security/auth";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import {
  createUserSession,
  isConfiguredWalletAuthOrigin,
  setUserSessionCookie,
  verifyWalletChallengeSignature,
} from "@/features/security/wallet-auth";
import { hashAuthSessionToken, AUTH_SESSION_COOKIE } from "@/features/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isConfiguredWalletAuthOrigin(request.headers.get("origin"))) {
    return apiError(403, "origin_not_allowed", "Wallet linking is only available to the configured VEYRA origin.");
  }
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.");
  let body: unknown;
  try {
    body = await readJsonBody(request, 2_048);
  } catch {
    return apiError(400, "invalid_request", "The wallet link signature is invalid.");
  }
  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as { nonce?: unknown; signature?: unknown } : {};
  if (typeof input.nonce !== "string" || !/^[a-f0-9]{32}$/i.test(input.nonce)
    || typeof input.signature !== "string" || !/^0x[0-9a-f]{130}$/i.test(input.signature)) {
    return apiError(400, "invalid_wallet_signature", "The wallet link signature is invalid.");
  }

  try {
    const store = getResearchStore();
    const session = await getAuthSession(request, store);
    if (!session) return apiError(401, "authentication_required", "Sign in to your VEYRA account before linking a wallet.");
    const rate = await store.takeRateLimit(hashRateLimitKey(`veyra:wallet-link-verify:${session.userId}`), 10, 10 * 60_000);
    if (!rate.allowed) return apiError(429, "rate_limit_exceeded", "Too many wallet link attempts. Try again later.", { "retry-after": "600" });

    const nonceHash = createHash("sha256").update(input.nonce).digest("hex");
    const challenge = await store.getWalletLinkChallenge(nonceHash, session.userId);
    if (!challenge || !(await store.consumeWalletLinkChallenge(nonceHash, session.userId))) {
      return apiError(401, "wallet_challenge_invalid", "The wallet link challenge is invalid, expired, or already used.");
    }
    if (!(await verifyWalletChallengeSignature(challenge.address, challenge.message, input.signature))) {
      return apiError(401, "wallet_signature_invalid", "The wallet signature could not be verified.");
    }
    if (!(await store.linkWalletIdentity(session.userId, challenge.address))) {
      return apiError(409, "wallet_already_linked", "This wallet is already linked to another VEYRA account.");
    }
    const walletSession = createUserSession(challenge.address);
    if (!walletSession) return apiError(503, "wallet_auth_not_configured", "Wallet research sign-in is not configured.");
    const appToken = readCookie(request, AUTH_SESSION_COOKIE);
    const appTokenHash = appToken ? hashAuthSessionToken(appToken) : undefined;
    if (!appTokenHash || !(await store.attachWalletSessionToAuthSession(appTokenHash, walletSession.sessionKey))) {
      return apiError(401, "authentication_required", "Your VEYRA account session expired. Sign in again before linking a wallet.");
    }
    const response = NextResponse.json({ linked: true, address: getAddress(challenge.address), chainId: challenge.chainId }, {
      headers: { "cache-control": "no-store" },
    });
    setUserSessionCookie(response, walletSession.value);
    return response;
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return apiError(503, code, "Wallet linking is temporarily unavailable.");
  }
}
