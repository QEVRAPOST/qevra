import { isAddress } from "viem";
import { getAuthSession } from "@/features/auth/server";
import { apiError } from "@/features/security/api";
import { hashRateLimitKey, readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";
import { isConfiguredWalletAuthOrigin } from "@/features/security/wallet-auth";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import { readRobinhoodContractCode, readRobinhoodContractOwner } from "@/features/wallet/public-rpc";
import { predictVeyraSmartWalletAddress } from "@/features/wallet/smart-account";
import { assertTestnetSelfCallFeeWithinLimit, validateTestnetSelfCallRequest } from "@/features/wallet/testnet-user-operation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRpcRequest = { jsonrpc: "2.0"; id: number | string; method: string; params: unknown[] };

function jsonRpcError(id: number | string | null, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { headers: { "cache-control": "no-store" } });
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.jsonrpc === "2.0"
    && (typeof record.id === "string" || typeof record.id === "number")
    && typeof record.method === "string"
    && Array.isArray(record.params);
}

const TESTNET_BUNDLER_METHODS = new Set([
  "eth_chainId",
  "eth_supportedEntryPoints",
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "eth_getUserOperationByHash",
  "eth_getUserOperationReceipt",
]);

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isConfiguredWalletAuthOrigin(request.headers.get("origin"))) {
    return apiError(403, "origin_not_allowed", "Smart wallet operations are only available to the configured VEYRA origin.");
  }
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON-RPC request.");

  let rawRequest: unknown;
  try {
    rawRequest = await readJsonBody(request, 64 * 1_024);
  } catch {
    return apiError(400, "invalid_request", "The bundler request is invalid or too large.");
  }
  if (!isJsonRpcRequest(rawRequest)) return apiError(400, "invalid_json_rpc", "The bundler request is invalid.");
  const rpcRequest = rawRequest;
  if (!TESTNET_BUNDLER_METHODS.has(rpcRequest.method)) {
    return jsonRpcError(rpcRequest.id, -32601, "This wallet operation is not enabled.");
  }
  const url = new URL(request.url);
  if (url.searchParams.get("networkId") !== "testnet") {
    return jsonRpcError(rpcRequest.id, -32602, "Only Robinhood Testnet wallet operations are enabled.");
  }
  const requestedOwner = url.searchParams.get("ownerAddress");
  if (!requestedOwner || !isAddress(requestedOwner)) return jsonRpcError(rpcRequest.id, -32602, "A linked EVM owner is required.");
  const apiKey = process.env.ALCHEMY_API_KEY?.trim();
  if (!apiKey) return jsonRpcError(rpcRequest.id, -32000, "The Robinhood Testnet bundler is not configured.");

  try {
    const store = getResearchStore();
    const session = await getAuthSession(request, store);
    if (!session) return apiError(401, "authentication_required", "Sign in to your VEYRA Account before using its smart wallet.");
    const rate = await store.takeRateLimit(hashRateLimitKey(`veyra:testnet-smart-account-bundler:${session.userId}`), 60, 60_000);
    if (!rate.allowed) return apiError(429, "rate_limit_exceeded", "Smart wallet requests are temporarily rate limited.", { "retry-after": "60" });
    const linkedOwner = await store.getLinkedWalletAddress(session.userId, requestedOwner);
    if (!linkedOwner || linkedOwner.toLowerCase() !== requestedOwner.toLowerCase()) {
      return apiError(403, "wallet_owner_not_linked", "This EVM owner is not linked to the signed-in VEYRA Account.");
    }

    if (rpcRequest.method === "eth_estimateUserOperationGas" || rpcRequest.method === "eth_sendUserOperation") {
      if (!Array.isArray(rpcRequest.params) || rpcRequest.params.length !== 2) {
        return jsonRpcError(rpcRequest.id, -32602, "The UserOperation request is invalid.");
      }
      const accountAddress = predictVeyraSmartWalletAddress(linkedOwner);
      const code = await readRobinhoodContractCode("testnet", accountAddress);
      const accountDeployed = code === "present";
      if (accountDeployed) {
        const onchainOwner = await readRobinhoodContractOwner("testnet", accountAddress);
        if (onchainOwner.toLowerCase() !== linkedOwner.toLowerCase()) {
          return jsonRpcError(rpcRequest.id, -32602, "The deployed account owner does not match the linked wallet.");
        }
      }
      const validated = validateTestnetSelfCallRequest({
        request: rpcRequest,
        linkedOwner,
        expectedAccount: accountAddress,
        accountDeployed,
      });
      if (rpcRequest.method === "eth_sendUserOperation") {
        assertTestnetSelfCallFeeWithinLimit({ userOperation: validated.userOperation });
      }
    } else if (rpcRequest.method === "eth_getUserOperationByHash" || rpcRequest.method === "eth_getUserOperationReceipt") {
      const hash = rpcRequest.params[0];
      if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) {
        return jsonRpcError(rpcRequest.id, -32602, "The UserOperation hash is invalid.");
      }
    }

    const endpoint = `https://robinhood-testnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rpcRequest),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!upstream.ok) return jsonRpcError(rpcRequest.id, -32000, "The Robinhood Testnet bundler is unavailable.");
    const payload: unknown = await upstream.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonRpcError(rpcRequest.id, -32000, "The Robinhood Testnet bundler returned an invalid response.");
    }
    const response = payload as { jsonrpc?: unknown; id?: unknown; result?: unknown; error?: unknown };
    if (response.jsonrpc !== "2.0" || response.id !== rpcRequest.id) {
      return jsonRpcError(rpcRequest.id, -32000, "The Robinhood Testnet bundler returned an invalid response.");
    }
    if (response.error !== undefined) {
      return jsonRpcError(rpcRequest.id, -32000, "The Robinhood Testnet bundler rejected the request.");
    }
    if (rpcRequest.method === "eth_estimateUserOperationGas") {
      const operation = rpcRequest.params[0];
      if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
        return jsonRpcError(rpcRequest.id, -32602, "The UserOperation request is invalid.");
      }
      try {
        assertTestnetSelfCallFeeWithinLimit({
          userOperation: operation as Record<string, unknown>,
          gasEstimate: response.result && typeof response.result === "object" && !Array.isArray(response.result)
            ? response.result as Record<string, unknown>
            : undefined,
        });
      } catch {
        return jsonRpcError(rpcRequest.id, -32000, "The estimated Testnet operation exceeds the VEYRA fee limit or could not be verified.");
      }
    }
    return Response.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "smart_wallet_operation_unavailable";
    return apiError(503, code, "The Robinhood Testnet smart wallet operation could not be verified.");
  }
}
