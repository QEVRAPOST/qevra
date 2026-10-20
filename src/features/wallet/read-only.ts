"use client";

import { formatEther, isAddress, type Address } from "viem";
import type { PublicNativeBalance, ReadOnlyWalletState } from "@/types/integrations";
import { PROJECT_NAME } from "@/lib/project-brand";

type ReadOnlyMethod = "eth_requestAccounts" | "eth_accounts" | "eth_chainId" | "eth_getBalance" | "eth_getBlockByNumber";

export interface ReadOnlyEip1193Provider {
  request(args: { method: ReadOnlyMethod; params?: readonly unknown[] }): Promise<unknown>;
  providerName?: string;
  on?(event: "accountsChanged" | "chainChanged" | "disconnect", listener: (...args: unknown[]) => void): void;
  removeListener?(event: "accountsChanged" | "chainChanged" | "disconnect", listener: (...args: unknown[]) => void): void;
}

export function createWalletRequestGuard() {
  let currentRequestId = 0;
  return {
    begin() {
      currentRequestId += 1;
      return currentRequestId;
    },
    invalidate() {
      currentRequestId += 1;
    },
    isCurrent(requestId: number) {
      return requestId === currentRequestId;
    },
  };
}

const ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
const ROBINHOOD_MAINNET_CHAIN_ID = 4_663;

function targetNetworks() {
  return new Map<number, "Robinhood Chain" | "Robinhood Chain Testnet">([
    [ROBINHOOD_MAINNET_CHAIN_ID, "Robinhood Chain"],
    [ROBINHOOD_TESTNET_CHAIN_ID, "Robinhood Chain Testnet"],
  ]);
}

