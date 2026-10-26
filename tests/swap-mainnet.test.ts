import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ROBINHOOD_MAINNET_TOKENS,
  NATIVE_ETH_ADDRESS,
  parseRobinhoodSwapRequest,
  normalizeZeroXSwapQuote,
  normalizeZeroXSwapPrice,
  type RobinhoodSwapRequest,
  type ZeroXContractVerification,
} from "@/features/swap/mainnet";
import { createSwapQuoteHandler } from "@/features/swap/server";
import { requestRobinhoodSwapQuote, MainnetSwapClientError } from "@/features/swap/client";
import { approveExactSwapAmount, preflightRobinhoodSwap, sendReviewedSwap } from "@/features/swap/execution";

const request: RobinhoodSwapRequest = {
  networkId: "mainnet",
  chainId: 4_663,
  tokenIn: "WETH",
  tokenOut: "USDG",
  amount: "0.01",
  slippageBps: 50,
  taker: "0x1111111111111111111111111111111111111111",
};

const verifiedAllowanceTarget = "0x0000000000001fF3684f28c67538d4D072C22734";
const verification: ZeroXContractVerification = {
  chainIdVerified: true,
  allowanceSpender: verifiedAllowanceTarget,
  allowanceSpenderCodePresent: true,
  executionTarget: verifiedAllowanceTarget,
  executionTargetCodePresent: true,
  latestSettler: "0x2222222222222222222222222222222222222222",
  settlerCodePresent: true,
};

function providerQuote(overrides: Record<string, unknown> = {}) {
  return {
    allowanceTarget: "0x0000000000001fF3684f28c67538d4D072C22734",
    buyAmount: "1000000",
    minBuyAmount: "995000",
    sellAmount: "10000000000000000",
    sellToken: ROBINHOOD_MAINNET_TOKENS.WETH.address,
    buyToken: ROBINHOOD_MAINNET_TOKENS.USDG.address,
    liquidityAvailable: true,
    gas: "180000",
    gasPrice: "1000000000",
    totalNetworkFee: "180000000000000",
    fees: { zeroExFee: null, integratorFee: null, gasFee: null },
    issues: {
      allowance: { actual: "0", spender: "0x0000000000001fF3684f28c67538d4D072C22734" },
      balance: { actual: "20000000000000000", expected: "10000000000000000" },
      simulationIncomplete: false,
      invalidSourcesPassed: [],
    },
    route: { fills: [{ from: ROBINHOOD_MAINNET_TOKENS.WETH.address, to: ROBINHOOD_MAINNET_TOKENS.USDG.address, source: "RobinSwap", proportionBps: 10_000 }], tokens: [] },
    transaction: {
      to: verification.executionTarget,
      data: `0x${"ab".repeat(64)}`,
      value: "0",
      gas: "180000",
      gasPrice: "1000000000",
    },
    ...overrides,
  };
}

test("Mainnet swap request admits only Robinhood 4663 and supported real token identifiers", () => {
  assert.equal(parseRobinhoodSwapRequest(request).success, true);
  assert.equal(parseRobinhoodSwapRequest({ ...request, chainId: 46_630 }).success, false);
  assert.equal(parseRobinhoodSwapRequest({ ...request, networkId: "testnet" }).success, false);
  assert.equal(parseRobinhoodSwapRequest({ ...request, tokenIn: "TKN-A" }).success, false);
  assert.equal(parseRobinhoodSwapRequest({ ...request, tokenIn: request.tokenOut }).success, false);
  assert.equal(parseRobinhoodSwapRequest({ ...request, amount: "1e3" }).success, false);
});

test("firm 0x quote requires the exact official AllowanceHolder and current on-chain Settler", () => {
  const result = normalizeZeroXSwapQuote(providerQuote(), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, verification, 1_800_000_000_000);
  assert.equal(result.status, "ready");
  if (result.status !== "ready" || result.mode !== "quote") return;
  assert.equal(result.execution.to, verification.executionTarget);
  assert.equal(result.allowance.spender, "0x0000000000001fF3684f28c67538d4D072C22734");
  assert.equal(result.executionEnabled, true);
  assert.equal(result.minimumReceived, "995000");
  assert.match(result.quoteDigest, /^0x[0-9a-f]{64}$/);
});

test("firm quote accepts the documented 0x shape with gas only in transaction", () => {
  const quoteWithNestedGasOnly = Object.fromEntries(
    Object.entries(providerQuote()).filter(([key]) => key !== "gas" && key !== "gasPrice"),
  );
  const result = normalizeZeroXSwapQuote(quoteWithNestedGasOnly, request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, verification, 1_800_000_000_000);

  assert.equal(result.status, "ready");
  if (result.status === "ready" && result.mode === "quote") {
    assert.equal(result.estimatedGas, "180000");
    assert.equal(result.transaction.gas, "180000");
    assert.equal(result.gasPrice, "1000000000");
  }
});

