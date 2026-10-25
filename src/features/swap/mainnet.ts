import { keccak256, stringToBytes } from "viem";
import { z } from "zod";

export const ROBINHOOD_MAINNET_CHAIN_ID = 4_663;
export const ROBINHOOD_MAINNET_RPC = "https://rpc.mainnet.chain.robinhood.com";
export const ZEROX_ALLOWANCE_HOLDER = "0x0000000000001fF3684f28c67538d4D072C22734" as const;
export const ZEROX_SETTLER_REGISTRY = "0x00000000000004533Fe15556B1E086BB1A72cEae" as const;
export const NATIVE_ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

export const ROBINHOOD_MAINNET_TOKENS = {
  ETH: { id: "ETH", address: NATIVE_ETH_ADDRESS, symbol: "ETH", decimals: 18, native: true },
  WETH: { id: "WETH", address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", symbol: "WETH", decimals: 18, native: false },
  USDG: { id: "USDG", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG", decimals: 6, native: false },
} as const;

export type RobinhoodSwapTokenId = keyof typeof ROBINHOOD_MAINNET_TOKENS;
export type RobinhoodSwapToken = (typeof ROBINHOOD_MAINNET_TOKENS)[RobinhoodSwapTokenId];
export type RobinhoodSwapTokenMetadata = {
  id: RobinhoodSwapTokenId;
  address: string;
  symbol: string;
  decimals: number;
  native: boolean;
};

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const DATA = /^0x(?:[0-9a-f]{2})+$/i;
const UINT = /^(0|[1-9][0-9]*)$/;
const POSITIVE_DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const proportionBpsSchema = z.union([
  z.number().int().min(0).max(10_000),
  z.string().regex(UINT).transform(Number).pipe(z.number().int().min(0).max(10_000)),
]).nullable().optional();
const tokenId = z.enum(["ETH", "WETH", "USDG"]);

const requestSchema = z.object({
  networkId: z.literal("mainnet"),
  chainId: z.literal(ROBINHOOD_MAINNET_CHAIN_ID),
  mode: z.enum(["price", "quote"]).optional(),
  tokenIn: tokenId,
  tokenOut: tokenId,
  amount: z.string().min(1).max(80).regex(POSITIVE_DECIMAL),
  slippageBps: z.number().int().min(1).max(1_000),
  taker: z.string().regex(ADDRESS),
}).strict().superRefine((value, context) => {
  if (value.tokenIn === value.tokenOut) context.addIssue({ code: "custom", path: ["tokenOut"], message: "tokens_must_differ" });
  if (!/[1-9]/.test(value.amount)) context.addIssue({ code: "custom", path: ["amount"], message: "amount_must_be_positive" });
});

export type RobinhoodSwapRequest = z.infer<typeof requestSchema>;

export function parseRobinhoodSwapRequest(input: unknown):
  | { success: true; data: RobinhoodSwapRequest }
  | { success: false; error: z.ZodError } {
  const result = requestSchema.safeParse(input);
  return result.success ? result : { success: false, error: result.error };
}

export function amountToBaseUnits(amount: string, decimals: number): string | undefined {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || !POSITIVE_DECIMAL.test(amount)) return undefined;
  const [whole = "0", fraction = ""] = amount.split(".");
  if (fraction.length > decimals) return undefined;
  try {
    const value = BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
    return value > BigInt(0) ? value.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function computeQuoteDigest(input: {
  chainId: number;
  taker: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  minimumReceived: string;
  slippageBps: number;
  recipient: string;
  allowanceSpender: string | null;
  settlerAddress: string;
  quotedAt: string;
  expiresAt: string;
  estimatedGas: string;
  gasPrice?: string;
  totalNetworkFee?: string;
  fees?: unknown;
  route: Array<{ from: string; to: string; source: string; proportionBps?: number | null }>;
  transaction: { to: string; data: string; value: string; gas: string; gasPrice?: string };
}): `0x${string}` {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  };
  const canonical = JSON.stringify(stable({
    version: 1,
    chainId: input.chainId,
    taker: input.taker.toLowerCase(),
    sellToken: input.sellToken.toLowerCase(),
    buyToken: input.buyToken.toLowerCase(),
    sellAmount: input.sellAmount,
    buyAmount: input.buyAmount,
    minimumReceived: input.minimumReceived,
    slippageBps: input.slippageBps,
    recipient: input.recipient.toLowerCase(),
    allowanceSpender: input.allowanceSpender?.toLowerCase() ?? null,
    settlerAddress: input.settlerAddress.toLowerCase(),
    quotedAt: input.quotedAt,
    expiresAt: input.expiresAt,
    estimatedGas: input.estimatedGas,
    gasPrice: input.gasPrice ?? null,
    totalNetworkFee: input.totalNetworkFee ?? null,
    fees: input.fees ?? null,
    route: input.route.map((fill) => ({
      from: fill.from.toLowerCase(),
      to: fill.to.toLowerCase(),
      source: fill.source,
      proportionBps: fill.proportionBps ?? null,
    })),
    transaction: {
      to: input.transaction.to.toLowerCase(),
      data: input.transaction.data.toLowerCase(),
      value: input.transaction.value,
      gas: input.transaction.gas,
      gasPrice: input.transaction.gasPrice ?? null,
    },
  }));
  return keccak256(stringToBytes(`VEYRA_ROBINHOOD_SWAP_QUOTE_V1\0${canonical}`));
}

export interface ZeroXContractVerification {
  chainIdVerified: boolean;
  allowanceSpender: string | null;
  allowanceSpenderCodePresent: boolean;
  executionTarget: string | null;
  executionTargetCodePresent: boolean;
  latestSettler: string | null;
  settlerCodePresent: boolean;
}

const quoteResponseSchema = z.object({
  allowanceTarget: z.string().regex(ADDRESS).nullable().optional(),
  buyAmount: z.string().regex(UINT),
  minBuyAmount: z.string().regex(UINT),
  sellAmount: z.string().regex(UINT),
  sellToken: z.string().regex(ADDRESS),
  buyToken: z.string().regex(ADDRESS),
  liquidityAvailable: z.literal(true),
  gas: z.string().regex(UINT),
  gasPrice: z.string().regex(UINT).optional(),
  totalNetworkFee: z.string().regex(UINT).nullable().optional(),
  fees: z.unknown().optional(),
  issues: z.object({
    allowance: z.object({ actual: z.string().regex(UINT).nullable().optional(), spender: z.string().regex(ADDRESS).nullable().optional() }).nullable().optional(),
    balance: z.object({ token: z.string().regex(ADDRESS).optional(), actual: z.string().regex(UINT).nullable().optional(), expected: z.string().regex(UINT).nullable().optional() }).nullable().optional(),
    simulationIncomplete: z.boolean().optional(),
    invalidSourcesPassed: z.array(z.string()).optional(),
  }).passthrough().optional(),
  route: z.object({
    fills: z.array(z.object({ from: z.string().regex(ADDRESS), to: z.string().regex(ADDRESS), source: z.string().min(1).max(100), proportionBps: proportionBpsSchema })).min(1),
    tokens: z.array(z.object({ address: z.string().regex(ADDRESS), symbol: z.string().max(64).optional() })).optional(),
  }).passthrough(),
  transaction: z.object({
    to: z.string().regex(ADDRESS),
    data: z.string().regex(DATA),
    value: z.string().regex(UINT),
    gas: z.string().regex(UINT).optional(),
    gasPrice: z.string().regex(UINT).optional(),
  }).passthrough(),
}).passthrough();

export type NormalizedRobinhoodSwapQuote = {
  status: "ready";
  mode: "quote";
  networkId: "mainnet";
  chainId: 4663;
  taker: string;
  recipient: string;
  tokenIn: RobinhoodSwapTokenMetadata;
  tokenOut: RobinhoodSwapTokenMetadata;
  amountIn: string;
  amountOut: string;
  minimumReceived: string;
  slippageBps: number;
  allowance: { spender: string | null; actual: string | null; requiredAmount: string };
  settlerAddress: string;
  transaction: { to: string; data: string; value: string; gas: string; gasPrice?: string };
  execution: { to: string; data: string; value: string; gas: string; gasPrice?: string };
  quoteDigest: `0x${string}`;
  quotedAt: string;
  expiresAt: string;
  estimatedGas: string;
  gasPrice?: string;
  totalNetworkFee?: string;
  fees?: unknown;
  route: Array<{ from: string; to: string; source: string; proportionBps?: number | null }>;
  walletBalance: { actual?: string | null; expected?: string | null; sufficient: boolean };
  signingEnabled: boolean;
  executionEnabled: boolean;
};

export type NormalizedQuoteResult =
  | NormalizedRobinhoodSwapQuote
  | {
      status: "ready";
      mode: "price";
      networkId: "mainnet";
      chainId: 4663;
      taker: string;
      tokenIn: RobinhoodSwapTokenMetadata;
      tokenOut: RobinhoodSwapTokenMetadata;
      amountIn: string;
      amountOut: string;
      slippageBps: number;
      estimatedGas?: string;
      gasPrice?: string;
      totalNetworkFee?: string;
      fees?: unknown;
      route: Array<{ from: string; to: string; source: string; proportionBps?: number | null }>;
      signingEnabled: false;
      executionEnabled: false;
    }
  | { status: "invalid"; reason: string }
  | { status: "unavailable"; reason: string };

const priceResponseSchema = z.object({
  buyAmount: z.string().regex(UINT),
  sellAmount: z.string().regex(UINT),
  sellToken: z.string().regex(ADDRESS),
  buyToken: z.string().regex(ADDRESS),
  liquidityAvailable: z.literal(true),
  gas: z.string().regex(UINT).nullable().optional(),
  gasPrice: z.string().regex(UINT).nullable().optional(),
  totalNetworkFee: z.string().regex(UINT).nullable().optional(),
  fees: z.unknown().optional(),
  route: z.object({
    fills: z.array(z.object({ from: z.string().regex(ADDRESS), to: z.string().regex(ADDRESS), source: z.string().min(1).max(100), proportionBps: proportionBpsSchema })).min(1),
  }).passthrough(),
}).passthrough();

export function normalizeZeroXSwapPrice(
  input: unknown,
  request: RobinhoodSwapRequest,
  tokens: { sell: RobinhoodSwapTokenMetadata; buy: RobinhoodSwapTokenMetadata },
): NormalizedQuoteResult {
  const parsed = priceResponseSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", reason: "malformed_provider_price" };
  const price = parsed.data;
  const amountIn = amountToBaseUnits(request.amount, tokens.sell.decimals);
  const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
  if (!amountIn || price.sellAmount !== amountIn || !same(price.sellToken, tokens.sell.address) || !same(price.buyToken, tokens.buy.address)) {
    return { status: "invalid", reason: "provider_price_request_mismatch" };
  }
  return {
    status: "ready",
    mode: "price",
    networkId: "mainnet",
    chainId: ROBINHOOD_MAINNET_CHAIN_ID,
    taker: request.taker,
    tokenIn: tokens.sell,
    tokenOut: tokens.buy,
    amountIn,
    amountOut: price.buyAmount,
    slippageBps: request.slippageBps,
    ...(price.gas ? { estimatedGas: price.gas } : {}),
    ...(price.gasPrice ? { gasPrice: price.gasPrice } : {}),
    ...(price.totalNetworkFee ? { totalNetworkFee: price.totalNetworkFee } : {}),
    ...(price.fees !== undefined ? { fees: price.fees } : {}),
    route: price.route.fills,
    signingEnabled: false,
    executionEnabled: false,
  };
}

export function normalizeZeroXSwapQuote(
  input: unknown,
  request: RobinhoodSwapRequest,
  tokens: { sell: RobinhoodSwapTokenMetadata; buy: RobinhoodSwapTokenMetadata },
  contracts: ZeroXContractVerification,
  now: number,
): NormalizedQuoteResult {
  const parsed = quoteResponseSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", reason: "malformed_provider_quote" };
  const quote = parsed.data;
  const amountIn = amountToBaseUnits(request.amount, tokens.sell.decimals);
  if (!amountIn) return { status: "invalid", reason: "amount_precision_exceeds_token_decimals" };
  const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
  if (!same(quote.sellToken, tokens.sell.address) || !same(quote.buyToken, tokens.buy.address) || quote.sellAmount !== amountIn) {
    return { status: "invalid", reason: "provider_quote_request_mismatch" };
  }
  if (!contracts.chainIdVerified || !contracts.latestSettler || !contracts.settlerCodePresent) {
    return { status: "unavailable", reason: "0x_execution_contract_not_verified_on_robinhood_mainnet" };
  }
  if (!quote.issues || quote.issues.simulationIncomplete !== false) {
    return { status: "unavailable", reason: "provider_simulation_incomplete" };
  }
  if ((quote.issues.invalidSourcesPassed?.length ?? 0) > 0) {
    return { status: "invalid", reason: "provider_reported_invalid_liquidity_sources" };
  }
  const allowance = quote.issues.allowance;
  const spender = allowance?.spender ?? quote.allowanceTarget ?? null;
  if (spender && same(spender, contracts.latestSettler)) {
    return { status: "invalid", reason: "missing_or_forbidden_allowance_spender" };
  }
  if ((spender && !same(spender, ZEROX_ALLOWANCE_HOLDER)) || !same(quote.transaction.to, ZEROX_ALLOWANCE_HOLDER)) {
    return { status: "unavailable", reason: "provider_allowance_holder_address_not_verified_for_robinhood_mainnet" };
  }
  if (allowance?.spender && quote.allowanceTarget && !same(allowance.spender, quote.allowanceTarget)) {
    return { status: "invalid", reason: "provider_allowance_target_mismatch" };
  }
  const allowanceRequired = !tokens.sell.native;
  if (allowanceRequired && !spender) {
    return { status: "invalid", reason: "missing_or_forbidden_allowance_spender" };
  }
  // Native sell tokens need no ERC-20 approval. If a spender is reported,
  // still require it to match the route entry point and verified deployment.
  if (spender && !same(spender, quote.transaction.to)) {
    return { status: "invalid", reason: "allowance_holder_execution_target_mismatch" };
  }
  if (spender && (same(spender, contracts.latestSettler)
    || !contracts.allowanceSpender || !same(contracts.allowanceSpender, spender)
    || !contracts.allowanceSpenderCodePresent)) {
    return { status: "unavailable", reason: "provider_allowance_spender_not_verified_on_robinhood_mainnet" };
  }
  if (!contracts.executionTarget || !same(contracts.executionTarget, quote.transaction.to) || !contracts.executionTargetCodePresent) {
    return { status: "unavailable", reason: "provider_execution_target_not_verified_on_robinhood_mainnet" };
  }
  if (quote.transaction.data === "0x" || BigInt(quote.gas) <= BigInt(0) || BigInt(quote.buyAmount) <= BigInt(0) || BigInt(quote.minBuyAmount) <= BigInt(0)
    || BigInt(quote.minBuyAmount) > BigInt(quote.buyAmount)) {
    return { status: "invalid", reason: "provider_quote_has_invalid_execution_values" };
  }
  const slippageFloor = BigInt(quote.buyAmount) * BigInt(10_000 - request.slippageBps) / BigInt(10_000);
  if (BigInt(quote.minBuyAmount) < slippageFloor) return { status: "invalid", reason: "provider_quote_exceeds_requested_slippage" };
  const balance = quote.issues.balance;
  const balanceActual = balance?.actual ?? null;
  const balanceExpected = balance?.expected ?? amountIn;
  const sufficientBalance = balanceActual !== null && BigInt(balanceActual) >= BigInt(balanceExpected);
  const transaction = {
    to: quote.transaction.to,
    data: quote.transaction.data,
    value: quote.transaction.value,
    gas: quote.transaction.gas ?? quote.gas,
    ...(quote.transaction.gasPrice ?? quote.gasPrice ? { gasPrice: quote.transaction.gasPrice ?? quote.gasPrice } : {}),
  };
  const quotedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + 30_000).toISOString();
  const recipient = request.taker;
  const quoteDigest = computeQuoteDigest({
    chainId: request.chainId,
    taker: request.taker,
    sellToken: tokens.sell.address,
    buyToken: tokens.buy.address,
    sellAmount: amountIn,
    buyAmount: quote.buyAmount,
    minimumReceived: quote.minBuyAmount,
    slippageBps: request.slippageBps,
    recipient,
    allowanceSpender: tokens.sell.native ? null : spender,
    settlerAddress: contracts.latestSettler!,
    quotedAt,
    expiresAt,
    estimatedGas: quote.gas,
    gasPrice: quote.transaction.gasPrice ?? quote.gasPrice,
    totalNetworkFee: quote.totalNetworkFee ?? undefined,
    fees: quote.fees,
    route: quote.route.fills,
    transaction,
  });
  return {
    status: "ready",
    mode: "quote",
    networkId: "mainnet",
    chainId: ROBINHOOD_MAINNET_CHAIN_ID,
    taker: request.taker,
    recipient,
    tokenIn: tokens.sell,
    tokenOut: tokens.buy,
    amountIn,
    amountOut: quote.buyAmount,
    minimumReceived: quote.minBuyAmount,
    slippageBps: request.slippageBps,
    allowance: { spender: tokens.sell.native ? null : spender, actual: allowance?.actual ?? null, requiredAmount: amountIn },
    settlerAddress: contracts.latestSettler!,
    transaction,
    execution: transaction,
    quoteDigest,
    quotedAt,
    expiresAt,
    estimatedGas: quote.gas,
    ...(quote.transaction.gasPrice ?? quote.gasPrice ? { gasPrice: quote.transaction.gasPrice ?? quote.gasPrice } : {}),
    ...(quote.totalNetworkFee ? { totalNetworkFee: quote.totalNetworkFee } : {}),
    ...(quote.fees !== undefined ? { fees: quote.fees } : {}),
    route: quote.route.fills,
    walletBalance: { actual: balanceActual, expected: balanceExpected, sufficient: sufficientBalance },
    signingEnabled: sufficientBalance,
    executionEnabled: sufficientBalance,
  };
}
