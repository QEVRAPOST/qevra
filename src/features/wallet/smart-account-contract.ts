import { isAddress } from "viem";
import type { NetworkId } from "@/types/network";
import type { RobinhoodSmartAccountInfrastructureSnapshot, RobinhoodSmartAccountTokenBalance } from "@/features/wallet/public-rpc";

export type SmartAccountBundlerStatus = "available" | "not_configured" | "unavailable" | "entry_point_unsupported";

export interface RobinhoodSmartAccountStatus {
  networkId: NetworkId;
  ownerAddress: `0x${string}`;
  infrastructure: RobinhoodSmartAccountInfrastructureSnapshot;
  bundler: SmartAccountBundlerStatus;
  account?: {
    address: `0x${string}`;
    deployment: "counterfactual" | "deployed";
    ownerVerified: boolean | null;
    balanceWei: string;
    observedBlock: string;
    observedAt: string;
  };
  tokenBalances: RobinhoodSmartAccountTokenBalance[];
  execution: "testnet_self_call_only" | "not_integrated";
}

export type WalletSmartAccountStatusResponse =
  | { status: "owner_link_required"; networkId: NetworkId }
  | {
      status: "infrastructure_blocked";
      networkId: NetworkId;
      ownerAddress: `0x${string}`;
      infrastructure: RobinhoodSmartAccountInfrastructureSnapshot;
      bundler: SmartAccountBundlerStatus;
      execution: "not_integrated";
    }
  | { status: "account_owner_mismatch"; networkId: NetworkId; accountAddress: `0x${string}` }
  | { status: "account_ready"; smartAccount: RobinhoodSmartAccountStatus };

export function isWalletSmartAccountStatusResponse(value: unknown): value is WalletSmartAccountStatusResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const smartAccount = record.smartAccount && typeof record.smartAccount === "object"
    ? record.smartAccount as Record<string, unknown>
    : undefined;
  const networkId = record.networkId ?? smartAccount?.networkId;
  if (networkId !== "mainnet" && networkId !== "testnet") return false;
  if (record.status === "owner_link_required") return true;
  if (record.status === "account_owner_mismatch") {
    return typeof record.accountAddress === "string" && isAddress(record.accountAddress);
  }
  const payload = record.status === "account_ready" ? smartAccount : record;
  if ((record.status !== "account_ready" && record.status !== "infrastructure_blocked")
    || !payload) return false;
  if (typeof payload.ownerAddress !== "string" || !isAddress(payload.ownerAddress)
    || !["available", "not_configured", "unavailable", "entry_point_unsupported"].includes(String(payload.bundler))
    || !["not_integrated", "testnet_self_call_only"].includes(String(payload.execution))
    || (payload.execution === "testnet_self_call_only" && networkId !== "testnet")) return false;
  const infrastructure = payload.infrastructure;
  if (!infrastructure || typeof infrastructure !== "object" || Array.isArray(infrastructure)) return false;
  const snapshot = infrastructure as Record<string, unknown>;
  const contractStatus = (entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    return typeof item.address === "string" && isAddress(item.address)
      && ["present", "absent", "unavailable"].includes(String(item.bytecode));
  };
  if (snapshot.networkId !== networkId || !Number.isSafeInteger(snapshot.chainId)
    || typeof snapshot.latestBlock !== "string" || !/^\d+$/.test(snapshot.latestBlock)
    || typeof snapshot.observedAt !== "string" || !Number.isFinite(Date.parse(snapshot.observedAt))
    || typeof snapshot.ready !== "boolean" || !contractStatus(snapshot.factory)
    || !contractStatus(snapshot.implementation) || !contractStatus(snapshot.entryPoint)) return false;
  if (record.status === "infrastructure_blocked") return true;
  const account = payload.account;
  if (!account || typeof account !== "object" || Array.isArray(account)) return false;
  const accountRecord = account as Record<string, unknown>;
  const tokenBalances = payload.tokenBalances;
  const validTokenBalances = Array.isArray(tokenBalances) && tokenBalances.every((token) => {
    if (!token || typeof token !== "object" || Array.isArray(token)) return false;
    const item = token as Record<string, unknown>;
    const balanceShapeValid = item.status === "available"
      ? typeof item.balanceRaw === "string" && /^\d+$/.test(item.balanceRaw)
      : item.balanceRaw === null;
    return typeof item.address === "string" && isAddress(item.address)
      && typeof item.symbol === "string" && /^[A-Z0-9]{2,12}$/.test(item.symbol)
      && Number.isSafeInteger(item.decimals) && Number(item.decimals) >= 0 && Number(item.decimals) <= 36
      && ["available", "token_contract_missing", "metadata_mismatch", "unavailable"].includes(String(item.status))
      && balanceShapeValid
      && typeof item.observedBlock === "string" && /^\d+$/.test(item.observedBlock);
  });
  return validTokenBalances && typeof accountRecord.address === "string" && isAddress(accountRecord.address)
    && ["deployed", "counterfactual"].includes(String(accountRecord.deployment))
    && (accountRecord.ownerVerified === null || typeof accountRecord.ownerVerified === "boolean")
    && typeof accountRecord.balanceWei === "string" && /^\d+$/.test(accountRecord.balanceWei)
    && typeof accountRecord.observedBlock === "string" && /^\d+$/.test(accountRecord.observedBlock)
    && typeof accountRecord.observedAt === "string" && Number.isFinite(Date.parse(accountRecord.observedAt));
}
