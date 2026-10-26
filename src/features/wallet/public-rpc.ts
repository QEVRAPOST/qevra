import { NETWORKS } from "@/lib/config/networks";
import { encodeFunctionData, getAddress, isAddress } from "viem";
import type { NetworkId } from "@/types/network";
import { ROBINHOOD_MAINNET_TOKENS, ZEROX_ALLOWANCE_HOLDER, ZEROX_SETTLER_REGISTRY } from "@/lib/config/robinhood-mainnet-contracts";

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

export type RobinhoodContractBytecodeStatus = "present" | "absent" | "unavailable";

export interface RobinhoodMainnetInfrastructureSnapshot {
  networkId: "mainnet";
  chainId: 4_663;
  latestBlock: string;
  observedAt: string;
  contracts: {
    allowanceHolder: { address: string; bytecode: RobinhoodContractBytecodeStatus };
    settlerRegistry: { address: string; bytecode: RobinhoodContractBytecodeStatus };
    currentSettler: { address: string | null; status: "available" | "not_assigned" | "unavailable"; bytecode: RobinhoodContractBytecodeStatus };
    weth: { address: string; bytecode: RobinhoodContractBytecodeStatus };
    usdg: { address: string; bytecode: RobinhoodContractBytecodeStatus };
  };
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
  method: "eth_chainId" | "eth_blockNumber" | "eth_getBalance" | "eth_getCode" | "eth_call",
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

const SETTLER_REGISTRY_ABI = [{
  type: "function",
  name: "ownerOf",
  stateMutability: "view",
  inputs: [{ name: "tokenId", type: "uint256" }],
  outputs: [{ name: "owner", type: "address" }],
}] as const;
const SETTLER_TOKEN_ID = BigInt(2);
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

async function readCodePresence(
  rpcUrl: string,
  id: number,
  address: string,
  blockTag: string,
  fetchImpl: typeof fetch,
): Promise<RobinhoodContractBytecodeStatus> {
  try {
    const code = await requestRpcResult(rpcUrl, id, "eth_getCode", fetchImpl, [address, blockTag]);
    if (typeof code !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(code)) return "unavailable";
    return code === "0x" ? "absent" : "present";
  } catch {
    return "unavailable";
  }
}

/** Reads only configured public Mainnet infrastructure at one chain-verified block; this performs no wallet request. */
export async function readRobinhoodMainnetInfrastructure(
  fetchImpl: typeof fetch = fetch,
): Promise<RobinhoodMainnetInfrastructureSnapshot> {
  const network = NETWORKS.find((candidate) => candidate.id === "mainnet" && candidate.available);
  if (!network) throw new RobinhoodRpcError("network_not_available", "Robinhood Mainnet is not enabled for public reads.");

  const chainIdResult = parseQuantity(await requestRpcResult(network.rpcUrl, 1, "eth_chainId", fetchImpl));
  if (chainIdResult === undefined || chainIdResult > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RobinhoodRpcError("rpc_invalid_response", "The Robinhood Mainnet RPC returned an invalid chain ID.");
  }
  const chainId = Number(chainIdResult);
  if (chainId !== 4_663) {
    throw new RobinhoodRpcError("rpc_chain_id_mismatch", "The Robinhood Mainnet RPC chain ID did not match.", chainId);
  }

  const blockResult = parseQuantity(await requestRpcResult(network.rpcUrl, 2, "eth_blockNumber", fetchImpl));
  if (blockResult === undefined) throw new RobinhoodRpcError("rpc_invalid_response", "The Robinhood Mainnet RPC returned an invalid latest block number.");
  const latestBlock = blockResult.toString();
  const blockTag = `0x${blockResult.toString(16)}`;
  const [allowanceHolderCode, registryCode, wethCode, usdgCode] = await Promise.all([
    readCodePresence(network.rpcUrl, 3, getAddress(ZEROX_ALLOWANCE_HOLDER), blockTag, fetchImpl),
    readCodePresence(network.rpcUrl, 4, getAddress(ZEROX_SETTLER_REGISTRY), blockTag, fetchImpl),
    readCodePresence(network.rpcUrl, 5, getAddress(ROBINHOOD_MAINNET_TOKENS.WETH.address), blockTag, fetchImpl),
    readCodePresence(network.rpcUrl, 6, getAddress(ROBINHOOD_MAINNET_TOKENS.USDG.address), blockTag, fetchImpl),
  ]);

  let currentSettlerAddress: string | null = null;
  let currentSettlerStatus: RobinhoodMainnetInfrastructureSnapshot["contracts"]["currentSettler"]["status"] = "unavailable";
  let currentSettlerCode: RobinhoodContractBytecodeStatus = "unavailable";
  if (registryCode === "present") {
    try {
      const callData = encodeFunctionData({ abi: SETTLER_REGISTRY_ABI, functionName: "ownerOf", args: [SETTLER_TOKEN_ID] });
      const result = await requestRpcResult(network.rpcUrl, 7, "eth_call", fetchImpl, [
        { to: getAddress(ZEROX_SETTLER_REGISTRY), data: callData },
        blockTag,
      ]);
      if (typeof result === "string" && /^0x[0-9a-f]{64}$/i.test(result) && /^0{24}$/i.test(result.slice(2, 26))) {
        const address = getAddress(`0x${result.slice(-40).toLowerCase()}`);
        if (address.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
          currentSettlerStatus = "not_assigned";
        } else if (isAddress(address)) {
          currentSettlerAddress = address;
          currentSettlerStatus = "available";
          currentSettlerCode = await readCodePresence(network.rpcUrl, 8, address, blockTag, fetchImpl);
        }
      }
    } catch {
      currentSettlerStatus = "unavailable";
    }
  }

  return {
    networkId: "mainnet",
    chainId: 4_663,
    latestBlock,
    observedAt: new Date().toISOString(),
    contracts: {
      allowanceHolder: { address: getAddress(ZEROX_ALLOWANCE_HOLDER), bytecode: allowanceHolderCode },
      settlerRegistry: { address: getAddress(ZEROX_SETTLER_REGISTRY), bytecode: registryCode },
      currentSettler: { address: currentSettlerAddress, status: currentSettlerStatus, bytecode: currentSettlerCode },
      weth: { address: getAddress(ROBINHOOD_MAINNET_TOKENS.WETH.address), bytecode: wethCode },
      usdg: { address: getAddress(ROBINHOOD_MAINNET_TOKENS.USDG.address), bytecode: usdgCode },
    },
  };
}