test("firm quote handles documented nullable transaction fields without weakening native value checks", () => {
  const quoteWithNullableOptionalFields = Object.fromEntries(
    Object.entries(providerQuote({
      transaction: { ...providerQuote().transaction, value: null, gasPrice: null },
    })).filter(([key]) => key !== "gas" && key !== "gasPrice"),
  );
  const erc20Result = normalizeZeroXSwapQuote(quoteWithNullableOptionalFields, request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, verification, 1_800_000_000_000);

  assert.equal(erc20Result.status, "ready");
  if (erc20Result.status === "ready" && erc20Result.mode === "quote") {
    assert.equal(erc20Result.transaction.value, "0");
    assert.equal(erc20Result.transaction.gas, "180000");
    assert.equal(erc20Result.gasPrice, undefined);
  }

  const nativeRequest = { ...request, tokenIn: "ETH" as const, amount: "0.0001" };
  const nativeQuote = providerQuote({
    sellToken: ROBINHOOD_MAINNET_TOKENS.ETH.address,
    sellAmount: "100000000000000",
    allowanceTarget: null,
    issues: { ...providerQuote().issues, allowance: null },
    route: { fills: [{ from: ROBINHOOD_MAINNET_TOKENS.ETH.address, to: ROBINHOOD_MAINNET_TOKENS.USDG.address, source: "Uniswap_V3", proportionBps: 10_000 }] },
    transaction: { ...providerQuote().transaction, value: null },
  });
  const nativeResult = normalizeZeroXSwapQuote(nativeQuote, nativeRequest, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.ETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, { ...verification, allowanceSpender: null, allowanceSpenderCodePresent: false }, 1_800_000_000_000);
  assert.deepEqual(nativeResult, { status: "invalid", reason: "provider_native_value_unavailable" });
});

test("firm quote rejects missing amounts or gas and rejects inconsistent native or ERC-20 transaction value", () => {
  const tokens = {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  };
  const noGas = Object.fromEntries(
    Object.entries(providerQuote({ transaction: { ...providerQuote().transaction, gas: null } }))
      .filter(([key]) => key !== "gas"),
  );
  assert.deepEqual(
    normalizeZeroXSwapQuote(noGas, request, tokens, verification, 1_800_000_000_000),
    { status: "unavailable", reason: "provider_gas_estimate_unavailable" },
  );
  assert.deepEqual(
    normalizeZeroXSwapQuote(providerQuote({ buyAmount: null }), request, tokens, verification, 1_800_000_000_000),
    { status: "invalid", reason: "provider_required_quote_amount_missing" },
  );
  assert.deepEqual(
    normalizeZeroXSwapQuote(providerQuote({
      transaction: { ...providerQuote().transaction, value: "1" },
    }), request, tokens, verification, 1_800_000_000_000),
    { status: "invalid", reason: "provider_erc20_transaction_value_nonzero" },
  );

  const nativeRequest = { ...request, tokenIn: "ETH" as const, amount: "0.0001" };
  const nativeQuote = providerQuote({
    sellToken: ROBINHOOD_MAINNET_TOKENS.ETH.address,
    sellAmount: "100000000000000",
    allowanceTarget: null,
    issues: { ...providerQuote().issues, allowance: null },
    route: { fills: [{ from: ROBINHOOD_MAINNET_TOKENS.ETH.address, to: ROBINHOOD_MAINNET_TOKENS.USDG.address, source: "Uniswap_V3", proportionBps: 10_000 }] },
    transaction: { ...providerQuote().transaction, value: "99999999999999" },
  });
  assert.deepEqual(
    normalizeZeroXSwapQuote(nativeQuote, nativeRequest, {
      sell: { ...ROBINHOOD_MAINNET_TOKENS.ETH, decimals: 18 },
      buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
    }, { ...verification, allowanceSpender: null, allowanceSpenderCodePresent: false }, 1_800_000_000_000),
    { status: "invalid", reason: "provider_native_value_mismatch" },
  );
});

test("native ETH firm quote does not require an ERC-20 allowance but ERC-20 firm quotes still do", () => {
  const nativeRequest: RobinhoodSwapRequest = {
    ...request,
    tokenIn: "ETH",
    tokenOut: "USDG",
    amount: "0.0001",
  };
  const nativeQuote = providerQuote({
    sellAmount: "100000000000000",
    sellToken: NATIVE_ETH_ADDRESS,
    allowanceTarget: null,
    issues: {
      allowance: null,
      balance: { actual: "200000000000000", expected: "100000000000000" },
      simulationIncomplete: false,
      invalidSourcesPassed: [],
    },
    route: { fills: [{ from: NATIVE_ETH_ADDRESS, to: ROBINHOOD_MAINNET_TOKENS.USDG.address, source: "Uniswap_V3", proportionBps: 10_000 }], tokens: [] },
    transaction: { ...providerQuote().transaction, value: "100000000000000" },
  });
  const nativeVerification: ZeroXContractVerification = {
    ...verification,
    allowanceSpender: null,
    allowanceSpenderCodePresent: false,
  };
  const nativeResult = normalizeZeroXSwapQuote(nativeQuote, nativeRequest, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.ETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, nativeVerification, 1_800_000_000_000);
  assert.equal(nativeResult.status, "ready");
  if (nativeResult.status === "ready" && nativeResult.mode === "quote") {
    assert.equal(nativeResult.allowance.spender, null);
    assert.equal(nativeResult.allowance.requiredAmount, "100000000000000");
    assert.equal(nativeResult.transaction.value, "100000000000000");
  }

  const erc20WithoutSpender = normalizeZeroXSwapQuote(providerQuote({
    allowanceTarget: null,
    issues: { ...providerQuote().issues, allowance: null },
  }), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, { ...verification, allowanceSpender: null, allowanceSpenderCodePresent: false }, 1_800_000_000_000);
  assert.deepEqual(erc20WithoutSpender, { status: "invalid", reason: "missing_or_forbidden_allowance_spender" });
});

