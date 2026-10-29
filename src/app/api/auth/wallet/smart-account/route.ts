import { getAddress, isAddress } from "viem";
import { getAuthSession } from "@/features/auth/server";
import { apiError } from "@/features/security/api";
import { hashRateLimitKey } from "@/features/security/auth";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import { RobinhoodRpcError, readRobinhoodContractCode, readRobinhoodContractOwner, readRobinhoodPublicAddress, readRobinhoodSmartAccountInfrastructure, readRobinhoodSmartAccountTokenBalances } from "@/features/wallet/public-rpc";
import { checkAlchemyBundler, predictVeyraSmartWalletAddress } from "@/features/wallet/smart-account";
import type { WalletSmartAccountStatusResponse } from "@/features/wallet/smart-account-contract";
import { NETWORKS } from "@/lib/config/networks";
import type { NetworkId } from "@/types/network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let networkId: NetworkId = "mainnet";
  try {
    const selected = new URL(request.url).searchParams.get("networkId") ?? "mainnet";
    const requestedOwner = new URL(request.url).searchParams.get("ownerAddress") ?? undefined;
    const network = NETWORKS.find((candidate) => candidate.id === selected && candidate.available);
    if (!network) return apiError(400, "network_not_supported", "Choose Robinhood Mainnet or Robinhood Testnet.");
    networkId = network.id;
    if (requestedOwner && !isAddress(requestedOwner)) return apiError(400, "wallet_owner_address_invalid", "The linked EVM owner address is invalid.");

    const store = getResearchStore();
    const session = await getAuthSession(request, store);
    if (!session) return apiError(401, "authentication_required", "Sign in to your VEYRA Account to check its smart wallet.", { "cache-control": "no-store" });
    const rate = await store.takeRateLimit(hashRateLimitKey(`veyra:smart-account-status:${session.userId}`), 20, 60_000);
    if (!rate.allowed) return apiError(429, "rate_limit_exceeded", "Smart wallet status is being refreshed too often. Wait before retrying.", { "cache-control": "no-store", "retry-after": "60" });
    const linkedAddress = await store.getLinkedWalletAddress(session.userId, requestedOwner);
    if (!linkedAddress) {
      const body: WalletSmartAccountStatusResponse = { status: "owner_link_required", networkId };
      return Response.json(body, { headers: { "cache-control": "no-store" } });
    }
    if (!isAddress(linkedAddress)) return apiError(503, "wallet_identity_invalid", "The linked wallet identity could not be validated.", { "cache-control": "no-store" });
    const ownerAddress = getAddress(linkedAddress);

    const [infrastructure, bundler] = await Promise.all([
      readRobinhoodSmartAccountInfrastructure(networkId),
      checkAlchemyBundler(networkId, process.env.ALCHEMY_API_KEY),
    ]);
    if (!infrastructure.ready) {
      const body: WalletSmartAccountStatusResponse = {
        status: "infrastructure_blocked",
        networkId,
        ownerAddress,
        infrastructure,
        bundler,
        execution: "not_integrated",
      };
      return Response.json(body, { headers: { "cache-control": "no-store" } });
    }

    const accountAddress = predictVeyraSmartWalletAddress(ownerAddress);
    const [accountCode, balance, tokenBalances] = await Promise.all([
      readRobinhoodContractCode(networkId, accountAddress),
      readRobinhoodPublicAddress(networkId, accountAddress),
      readRobinhoodSmartAccountTokenBalances(networkId, accountAddress),
    ]);
    const deployment = accountCode === "present" ? "deployed" : "counterfactual";
    const verifiedOwner = deployment === "deployed"
      ? (await readRobinhoodContractOwner(networkId, accountAddress)).toLowerCase() === ownerAddress.toLowerCase()
      : null;
    if (verifiedOwner === false) {
      const body: WalletSmartAccountStatusResponse = { status: "account_owner_mismatch", networkId, accountAddress };
      return Response.json(body, { headers: { "cache-control": "no-store" } });
    }

    const body: WalletSmartAccountStatusResponse = {
      status: "account_ready",
      smartAccount: {
        networkId,
        ownerAddress,
        infrastructure,
        bundler,
        account: {
          address: accountAddress,
          deployment,
          ownerVerified: verifiedOwner,
          balanceWei: balance.balanceWei,
          observedBlock: balance.observedBlock,
          observedAt: balance.observedAt,
        },
        tokenBalances,
        execution: networkId === "testnet" && bundler === "available" ? "testnet_self_call_only" : "not_integrated",
      },
    };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured"
      : error instanceof RobinhoodRpcError ? error.code
        : "smart_account_status_unavailable";
    return apiError(503, code, "The smart wallet could not be verified from the selected Robinhood network.", { "cache-control": "no-store" });
  }
}
