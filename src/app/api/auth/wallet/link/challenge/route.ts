import { createHash, randomBytes } from "node:crypto";
import { getAddress, isAddress } from "viem";
import { createWalletLinkMessage } from "@/features/auth/core";
import { getAuthSession } from "@/features/auth/server";
import { apiError } from "@/features/security/api";
import { hashRateLimitKey, readJsonBody, requireJsonContentType } from "@/features/security/auth";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import { isConfiguredWalletAuthOrigin } from "@/features/security/wallet-auth";
import { NETWORKS } from "@/lib/config/networks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isConfiguredWalletAuthOrigin(request.headers.get("origin"))) {
    return apiError(403, "origin_not_allowed", "Wallet linking is only available to the configured VEYRA origin.");
  }
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.");
  let body: unknown;
  try {
    body = await readJsonBody(request, 1_024);
  } catch {
    return apiError(400, "invalid_request", "The wallet link request is invalid.");
  }
  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as { networkId?: unknown; address?: unknown } : {};
  const network = NETWORKS.find((candidate) => candidate.id === input.networkId && candidate.available);
  if (typeof input.address !== "string" || !isAddress(input.address) || !network) {
    return apiError(400, "invalid_wallet_link", "Choose a supported network and valid wallet address.");
  }

  try {
    const store = getResearchStore();
    const session = await getAuthSession(request, store);
    if (!session) return apiError(401, "authentication_required", "Sign in to your VEYRA account before linking a wallet.");
    const rate = await store.takeRateLimit(hashRateLimitKey(`veyra:wallet-link:${session.userId}`), 5, 10 * 60_000);
    if (!rate.allowed) return apiError(429, "rate_limit_exceeded", "Too many wallet link attempts. Try again later.", { "retry-after": "600" });

    const origin = process.env.VEYRA_AUTH_ORIGIN?.trim();
    if (!origin) return apiError(503, "auth_origin_not_configured", "Wallet linking is not configured.");
    const address = getAddress(input.address);
    const nonce = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const message = createWalletLinkMessage({ address, chainId: network.chainId, nonce, origin });
    await store.createWalletLinkChallenge({
      nonceHash: createHash("sha256").update(nonce).digest("hex"),
      userId: session.userId,
      address,
      chainId: network.chainId,
      message,
      expiresAt,
    });
    return Response.json({ nonce, message, expiresAt, address, chainId: network.chainId }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    return apiError(503, code, "Wallet linking is temporarily unavailable.");
  }
}
