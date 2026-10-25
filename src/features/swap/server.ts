import "server-only";

import { randomUUID } from "node:crypto";
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

export type SwapRpcFailureCategory =
  | "rpc_chain_id_read_failed"
  | "rpc_chain_id_mismatch"
  | "rpc_token_code_read_failed"
  | "rpc_token_code_missing"
  | "rpc_token_metadata_read_failed"
  | "rpc_token_metadata_mismatch"
  | "rpc_settler_registry_code_read_failed"
  | "rpc_settler_registry_code_missing"
  | "rpc_settler_registry_read_failed"
  | "rpc_contract_code_read_failed"
  | "rpc_allowance_holder_code_missing"
  | "rpc_execution_target_code_missing"
  | "rpc_settler_code_missing";

type ReportRpcFailure = (category: SwapRpcFailureCategory) => void;

export type SwapQuoteFailureDiagnostic = {
  event: "swap_quote_failure";
  requestId: string;
  mode: "price" | "quote" | "unknown";
  upstreamHttpStatus: number | null;
  providerErrorClassification: string | null;
  rpcFailureCategories: SwapRpcFailureCategory[];
  applicationValidationCategory: string | null;
  requestDurationMs: number;
  internalExceptionCategory: "timeout" | "type_error" | "unexpected_exception" | null;
};

export async function getVerifiedMainnetTokenMetadata(
  id: RobinhoodSwapTokenId,
  reportRpcFailure?: ReportRpcFailure,
): Promise<RobinhoodSwapTokenMetadata | undefined> {
  const configured = ROBINHOOD_MAINNET_TOKENS[id];
  let chainId: number;
  try {
    chainId = await publicClient.getChainId();
  } catch {
    reportRpcFailure?.("rpc_chain_id_read_failed");
    return undefined;
  }
  if (chainId !== ROBINHOOD_MAINNET_CHAIN_ID) {
    reportRpcFailure?.("rpc_chain_id_mismatch");
    return undefined;
  }
  if (configured.native) return { ...configured, decimals: 18 };

  const address = getAddress(configured.address);
  let code: string | undefined;
  try {
    code = await publicClient.getCode({ address });
  } catch {
    reportRpcFailure?.("rpc_token_code_read_failed");
    return undefined;
  }
  if (!code || code === "0x") {
    reportRpcFailure?.("rpc_token_code_missing");
    return undefined;
  }

  let symbol: string;
  let decimals: number;
  try {
    [symbol, decimals] = await Promise.all([
      publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      publicClient.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]);
  } catch {
    reportRpcFailure?.("rpc_token_metadata_read_failed");
    return undefined;
  }
  if (symbol !== configured.symbol || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    reportRpcFailure?.("rpc_token_metadata_mismatch");
    return undefined;
  }
  return { ...configured, address, symbol, decimals };
}

