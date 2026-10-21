import { z } from "zod";
import { NETWORKS } from "@/lib/config/networks";
import type { NetworkId } from "@/types/network";

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const HASH = /^0x[0-9a-f]{64}$/i;
const UINT = /^(0|[1-9][0-9]{0,77})$/;
const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

const uintString = z.string().regex(UINT).refine((value) => BigInt(value) <= MAX_UINT256);
const tokenAddress = z.string().regex(ADDRESS);

const quoteRequestSchema = z.object({
  networkId: z.enum(["testnet", "mainnet"]),
  chainId: z.number().int().positive(),
  tokenIn: tokenAddress,
  tokenInDecimals: z.number().int().min(0).max(36),
  tokenOut: tokenAddress,
  tokenOutDecimals: z.number().int().min(0).max(36),
  amountIn: uintString.refine((amount) => BigInt(amount) > BigInt(0)),
  slippageBps: z.number().int().min(1).max(1_000),
}).superRefine((request, context) => {
  const network = NETWORKS.find((candidate) => candidate.id === request.networkId && candidate.available);
  if (!network || network.chainId !== request.chainId) {
    context.addIssue({ code: "custom", path: ["chainId"], message: "chain_id_mismatch" });
  }
  if (request.tokenIn.toLowerCase() === request.tokenOut.toLowerCase()) {
    context.addIssue({ code: "custom", path: ["tokenOut"], message: "tokens_must_differ" });
  }
});

export type SwapQuoteRequest = z.infer<typeof quoteRequestSchema>;

const quoteSchema = quoteRequestSchema.extend({
  router: tokenAddress,
  routerCodeHash: z.string().regex(HASH),
  amountOut: uintString.refine((amount) => BigInt(amount) > BigInt(0)),
  minimumAmountOut: uintString.refine((amount) => BigInt(amount) > BigInt(0)),
  provenance: z.object({
    providerId: z.string().min(1).max(120),
    endpoint: z.string().url().refine((value) => {
      try {
        const endpoint = new URL(value);
        return endpoint.protocol === "https:" && !endpoint.username && !endpoint.password && !endpoint.hash && !endpoint.search;
      } catch {
        return false;
      }
    }),
    responseHash: z.string().regex(HASH),
  }),
  quotedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
});

export type SwapQuote = z.infer<typeof quoteSchema>;

export type QuoteValidation =
  | { status: "valid"; expectedMinimumAmountOut: string }
  | { status: "invalid"; reason: string }
  | { status: "expired"; reason: "quote_expired" };

export function parseSwapQuoteRequest(input: unknown):
  | { success: true; data: SwapQuoteRequest }
  | { success: false; error: z.ZodError } {
  const result = quoteRequestSchema.safeParse(input);
  return result.success ? result : { success: false, error: result.error };
}

