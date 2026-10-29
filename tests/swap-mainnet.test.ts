import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ROBINHOOD_MAINNET_TOKENS,
  DEFAULT_ROBINHOOD_SWAP_SELL_TOKEN,
  NATIVE_ETH_ADDRESS,
  parseRobinhoodSwapRequest,
  normalizeZeroXSwapQuote,
  normalizeZeroXSwapPrice,
  computeQuoteDigest,
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

function nativeEthQuote() {
  const nativeRequest: RobinhoodSwapRequest = { ...request, tokenIn: "ETH", amount: "0.0001" };
  const raw = providerQuote({
    sellAmount: "100000000000000",
    sellToken: NATIVE_ETH_ADDRESS,
    allowanceTarget: null,
    issues: { ...providerQuote().issues, allowance: null },
    route: { fills: [{ from: NATIVE_ETH_ADDRESS, to: ROBINHOOD_MAINNET_TOKENS.USDG.address, source: "Uniswap_V3", proportionBps: 10_000 }] },
    transaction: { ...providerQuote().transaction, value: "100000000000000" },
  });
  const quote = normalizeZeroXSwapQuote(raw, nativeRequest, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.ETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, { ...verification, allowanceSpender: null, allowanceSpenderCodePresent: false }, 1_800_000_000_000);
  assert.equal(quote.status, "ready");
  if (quote.status !== "ready" || quote.mode !== "quote") throw new Error("expected_ready_native_quote");
  return quote;
}

function mainnetNonceRpcFetch(options: { chainId?: string; nonce?: string; status?: number; invalidJson?: boolean; observedAt?: string } = {}): typeof fetch {
  return async (input) => {
    if (options.status !== undefined) return new Response("", { status: options.status });
    if (options.invalidJson) return new Response("not-json", { status: 200 });
    const chainId = Number.parseInt(options.chainId ?? "0x1237", 16);
    if (chainId !== 4_663) return Response.json({ error: { code: "rpc_chain_id_mismatch", message: "safe" } }, { status: 502 });
    const address = new URL(String(input), "http://localhost").searchParams.get("address");
    return Response.json({ networkId: "mainnet", chainId, address, pendingNonce: BigInt(options.nonce ?? "0x9").toString(), observedAt: options.observedAt ?? new Date().toISOString() });
  };
}

function nativePreflightProvider(walletNonce: string | (() => Promise<unknown>), onRequest?: (method: string) => void) {
  return { request: async ({ method }: { method: string }) => {
    onRequest?.(method);
    if (method === "eth_accounts") return [request.taker];
    if (method === "eth_chainId") return "0x1237";
    if (method === "eth_getTransactionCount") return typeof walletNonce === "string" ? walletNonce : walletNonce();
    if (method === "eth_getCode") return `0x${"aa".repeat(40)}`;
    if (method === "eth_call") return `0x${"0".repeat(24)}${verification.latestSettler!.slice(2).toLowerCase()}`;
    if (method === "eth_getBalance") return "0x3635c9adc5dea00000";
    if (method === "eth_gasPrice") return "0x3b9aca00";
    if (method === "eth_estimateGas") return "0x186a0";
    throw new Error(`Unexpected RPC method ${method}`);
  } };
}

test("Mainnet swap starts with native ETH for the USDG acceptance route", () => {
  assert.equal(DEFAULT_ROBINHOOD_SWAP_SELL_TOKEN, "ETH");
  assert.equal(ROBINHOOD_MAINNET_TOKENS[DEFAULT_ROBINHOOD_SWAP_SELL_TOKEN].native, true);
});

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

test("firm 0x quote validates the official AllowanceHolder and current Settler separately", () => {
  const result = normalizeZeroXSwapQuote(providerQuote(), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, verification, 1_800_000_000_000);
  assert.equal(result.status, "ready");
  if (result.status !== "ready" || result.mode !== "quote") return;
  assert.equal(result.execution.to, verifiedAllowanceTarget);
  assert.equal(result.allowance.spender, "0x0000000000001fF3684f28c67538d4D072C22734");
  assert.equal(result.executionEnabled, true);
  assert.equal(result.minimumReceived, "995000");
  assert.match(result.quoteDigest, /^0x[0-9a-f]{64}$/);
});