export async function verifyMainnetZeroXContracts(
  reportedAllowanceSpender?: string,
  reportedExecutionTarget?: string,
  reportRpcFailure?: ReportRpcFailure,
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
    const [chainResult, registryCodeResult] = await Promise.all([
      publicClient.getChainId().then((value) => ({ value })).catch(() => ({ failed: true as const })),
      publicClient.getCode({ address: registry }).then((value) => ({ value })).catch(() => ({ failed: true as const })),
    ]);
    if ("failed" in chainResult) {
      reportRpcFailure?.("rpc_chain_id_read_failed");
      return unavailable;
    }
    if (chainResult.value !== ROBINHOOD_MAINNET_CHAIN_ID) {
      reportRpcFailure?.("rpc_chain_id_mismatch");
      return unavailable;
    }
    if ("failed" in registryCodeResult) {
      reportRpcFailure?.("rpc_settler_registry_code_read_failed");
      return unavailable;
    }
    const registryCode = registryCodeResult.value;
    if (!registryCode || registryCode === "0x") {
      reportRpcFailure?.("rpc_settler_registry_code_missing");
      return unavailable;
    }
    let latestSettler: `0x${string}`;
    try {
      latestSettler = await publicClient.readContract({
        address: registry,
        abi: SETTLER_REGISTRY_ABI,
        functionName: "ownerOf",
        args: [BigInt(2)],
      });
    } catch {
      // ownerOf reverting means 0x has paused the settler; fail closed.
      reportRpcFailure?.("rpc_settler_registry_read_failed");
      return unavailable;
    }
    let spenderCode: string | undefined;
    let targetCode: string | undefined;
    let settlerCode: string | undefined;
    try {
      [spenderCode, targetCode, settlerCode] = await Promise.all([
        spender ? publicClient.getCode({ address: spender }) : Promise.resolve("0x" as const),
        publicClient.getCode({ address: executionTarget }),
        publicClient.getCode({ address: latestSettler }),
      ]);
    } catch {
      reportRpcFailure?.("rpc_contract_code_read_failed");
      return unavailable;
    }
    if (spender && (!spenderCode || spenderCode === "0x")) reportRpcFailure?.("rpc_allowance_holder_code_missing");
    if (!targetCode || targetCode === "0x") reportRpcFailure?.("rpc_execution_target_code_missing");
    if (!settlerCode || settlerCode === "0x") reportRpcFailure?.("rpc_settler_code_missing");
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
  getTokenMetadata: (id: RobinhoodSwapTokenId, reportRpcFailure?: ReportRpcFailure) => Promise<RobinhoodSwapTokenMetadata | undefined>;
  verifyContracts: (
    reportedAllowanceSpender?: string,
    reportedExecutionTarget?: string,
    reportRpcFailure?: ReportRpcFailure,
  ) => Promise<ZeroXContractVerification>;
  onDiagnostic?: (diagnostic: SwapQuoteFailureDiagnostic) => void;
  rateLimit?: (request: Request) => boolean;
};

function requestCorrelationId(request: Request): string {
  const candidate = request.headers.get("x-request-id");
  return candidate && /^[A-Za-z0-9_-]{1,80}$/.test(candidate) ? candidate : randomUUID();
}

function classifyProviderHttpStatus(status: number): string {
  if (status === 401 || status === 403) return "upstream_auth_or_permission_rejected";
  if (status === 429) return "upstream_rate_limited";
  if (status >= 400 && status < 500) return "upstream_rejected";
  if (status >= 500) return "upstream_server_error";
  return "upstream_http_error";
}

