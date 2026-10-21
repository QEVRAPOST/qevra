import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as requestSwapQuote } from "@/app/api/swap/quote/route";
import {
  compareIntentToExecution,
  discoverSwapQuote,
  parseSwapQuoteRequest,
  validateSwapQuote,
  type SwapQuoteRequest,
} from "@/features/swap/validation";

const request: SwapQuoteRequest = {
  networkId: "testnet",
  chainId: 46_630,
  tokenIn: "0x0000000000000000000000000000000000000001",
  tokenInDecimals: 6,
  tokenOut: "0x0000000000000000000000000000000000000002",
  tokenOutDecimals: 18,
  amountIn: "1000000",
  slippageBps: 50,
};

const quote = {
  ...request,
  router: "0x0000000000000000000000000000000000000003",
  routerCodeHash: `0x${"a".repeat(64)}`,
  amountOut: "2000000000000000000",
  minimumAmountOut: "1990000000000000000",
  provenance: {
    providerId: "robinhood-test-provider",
    endpoint: "https://quotes.example/api",
    responseHash: `0x${"d".repeat(64)}`,
  },
  quotedAt: "2026-10-21T00:00:00.000Z",
  expiresAt: "2026-10-21T00:05:00.000Z",
};

test("swap request parsing validates distinct EVM tokens, configured chain, amount, decimals, and slippage", () => {
  assert.deepEqual(parseSwapQuoteRequest(request), { success: true, data: request });
  assert.equal(parseSwapQuoteRequest({ ...request, chainId: 1 }).success, false);
  assert.equal(parseSwapQuoteRequest({ ...request, tokenOut: request.tokenIn }).success, false);
  assert.equal(parseSwapQuoteRequest({ ...request, amountIn: "0" }).success, false);
  assert.equal(parseSwapQuoteRequest({ ...request, tokenInDecimals: 256 }).success, false);
  assert.equal(parseSwapQuoteRequest({ ...request, slippageBps: 10_001 }).success, false);
});

test("quote validation fails closed for wrong chain, unapproved router, expired or inconsistent amounts", () => {
  const context = {
    now: Date.parse("2026-10-21T00:01:00.000Z"),
    approvedRouters: new Map([[quote.router, quote.routerCodeHash]]),
    approvedProviders: new Map([[quote.provenance.providerId, quote.provenance.endpoint]]),
  };
  assert.equal(validateSwapQuote(request, quote, context).status, "valid");
  assert.equal(validateSwapQuote(request, { ...quote, chainId: 4_663 }, context).status, "invalid");
  assert.equal(validateSwapQuote(request, quote, { ...context, approvedRouters: new Map() }).status, "invalid");
  assert.equal(validateSwapQuote(request, quote, { ...context, approvedProviders: new Map() }).status, "invalid");
  assert.equal(validateSwapQuote(request, quote, {
    ...context,
    approvedProviders: new Map([[quote.provenance.providerId, "https://other-quotes.example/api"]]),
  }).status, "invalid");
  assert.equal(validateSwapQuote(request, quote, { ...context, now: Date.parse(quote.expiresAt) }).status, "expired");
  assert.equal(validateSwapQuote(request, { ...quote, minimumAmountOut: "1" }, context).status, "invalid");
});

test("Intent Lock compares every executable field and never treats absent execution data as a match", () => {
  const intent = {
    ...request,
    recipient: "0x0000000000000000000000000000000000000004",
    router: quote.router,
    value: "0",
    calldataHash: `0x${"c".repeat(64)}`,
    minimumReceived: quote.minimumAmountOut,
    expiresAt: quote.expiresAt,
  };
  const actual = { ...intent, chainId: 46_630 };
  assert.equal(compareIntentToExecution(intent, actual).status, "match");
  assert.equal(compareIntentToExecution(intent, { ...actual, value: "1" }).status, "mismatch");
  assert.equal(compareIntentToExecution(intent, { ...actual, router: "0x0000000000000000000000000000000000000005" }).status, "mismatch");
  assert.equal(compareIntentToExecution(intent, null).status, "unavailable");
});

test("quote discovery returns unavailable on both chains while no reviewed router is configured", () => {
  assert.deepEqual(discoverSwapQuote(request), {
    status: "unavailable",
    reason: "no_verified_route",
    networkId: "testnet",
    chainId: 46_630,
    quote: null,
    signingEnabled: false,
    executionEnabled: false,
  });
  assert.deepEqual(discoverSwapQuote({ ...request, networkId: "mainnet", chainId: 4_663 }), {
    status: "unavailable",
    reason: "no_verified_route",
    networkId: "mainnet",
    chainId: 4_663,
    quote: null,
    signingEnabled: false,
    executionEnabled: false,
  });
});

test("swap quote API returns a no-store unavailable result without contacting a quote provider", async () => {
  const response = await requestSwapQuote(new Request("https://veyra.example/api/swap/quote", {
    method: "POST",
    headers: {
      origin: "https://veyra.example",
      host: "veyra.example",
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    status: "unavailable",
    reason: "no_verified_route",
    networkId: "testnet",
    chainId: 46_630,
    quote: null,
    signingEnabled: false,
    executionEnabled: false,
  });
});