test("firm quote keeps AllowanceHolder approval separate from the current Settler execution target", () => {
  const currentSettler = verification.latestSettler!;
  const result = normalizeZeroXSwapQuote(providerQuote({
    transaction: { ...providerQuote().transaction, to: currentSettler },
  }), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, {
    ...verification,
    executionTarget: currentSettler,
    executionTargetCodePresent: true,
  }, 1_800_000_000_000);

  assert.equal(result.status, "ready");
  if (result.status === "ready" && result.mode === "quote") {
    assert.equal(result.allowance.spender, verifiedAllowanceTarget);
    assert.equal(result.transaction.to, currentSettler);
    assert.equal(result.settlerAddress, currentSettler);
  }
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
    assert.equal(splitAllowanceAndExecution.reason, "provider_execution_target_not_verified_on_robinhood_mainnet");
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

test("client accepts a quote targeting the registry Settler when its AllowanceHolder spender stays separate", async () => {
  const currentSettler = verification.latestSettler!;
  const normalized = normalizeZeroXSwapQuote(providerQuote({
    transaction: { ...providerQuote().transaction, to: currentSettler },
  }), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, { ...verification, executionTarget: currentSettler, executionTargetCodePresent: true }, 1_800_000_000_000);
  assert.equal(normalized.status, "ready");
  if (normalized.status !== "ready" || normalized.mode !== "quote") return;

  const result = await requestRobinhoodSwapQuote(request, {
    now: 1_800_000_000_000,
    fetch: async () => Response.json(normalized),
  });
  assert.equal(result.mode, "quote");
  if (result.mode === "quote") {
    assert.equal(result.transaction.to, currentSettler);
    assert.equal(result.allowance.spender, verifiedAllowanceTarget);
  }
});

test("swap preflight accepts matching wallet and independently verified Mainnet pending nonces", async () => {
  const quote = nativeEthQuote();
  const walletCalls: string[] = [];
  const result = await preflightRobinhoodSwap(nativePreflightProvider("0x9", (method) => walletCalls.push(method)), quote, Date.now(), {
    fetch: mainnetNonceRpcFetch({ nonce: "0x9" }),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.transactionNonce, BigInt(9));
  assert.equal(result.nonceSource, "wallet_and_rpc");
  assert.ok(walletCalls.indexOf("eth_accounts") < walletCalls.indexOf("eth_getTransactionCount"));
  assert.ok(walletCalls.lastIndexOf("eth_accounts") > walletCalls.indexOf("eth_getTransactionCount"));
});

test("swap preflight uses an explicit trusted-RPC fallback when the wallet rejects pending nonce reads", async () => {
  const quote = nativeEthQuote();
  const unsupported = Object.assign(new Error("raw provider details must not escape"), { code: -32601 });
  const result = await preflightRobinhoodSwap(nativePreflightProvider(async () => { throw unsupported; }), quote, Date.now(), {
    fetch: mainnetNonceRpcFetch({ nonce: "0x9" }),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.transactionNonce, BigInt(9));
  assert.equal(result.nonceSource, "trusted_rpc_fallback");
  assert.equal(result.walletNonceFailureCategory, "method_unsupported");
});

test("swap preflight does not use nonce fallback after wallet rejection or disconnection", async () => {
  const quote = nativeEthQuote();
  let fallbackCalls = 0;
  const rejectedProvider = nativePreflightProvider(async () => { throw Object.assign(new Error("wallet rejected"), { code: 4001 }); });
  await assert.rejects(preflightRobinhoodSwap(rejectedProvider, quote, Date.now(), {
    fetch: async () => { fallbackCalls += 1; return Response.json({}); },
  }), (error: unknown) => error instanceof Error && "code" in error && (error as { code: string }).code === "wallet_rejected");
  assert.equal(fallbackCalls, 0);

  const disconnectedProvider = nativePreflightProvider(async () => { throw Object.assign(new Error("wallet disconnected"), { code: 4900 }); });
  await assert.rejects(preflightRobinhoodSwap(disconnectedProvider, quote, Date.now(), { fetch: mainnetNonceRpcFetch() }), (error: unknown) =>
    error instanceof Error && "code" in error && (error as { code: string }).code === "wallet_disconnected");
});

test("swap preflight uses the exact pending tag and records malformed wallet nonce responses safely", async () => {
  const quote = nativeEthQuote();
  let requestedParams: readonly unknown[] | undefined;
  const base = nativePreflightProvider("0x9");
  const provider = { request: async (args: { method: string; params?: readonly unknown[] }) => {
    if (args.method === "eth_getTransactionCount") { requestedParams = args.params; return "9"; }
    return base.request(args);
  } };
  const result = await preflightRobinhoodSwap(provider, quote, Date.now(), { fetch: mainnetNonceRpcFetch({ nonce: "0x9" }) });

  assert.deepEqual(requestedParams, [request.taker, "pending"]);
  assert.equal(result.nonceSource, "trusted_rpc_fallback");
  assert.equal(result.walletNonceFailureCategory, "invalid_response");
});

test("swap preflight rejects wallet and trusted RPC pending nonce mismatches", async () => {
  const quote = nativeEthQuote();
  await assert.rejects(preflightRobinhoodSwap(nativePreflightProvider("0x9"), quote, Date.now(), {
    fetch: mainnetNonceRpcFetch({ nonce: "0xa" }),
  }), (error: unknown) => error instanceof Error && "code" in error
    && (error as { code: string }).code === "pending_nonce_mismatch");
});

test("swap preflight fails closed with a safe RPC category when nonce fallback cannot verify chain 4663", async () => {
  const quote = nativeEthQuote();
  await assert.rejects(preflightRobinhoodSwap(nativePreflightProvider(async () => { throw Object.assign(new Error("hidden"), { code: 4200 }); }), quote, Date.now(), {
    fetch: mainnetNonceRpcFetch({ chainId: "0x1" }),
  }), (error: unknown) => error instanceof Error && "code" in error
    && (error as { code: string }).code === "pending_nonce_verification_failed"
    && "diagnosticCategory" in error && (error as { diagnosticCategory: string }).diagnosticCategory === "rpc_chain_id_mismatch"
    && !error.message.includes("hidden"));
});

test("swap preflight rejects a stale pending nonce API snapshot instead of reusing its value", async () => {
  const quote = nativeEthQuote();
  await assert.rejects(preflightRobinhoodSwap(nativePreflightProvider(async () => { throw Object.assign(new Error("unsupported"), { code: 4200 }); }), quote, Date.now(), {
    fetch: mainnetNonceRpcFetch({ nonce: "0x9", observedAt: new Date(Date.now() - 60_000).toISOString() }),
  }), (error: unknown) => error instanceof Error && "code" in error
    && (error as { code: string }).code === "pending_nonce_verification_failed"
    && "diagnosticCategory" in error && (error as { diagnosticCategory: string }).diagnosticCategory === "rpc_stale_response");
});

test("swap preflight checks wallet identity before each nonce read and detects context invalidation", async () => {
  const quote = nativeEthQuote();
  let countCalls = 0;
  let accountReads = 0;
  const wrongAccountProvider = { request: async ({ method }: { method: string }) => {
    if (method === "eth_accounts") { accountReads += 1; return [accountReads < 3 ? request.taker : "0x2222222222222222222222222222222222222222"]; }
    if (method === "eth_chainId") return "0x1237";
    if (method === "eth_getTransactionCount") { countCalls += 1; return "0x9"; }
    return nativePreflightProvider("0x9").request({ method });
  } };
  // A provider that changes account immediately after returning its pending nonce must be rejected.
  await assert.rejects(preflightRobinhoodSwap(wrongAccountProvider, quote, Date.now(), {
    fetch: mainnetNonceRpcFetch({ nonce: "0x9" }),
  }), (error: unknown) => error instanceof Error && "code" in error
    && (error as { code: string }).code === "wallet_account_changed");
  assert.equal(countCalls, 1);

  let earlyNonceCalls = 0;
  const wrongChainProvider = { request: async ({ method }: { method: string }) => {
    if (method === "eth_accounts") return [request.taker];
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_getTransactionCount") { earlyNonceCalls += 1; return "0x9"; }
    return nativePreflightProvider("0x9").request({ method });
  } };
  await assert.rejects(preflightRobinhoodSwap(wrongChainProvider, quote, Date.now(), { fetch: mainnetNonceRpcFetch({ nonce: "0x9" }) }), (error: unknown) =>
    error instanceof Error && "code" in error && (error as { code: string }).code === "wallet_chain_mismatch");
  assert.equal(earlyNonceCalls, 0);

  let contextChecks = 0;
  await assert.rejects(preflightRobinhoodSwap(nativePreflightProvider("0x9"), quote, Date.now(), {
    fetch: mainnetNonceRpcFetch({ nonce: "0x9" }),
    isContextCurrent: () => ++contextChecks < 7,
  }), (error: unknown) => error instanceof Error && "code" in error
    && (error as { code: string }).code === "swap_context_changed");
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
  const result = await approveExactSwapAmount(provider, normalized, { fetch: mainnetNonceRpcFetch({ nonce: "0x7" }) });
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

  const malformedHashProvider = { request: (args: { method: string; params?: readonly unknown[] }) =>
    args.method === "eth_sendTransaction" ? Promise.resolve("0x1234") : provider.request(args) };
  await assert.rejects(approveExactSwapAmount(malformedHashProvider, normalized, { fetch: mainnetNonceRpcFetch({ nonce: "0x7" }) }), (error: unknown) =>
    error instanceof Error && "code" in error && (error as { code: string }).code === "transaction_submission_unknown"
      && error.message.includes("Check wallet activity"));
});

test("swap preflight rejects a changed pending wallet nonce before execution", async () => {
  const currentSettler = verification.latestSettler!;
  const normalized = normalizeZeroXSwapQuote(providerQuote({
    transaction: { ...providerQuote().transaction, to: currentSettler },
  }), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, { ...verification, executionTarget: currentSettler, executionTargetCodePresent: true }, 1_800_000_000_000);
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
  const result = await preflightRobinhoodSwap(provider, normalized, Date.now(), { fetch: mainnetNonceRpcFetch({ nonce: "0x9" }) });
  assert.equal(result.status, "ready");
  assert.equal(result.transactionNonce, BigInt(9));
  await assert.rejects(sendReviewedSwap(provider, normalized, "7", { fetch: mainnetNonceRpcFetch({ nonce: "0x9" }) }), (error: unknown) =>
    error instanceof Error && "code" in error && (error as { code: string }).code === "transaction_nonce_changed");
});

test("swap send emits an awaiting-wallet signal and submits only the exact freshly checked native quote", async () => {
  const quote = nativeEthQuote();
  const calls: Array<{ method: string; params?: readonly unknown[] }> = [];
  const events: string[] = [];
  const provider = {
    request: async (args: { method: string; params?: readonly unknown[] }) => {
      calls.push(args);
      const base = nativePreflightProvider("0x9");
      if (args.method === "eth_sendTransaction") { events.push(args.method); return `0x${"ab".repeat(32)}`; }
      return base.request(args);
    },
  };
  let walletRequestSignal = 0;
  const hash = await sendReviewedSwap(provider, quote, "9", {
    fetch: mainnetNonceRpcFetch({ nonce: "0x9" }),
    onWalletRequest: () => { walletRequestSignal += 1; events.push("awaiting_wallet"); },
  });

  assert.equal(hash, `0x${"ab".repeat(32)}`);
  assert.equal(walletRequestSignal, 1);
  assert.deepEqual(events, ["awaiting_wallet", "eth_sendTransaction"]);
  const send = calls.find((call) => call.method === "eth_sendTransaction");
  assert.ok(send);
  const tx = send.params?.[0] as { from: string; to: string; data: string; value: string; nonce: string };
  assert.equal(tx.from.toLowerCase(), quote.taker.toLowerCase());
  assert.equal(tx.to.toLowerCase(), quote.transaction.to.toLowerCase());
  assert.equal(tx.data, quote.transaction.data);
  assert.equal(BigInt(tx.value), BigInt(quote.transaction.value));
  assert.equal(tx.nonce, "0x9");
});

test("swap send blocks if the independently verified pending nonce changes during final preflight", async () => {
  const quote = nativeEthQuote();
  let walletNonceReads = 0;
  let trustedNonceReads = 0;
  let sendCalls = 0;
  const base = nativePreflightProvider("0x9");
  const provider = { request: async (args: { method: string; params?: readonly unknown[] }) => {
    if (args.method === "eth_getTransactionCount") {
      walletNonceReads += 1;
      return walletNonceReads < 2 ? "0x9" : "0xa";
    }
    if (args.method === "eth_sendTransaction") { sendCalls += 1; return `0x${"ab".repeat(32)}`; }
    return base.request(args);
  } };
  const fetch = async () => {
    const pendingNonce = trustedNonceReads++ === 0 ? "9" : "10";
    return Response.json({
      networkId: "mainnet",
      chainId: 4_663,
      address: request.taker,
      pendingNonce,
      observedAt: new Date().toISOString(),
    });
  };

  await assert.rejects(sendReviewedSwap(provider, quote, "9", { fetch }), (error: unknown) =>
    error instanceof Error && "code" in error && (error as { code: string }).code === "transaction_nonce_changed");
  assert.equal(walletNonceReads, 2);
  assert.equal(trustedNonceReads, 2);
  assert.equal(sendCalls, 0);
});

test("wallet request already pending is distinct and does not leak provider details", async () => {
  const quote = nativeEthQuote();
  const base = nativePreflightProvider("0x9");
  const provider = { request: async (args: { method: string; params?: readonly unknown[] }) => {
    if (args.method === "eth_sendTransaction") throw Object.assign(new Error("private provider diagnostic"), { code: -32002 });
    return base.request(args);
  } };

  await assert.rejects(sendReviewedSwap(provider, quote, "9", { fetch: mainnetNonceRpcFetch({ nonce: "0x9" }) }), (error: unknown) =>
    error instanceof Error && "code" in error && (error as { code: string }).code === "wallet_request_pending"
      && error.message.includes("already has a request") && !error.message.includes("private provider diagnostic"));
});

test("explicit wallet rejection is reported without treating it as a submitted transaction", async () => {
  const quote = nativeEthQuote();
  const base = nativePreflightProvider("0x9");
  const provider = { request: async (args: { method: string; params?: readonly unknown[] }) => {
    if (args.method === "eth_sendTransaction") throw Object.assign(new Error("wallet rejected"), { code: 4001 });
    return base.request(args);
  } };
  let walletRequestSignal = 0;

  await assert.rejects(sendReviewedSwap(provider, quote, "9", {
    fetch: mainnetNonceRpcFetch({ nonce: "0x9" }),
    onWalletRequest: () => { walletRequestSignal += 1; },
  }), (error: unknown) => error instanceof Error && "code" in error && (error as { code: string }).code === "wallet_rejected");
  assert.equal(walletRequestSignal, 1);
});

test("uncertain provider response after eth_sendTransaction is not reported as a safe rejection", async () => {
  const quote = nativeEthQuote();
  const base = nativePreflightProvider("0x9");
  const provider = { request: async (args: { method: string; params?: readonly unknown[] }) => {
    if (args.method === "eth_sendTransaction") throw Object.assign(new Error("secret provider detail"), { code: -32603 });
    return base.request(args);
  } };
  await assert.rejects(sendReviewedSwap(provider, quote, "9", { fetch: mainnetNonceRpcFetch({ nonce: "0x9" }) }), (error: unknown) =>
    error instanceof Error && "code" in error && (error as { code: string }).code === "transaction_submission_unknown"
      && error.message.includes("Check wallet activity") && !error.message.includes("secret provider detail"));
});

test("swap send refuses a quote that expires during its final preflight before opening the wallet", async () => {
  const original = nativeEthQuote();
  const nearExpiry = { ...original, quotedAt: new Date(Date.now() - 29_000).toISOString(), expiresAt: new Date(Date.now() + 1_000).toISOString() };
  nearExpiry.quoteDigest = computeQuoteDigest({
    chainId: nearExpiry.chainId,
    taker: nearExpiry.taker,
    sellToken: nearExpiry.tokenIn.address,
    buyToken: nearExpiry.tokenOut.address,
    sellAmount: nearExpiry.amountIn,
    buyAmount: nearExpiry.amountOut,
    minimumReceived: nearExpiry.minimumReceived,
    slippageBps: nearExpiry.slippageBps,
    recipient: nearExpiry.recipient,
    allowanceSpender: nearExpiry.allowance.spender,
    settlerAddress: nearExpiry.settlerAddress,
    quotedAt: nearExpiry.quotedAt,
    expiresAt: nearExpiry.expiresAt,
    estimatedGas: nearExpiry.estimatedGas,
    gasPrice: nearExpiry.gasPrice,
    totalNetworkFee: nearExpiry.totalNetworkFee,
    fees: nearExpiry.fees,
    route: nearExpiry.route,
    transaction: nearExpiry.transaction,
  });
  let walletRequestSignal = 0;

  await assert.rejects(sendReviewedSwap(nativePreflightProvider("0x9"), nearExpiry, "9", {
    fetch: mainnetNonceRpcFetch({ nonce: "0x9" }),
    onWalletRequest: () => { walletRequestSignal += 1; },
  }), (error: unknown) => error instanceof Error && "code" in error && (error as { code: string }).code === "quote_expiring");
  assert.equal(walletRequestSignal, 0);
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

test("zero WETH balance blocks before wallet transaction confirmation", async () => {
  const normalized = normalizeZeroXSwapQuote(providerQuote(), request, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.WETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, verification, 1_800_000_000_000);
  assert.equal(normalized.status, "ready");
  if (normalized.status !== "ready" || normalized.mode !== "quote") return;

  let sendTransactionCalls = 0;
  const provider = { request: async ({ method, params }: { method: string; params?: readonly unknown[] }) => {
    if (method === "eth_accounts") return [request.taker];
    if (method === "eth_chainId") return "0x1237";
    if (method === "eth_getTransactionCount") return "0x3";
    if (method === "eth_getCode") return `0x${"aa".repeat(40)}`;
    if (method === "eth_call") {
      const data = (params?.[0] as { data: string }).data;
      if (data === "0x6352211e" + "0".repeat(63) + "2") return `0x${"0".repeat(24)}${verification.latestSettler!.slice(2).toLowerCase()}`;
      if (data === "0x313ce567") return `0x${BigInt(18).toString(16).padStart(64, "0")}`;
      if (data.startsWith("0x70a08231")) return `0x${"0".repeat(64)}`;
      if (data.startsWith("0xdd62ed3e")) return `0x${"0".repeat(64)}`;
    }
    if (method === "eth_sendTransaction") { sendTransactionCalls += 1; return `0x${"99".repeat(32)}`; }
    throw new Error(`Unexpected RPC method ${method}`);
  } };

  await assert.rejects(sendReviewedSwap(provider, normalized, "3"), (error: unknown) =>
    error instanceof Error && "code" in error && (error as { code: string }).code === "insufficient_token_balance");
  assert.equal(sendTransactionCalls, 0);
});

test("native ETH preflight is ready without ERC-20 allowance calls or approval requests", async () => {
  const nativeRequest: RobinhoodSwapRequest = { ...request, tokenIn: "ETH", amount: "0.0001" };
  const nativeQuote = providerQuote({
    sellAmount: "100000000000000",
    sellToken: NATIVE_ETH_ADDRESS,
    allowanceTarget: null,
    issues: { ...providerQuote().issues, allowance: null },
    route: { fills: [{ from: NATIVE_ETH_ADDRESS, to: ROBINHOOD_MAINNET_TOKENS.USDG.address, source: "Uniswap_V3", proportionBps: 10_000 }] },
    transaction: { ...providerQuote().transaction, value: "100000000000000" },
  });
  const normalized = normalizeZeroXSwapQuote(nativeQuote, nativeRequest, {
    sell: { ...ROBINHOOD_MAINNET_TOKENS.ETH, decimals: 18 },
    buy: { ...ROBINHOOD_MAINNET_TOKENS.USDG, decimals: 6 },
  }, { ...verification, allowanceSpender: null, allowanceSpenderCodePresent: false }, 1_800_000_000_000);
  assert.equal(normalized.status, "ready");
  if (normalized.status !== "ready" || normalized.mode !== "quote") return;

  const calls: string[] = [];
  const provider = { request: async ({ method, params }: { method: string; params?: readonly unknown[] }) => {
    calls.push(method);
    if (method === "eth_accounts") return [request.taker];
    if (method === "eth_chainId") return "0x1237";
    if (method === "eth_getTransactionCount") return "0x7";
    if (method === "eth_getCode") return `0x${"aa".repeat(40)}`;
    if (method === "eth_call") {
      const data = (params?.[0] as { data: string }).data;
      assert.equal(data, "0x6352211e" + "0".repeat(63) + "2", "native ETH must not trigger ERC-20 metadata, balance, or allowance reads");
      return `0x${"0".repeat(24)}${verification.latestSettler!.slice(2).toLowerCase()}`;
    }
    if (method === "eth_getBalance") return "0x3635c9adc5dea00000";
    if (method === "eth_gasPrice") return "0x3b9aca00";
    if (method === "eth_estimateGas") return "0x186a0";
    throw new Error(`Unexpected RPC method ${method}`);
  } };

  const preflight = await preflightRobinhoodSwap(provider, normalized, Date.now(), { fetch: mainnetNonceRpcFetch({ nonce: "0x7" }) });
  assert.equal(preflight.status, "ready");
  const callsBeforeApprovalAttempt = calls.length;
  await assert.rejects(approveExactSwapAmount(provider, normalized), (error: unknown) =>
    error instanceof Error && "code" in error && (error as { code: string }).code === "approval_target_not_allowed");
  assert.equal(calls.length, callsBeforeApprovalAttempt);
  assert.equal(calls.includes("eth_sendTransaction"), false);
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
