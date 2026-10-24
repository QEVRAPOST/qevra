import { z } from "zod";
import { computeQuoteDigest, ROBINHOOD_MAINNET_TOKENS, ZEROX_ALLOWANCE_HOLDER, type RobinhoodSwapRequest } from "./mainnet";

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const HASH = /^0x[0-9a-f]{64}$/i;
const UINT = /^(0|[1-9][0-9]*)$/;
const DATA = /^0x(?:[0-9a-f]{2})+$/i;

const quoteResponseSchema = z.object({
  status: z.literal("ready"),
  mode: z.literal("quote"),
  networkId: z.literal("mainnet"),
  chainId: z.literal(4_663),
  taker: z.string().regex(ADDRESS),
  recipient: z.string().regex(ADDRESS),
  tokenIn: z.object({ id: z.enum(["ETH", "WETH", "USDG"]), address: z.string().regex(ADDRESS), symbol: z.string().min(1).max(32), decimals: z.number().int().min(0).max(36), native: z.boolean() }),
  tokenOut: z.object({ id: z.enum(["ETH", "WETH", "USDG"]), address: z.string().regex(ADDRESS), symbol: z.string().min(1).max(32), decimals: z.number().int().min(0).max(36), native: z.boolean() }),
  amountIn: z.string().regex(UINT),
  amountOut: z.string().regex(UINT),
  minimumReceived: z.string().regex(UINT),
  slippageBps: z.number().int().min(1).max(1_000),
  allowance: z.object({ spender: z.string().regex(ADDRESS).nullable(), actual: z.string().regex(UINT).nullable(), requiredAmount: z.string().regex(UINT) }),
  settlerAddress: z.string().regex(ADDRESS),
  transaction: z.object({ to: z.string().regex(ADDRESS), data: z.string().regex(DATA), value: z.string().regex(UINT), gas: z.string().regex(UINT), gasPrice: z.string().regex(UINT).optional() }),
  execution: z.object({ to: z.string().regex(ADDRESS), data: z.string().regex(DATA), value: z.string().regex(UINT), gas: z.string().regex(UINT), gasPrice: z.string().regex(UINT).optional() }),
  quoteDigest: z.string().regex(HASH),
  quotedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  estimatedGas: z.string().regex(UINT),
  gasPrice: z.string().regex(UINT).optional(),
  totalNetworkFee: z.string().regex(UINT).optional(),
  fees: z.unknown().optional(),
  route: z.array(z.object({ from: z.string().regex(ADDRESS), to: z.string().regex(ADDRESS), source: z.string().min(1).max(100), proportionBps: z.number().int().min(0).max(10_000).nullable().optional() })).min(1),
  walletBalance: z.object({ actual: z.string().regex(UINT).nullable().optional(), expected: z.string().regex(UINT).nullable().optional(), sufficient: z.boolean() }),
  signingEnabled: z.boolean(),
  executionEnabled: z.boolean(),
}).strict();

const priceResponseSchema = z.object({
  status: z.literal("ready"),
  mode: z.literal("price"),
  networkId: z.literal("mainnet"),
  chainId: z.literal(4_663),
  taker: z.string().regex(ADDRESS),
  tokenIn: z.object({ id: z.enum(["ETH", "WETH", "USDG"]), address: z.string().regex(ADDRESS), symbol: z.string().min(1).max(32), decimals: z.number().int().min(0).max(36), native: z.boolean() }).strict(),
  tokenOut: z.object({ id: z.enum(["ETH", "WETH", "USDG"]), address: z.string().regex(ADDRESS), symbol: z.string().min(1).max(32), decimals: z.number().int().min(0).max(36), native: z.boolean() }).strict(),
  amountIn: z.string().regex(UINT),
  amountOut: z.string().regex(UINT),
  slippageBps: z.number().int().min(1).max(1_000),
  estimatedGas: z.string().regex(UINT).optional(),
  gasPrice: z.string().regex(UINT).optional(),
  totalNetworkFee: z.string().regex(UINT).optional(),
  fees: z.unknown().optional(),
  route: z.array(z.object({ from: z.string().regex(ADDRESS), to: z.string().regex(ADDRESS), source: z.string().min(1).max(100), proportionBps: z.number().int().min(0).max(10_000).nullable().optional() }).strict()).min(1),
  signingEnabled: z.literal(false),
  executionEnabled: z.literal(false),
}).strict();

