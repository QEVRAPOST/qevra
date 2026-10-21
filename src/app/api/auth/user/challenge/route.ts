import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { NETWORKS } from "@/lib/config/networks";
import { apiError } from "@/features/security/api";
import { hashRateLimitKey, readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";
import { configuredWalletAuthOrigin, formatWalletChallenge, hasWalletAuthConfiguration, isConfiguredWalletAuthOrigin } from "@/features/security/wallet-auth";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import { isAddress, getAddress } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isConfiguredWalletAuthOrigin(request.headers.get("origin"))) {
    return apiError(403, "origin_not_allowed", "Wallet sign-in is only available to the configured VEYRA origin.");
  }
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.");
  if (!hasWalletAuthConfiguration()) return apiError(503, "wallet_auth_not_configured", "Wallet sign-in is not configured.");

  let body: unknown;
  try {
    body = await readJsonBody(request, 1_024);
  } catch {
    return apiError(400, "invalid_request", "The wallet challenge request is invalid.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError(400, "invalid_wallet_challenge", "Choose a supported network and valid wallet address.");
  }
  const input = body as { networkId?: unknown; address?: unknown };
  if (typeof input.address !== "string" || !isAddress(input.address)
    || (input.networkId !== "testnet" && input.networkId !== "mainnet")) {
    return apiError(400, "invalid_wallet_challenge", "Choose a supported network and valid wallet address.");
  }
  const network = NETWORKS.find((candidate) => candidate.id === input.networkId && candidate.available);
  const origin = configuredWalletAuthOrigin();
  if (!network || !origin) return apiError(503, "wallet_auth_not_configured", "Wallet sign-in is not configured.");

  try {
    const store = getResearchStore();
    const globalRate = await store.takeRateLimit(hashRateLimitKey("veyra:wallet-challenge:global"), 100, 15 * 60_000);
    const walletRate = await store.takeRateLimit(hashRateLimitKey(`veyra:wallet-challenge:${input.address.toLowerCase()}`), 5, 10 * 60_000);
    if (!globalRate.allowed || !walletRate.allowed) {
      return apiError(429, "rate_limit_exceeded", "Too many wallet sign-in attempts. Try again later.", { "retry-after": "600" });
    }

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000);
    const nonce = randomBytes(16).toString("hex");
    const message = formatWalletChallenge({
      address: getAddress(input.address),
      chainId: network.chainId,
      nonce,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      origin,
    });
    await store.createWalletAuthChallenge({
      nonceHash: createHash("sha256").update(nonce).digest("hex"),
      address: getAddress(input.address),
      chainId: network.chainId,
      message,
      expiresAt: expiresAt.toISOString(),
    });
    return NextResponse.json({ nonce, message, expiresAt: expiresAt.toISOString() }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return apiError(503, code, "Wallet sign-in is temporarily unavailable.");
  }
}
