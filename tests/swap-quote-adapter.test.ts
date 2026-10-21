import assert from "node:assert/strict";
import { test } from "node:test";
import { requestLiveSwapQuote } from "@/features/dashboard/live-adapters";

const request = {
  networkId: "testnet" as const,
  chainId: 46_630,
  tokenIn: "0x0000000000000000000000000000000000000001",
  tokenInDecimals: 18,
  tokenOut: "0x0000000000000000000000000000000000000002",
  tokenOutDecimals: 6,
  amountIn: "10000000000000000",
  slippageBps: 50,
};
test("typed swap adapter preserves the API no-route response and transport status", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return Response.json({
      status: "unavailable",
      reason: "no_verified_route",
      networkId: "testnet",
      chainId: 46_630,
      quote: null,
      signingEnabled: false,
      executionEnabled: false,
    }, { status: 503 });
  };
  try {
    const result = await requestLiveSwapQuote(request);
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "no_verified_route");
    assert.equal(result.transportStatus, 503);
    assert.equal(result.quote, null);
    assert.equal(result.signingEnabled, false);
    assert.equal(result.executionEnabled, false);
    assert.equal(capturedUrl, "/api/swap/quote");
    assert.equal(capturedInit?.method, "POST");
    assert.equal(capturedInit?.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), request);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("typed swap adapter rejects malformed or mismatched no-route responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    status: "unavailable",
    reason: "no_verified_route",
    networkId: "mainnet",
    chainId: 4_663,
    quote: null,
    signingEnabled: true,
    executionEnabled: false,
  }, { status: 503 });
  try {
    await assert.rejects(requestLiveSwapQuote(request), (error: unknown) =>
      error instanceof Error && error.name === "SwapQuoteClientError");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