test("firm quote rejects a deployed but noncanonical spender and execution target", () => {
  const otherDeployedContract = "0x3333333333333333333333333333333333333333";
  const result = normalizeZeroXSwapQuote(providerQuote({
    allowanceTarget: otherDeployedContract,
    issues: { ...providerQuote().issues, allowance: { actual: "0", spender: otherDeployedContract } },
    transaction: { ...providerQuote().transaction, to: otherDeployedContract },
  }), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, {
    ...verification,
    allowanceSpender: otherDeployedContract,
    executionTarget: otherDeployedContract,
  }, 1_800_000_000_000);

  assert.equal(result.status, "unavailable");
  if (result.status === "unavailable") {
    assert.equal(result.reason, "provider_allowance_holder_address_not_verified_for_robinhood_mainnet");
  }
});

test("0x v2 provider proportionBps decimal strings are normalized in price and firm quote data", () => {
  const apiResponse = providerQuote({
    route: { fills: [{ from: ROBINHOOD_MAINNET_TOKENS.WETH.address, to: ROBINHOOD_MAINNET_TOKENS.USDG.address, source: "RobinSwap", proportionBps: "10000" }], tokens: [] },
  });
  const tokens = {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  };
  const price = normalizeZeroXSwapPrice(apiResponse, request, tokens);
  const quote = normalizeZeroXSwapQuote(apiResponse, request, tokens, verification, 1_800_000_000_000);

  assert.equal(price.status, "ready");
  assert.equal(quote.status, "ready");
  if (price.status === "ready" && quote.status === "ready") {
    assert.equal(price.route[0]?.proportionBps, 10_000);
    assert.equal(quote.route[0]?.proportionBps, 10_000);
  }
});

test("quote validation rejects Settler approvals, stale/unknown execution targets, and incomplete simulations", () => {
  const settlerApproval = normalizeZeroXSwapQuote(providerQuote({
    allowanceTarget: verification.latestSettler,
    issues: { allowance: { actual: "0", spender: verification.latestSettler }, simulationIncomplete: false },
  }), request, { sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 }, buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 } }, verification, 1_800_000_000_000);
  assert.equal(settlerApproval.status, "invalid");

  const unregisteredAddress = "0x3333333333333333333333333333333333333333";
  const unregisteredTarget = normalizeZeroXSwapQuote(providerQuote({
    allowanceTarget: unregisteredAddress,
    issues: { ...providerQuote().issues, allowance: { actual: "0", spender: unregisteredAddress } },
    transaction: { ...providerQuote().transaction, to: unregisteredAddress },
  }), request,
    { sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 }, buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 } }, verification, 1_800_000_000_000);
  assert.equal(unregisteredTarget.status, "unavailable");

  const mismatchedExecutionTarget = "0x3333333333333333333333333333333333333333";
  const splitAllowanceAndExecution = normalizeZeroXSwapQuote(providerQuote({
    transaction: { ...providerQuote().transaction, to: mismatchedExecutionTarget },
  }), request, { sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 }, buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 } }, {
    ...verification,
    executionTarget: mismatchedExecutionTarget,
    executionTargetCodePresent: true,
  }, 1_800_000_000_000);
  assert.equal(splitAllowanceAndExecution.status, "unavailable");
  if (splitAllowanceAndExecution.status === "unavailable") {
    assert.equal(splitAllowanceAndExecution.reason, "provider_allowance_holder_address_not_verified_for_robinhood_mainnet");
  }

  const incomplete = normalizeZeroXSwapQuote(providerQuote({ issues: { ...providerQuote().issues, simulationIncomplete: true } }), request,
    { sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 }, buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 } }, verification, 1_800_000_000_000);
  assert.equal(incomplete.status, "unavailable");

  const invalidSources = normalizeZeroXSwapQuote(providerQuote({
    issues: { ...providerQuote().issues, invalidSourcesPassed: ["Unsupported_Fake_Source"] },
  }), request, { sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 }, buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 } }, verification, 1_800_000_000_000);
  assert.equal(invalidSources.status, "invalid");
  if (invalidSources.status === "invalid") assert.equal(invalidSources.reason, "provider_reported_invalid_liquidity_sources");
});

