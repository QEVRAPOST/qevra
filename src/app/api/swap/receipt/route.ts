import { createPublicClient, defineChain, http } from "viem";
import { ROBINHOOD_MAINNET_CHAIN_ID, ROBINHOOD_MAINNET_RPC } from "@/features/swap/mainnet";
import { createSwapReceiptHandler } from "@/features/swap/receipt-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = createPublicClient({
  chain: defineChain({ id: ROBINHOOD_MAINNET_CHAIN_ID, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [ROBINHOOD_MAINNET_RPC] } } }),
  transport: http(ROBINHOOD_MAINNET_RPC, { timeout: 10_000 }),
});

export const POST = createSwapReceiptHandler(client);
