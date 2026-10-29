import { AccountVersionRegistry, predictLightAccountAddress } from "@alchemy/smart-accounts";
import { getAddress, isAddress } from "viem";
import type { NetworkId } from "@/types/network";
import type { SmartAccountBundlerStatus } from "@/features/wallet/smart-account-contract";

export const VEYRA_LIGHT_ACCOUNT_VERSION = "v2.0.0" as const;
export const VEYRA_LIGHT_ACCOUNT = AccountVersionRegistry.LightAccount[VEYRA_LIGHT_ACCOUNT_VERSION];
export const VEYRA_LIGHT_ACCOUNT_SALT = BigInt(0);

export async function checkAlchemyBundler(
  networkId: NetworkId,
  apiKey?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SmartAccountBundlerStatus> {
  const key = apiKey?.trim();
  if (!key) return "not_configured";
  const hostname = networkId === "mainnet"
    ? "https://robinhood-mainnet.g.alchemy.com/v2/"
    : "https://robinhood-testnet.g.alchemy.com/v2/";
  try {
    const response = await fetchImpl(`${hostname}${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_supportedEntryPoints", params: [] }),
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
    if (!response.ok) return "unavailable";
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return "unavailable";
    const responseRecord = payload as { jsonrpc?: unknown; id?: unknown; result?: unknown; error?: unknown };
    if (responseRecord.jsonrpc !== "2.0" || responseRecord.id !== 1 || responseRecord.error !== undefined) {
      return "unavailable";
    }
    const result = responseRecord.result;
    if (!Array.isArray(result) || !result.every((address) => typeof address === "string" && isAddress(address))) return "unavailable";
    return result.some((address) => address.toLowerCase() === VEYRA_LIGHT_ACCOUNT.entryPoint.address.toLowerCase())
      ? "available"
      : "entry_point_unsupported";
  } catch {
    return "unavailable";
  }
}

export function predictVeyraSmartWalletAddress(ownerAddress: string): `0x${string}` {
  if (!isAddress(ownerAddress)) throw new Error("wallet_owner_address_invalid");
  return predictLightAccountAddress({
    version: VEYRA_LIGHT_ACCOUNT_VERSION,
    factoryAddress: VEYRA_LIGHT_ACCOUNT.factoryAddress,
    salt: VEYRA_LIGHT_ACCOUNT_SALT,
    ownerAddress: getAddress(ownerAddress),
  });
}