test("server quote API never exposes provider key and refuses missing configuration", async () => {
  let providerCalls = 0;
  const handler = createSwapQuoteHandler({
    appMode: "live",
    apiKey: undefined,
    fetch: async () => { providerCalls++; return Response.json({}); },
    now: () => 1_800_000_000_000,
    getTokenMetadata: async (id) => ({ ...ROBINHOOD_MAINNET_TOKENS[id], decimals: id === "USDG" ? 6 : 18 }),
    verifyContracts: async () => verification,
  });
  const response = await handler(new Request("https://veyra.example/api/swap/quote", {
    method: "POST",
    headers: { origin: "https://veyra.example", host: "veyra.example", "content-type": "application/json" },
    body: JSON.stringify(request),
  }));
  assert.equal(response.status, 503);
  assert.equal(providerCalls, 0);
  assert.equal((await response.text()).includes("apiKey"), false);
});

test("server quote API fails closed outside explicit QEVRA_APP_MODE live", async () => {
  let providerCalls = 0;
  const handler = createSwapQuoteHandler({
    appMode: "demo",
    apiKey: "test-only-provider-key",
    fetch: async () => { providerCalls++; return Response.json(providerQuote()); },
    now: () => 1_800_000_000_000,
    getTokenMetadata: async (id) => ({ ...ROBINHOOD_MAINNET_TOKENS[id], decimals: id === "USDG" ? 6 : 18 }),
    verifyContracts: async () => verification,
  });
  const response = await handler(new Request("https://veyra.example/api/swap/quote", {
    method: "POST",
    headers: { origin: "https://veyra.example", host: "veyra.example", "content-type": "application/json" },
    body: JSON.stringify(request),
  }));

  assert.equal(response.status, 503);
  assert.equal(providerCalls, 0);
  assert.equal((await response.text()).includes("swap_live_mode_required"), true);
});

test("server quote API requests only the Mainnet 0x v2 quote and returns verified data", async () => {
  let seenUrl = "";
  let seenHeaders = new Headers();
  let verifiedAllowanceSpender = "";
  let verifiedExecutionTarget = "";
  const handler = createSwapQuoteHandler({
    appMode: "live",
    apiKey: "test-only-provider-key",
    fetch: async (input, init) => {
      seenUrl = String(input);
      seenHeaders = new Headers(init?.headers);
      return Response.json(providerQuote());
    },
    now: () => 1_800_000_000_000,
    getTokenMetadata: async (id) => ({ ...ROBINHOOD_MAINNET_TOKENS[id], decimals: id === "USDG" ? 6 : 18 }),
    verifyContracts: async (spender, target) => {
      verifiedAllowanceSpender = spender ?? "";
      verifiedExecutionTarget = target ?? "";
      return verification;
    },
  });
  const response = await handler(new Request("https://veyra.example/api/swap/quote", {
    method: "POST",
    headers: { origin: "https://veyra.example", host: "veyra.example", "content-type": "application/json" },
    body: JSON.stringify(request),
  }));
  assert.equal(response.status, 200);
  assert.match(seenUrl, /^https:\/\/api\.0x\.org\/swap\/allowance-holder\/quote\?/);
  assert.match(seenUrl, /chainId=4663/);
  assert.equal(new URL(seenUrl).searchParams.get("recipient"), request.taker);
  assert.equal(seenHeaders.get("0x-version"), "v2");
  assert.equal(seenHeaders.get("0x-api-key"), "test-only-provider-key");
  assert.equal(verifiedAllowanceSpender.toLowerCase(), verifiedAllowanceTarget.toLowerCase());
  assert.equal(verifiedExecutionTarget.toLowerCase(), verifiedAllowanceTarget.toLowerCase());
  const body = await response.json() as { status: string; executionEnabled: boolean; tokenIn: { decimals: number } };
  assert.equal(body.status, "ready");
  assert.equal(body.executionEnabled, true);
  assert.equal(body.tokenIn.decimals, 18);
  assert.equal(JSON.stringify(body).includes("test-only-provider-key"), false);
});

test("indicative price uses the dedicated 0x price endpoint and cannot enable signing", async () => {
  let seenUrl = "";
  const handler = createSwapQuoteHandler({
    appMode: "live",
    apiKey: "test-only-provider-key",
    fetch: async (input) => {
      seenUrl = String(input);
      return Response.json({
        buyAmount: "1000000",
        sellAmount: "10000000000000000",
        sellToken: ROBINHOOD_MAINNET_TOKENS.WETH.address,
        buyToken: ROBINHOOD_MAINNET_TOKENS.USDG.address,
        liquidityAvailable: true,
        gas: "180000",
        gasPrice: "1000000000",
        route: { fills: [{ from: ROBINHOOD_MAINNET_TOKENS.WETH.address, to: ROBINHOOD_MAINNET_TOKENS.USDG.address, source: "RobinSwap", proportionBps: 10_000 }] },
      });
    },
    now: () => 1_800_000_000_000,
    getTokenMetadata: async (id) => ({ ...ROBINHOOD_MAINNET_TOKENS[id], decimals: id === "USDG" ? 6 : 18 }),
    verifyContracts: async () => verification,
  });
  const response = await handler(new Request("https://veyra.example/api/swap/quote", {
    method: "POST",
    headers: { origin: "https://veyra.example", host: "veyra.example", "content-type": "application/json" },
    body: JSON.stringify({ ...request, mode: "price" }),
  }));
  const body = await response.json() as { mode: string; signingEnabled: boolean; executionEnabled: boolean };
  assert.equal(response.status, 200);
  assert.match(seenUrl, /\/swap\/allowance-holder\/price\?/);
  assert.equal(body.mode, "price");
  assert.equal(body.signingEnabled, false);
  assert.equal(body.executionEnabled, false);
});

