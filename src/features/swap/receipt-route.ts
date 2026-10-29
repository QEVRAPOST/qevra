import type { Address, Hex } from "viem";
import { apiError } from "@/features/security/api";
import { readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";
import { ROBINHOOD_MAINNET_CHAIN_ID } from "./mainnet";
import { verifyErc20OutputSettlement, verifySwapTransactionIdentity, type SwapReceiptLog, type SwapReceiptTransaction } from "./receipt-evidence";

const HASH = /^0x[0-9a-f]{64}$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const UINT = /^(0|[1-9][0-9]*)$/;

interface SwapExpectation {
  to: Address;
  dataHash: Hex;
  value: string;
  outputToken: Address;
  outputNative: boolean;
  recipient: Address;
  minimumOutput: string;
}

interface ReceiptRequestBody {
  hash: Hex;
  account: Address;
  kind: "swap" | "approval";
  expected?: SwapExpectation;
}

export interface SwapReceiptRpcClient {
  getChainId(): Promise<number>;
  getTransaction(args: { hash: Hex }): Promise<SwapReceiptTransaction | null>;
  getTransactionReceipt(args: { hash: Hex }): Promise<{
    transactionHash: Hex;
    status: "success" | "reverted";
    blockNumber: bigint;
    logs: readonly SwapReceiptLog[];
  } | null>;
}

async function readIfPending<T>(read: () => Promise<T>): Promise<T | null> {
  try { return await read(); } catch (error) {
    if (error instanceof Error && /Transaction(?:Receipt)?NotFoundError/.test(error.name)) return null;
    throw error;
  }
}

function parseRequestBody(value: unknown): ReceiptRequestBody | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  if (typeof body.hash !== "string" || !HASH.test(body.hash)
    || typeof body.account !== "string" || !ADDRESS.test(body.account)
    || (body.kind !== "swap" && body.kind !== "approval")) return undefined;
  if (body.kind === "approval") return { hash: body.hash as Hex, account: body.account as Address, kind: body.kind };
  if (!body.expected || typeof body.expected !== "object") return undefined;
  const expected = body.expected as Record<string, unknown>;
  if (typeof expected.to !== "string" || !ADDRESS.test(expected.to)
    || typeof expected.dataHash !== "string" || !HASH.test(expected.dataHash)
    || typeof expected.value !== "string" || !UINT.test(expected.value)
    || typeof expected.outputToken !== "string" || !ADDRESS.test(expected.outputToken)
    || typeof expected.outputNative !== "boolean"
    || typeof expected.recipient !== "string" || !ADDRESS.test(expected.recipient)
    || expected.recipient.toLowerCase() !== body.account.toLowerCase()
    || typeof expected.minimumOutput !== "string" || !/^[1-9][0-9]*$/.test(expected.minimumOutput)) return undefined;
  return {
    hash: body.hash as Hex,
    account: body.account as Address,
    kind: body.kind,
    expected: {
      to: expected.to as Address,
      dataHash: expected.dataHash as Hex,
      value: expected.value,
      outputToken: expected.outputToken as Address,
      outputNative: expected.outputNative,
      recipient: expected.recipient as Address,
      minimumOutput: expected.minimumOutput,
    },
  };
}

export function createSwapReceiptHandler(client: SwapReceiptRpcClient) {
  return async function POST(request: Request): Promise<Response> {
    const noStore = { "cache-control": "no-store" };
    if (!sameOrigin(request)) return apiError(403, "origin_not_allowed", "Cross-origin receipt requests are not allowed.", noStore);
    if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.", noStore);
    let raw: unknown;
    try { raw = await readJsonBody(request, 4_096); } catch {
      return apiError(400, "invalid_json", "The receipt request body is invalid.", noStore);
    }
    const body = parseRequestBody(raw);
    if (!body) return apiError(400, "invalid_receipt_request", "A valid transaction hash, wallet address, transaction kind, and expected swap identity are required.", noStore);

    try {
      if (await client.getChainId() !== ROBINHOOD_MAINNET_CHAIN_ID) {
        return apiError(503, "mainnet_rpc_chain_mismatch", "The configured receipt RPC is not Robinhood Mainnet.", noStore);
      }
      const [transaction, receipt] = await Promise.all([
        readIfPending(() => client.getTransaction({ hash: body.hash })),
        readIfPending(() => client.getTransactionReceipt({ hash: body.hash })),
      ]);
      if (!transaction && !receipt) {
        return Response.json({ status: "not_observed", identityVerified: false, transactionHash: body.hash }, { headers: noStore });
      }
      if (receipt && !transaction) return apiError(503, "receipt_transaction_unavailable", "The transaction details are not yet available from Robinhood Mainnet RPC.", noStore);
      if (!transaction || transaction.hash.toLowerCase() !== body.hash.toLowerCase()
        || transaction.from.toLowerCase() !== body.account.toLowerCase()
        || (receipt && receipt.transactionHash.toLowerCase() !== body.hash.toLowerCase())) {
        return apiError(409, "receipt_identity_mismatch", "The observed transaction does not match the submitted hash and wallet.", noStore);
      }
      if (body.kind === "swap" && (!body.expected || !verifySwapTransactionIdentity(transaction, {
        account: body.account,
        to: body.expected.to,
        value: BigInt(body.expected.value),
        dataHash: body.expected.dataHash,
      }))) {
        return apiError(409, "receipt_identity_mismatch", "The observed transaction does not match the reviewed swap transaction.", noStore);
      }
      if (!receipt) {
        return Response.json({ status: "pending", identityVerified: true, transactionHash: body.hash }, { headers: noStore });
      }
      const settlement = body.kind === "swap" && receipt.status === "success" && body.expected
        ? body.expected.outputNative ? { status: "not_applicable" as const } : verifyErc20OutputSettlement(receipt.logs, {
          token: body.expected.outputToken,
          recipient: body.expected.recipient,
          minimumAmount: body.expected.minimumOutput,
        })
        : { status: body.kind === "swap" ? "not_verified" as const : "not_applicable" as const };
      return Response.json({
        status: receipt.status === "success" ? "confirmed" : "reverted",
        identityVerified: true,
        blockNumber: receipt.blockNumber.toString(),
        transactionHash: body.hash,
        settlement,
      }, { headers: noStore });
    } catch {
      return apiError(503, "mainnet_rpc_unavailable", "Robinhood Mainnet transaction status is temporarily unavailable.", noStore);
    }
  };
}
