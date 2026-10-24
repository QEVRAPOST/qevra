import { formatUnits } from "viem";
import type { SwapPreflightResult } from "./execution";

const ROBINHOOD_MAINNET_CHAIN_ID = 4_663;
const ML_DSA_44_PUBLIC_KEY_BYTES = 1_312;

export interface MainnetSwapWalletContext {
  account?: string;
  applicationChainId?: number;
  walletChainId?: number;
  provider?: object;
}

export function getMainnetSwapNetworkReadiness(applicationChainId?: number, walletChainId?: number) {
  const applicationReady = applicationChainId === ROBINHOOD_MAINNET_CHAIN_ID;
  const walletReady = walletChainId === ROBINHOOD_MAINNET_CHAIN_ID;
  return { applicationReady, walletReady, ready: applicationReady && walletReady };
}

export function hasMainnetSwapContextChanged(previous: MainnetSwapWalletContext, current: MainnetSwapWalletContext): boolean {
  return (previous.account?.toLowerCase() ?? undefined) !== (current.account?.toLowerCase() ?? undefined)
    || previous.applicationChainId !== current.applicationChainId
    || previous.walletChainId !== current.walletChainId
    || previous.provider !== current.provider;
}

export function isWalletRequestRejection(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error
    && (error as { code?: unknown }).code === 4_001);
}

export function formatMainnetPreflightBalances(
  snapshot: SwapPreflightResult,
  sellToken: { symbol: string; decimals: number; native: boolean },
) {
  return {
    sellTokenBalance: `${formatUnits(sellToken.native ? snapshot.nativeBalance : snapshot.tokenBalance, sellToken.decimals)} ${sellToken.symbol}`,
    nativeBalance: `${formatUnits(snapshot.nativeBalance, 18)} ETH`,
    allowance: sellToken.native ? "Not applicable" : `${formatUnits(snapshot.currentAllowance, sellToken.decimals)} ${sellToken.symbol}`,
    estimatedGas: `${snapshot.estimatedGas} units`,
    estimatedFee: `${formatUnits(snapshot.feeRequirement, 18)} ETH`,
  };
}

export function formatMainnetTokenAmount(value: string | null | undefined, decimals: number): string | undefined {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)
    || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return undefined;
  return formatUnits(BigInt(value), decimals);
}

function decodeBase64Url(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

export async function getMldsa44PublicKeyFingerprint(
  attestation: { publicKey: string },
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<`0x${string}`> {
  const publicKey = decodeBase64Url(attestation.publicKey);
  if (!publicKey || publicKey.byteLength !== ML_DSA_44_PUBLIC_KEY_BYTES || !cryptoProvider?.subtle) {
    throw new Error("invalid_mldsa44_public_key");
  }
  const digestInput = new Uint8Array(publicKey.byteLength);
  digestInput.set(publicKey);
  const digest = new Uint8Array(await cryptoProvider.subtle.digest("SHA-256", digestInput.buffer));
  return `0x${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