test("price and firm quote send the same ETH/USDG request parameters and log a firm-only validation rejection safely", async () => {
  const observedRequest: RobinhoodSwapRequest = {
    ...request,
    tokenIn: "ETH",
    tokenOut: "USDG",
    amount: "0.0001",
    slippageBps: 50,
  };
  const otherTarget = "0x3333333333333333333333333333333333333333";
  const apiQuote = providerQuote({
    sellAmount: "100000000000000",
    sellToken: NATIVE_ETH_ADDRESS,
    allowanceTarget: otherTarget,
    issues: { ...providerQuote().issues, allowance: { actual: "0", spender: verifiedAllowanceTarget } },
    route: { fills: [{ from: NATIVE_ETH_ADDRESS, to: ROBINHOOD_MAINNET_TOKENS.USDG.address, source: "Uniswap_V3", proportionBps: 10_000 }], tokens: [] },
  });
  const urls: string[] = [];
  const diagnostics: Array<Record<string, unknown>> = [];
  const makeHandler = () => createSwapQuoteHandler({
    appMode: "live",
    apiKey: "test-only-provider-key",
    fetch: async (input) => { urls.push(String(input)); return Response.json(apiQuote); },
    now: () => 1_800_000_000_000,
    getTokenMetadata: async (id) => ({ ...ROBINHOOD_MAINNET_TOKENS[id], decimals: id === "USDG" ? 6 : 18 }),
    verifyContracts: async () => verification,
    onDiagnostic: (entry) => diagnostics.push(entry as unknown as Record<string, unknown>),
  });
  const makeRequest = (mode: "price" | "quote") => new Request("https://veyra.example/api/swap/quote", {
    method: "POST",
    headers: { origin: "https://veyra.example", host: "veyra.example", "content-type": "application/json", "x-request-id": `firm-test-${mode}` },
    body: JSON.stringify({ ...observedRequest, mode }),
  });

  const priceResponse = await makeHandler()(makeRequest("price"));
  const quoteResponse = await makeHandler()(makeRequest("quote"));
  assert.equal(priceResponse.status, 200);
  assert.equal(quoteResponse.status, 502);
  assert.equal(quoteResponse.headers.get("x-veyra-request-id"), "firm-test-quote");
  const expected = {
    chainId: "4663",
    sellToken: NATIVE_ETH_ADDRESS,
    buyToken: ROBINHOOD_MAINNET_TOKENS.USDG.address,
    sellAmount: "100000000000000",
    taker: observedRequest.taker,
    recipient: observedRequest.taker,
    slippageBps: "50",
  };
  for (const url of urls) {
    const parsed = new URL(url);
    assert.deepEqual(Object.fromEntries(parsed.searchParams), expected);
  }
  assert.match(urls[0]!, /\/price\?/);
  assert.match(urls[1]!, /\/quote\?/);
  const failure = diagnostics[0];
  assert.equal(failure?.requestId, "firm-test-quote");
  assert.equal(failure?.mode, "quote");
  assert.equal(failure?.upstreamHttpStatus, 200);
  assert.equal(failure?.applicationValidationCategory, "allowance_target_mismatch");
  assert.equal(typeof failure?.requestDurationMs, "number");
  assert.equal(JSON.stringify(diagnostics).includes("test-only-provider-key"), false);
  assert.equal(JSON.stringify(diagnostics).includes(observedRequest.taker), false);
  assert.equal((await quoteResponse.text()).includes("test-only-provider-key"), false);
});

