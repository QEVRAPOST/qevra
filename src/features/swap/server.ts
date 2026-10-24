import "server-only";

import { createPublicClient, defineChain, http, erc20Abi, getAddress, isAddress } from "viem";
import { apiError } from "@/features/security/api";
import { readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";
import {
  ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_MAINNET_RPC,
  ROBINHOOD_MAINNET_TOKENS,
  ZEROX_ALLOWANCE_HOLDER,
  ZEROX_SETTLER_REGISTRY,
  normalizeZeroXSwapPrice,
  normalizeZeroXSwapQuote,
  parseRobinhoodSwapRequest,
  type RobinhoodSwapTokenId,
  type RobinhoodSwapTokenMetadata,
  type ZeroXContractVerification,
} from "./mainnet";

const chain = defineChain({
  id: ROBINHOOD_MAINNET_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_MAINNET_RPC] } },
});

const publicClient = createPublicClient({ chain, transport: http(ROBINHOOD_MAINNET_RPC, { timeout: 10_000 }) });
const SETTLER_REGISTRY_ABI = [{
  type: "function",
  name: "ownerOf",
  stateMutability: "view",
  inputs: [{ name: "tokenId", type: "uint256" }],
  outputs: [{ name: "owner", type: "address" }],
}] as const;

export async function getVerifiedMainnetTokenMetadata(id: RobinhoodSwapTokenId): Promise<RobinhoodSwapTokenMetadata | undefined> {
  const configured = ROBINHOOD_MAINNET_TOKENS[id];
  try {
    if (await publicClient.getChainId() !== ROBINHOOD_MAINNET_CHAIN_ID) return undefined;
    if (configured.native) return { ...configured, decimals: 18 };
    const address = getAddress(configured.address);
    const code = await publicClient.getCode({ address });
    if (!code || code === "0x") return undefined;
    const [symbol, decimals] = await Promise.all([
      publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      publicClient.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]);
    if (symbol !== configured.symbol || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return undefined;
    return { ...configured, address, symbol, decimals };
  } catch {
    return undefined;
  }
}

export async function verifyMainnetZeroXContracts(
  reportedAllowanceSpender?: string,
  reportedExecutionTarget?: string,
): Promise<ZeroXContractVerification> {
  const unavailable: ZeroXContractVerification = {
    chainIdVerified: false,
    allowanceSpender: null,
    allowanceSpenderCodePresent: false,
    executionTarget: null,
    executionTargetCodePresent: false,
    latestSettler: null,
    settlerCodePresent: false,
  };
  try {
    const spender = reportedAllowanceSpender && isAddress(reportedAllowanceSpender) ? getAddress(reportedAllowanceSpender) : null;
    const executionTarget = reportedExecutionTarget && isAddress(reportedExecutionTarget) ? getAddress(reportedExecutionTarget) : null;
    if ((reportedAllowanceSpender && (!spender || spender.toLowerCase() !== ZEROX_ALLOWANCE_HOLDER.toLowerCase()))
      || !executionTarget || executionTarget.toLowerCase() !== ZEROX_ALLOWANCE_HOLDER.toLowerCase()) return unavailable;
    const registry = getAddress(ZEROX_SETTLER_REGISTRY);
    const [chainId, registryCode] = await Promise.all([
      publicClient.getChainId(),
      publicClient.getCode({ address: registry }),
    ]);
    if (chainId !== ROBINHOOD_MAINNET_CHAIN_ID || !registryCode || registryCode === "0x") return unavailable;
    const latestSettler = await publicClient.readContract({
      address: registry,
      abi: SETTLER_REGISTRY_ABI,
      functionName: "ownerOf",
      args: [BigInt(2)],
    });
    const [spenderCode, targetCode, settlerCode] = await Promise.all([
      spender ? publicClient.getCode({ address: spender }) : Promise.resolve("0x" as const),
      publicClient.getCode({ address: executionTarget }),
      publicClient.getCode({ address: latestSettler }),
    ]);
    return {
      chainIdVerified: true,
      allowanceSpender: spender,
      allowanceSpenderCodePresent: Boolean(spenderCode && spenderCode !== "0x"),
      executionTarget,
      executionTargetCodePresent: Boolean(targetCode && targetCode !== "0x"),
      latestSettler,
      settlerCodePresent: Boolean(settlerCode && settlerCode !== "0x"),
    };
  } catch {
    // ownerOf reverting means 0x has paused the settler; fail closed.
    return unavailable;
  }
}

type QuoteHandlerDependencies = {
  appMode?: string;
  apiKey?: string;
  fetch: typeof fetch;
  now: () => number;
  getTokenMetadata: typeof getVerifiedMainnetTokenMetadata;
  verifyContracts: (reportedAllowanceSpender?: string, reportedExecutionTarget?: string) => Promise<ZeroXContractVerification>;
  rateLimit?: (request: Request) => boolean;
};

const quoteRateBuckets = new Map<string, { count: number; resetAt: number }>();
function inMemoryQuoteRateLimit(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const now = Date.now();
  if (quoteRateBuckets.size > 4_096) {
    for (const [bucketIp, bucket] of quoteRateBuckets) {
      if (bucket.resetAt <= now) quoteRateBuckets.delete(bucketIp);
    }
    if (quoteRateBuckets.size > 8_192) return false;
  }
  const current = quoteRateBuckets.get(ip);
  if (!current || current.resetAt <= now) {
    quoteRateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

export function createSwapQuoteHandler(dependencies: QuoteHandlerDependencies) {
  return async function handleSwapQuote(request: Request): Promise<Response> {
    const noStore = { "cache-control": "no-store" };
    if (!sameOrigin(request)) return apiError(403, "origin_not_allowed", "Cross-origin quote requests are not allowed.", noStore);
    if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.", noStore);
    if (!(dependencies.rateLimit ?? inMemoryQuoteRateLimit)(request)) {
      return apiError(429, "quote_rate_limited", "Too many quote requests. Wait before requesting another price or quote.", { ...noStore, "retry-after": "60" });
    }

    let raw: unknown;
    try {
      raw = await readJsonBody(request, 2_048);
    } catch (error) {
      const code = error instanceof Error && error.message.startsWith("request_body_") ? error.message : "invalid_json";
      return apiError(400, code, "The swap request body is invalid.", noStore);
    }
    const parsed = parseRobinhoodSwapRequest(raw);
    if (!parsed.success) return apiError(400, "invalid_swap_request", "Robinhood Mainnet swap parameters are invalid.", noStore);
    if (dependencies.appMode !== "live") {
      return apiError(503, "swap_live_mode_required", "Mainnet quote requests require QEVRA_APP_MODE=live. No quote was requested.", noStore);
    }
    if (!dependencies.apiKey || dependencies.apiKey.trim().length < 16) {
      return apiError(503, "swap_provider_not_configured", "The server has no configured 0x API credential. No quote was requested.", noStore);
    }

    const requestData = parsed.data;
    const [sellToken, buyToken] = await Promise.all([
      dependencies.getTokenMetadata(requestData.tokenIn),
      dependencies.getTokenMetadata(requestData.tokenOut),
    ]);
    if (!sellToken || !buyToken) {
      return apiError(503, "mainnet_token_metadata_unavailable", "Robinhood Mainnet token bytecode or metadata could not be verified from RPC.", noStore);
    }
    const sellAmount = amountToBaseUnitsForServer(requestData.amount, sellToken.decimals);
    if (!sellAmount) return apiError(400, "invalid_token_amount_precision", "The amount has more decimal places than this token supports.", noStore);

    const mode = requestData.mode ?? "quote";
    const isNativeWrapPair = (requestData.tokenIn === "ETH" && requestData.tokenOut === "WETH")
      || (requestData.tokenIn === "WETH" && requestData.tokenOut === "ETH");
    const query = new URLSearchParams({
      chainId: String(ROBINHOOD_MAINNET_CHAIN_ID),
      sellToken: sellToken.address,
      buyToken: buyToken.address,
      sellAmount,
      taker: requestData.taker,
      ...(!isNativeWrapPair ? { recipient: requestData.taker } : {}),
      slippageBps: String(requestData.slippageBps),
    });
    const endpoint = `https://api.0x.org/swap/allowance-holder/${mode}?${query.toString()}`;
    let upstream: Response;
    try {
      upstream = await dependencies.fetch(endpoint, {
        method: "GET",
        headers: { "0x-api-key": dependencies.apiKey, "0x-version": "v2", accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return apiError(502, "quote_provider_unavailable", "The 0x quote service could not be reached. No transaction was requested.", noStore);
    }
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 503 : 502;
      return apiError(status, upstream.status === 429 ? "quote_provider_rate_limited" : "no_verified_route", "0x did not return a usable Robinhood Mainnet route for this pair and amount.", noStore);
    }
    let body: unknown;
    try {
      const text = await upstream.text();
      if (text.length > 1_500_000) return apiError(502, "quote_provider_response_too_large", "The quote provider response was rejected.", noStore);
      body = JSON.parse(text) as unknown;
    } catch {
      return apiError(502, "invalid_quote_provider_response", "The 0x service returned an unreadable response.", noStore);
    }

    if (mode === "price") {
      const price = normalizeZeroXSwapPrice(body, requestData, { sell: sellToken, buy: buyToken });
      if (price.status !== "ready") return apiError(price.status === "invalid" ? 502 : 503, price.reason, "No independently validated indicative Mainnet price is available.", noStore);
      return Response.json(price, { headers: noStore });
    }
    const contracts = await dependencies.verifyContracts(readProviderAllowanceSpender(body), readProviderExecutionTarget(body));
    const quote = normalizeZeroXSwapQuote(body, requestData, { sell: sellToken, buy: buyToken }, contracts, dependencies.now());
    if (quote.status !== "ready") {
      const code = quote.reason;
      return apiError(quote.status === "invalid" ? 502 : 503, code, "The firm quote failed independent Mainnet route and deployment checks.", noStore);
    }
    return Response.json(quote, { headers: noStore });
  };
}

function readProviderAllowanceSpender(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as { allowanceTarget?: unknown; issues?: { allowance?: { spender?: unknown } | null } | null };
  const issueSpender = value.issues?.allowance?.spender;
  if (typeof issueSpender === "string") return issueSpender;
  return typeof value.allowanceTarget === "string" ? value.allowanceTarget : undefined;
}

function readProviderExecutionTarget(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const transaction = (input as { transaction?: unknown }).transaction;
  if (!transaction || typeof transaction !== "object") return undefined;
  const target = (transaction as { to?: unknown }).to;
  return typeof target === "string" ? target : undefined;
}

function amountToBaseUnitsForServer(amount: string, decimals: number): string | undefined {
  const [whole = "0", fraction = ""] = amount.split(".");
  if (fraction.length > decimals || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(amount)) return undefined;
  try {
    const value = BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
    return value > BigInt(0) ? value.toString() : undefined;
  } catch {
    return undefined;
  }
}