export type MainnetFirmQuote = z.infer<typeof quoteResponseSchema>;
export type MainnetIndicativePrice = {
  status: "ready";
  mode: "price";
  networkId: "mainnet";
  chainId: 4663;
  taker: string;
  tokenIn: MainnetFirmQuote["tokenIn"];
  tokenOut: MainnetFirmQuote["tokenOut"];
  amountIn: string;
  amountOut: string;
  slippageBps: number;
  estimatedGas?: string;
  gasPrice?: string;
  totalNetworkFee?: string;
  fees?: unknown;
  route: MainnetFirmQuote["route"];
  signingEnabled: false;
  executionEnabled: false;
};

export class MainnetSwapClientError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "MainnetSwapClientError";
  }
}

function readError(body: unknown): { code: string; message: string } {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (error && typeof error === "object") {
      const value = error as { code?: unknown; message?: unknown };
      if (typeof value.code === "string" && typeof value.message === "string") return { code: value.code, message: value.message };
    }
  }
  return { code: "swap_request_failed", message: "The Mainnet swap service could not return a usable response." };
}

function validateFirmQuote(input: unknown, request: RobinhoodSwapRequest, now: number): MainnetFirmQuote {
  const parsed = quoteResponseSchema.safeParse(input);
  if (!parsed.success) throw new MainnetSwapClientError(502, "invalid_swap_response", "The swap API returned malformed quote data.");
  const quote = parsed.data;
  const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
  const expectedIn = ROBINHOOD_MAINNET_TOKENS[request.tokenIn];
  const expectedOut = ROBINHOOD_MAINNET_TOKENS[request.tokenOut];
  if (!same(quote.taker, request.taker) || !same(quote.recipient, request.taker)
    || quote.tokenIn.id !== request.tokenIn || quote.tokenOut.id !== request.tokenOut
    || !same(quote.tokenIn.address, expectedIn.address) || !same(quote.tokenOut.address, expectedOut.address)
    || quote.tokenIn.symbol !== expectedIn.symbol || quote.tokenOut.symbol !== expectedOut.symbol
    || quote.tokenIn.native !== expectedIn.native || quote.tokenOut.native !== expectedOut.native
    || quote.slippageBps !== request.slippageBps) {
    throw new MainnetSwapClientError(502, "swap_request_mismatch", "The quote does not match the selected Mainnet wallet and token parameters.");
  }
  const [whole = "0", fraction = ""] = request.amount.split(".");
  if (fraction.length > quote.tokenIn.decimals) throw new MainnetSwapClientError(502, "swap_amount_mismatch", "The quote token decimals do not support the selected amount.");
  const amountIn = (BigInt(whole) * BigInt(10) ** BigInt(quote.tokenIn.decimals)
    + BigInt((fraction + "0".repeat(quote.tokenIn.decimals)).slice(0, quote.tokenIn.decimals) || "0")).toString();
  if (quote.amountIn !== amountIn || quote.allowance.requiredAmount !== amountIn
    || BigInt(quote.minimumReceived) > BigInt(quote.amountOut)
    || quote.transaction.to.toLowerCase() !== quote.execution.to.toLowerCase()
    || quote.transaction.data.toLowerCase() !== quote.execution.data.toLowerCase()
    || quote.transaction.value !== quote.execution.value || quote.transaction.gas !== quote.execution.gas
    || quote.transaction.to.toLowerCase() !== ZEROX_ALLOWANCE_HOLDER.toLowerCase()
    || (expectedIn.native ? quote.allowance.spender !== null : !quote.allowance.spender || quote.allowance.spender.toLowerCase() !== ZEROX_ALLOWANCE_HOLDER.toLowerCase())
    || (quote.allowance.spender && quote.allowance.spender.toLowerCase() === quote.settlerAddress.toLowerCase())) {
    throw new MainnetSwapClientError(502, "invalid_execution_parameters", "The returned allowance or execution data failed local validation.");
  }
  const expectedDigest = computeQuoteDigest({
    chainId: quote.chainId,
    taker: quote.taker,
    sellToken: quote.tokenIn.address,
    buyToken: quote.tokenOut.address,
    sellAmount: quote.amountIn,
    buyAmount: quote.amountOut,
    minimumReceived: quote.minimumReceived,
    slippageBps: quote.slippageBps,
    recipient: quote.recipient,
    allowanceSpender: quote.allowance.spender,
    settlerAddress: quote.settlerAddress,
    quotedAt: quote.quotedAt,
    expiresAt: quote.expiresAt,
    estimatedGas: quote.estimatedGas,
    gasPrice: quote.gasPrice,
    totalNetworkFee: quote.totalNetworkFee,
    fees: quote.fees,
    route: quote.route,
    transaction: quote.transaction,
  });
  if (!same(expectedDigest, quote.quoteDigest)) throw new MainnetSwapClientError(502, "quote_digest_mismatch", "The quote digest does not match its executable transaction.");
  const quotedAt = Date.parse(quote.quotedAt);
  const expiresAt = Date.parse(quote.expiresAt);
  if (!Number.isFinite(quotedAt) || !Number.isFinite(expiresAt) || quotedAt > now || expiresAt <= now || expiresAt - quotedAt > 30_000) {
    throw new MainnetSwapClientError(409, "quote_expired", "The firm quote expired. Request a fresh quote before signing.");
  }
  return quote;
}

