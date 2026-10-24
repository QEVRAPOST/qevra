import { getExplorerTransactionUrl } from "@/lib/config/networks";
import type { ActivityRow } from "@/types";

export const SWAP_ACTIVITY_STORAGE_KEY = "veyra.robinhood.mainnet.transactions.v1";

export interface StoredSwapTransaction {
  hash: `0x${string}`;
  account: `0x${string}`;
  kind: "swap" | "approval";
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amountIn: string;
  createdAt: string;
}

function isStoredTransaction(value: unknown): value is StoredSwapTransaction {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StoredSwapTransaction>;
  return typeof item.hash === "string" && /^0x[0-9a-f]{64}$/i.test(item.hash)
    && typeof item.account === "string" && /^0x[0-9a-f]{40}$/i.test(item.account)
    && (item.kind === "swap" || item.kind === "approval")
    && typeof item.tokenInSymbol === "string" && item.tokenInSymbol.length <= 32
    && typeof item.tokenOutSymbol === "string" && item.tokenOutSymbol.length <= 32
    && typeof item.amountIn === "string" && item.amountIn.length <= 80
    && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt));
}

export function readStoredSwapTransactions(storage?: Storage): StoredSwapTransaction[] {
  try {
    const value = (storage ?? (typeof window !== "undefined" ? window.localStorage : undefined))?.getItem(SWAP_ACTIVITY_STORAGE_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isStoredTransaction).slice(0, 100) : [];
  } catch {
    return [];
  }
}

export function saveSwapTransaction(transaction: StoredSwapTransaction, storage?: Storage): boolean {
  if (!isStoredTransaction(transaction)) return false;
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!target) return false;
    const current = readStoredSwapTransactions(target).filter((item) => item.hash.toLowerCase() !== transaction.hash.toLowerCase());
    target.setItem(SWAP_ACTIVITY_STORAGE_KEY, JSON.stringify([transaction, ...current].slice(0, 100)));
    return true;
  } catch {
    return false;
  }
}

export function toMainnetActivityRow(
  transaction: StoredSwapTransaction,
  state: "pending" | "confirmed" | "reverted",
  blockNumber?: string,
): ActivityRow {
  const action = transaction.kind === "approval" ? "Token approval submitted" : "Mainnet swap submitted";
  const displayState = state === "confirmed" ? "Included" : state === "reverted" ? "Reverted" : "Waiting for receipt";
  const explorerUrl = getExplorerTransactionUrl("mainnet", transaction.hash);
  return {
    id: transaction.hash,
    sentence: transaction.kind === "approval"
      ? `Approve ${transaction.amountIn} ${transaction.tokenInSymbol} to 0x AllowanceHolder`
      : `Swap ${transaction.amountIn} ${transaction.tokenInSymbol} for ${transaction.tokenOutSymbol}`,
    state,
    stateLabel: displayState,
    tone: state === "confirmed" ? "ok" : state === "reverted" ? "bad" : "unk",
    material: state === "confirmed" ? "solid" : "outline",
    amount: transaction.amountIn,
    note: `${action}. This record is saved in this browser only; the inclusion receipt is checked against Robinhood Mainnet RPC. This does not establish finality or provide a complete wallet transaction history.`,
    hash: transaction.hash,
    time: transaction.createdAt,
    ...(explorerUrl ? { explorerUrl } : {}),
    detail: [
      { label: "Transaction hash", value: transaction.hash, ...(explorerUrl ? { href: explorerUrl } : {}) },
      { label: "Wallet", value: transaction.account },
      { label: "Network", value: "Robinhood Mainnet · 4663" },
      { label: "Activity", value: action },
      ...(blockNumber ? [{ label: "Receipt block", value: blockNumber }] : []),
    ],
  };
}