function classifyInternalException(error: unknown): SwapQuoteFailureDiagnostic["internalExceptionCategory"] {
  if (!(error instanceof Error)) return "unexpected_exception";
  if (error.name === "AbortError" || error.name === "TimeoutError") return "timeout";
  if (error.name === "TypeError") return "type_error";
  return "unexpected_exception";
}

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
    const requestId = requestCorrelationId(request);
    const startedAt = Date.now();
    const responseHeaders = { "cache-control": "no-store", "x-veyra-request-id": requestId };
    let mode: SwapQuoteFailureDiagnostic["mode"] = "unknown";
    let upstreamHttpStatus: number | null = null;
    let providerErrorClassification: string | null = null;
    let applicationValidationCategory: string | null = null;
    let internalExceptionCategory: SwapQuoteFailureDiagnostic["internalExceptionCategory"] = null;
    const rpcFailureCategories = new Set<SwapRpcFailureCategory>();
    const reportRpcFailure: ReportRpcFailure = (category) => rpcFailureCategories.add(category);
    const fail = (status: number, code: string, message: string) => {
      if (status >= 500) {
        const diagnostic: SwapQuoteFailureDiagnostic = {
          event: "swap_quote_failure",
          requestId,
          mode,
          upstreamHttpStatus,
          providerErrorClassification,
          rpcFailureCategories: [...rpcFailureCategories],
          applicationValidationCategory,
          requestDurationMs: Math.max(0, Date.now() - startedAt),
          internalExceptionCategory,
        };
        try {
          dependencies.onDiagnostic?.(diagnostic);
        } catch {
          // Logging failures must not affect the safe API response.
        }
      }
      return apiError(status, code, message, responseHeaders);
    };

    try {
      if (!sameOrigin(request)) return fail(403, "origin_not_allowed", "Cross-origin quote requests are not allowed.");
      if (!requireJsonContentType(request)) return fail(415, "json_required", "Send a JSON request body.");
      if (!(dependencies.rateLimit ?? inMemoryQuoteRateLimit)(request)) {
        return apiError(429, "quote_rate_limited", "Too many quote requests. Wait before requesting another price or quote.", { ...responseHeaders, "retry-after": "60" });
      }

      let raw: unknown;
      try {
        raw = await readJsonBody(request, 2_048);
      } catch (error) {
        const code = error instanceof Error && error.message.startsWith("request_body_") ? error.message : "invalid_json";
        return fail(400, code, "The swap request body is invalid.");
      }
      const parsed = parseRobinhoodSwapRequest(raw);
      if (!parsed.success) return fail(400, "invalid_swap_request", "Robinhood Mainnet swap parameters are invalid.");
      const requestData = parsed.data;
      mode = requestData.mode ?? "quote";
      if (dependencies.appMode !== "live") {
        providerErrorClassification = "provider_not_configured_for_live_mode";
        return fail(503, "swap_live_mode_required", "Mainnet quote requests require QEVRA_APP_MODE=live. No quote was requested.");
      }
      if (!dependencies.apiKey || dependencies.apiKey.trim().length < 16) {
        providerErrorClassification = "provider_credential_unavailable";
        return fail(503, "swap_provider_not_configured", "The server has no configured 0x API credential. No quote was requested.");
      }

      const [sellToken, buyToken] = await Promise.all([
        dependencies.getTokenMetadata(requestData.tokenIn, reportRpcFailure),
        dependencies.getTokenMetadata(requestData.tokenOut, reportRpcFailure),
      ]);
      if (!sellToken || !buyToken) {
        applicationValidationCategory = "mainnet_token_metadata_unavailable";
        return fail(503, "mainnet_token_metadata_unavailable", "Robinhood Mainnet token bytecode or metadata could not be verified from RPC.");
      }
      const sellAmount = amountToBaseUnitsForServer(requestData.amount, sellToken.decimals);
      if (!sellAmount) return fail(400, "invalid_token_amount_precision", "The amount has more decimal places than this token supports.");

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
      } catch (error) {
        providerErrorClassification = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
          ? "provider_transport_timeout"
          : "provider_transport_failure";
        return fail(502, "quote_provider_unavailable", "The 0x quote service could not be reached. No transaction was requested.");
      }
      upstreamHttpStatus = upstream.status;
      if (!upstream.ok) {
        providerErrorClassification = classifyProviderHttpStatus(upstream.status);
        const status = upstream.status === 429 ? 503 : 502;
        return fail(status, upstream.status === 429 ? "quote_provider_rate_limited" : "no_verified_route", "0x did not return a usable Robinhood Mainnet route for this pair and amount.");
      }
      let text: string;
      try {
        text = await upstream.text();
      } catch {
        providerErrorClassification = "provider_response_read_failure";
        return fail(502, "invalid_quote_provider_response", "The 0x service returned an unreadable response.");
      }
      if (text.length > 1_500_000) {
        providerErrorClassification = "provider_response_too_large";
        return fail(502, "quote_provider_response_too_large", "The quote provider response was rejected.");
      }
      let body: unknown;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        providerErrorClassification = "provider_response_invalid_json";
        return fail(502, "invalid_quote_provider_response", "The 0x service returned an unreadable response.");
      }

      if (mode === "price") {
        const price = normalizeZeroXSwapPrice(body, requestData, { sell: sellToken, buy: buyToken });
        if (price.status !== "ready") {
          applicationValidationCategory = price.reason;
          return fail(price.status === "invalid" ? 502 : 503, price.reason, "No independently validated indicative Mainnet price is available.");
        }
        return Response.json(price, { headers: responseHeaders });
      }
      const contracts = await dependencies.verifyContracts(readProviderAllowanceSpender(body), readProviderExecutionTarget(body), reportRpcFailure);
      const quote = normalizeZeroXSwapQuote(body, requestData, { sell: sellToken, buy: buyToken }, contracts, dependencies.now());
      if (quote.status !== "ready") {
        applicationValidationCategory = quote.reason;
        return fail(quote.status === "invalid" ? 502 : 503, quote.reason, "The firm quote failed independent Mainnet route and deployment checks.");
      }
      return Response.json(quote, { headers: responseHeaders });
    } catch (error) {
      internalExceptionCategory = classifyInternalException(error);
      applicationValidationCategory = "unexpected_server_exception";
      return fail(500, "quote_internal_error", "The quote request failed unexpectedly. No transaction was requested.");
    }
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