export async function requestRobinhoodSwapQuote(
  request: RobinhoodSwapRequest & { mode?: "price" | "quote" },
  options: { now?: number; fetch?: typeof fetch } = {},
): Promise<MainnetFirmQuote | MainnetIndicativePrice> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const response = await fetcher("/api/swap/quote", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ ...request, mode: request.mode ?? "quote" }),
  });
  let body: unknown;
  try { body = await response.json() as unknown; } catch {
    throw new MainnetSwapClientError(502, "invalid_swap_response", "The swap API returned an unreadable response.");
  }
  if (!response.ok) {
    const error = readError(body);
    throw new MainnetSwapClientError(response.status, error.code, error.message);
  }
  if (request.mode === "price") {
    const parsed = priceResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new MainnetSwapClientError(502, "invalid_price_response", "The price API returned invalid data.");
    }
    const value: MainnetIndicativePrice = parsed.data;
    const expectedIn = ROBINHOOD_MAINNET_TOKENS[request.tokenIn];
    const expectedOut = ROBINHOOD_MAINNET_TOKENS[request.tokenOut];
    const [whole = "0", fraction = ""] = request.amount.split(".");
    if (fraction.length > value.tokenIn.decimals) throw new MainnetSwapClientError(502, "invalid_price_response", "The indicative price amount precision does not match the selected token.");
    const expectedAmount = (BigInt(whole) * BigInt(10) ** BigInt(value.tokenIn.decimals)
      + BigInt((fraction + "0".repeat(value.tokenIn.decimals)).slice(0, value.tokenIn.decimals) || "0")).toString();
    if (value.networkId !== "mainnet" || value.chainId !== 4_663 || value.taker.toLowerCase() !== request.taker.toLowerCase()
      || value.tokenIn.id !== request.tokenIn || value.tokenOut.id !== request.tokenOut
      || value.tokenIn.address.toLowerCase() !== expectedIn.address.toLowerCase()
      || value.tokenOut.address.toLowerCase() !== expectedOut.address.toLowerCase()
      || value.tokenIn.symbol !== expectedIn.symbol || value.tokenOut.symbol !== expectedOut.symbol
      || value.tokenIn.native !== expectedIn.native || value.tokenOut.native !== expectedOut.native
      || value.amountIn !== expectedAmount || value.slippageBps !== request.slippageBps
      || !/^(0|[1-9][0-9]*)$/.test(value.amountOut) || BigInt(value.amountOut) <= BigInt(0)
      || value.signingEnabled !== false || value.executionEnabled !== false || value.route.length === 0) {
      throw new MainnetSwapClientError(502, "invalid_price_response", "The indicative price is inconsistent with the selected Mainnet request.");
    }
    return value;
  }
  return validateFirmQuote(body, request, options.now ?? Date.now());
}