test("server returns an independently verified native ETH firm quote without an ERC-20 spender", async () => {
  const nativeRequest: RobinhoodSwapRequest = {
    ...request,
    tokenIn: "ETH",
    tokenOut: "USDG",
    amount: "0.0001",
  };
  const nativeQuote = providerQuote({
    sellAmount: "100000000000000",
    sellToken: NATIVE_ETH_ADDRESS,
    allowanceTarget: null,
    issues: {
      allowance: null,
      balance: { actual: "200000000000000", expected: "100000000000000" },
      simulationIncomplete: false,
      invalidSourcesPassed: [],
    },
    route: { fills: [{ from: NATIVE_ETH_ADDRESS, to: ROBINHOOD_MAINNET_TOKENS.USDG.address, source: "Uniswap_V3", proportionBps: 10_000 }], tokens: [] },
    transaction: { ...providerQuote().transaction, value: "100000000000000" },
  });
  const handler = createSwapQuoteHandler({
    appMode: "live",
    apiKey: "test-only-provider-key",
    fetch: async (input) => {
      assert.match(String(input), /\/swap\/allowance-holder\/quote\?/);
      return Response.json(nativeQuote);
    },
    now: () => 1_800_000_000_000,
    getTokenMetadata: async (id) => ({ ...ROBINHOOD_MAINNET_TOKENS[id], decimals: id === "USDG" ? 6 : 18 }),
    verifyContracts: async (spender, target) => {
      assert.equal(spender, undefined);
      assert.equal(target, verifiedAllowanceTarget);
      return { ...verification, allowanceSpender: null, allowanceSpenderCodePresent: false };
    },
  });
  const response = await handler(new Request("https://veyra.example/api/swap/quote", {
    method: "POST",
    headers: { origin: "https://veyra.example", host: "veyra.example", "content-type": "application/json" },
    body: JSON.stringify(nativeRequest),
  }));
  assert.equal(response.status, 200);
  const body = await response.json() as { allowance: { spender: string | null }; executionEnabled: boolean };
  assert.deepEqual(body.allowance, { spender: null, actual: null, requiredAmount: "100000000000000" });
  assert.equal(body.executionEnabled, true);
});

test("provider rejection logs status and safe classification without exposing provider response data", async () => {
  const diagnostics: Array<Record<string, unknown>> = [];
  const handler = createSwapQuoteHandler({
    appMode: "live",
    apiKey: "private-provider-marker",
    fetch: async () => new Response("private response body marker", { status: 422 }),
    now: () => 1_800_000_000_000,
    getTokenMetadata: async (id) => ({ ...ROBINHOOD_MAINNET_TOKENS[id], decimals: id === "USDG" ? 6 : 18 }),
    verifyContracts: async () => verification,
    onDiagnostic: (entry) => diagnostics.push(entry as unknown as Record<string, unknown>),
  });
  const response = await handler(new Request("https://veyra.example/api/swap/quote", {
    method: "POST",
    headers: { origin: "https://veyra.example", host: "veyra.example", "content-type": "application/json", "x-request-id": "provider-reject-test" },
    body: JSON.stringify(request),
  }));
  const responseText = await response.text();
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("x-veyra-request-id"), "provider-reject-test");
  assert.equal(responseText.includes("private-provider-marker"), false);
  assert.equal(responseText.includes("private response body marker"), false);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.upstreamHttpStatus, 422);
  assert.equal(diagnostics[0]?.providerErrorClassification, "upstream_rejected");
  assert.equal(diagnostics[0]?.requestId, "provider-reject-test");
  assert.equal(JSON.stringify(diagnostics).includes("private-provider-marker"), false);
  assert.equal(JSON.stringify(diagnostics).includes("private response body marker"), false);
});

test("malformed firm quote diagnostics identify only the failed field and safe value type", async () => {
  const diagnostics: Array<Record<string, unknown>> = [];
  const malformedQuote = providerQuote({
    transaction: { ...providerQuote().transaction, data: null },
  });
  const handler = createSwapQuoteHandler({
    appMode: "live",
    apiKey: "private-provider-marker",
    fetch: async () => Response.json(malformedQuote),
    now: () => 1_800_000_000_000,
    getTokenMetadata: async (id) => ({ ...ROBINHOOD_MAINNET_TOKENS[id], decimals: id === "USDG" ? 6 : 18 }),
    verifyContracts: async () => verification,
    onDiagnostic: (entry) => diagnostics.push(entry as unknown as Record<string, unknown>),
  });
  const response = await handler(new Request("https://veyra.example/api/swap/quote", {
    method: "POST",
    headers: { origin: "https://veyra.example", host: "veyra.example", "content-type": "application/json", "x-request-id": "schema-failure-test" },
    body: JSON.stringify(request),
  }));

  assert.equal(response.status, 502);
  const diagnostic = diagnostics[0];
  assert.equal(diagnostic?.requestId, "schema-failure-test");
  assert.equal(diagnostic?.applicationValidationCategory, "invalid_transaction_field_type");
  assert.deepEqual(diagnostic?.providerSchemaFailures, [{
    path: "transaction.data",
    issueCode: "invalid_type",
    expectedType: "string",
    receivedType: "null",
  }]);
  const serialized = JSON.stringify(diagnostics);
  assert.equal(serialized.includes("private-provider-marker"), false);
  assert.equal(serialized.includes("0x" + "ab".repeat(64)), false);
  assert.equal((await response.text()).includes("transaction.data"), false);
});

