import { NETWORKS } from "@/lib/config/networks";
import { getAddress, isAddress } from "viem";
import type { NetworkId } from "@/types/network";

export type RobinhoodRpcErrorCode =
  | "network_not_available"
  | "rpc_timeout"
  | "rpc_unavailable"
  | "rpc_http_error"
  | "rpc_error"
  | "rpc_invalid_response"
  | "rpc_chain_id_mismatch"
  | "invalid_address";

export class RobinhoodRpcError extends Error {
  constructor(readonly code: RobinhoodRpcErrorCode, message: string, readonly observedChainId?: number) {
    super(message);
    this.name = "RobinhoodRpcError";
  }
}

export interface RobinhoodNetworkSnapshot {
  networkId: NetworkId;
  chainId: number;
  latestBlock: string;
  observedAt: string;
}

export interface RobinhoodPublicAddressSnapshot {
  networkId: NetworkId;
  chainId: number;
  address: string;
  balanceWei: string;
  observedBlock: string;
  observedAt: string;
}

function parseQuantity(value: unknown): bigint | undefined {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

async function requestRpcResult(
  rpcUrl: string,
  id: number,
  method: "eth_chainId" | "eth_blockNumber" | "eth_getBalance",
  fetchImpl: typeof fetch,
  params: readonly unknown[] = [],
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new RobinhoodRpcError("rpc_timeout", "The public Robinhood RPC request timed out.");
    }
    throw new RobinhoodRpcError("rpc_unavailable", "The public Robinhood RPC could not be reached.");
  }

  if (!response.ok) throw new RobinhoodRpcError("rpc_http_error", `The public Robinhood RPC returned HTTP ${response.status}.`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RobinhoodRpcError("rpc_invalid_response", "The public Robinhood RPC returned invalid JSON.");
  }
  if (!payload || typeof payload !== "object") {
    throw new RobinhoodRpcError("rpc_invalid_response", "The public Robinhood RPC returned an invalid response.");
  }
  const record = payload as { id?: unknown; result?: unknown; error?: unknown };
  if (record.id !== id) throw new RobinhoodRpcError("rpc_invalid_response", "The public Robinhood RPC response ID did not match.");
  if (record.error !== undefined) throw new RobinhoodRpcError("rpc_error", "The public Robinhood RPC rejected a read-only query.");
  return record.result;
}

/** Reads only eth_chainId and eth_blockNumber from the repository's fixed Robinhood RPC allowlist. */
export async function readRobinhoodNetwork(
  networkId: NetworkId,
  fetchImpl: typeof fetch = fetch,
): Promise<RobinhoodNetworkSnapshot> {
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network) throw new RobinhoodRpcError("network_not_available", "This Robinhood network is not enabled for public reads.");

  const chainIdResult = parseQuantity(await requestRpcResult(network.rpcUrl, 1, "eth_chainId", fetchImpl));
  if (chainIdResult === undefined || chainIdResult > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RobinhoodRpcError("rpc_invalid_response", "The public Robinhood RPC returned an invalid chain ID.");
  }
  const chainId = Number(chainIdResult);
  if (chainId !== network.chainId) {
    throw new RobinhoodRpcError("rpc_chain_id_mismatch", "The public Robinhood RPC chain ID did not match the selected network.", chainId);
  }

  const blockResult = parseQuantity(await requestRpcResult(network.rpcUrl, 2, "eth_blockNumber", fetchImpl));
  if (blockResult === undefined) {
    throw new RobinhoodRpcError("rpc_invalid_response", "The public Robinhood RPC returned an invalid latest block number.");
  }

  return {
    networkId,
    chainId,
    latestBlock: blockResult.toString(),
    observedAt: new Date().toISOString(),
  };
}

/** Reads a public EVM address on a fixed Robinhood RPC allowlist; this never requests wallet access. */
export async function readRobinhoodPublicAddress(
  networkId: NetworkId,
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RobinhoodPublicAddressSnapshot> {
  if (!isAddress(address)) {
    throw new RobinhoodRpcError("invalid_address", "Enter a valid EVM address to inspect.");
  }
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network) throw new RobinhoodRpcError("network_not_available", "This Robinhood network is not enabled for public reads.");
  const normalizedAddress = getAddress(address);

  const chainIdResult = parseQuantity(await requestRpcResult(network.rpcUrl, 1, "eth_chainId", fetchImpl));
  if (chainIdResult === undefined || chainIdResult > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RobinhoodRpcError("rpc_invalid_response", "The public Robinhood RPC returned an invalid chain ID.");
  }
  const chainId = Number(chainIdResult);
  if (chainId !== network.chainId) {
    throw new RobinhoodRpcError("rpc_chain_id_mismatch", "The public Robinhood RPC chain ID did not match the selected network.", chainId);
  }

  const blockResult = parseQuantity(await requestRpcResult(network.rpcUrl, 2, "eth_blockNumber", fetchImpl));
  if (blockResult === undefined) {
    throw new RobinhoodRpcError("rpc_invalid_response", "The public Robinhood RPC returned an invalid latest block number.");
  }

  const balanceResult = parseQuantity(await requestRpcResult(
    network.rpcUrl,
    3,
    "eth_getBalance",
    fetchImpl,
    [normalizedAddress, `0x${blockResult.toString(16)}`],
  ));
  if (balanceResult === undefined) {
    throw new RobinhoodRpcError("rpc_invalid_response", "The public Robinhood RPC returned an invalid native balance.");
  }

  return {
    networkId,
    chainId,
    address: normalizedAddress,
    balanceWei: balanceResult.toString(),
    observedBlock: blockResult.toString(),
    observedAt: new Date().toISOString(),
  };
}
