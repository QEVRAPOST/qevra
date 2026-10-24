import { createPublicClient, defineChain, http, getAddress, type Hex } from "viem";
import { apiError } from "@/features/security/api";
import { readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";
import { ROBINHOOD_MAINNET_CHAIN_ID, ROBINHOOD_MAINNET_RPC } from "@/features/swap/mainnet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = createPublicClient({
  chain: defineChain({ id: ROBINHOOD_MAINNET_CHAIN_ID, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [ROBINHOOD_MAINNET_RPC] } } }),
  transport: http(ROBINHOOD_MAINNET_RPC, { timeout: 10_000 }),
});
const REQUEST = /^0x[0-9a-f]{64}$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;

export async function POST(request: Request) {
  const noStore = { "cache-control": "no-store" };
  if (!sameOrigin(request)) return apiError(403, "origin_not_allowed", "Cross-origin receipt requests are not allowed.", noStore);
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.", noStore);
  let raw: unknown;
  try { raw = await readJsonBody(request, 1_024); } catch {
    return apiError(400, "invalid_json", "The receipt request body is invalid.", noStore);
  }
  if (!raw || typeof raw !== "object") return apiError(400, "invalid_receipt_request", "A transaction hash and wallet address are required.", noStore);
  const body = raw as { hash?: unknown; account?: unknown };
  if (typeof body.hash !== "string" || !REQUEST.test(body.hash) || typeof body.account !== "string" || !ADDRESS.test(body.account)) {
    return apiError(400, "invalid_receipt_request", "The transaction hash or wallet address is invalid.", noStore);
  }
  try {
    if (await client.getChainId() !== ROBINHOOD_MAINNET_CHAIN_ID) {
      return apiError(503, "mainnet_rpc_chain_mismatch", "The configured receipt RPC is not Robinhood Mainnet.", noStore);
    }
    const hash = body.hash as Hex;
    const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) {
      const transaction = await client.getTransaction({ hash });
      if (transaction.from.toLowerCase() !== getAddress(body.account).toLowerCase()) {
        return apiError(404, "transaction_owner_mismatch", "This transaction was not sent by the recorded wallet.", noStore);
      }
      return Response.json({
        status: receipt.status === "success" ? "confirmed" : "reverted",
        blockNumber: receipt.blockNumber.toString(),
        from: transaction.from,
        transactionHash: hash,
      }, { headers: noStore });
    }
    const transaction = await client.getTransaction({ hash }).catch(() => null);
    if (transaction && transaction.from.toLowerCase() !== getAddress(body.account).toLowerCase()) {
      return apiError(404, "transaction_owner_mismatch", "This transaction was not sent by the recorded wallet.", noStore);
    }
    return Response.json({ status: transaction ? "pending" : "not_observed", transactionHash: hash }, { headers: noStore });
  } catch {
    return apiError(503, "mainnet_rpc_unavailable", "Robinhood Mainnet transaction status is temporarily unavailable.", noStore);
  }
}