export function validateSwapQuote(
  request: SwapQuoteRequest,
  candidate: unknown,
  context: { now: number; approvedRouters: ReadonlyMap<string, string>; approvedProviders: ReadonlyMap<string, string> },
): QuoteValidation {
  const parsed = quoteSchema.safeParse(candidate);
  if (!parsed.success) return { status: "invalid", reason: "malformed_quote" };
  const quote = parsed.data;
  const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
  if (quote.networkId !== request.networkId || quote.chainId !== request.chainId) {
    return { status: "invalid", reason: "quote_chain_mismatch" };
  }
  if (!same(quote.tokenIn, request.tokenIn) || !same(quote.tokenOut, request.tokenOut)
    || quote.tokenInDecimals !== request.tokenInDecimals || quote.tokenOutDecimals !== request.tokenOutDecimals
    || quote.amountIn !== request.amountIn || quote.slippageBps !== request.slippageBps) {
    return { status: "invalid", reason: "quote_request_mismatch" };
  }
  const registeredCodeHash = context.approvedRouters.get(quote.router.toLowerCase());
  if (!registeredCodeHash || !same(registeredCodeHash, quote.routerCodeHash)) {
    return { status: "invalid", reason: "router_not_verified" };
  }
  const providerEndpoint = context.approvedProviders.get(quote.provenance.providerId);
  if (!providerEndpoint || providerEndpoint !== quote.provenance.endpoint) {
    return { status: "invalid", reason: "quote_provider_not_verified" };
  }
  const quotedAt = Date.parse(quote.quotedAt);
  const expiresAt = Date.parse(quote.expiresAt);
  if (!Number.isFinite(quotedAt) || !Number.isFinite(expiresAt) || quotedAt > context.now || expiresAt <= context.now
    || expiresAt <= quotedAt || expiresAt - quotedAt > 5 * 60_000) {
    return { status: "expired", reason: "quote_expired" };
  }
  const output = BigInt(quote.amountOut);
  const minimum = BigInt(quote.minimumAmountOut);
  const slippageFloor = output * BigInt(10_000 - request.slippageBps) / BigInt(10_000);
  if (minimum > output || minimum < slippageFloor) {
    return { status: "invalid", reason: "minimum_received_outside_slippage" };
  }
  return { status: "valid", expectedMinimumAmountOut: minimum.toString() };
}

const intentSchema = quoteRequestSchema.extend({
  recipient: tokenAddress,
  router: tokenAddress,
  value: uintString,
  calldataHash: z.string().regex(HASH),
  minimumReceived: uintString.refine((amount) => BigInt(amount) > BigInt(0)),
  expiresAt: z.string().datetime({ offset: true }),
});

const executionSchema = intentSchema.extend({});
export type SwapIntent = z.infer<typeof intentSchema>;
export type ExecutableSwapParameters = z.infer<typeof executionSchema>;

export type IntentComparison =
  | { status: "match" }
  | { status: "mismatch"; fields: string[] }
  | { status: "unavailable"; reason: "execution_parameters_unavailable" | "malformed_execution_parameters" };

export function compareIntentToExecution(intentInput: unknown, executionInput: unknown | null): IntentComparison {
  if (executionInput === null) return { status: "unavailable", reason: "execution_parameters_unavailable" };
  const intent = intentSchema.safeParse(intentInput);
  const execution = executionSchema.safeParse(executionInput);
  if (!intent.success || !execution.success) {
    return { status: "unavailable", reason: "malformed_execution_parameters" };
  }
  const fields: string[] = [];
  for (const key of [
    "networkId", "chainId", "tokenIn", "tokenInDecimals", "tokenOut", "tokenOutDecimals",
    "amountIn", "slippageBps", "recipient", "router", "value", "calldataHash", "minimumReceived", "expiresAt",
  ] as const) {
    const expected = intent.data[key];
    const actual = execution.data[key];
    const equal = typeof expected === "string" && typeof actual === "string"
      && ["tokenIn", "tokenOut", "recipient", "router", "calldataHash"].includes(key)
      ? expected.toLowerCase() === actual.toLowerCase()
      : expected === actual;
    if (!equal) fields.push(key);
  }
  return fields.length === 0 ? { status: "match" } : { status: "mismatch", fields };
}

export function getSwapQuoteUnavailable(networkId: NetworkId) {
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  return {
    status: "unavailable" as const,
    reason: "no_verified_route" as const,
    networkId,
    chainId: network?.chainId ?? null,
    quote: null,
    signingEnabled: false as const,
    executionEnabled: false as const,
  };
}

/** No supported, independently verified Robinhood router integration is configured yet. */
export function discoverSwapQuote(request: SwapQuoteRequest) {
  const parsed = parseSwapQuoteRequest(request);
  if (!parsed.success) {
    return {
      status: "unavailable" as const,
      reason: "invalid_quote_request" as const,
      networkId: request.networkId,
      chainId: null,
      quote: null,
      signingEnabled: false as const,
      executionEnabled: false as const,
    };
  }
  return getSwapQuoteUnavailable(parsed.data.networkId);
}