test("RPC failures and unexpected server exceptions are classified without leaking exception messages", async () => {
  const diagnostics: Array<Record<string, unknown>> = [];
  const common = {
    appMode: "live",
    apiKey: "private-provider-marker",
    fetch: async () => Response.json(providerQuote()),
    now: () => 1_800_000_000_000,
    getTokenMetadata: async (id: keyof typeof ROBINHOOD_MAINNET_TOKENS) => ({ ...ROBINHOOD_MAINNET_TOKENS[id], decimals: id === "USDG" ? 6 : 18 }),
    onDiagnostic: (entry: unknown) => diagnostics.push(entry as Record<string, unknown>),
  };
  const rpcHandler = createSwapQuoteHandler({
    ...common,
    verifyContracts: async (_spender, _target, onRpcFailure) => {
      onRpcFailure?.("rpc_settler_registry_read_failed");
      return { ...verification, chainIdVerified: false, latestSettler: null, settlerCodePresent: false };
    },
  });
  const rpcResponse = await rpcHandler(new Request("https://veyra.example/api/swap/quote", {
    method: "POST",
    headers: { origin: "https://veyra.example", host: "veyra.example", "content-type": "application/json", "x-request-id": "rpc-failure-test" },
    body: JSON.stringify(request),
  }));
  assert.equal(rpcResponse.status, 503);
  assert.deepEqual(diagnostics[0]?.rpcFailureCategories, ["rpc_settler_registry_read_failed"]);

  const exceptionHandler = createSwapQuoteHandler({
    ...common,
    getTokenMetadata: async () => { throw new Error("private exception payload marker"); },
    verifyContracts: async () => verification,
  });
  const exceptionResponse = await exceptionHandler(new Request("https://veyra.example/api/swap/quote", {
    method: "POST",
    headers: { origin: "https://veyra.example", host: "veyra.example", "content-type": "application/json", "x-request-id": "internal-exception-test" },
    body: JSON.stringify(request),
  }));
  const exceptionText = await exceptionResponse.text();
  assert.equal(exceptionResponse.status, 500);
  assert.equal(exceptionText.includes("private exception payload marker"), false);
  assert.equal(diagnostics[1]?.internalExceptionCategory, "unexpected_exception");
  assert.equal(diagnostics[1]?.requestId, "internal-exception-test");
});

test("client rejects an indicative price for a different token address or sell amount", async () => {
  const price = {
    status: "ready", mode: "price", networkId: "mainnet", chainId: 4_663,
    taker: request.taker,
    tokenIn: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    tokenOut: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
    amountIn: "10000000000000000", amountOut: "1000000", slippageBps: request.slippageBps,
    route: [{ from: ROBINHOOD_MAINNET_TOKENS.WETH.address, to: ROBINHOOD_MAINNET_TOKENS.USDG.address, source: "RobinSwap" }],
    signingEnabled: false, executionEnabled: false,
  };
  await assert.rejects(requestRobinhoodSwapQuote({ ...request, mode: "price" }, {
    fetch: async () => Response.json({ ...price, tokenIn: { ...price.tokenIn, address: verification.latestSettler } }),
  }), (error: unknown) => error instanceof MainnetSwapClientError && error.code === "invalid_price_response");
  await assert.rejects(requestRobinhoodSwapQuote({ ...request, mode: "price" }, {
    fetch: async () => Response.json({ ...price, amountIn: "10000000000000001" }),
  }), (error: unknown) => error instanceof MainnetSwapClientError && error.code === "invalid_price_response");
});

test("client rejects a quote response with changed executable calldata digest", async () => {
  const normalized = normalizeZeroXSwapQuote(providerQuote(), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, verification, 1_800_000_000_000);
  assert.equal(normalized.status, "ready");
  if (normalized.status !== "ready" || normalized.mode !== "quote") return;
  await assert.rejects(requestRobinhoodSwapQuote(request, {
    now: 1_800_000_000_000,
    fetch: async () => {
      const changedData = `0x${"cd".repeat(64)}`;
      return Response.json({ ...normalized, transaction: { ...normalized.transaction, data: changedData }, execution: { ...normalized.execution, data: changedData } });
    },
  }), (error: unknown) => error instanceof MainnetSwapClientError && error.code === "quote_digest_mismatch");
});