function parseChainId(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return undefined;
  const parsed = Number.parseInt(value, 16);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseHexQuantity(value: unknown): bigint | undefined {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function parseBlock(value: unknown): { number: bigint; hash: `0x${string}`; rpcNumber: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const block = value as { number?: unknown; hash?: unknown };
  const number = parseHexQuantity(block.number);
  if (number === undefined || typeof block.number !== "string" || typeof block.hash !== "string" || !/^0x[a-f0-9]{64}$/i.test(block.hash)) {
    return undefined;
  }
  return { number, hash: block.hash as `0x${string}`, rpcNumber: block.number };
}

function providerErrorState(error: unknown, readStage: boolean): ReadOnlyWalletState {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === 4001) return { status: "connection_rejected", message: "Wallet connection was rejected. No signature was requested." };
  if (code === 4900 || code === 4901) return { status: "provider_error", message: "The wallet provider is disconnected." };
  if (readStage) return { status: "rpc_unavailable", message: "The wallet's read-only RPC request failed. No write request was sent." };
  return { status: "provider_error", message: "The wallet provider did not return a valid read-only response." };
}

/** Requests account access and reads public account/network data only. It has no signing or transaction methods. */
export async function connectReadOnlyWallet(provider?: ReadOnlyEip1193Provider): Promise<ReadOnlyWalletState> {
  if (!provider) return { status: "wallet_not_installed", message: "No EIP-1193 wallet provider is available." };
  return readWallet(provider, true);
}

/** Refreshes an already granted connection without reopening the wallet permission prompt. */
export async function refreshReadOnlyWallet(provider?: ReadOnlyEip1193Provider): Promise<ReadOnlyWalletState> {
  if (!provider) return { status: "wallet_not_installed", message: "No EIP-1193 wallet provider is available." };
  return readWallet(provider, false);
}

/** Disconnect is local-only because EIP-1193 does not define a standard revoke method. */
export function disconnectReadOnlyWallet(): ReadOnlyWalletState {
  return { status: "disconnected", message: "Wallet disconnected from this view. No wallet request was sent." };
}

async function readWallet(provider: ReadOnlyEip1193Provider, requestAccounts: boolean): Promise<ReadOnlyWalletState> {
  let readStage = false;
  let address: Address | undefined;
  let chainId: number | undefined;
  let networkName: "Robinhood Chain" | "Robinhood Chain Testnet" | undefined;
  const providerInfo = provider.providerName ? { providerName: provider.providerName } : {};
  try {
    const accounts = await provider.request({ method: requestAccounts ? "eth_requestAccounts" : "eth_accounts" });
    if (!Array.isArray(accounts) || accounts.length === 0) return { status: "disconnected" };
    const account = accounts[0];
    if (typeof account !== "string" || !isAddress(account)) {
      return { status: "invalid_rpc_response", message: "The wallet returned an invalid account address." };
    }
    address = account as Address;

    readStage = true;
    chainId = parseChainId(await provider.request({ method: "eth_chainId" }));
    if (!chainId) return { status: "invalid_rpc_response", address, ...providerInfo, message: "The wallet returned an invalid chain ID." };
    networkName = targetNetworks().get(chainId);
    if (!networkName) {
      return {
        status: "unsupported_network",
        address,
        ...providerInfo,
        chainId,
        networkName: "Unsupported network",
        isQevraTargetNetwork: false,
        message: `This network is not configured as a ${PROJECT_NAME} read-only target.`,
      };
    }

    const block = parseBlock(await provider.request({ method: "eth_getBlockByNumber", params: ["latest", false] }));
    if (!block) {
      return {
        status: "invalid_rpc_response",
        address,
        ...providerInfo,
        chainId,
        networkName,
        isQevraTargetNetwork: true,
        message: "The wallet returned an invalid latest block reference.",
      };
    }
    const balanceResult = await provider.request({ method: "eth_getBalance", params: [address, block.rpcNumber] });
    const balance = parseHexQuantity(balanceResult);
    if (balance === undefined) {
      return {
        status: "invalid_rpc_response",
        address,
        ...providerInfo,
        chainId,
        networkName,
        isQevraTargetNetwork: true,
        message: "The wallet returned an invalid balance or block number.",
      };
    }

    const currentAccounts = await provider.request({ method: "eth_accounts" });
    const currentChainId = parseChainId(await provider.request({ method: "eth_chainId" }));
    const currentAddress = Array.isArray(currentAccounts) && typeof currentAccounts[0] === "string" && isAddress(currentAccounts[0])
      ? currentAccounts[0]
      : undefined;
    if (!currentAddress || currentAddress.toLowerCase() !== address.toLowerCase() || currentChainId !== chainId) {
      return {
        status: "provider_error",
        message: "The wallet account or network changed while reading. Refresh to request a consistent address and balance snapshot.",
      };
    }

    const publicBalance: PublicNativeBalance = {
      symbol: "ETH",
      amount: formatEther(balance),
      wei: balance.toString(),
      blockNumber: block.number.toString(),
      blockHash: block.hash,
      provider: "connected_wallet_rpc",
      observedAt: new Date().toISOString(),
    };
    return { status: "connected", address, ...providerInfo, chainId, networkName, isQevraTargetNetwork: true, balance: publicBalance };
  } catch (error) {
    return {
      ...providerErrorState(error, readStage),
      ...(address ? { address } : {}),
      ...providerInfo,
      ...(chainId !== undefined ? { chainId } : {}),
      ...(networkName ? { networkName, isQevraTargetNetwork: true } : chainId !== undefined ? { isQevraTargetNetwork: false } : {}),
    };
  }
}

export function watchReadOnlyWallet(
  provider: ReadOnlyEip1193Provider,
  listener: () => void,
): () => void {
  const handler = () => listener();
  provider.on?.("accountsChanged", handler);
  provider.on?.("chainChanged", handler);
  provider.on?.("disconnect", handler);
  return () => {
    provider.removeListener?.("accountsChanged", handler);
    provider.removeListener?.("chainChanged", handler);
    provider.removeListener?.("disconnect", handler);
  };
}