test("approval transaction is bounded to exact sell amount and verified AllowanceHolder", async () => {
  const normalized = normalizeZeroXSwapQuote(providerQuote(), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, verification, 1_800_000_000_000);
  assert.equal(normalized.status, "ready");
  if (normalized.status !== "ready" || normalized.mode !== "quote") return;
  const calls: Array<{ method: string; params?: readonly unknown[] }> = [];
  const provider = { request: async (args: { method: string; params?: readonly unknown[] }) => {
    calls.push(args);
    if (args.method === "eth_accounts") return [request.taker];
    if (args.method === "eth_chainId") return "0x1237";
    if (args.method === "eth_getCode") return `0x${"aa".repeat(40)}`;
    if (args.method === "eth_call") {
      const data = (args.params?.[0] as { data: string }).data;
      if (data === "0x6352211e" + "0".repeat(63) + "2") return `0x${"0".repeat(24)}${verification.latestSettler!.slice(2).toLowerCase()}`;
      return data.startsWith("0xdd62ed3e") ? `0x${"0".repeat(64)}` : `0x${"0".repeat(64)}`;
    }
    if (args.method === "eth_estimateGas") return "0x186a0";
    if (args.method === "eth_gasPrice") return "0x3b9aca00";
    if (args.method === "eth_getBalance") return "0x3635c9adc5dea00000";
    if (args.method === "eth_getTransactionCount") return "0x7";
    if (args.method === "eth_sendTransaction") return `0x${"99".repeat(32)}`;
    throw new Error(`Unexpected RPC method ${args.method}`);
  } };
  const result = await approveExactSwapAmount(provider, normalized);
  assert.equal(result.amount, "10000000000000000");
  assert.equal(result.spender.toLowerCase(), "0x0000000000001ff3684f28c67538d4d072c22734");
  const send = calls.find((call) => call.method === "eth_sendTransaction");
  assert.ok(send);
  const tx = send.params?.[0] as { to: string; data: string; nonce: string };
  assert.equal(tx.to, normalized.tokenIn.address);
  assert.equal(tx.nonce, "0x7");
  assert.equal(tx.data.slice(0, 10), "0x095ea7b3");
  assert.equal(tx.data.slice(10, 74).toLowerCase(), normalized.allowance.spender!.slice(2).toLowerCase().padStart(64, "0"));
  assert.equal(BigInt(`0x${tx.data.slice(-64)}`).toString(), result.amount);
  assert.notEqual(tx.data.slice(-64), "f".repeat(64));
});

test("swap preflight rejects a changed pending wallet nonce before execution", async () => {
  const normalized = normalizeZeroXSwapQuote(providerQuote(), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, verification, 1_800_000_000_000);
  assert.equal(normalized.status, "ready");
  if (normalized.status !== "ready" || normalized.mode !== "quote") return;
  const provider = { request: async ({ method, params }: { method: string; params?: readonly unknown[] }) => {
    if (method === "eth_accounts") return [request.taker];
    if (method === "eth_chainId") return "0x1237";
    if (method === "eth_getTransactionCount") return "0x9";
    if (method === "eth_getCode") return `0x${"aa".repeat(40)}`;
    if (method === "eth_call") {
      const data = (params?.[0] as { data: string }).data;
      if (data === "0x6352211e" + "0".repeat(63) + "2") return `0x${"0".repeat(24)}${verification.latestSettler!.slice(2).toLowerCase()}`;
      if (data === "0x313ce567") return "0x" + BigInt(18).toString(16).padStart(64, "0");
      if (data.startsWith("0x70a08231")) return "0x" + BigInt("20000000000000000").toString(16).padStart(64, "0");
      if (data.startsWith("0xdd62ed3e")) return "0x" + BigInt("10000000000000000").toString(16).padStart(64, "0");
    }
    if (method === "eth_getBalance") return "0x3635c9adc5dea00000";
    if (method === "eth_gasPrice") return "0x3b9aca00";
    if (method === "eth_estimateGas") return "0x186a0";
    throw new Error(`Unexpected RPC method ${method}`);
  } };
  const result = await preflightRobinhoodSwap(provider, normalized);
  assert.equal(result.status, "ready");
  assert.equal(result.transactionNonce, BigInt(9));
  await assert.rejects(sendReviewedSwap(provider, normalized, "7"), (error: unknown) =>
    error instanceof Error && "code" in error && (error as { code: string }).code === "transaction_nonce_changed");
});

test("wallet preflight distinguishes empty contract code from malformed RPC data", async () => {
  const normalized = normalizeZeroXSwapQuote(providerQuote(), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, verification, 1_800_000_000_000);
  assert.equal(normalized.status, "ready");
  if (normalized.status !== "ready" || normalized.mode !== "quote") return;
  const provider = { request: async ({ method }: { method: string }) => {
    if (method === "eth_accounts") return [request.taker];
    if (method === "eth_chainId") return "0x1237";
    if (method === "eth_getTransactionCount") return "0x0";
    if (method === "eth_getCode") return "0x";
    throw new Error(`Unexpected RPC method ${method}`);
  } };
  await assert.rejects(preflightRobinhoodSwap(provider, normalized), (error: unknown) =>
    error instanceof Error && "code" in error && (error as { code: string }).code === "execution_target_not_deployed");
});

test("wallet execution rejects a modified quote before any wallet RPC or write request", async () => {
  const normalized = normalizeZeroXSwapQuote(providerQuote(), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, verification, 1_800_000_000_000);
  assert.equal(normalized.status, "ready");
  if (normalized.status !== "ready" || normalized.mode !== "quote") return;
  let rpcCalls = 0;
  const provider = { request: async () => { rpcCalls++; return undefined; } };
  const altered = {
    ...normalized,
    transaction: { ...normalized.transaction, data: `0x${"cd".repeat(64)}` },
  } as typeof normalized;
  await assert.rejects(preflightRobinhoodSwap(provider, altered), (error: unknown) =>
    error instanceof Error && "code" in error && (error as { code: string }).code === "quote_integrity_failed");
  assert.equal(rpcCalls, 0);
});
