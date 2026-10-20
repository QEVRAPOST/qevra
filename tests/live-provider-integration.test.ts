import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import type { ReadOnlyWalletState, ResearchRunSummary } from "@/types/integrations";
import { listSecurityRuns } from "@/features/security/client";

async function liveUiState() {
  return import("@/features/dashboard/live-ui-state").catch(() => ({} as Record<string, unknown>));
}

test("public wallet UI renders while protected research UI remains behind the login gate", () => {
  const markup = execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    'import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { LiveAppProvider, LiveResearchAccessBoundary } from "./src/features/dashboard/LiveAppProvider.tsx"; import { WalletView } from "./src/components/dashboard/WalletView.tsx"; process.stdout.write(renderToStaticMarkup(createElement(LiveAppProvider, null, createElement("main", null, createElement(WalletView), createElement(LiveResearchAccessBoundary, null, createElement("p", null, "Protected research content"))))))',
  ], { cwd: process.cwd(), encoding: "utf8" });

  assert.match(markup, /aria-labelledby="h-wallet"/);
  assert.match(markup, /Connect wallet/);
  assert.match(markup, /46630/);
  assert.match(markup, /Checking live service/);
  assert.doesNotMatch(markup, /Protected research content/);
});

test("wallet UI consumes live address, selected chain, mismatch, balance, and refresh actions", () => {
  const markup = execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    'import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { ModelContext } from "./src/components/dashboard/AppModelContext.tsx"; import { WalletView } from "./src/components/dashboard/WalletView.tsx"; import { buildLiveAppModel } from "./src/features/dashboard/live-model.ts"; const wallet = { status: "connected", address: "0x0000000000000000000000000000000000000001", chainId: 46630, networkName: "Robinhood Chain Testnet", isQevraTargetNetwork: true, balance: { symbol: "ETH", amount: "0.1", wei: "100000000000000000", blockNumber: "16", blockHash: `0x${"a".repeat(64)}`, provider: "connected_wallet_rpc", observedAt: "2026-10-20T00:00:00.000Z" } }; const model = buildLiveAppModel({ wallet, selectedNetwork: "mainnet", networkRpc: { status: "unavailable", errorCode: "rpc_unavailable", message: "Public RPC offline" }, runs: null, accessState: "unauthenticated", isRefreshing: false, isCreating: false }); const value = { model, actions: { setNetwork() {}, setAmount() {}, pressSwapButton() {}, pressWalletButton() {}, pressLedgerAction() {}, refreshWallet() {}, createSecurityRun() {}, logout() {} } }; process.stdout.write(renderToStaticMarkup(createElement(ModelContext.Provider, { value }, createElement(WalletView))))',
  ], { cwd: process.cwd(), encoding: "utf8" });

  assert.match(markup, /Robinhood Mainnet/);
  assert.match(markup, /0x0000…0001/);
  assert.match(markup, /chain 46630/);
  assert.match(markup, /Differs from the network the app reads \(Mainnet\)/);
  assert.match(markup, /0\.1/);
  assert.match(markup, /Public RPC offline/);
  assert.match(markup, /Refresh balance/);
  assert.match(markup, /Disconnect/);
});

test("protected research requests stay closed until the operator session is authenticated", async () => {
  const state = await liveUiState() as { canUseProtectedResearch?: (gate: string) => boolean };

  assert.equal(state.canUseProtectedResearch?.("checking"), false);
  assert.equal(state.canUseProtectedResearch?.("unauthenticated"), false);
  assert.equal(state.canUseProtectedResearch?.("authenticated"), true);
});

test("a protected 401 expires research access immediately while other statuses preserve it", async () => {
  const state = await liveUiState() as { gateAfterProtectedResponse?: (gate: string, status: number) => string };

  assert.equal(state.gateAfterProtectedResponse?.("authenticated", 401), "unauthenticated");
  assert.equal(state.gateAfterProtectedResponse?.("authenticated", 403), "authenticated");
  assert.equal(state.gateAfterProtectedResponse?.("authenticated", 429), "authenticated");
  assert.equal(state.gateAfterProtectedResponse?.("authenticated", 503), "authenticated");
});

test("expiring research access clears protected history and leaves wallet state unchanged", async () => {
  const state = await liveUiState() as {
    expireResearchSession?: <T extends Record<string, unknown>>(value: T) => T;
  };
  const wallet: ReadOnlyWalletState = {
    status: "connected",
    address: "0x0000000000000000000000000000000000000001",
    chainId: 46_630,
    networkName: "Robinhood Chain Testnet",
    isQevraTargetNetwork: true,
    balance: {
      symbol: "ETH",
      amount: "0.1",
      wei: "100000000000000000",
      blockNumber: "16",
      blockHash: `0x${"a".repeat(64)}`,
      provider: "connected_wallet_rpc",
      observedAt: "2026-10-20T00:00:00.000Z",
    },
  };
  const summary: ResearchRunSummary = {
    id: "11111111-1111-4111-8111-111111111111",
    topicId: "security-evidence",
    topic: "Saved research",
    status: "completed",
    currentStage: "completed",
    createdAt: "2026-10-19T00:00:00.000Z",
    updatedAt: "2026-10-19T00:01:00.000Z",
    agents: [],
    sourceCount: 1,
    availableSourceCount: 1,
    findingCount: 1,
    events: [],
  };
  const before = {
    gate: "authenticated",
    wallet,
    summaries: [summary],
    details: { [summary.id]: { id: summary.id } },
    detailErrors: { [summary.id]: "stale" },
    capabilities: { provider: "available" },
    nextCursor: "next-page",
    loadedPageCount: 2,
  };

  const after = state.expireResearchSession?.(before);
  assert.equal(after?.gate, "unauthenticated");
  assert.equal(after?.summaries, null);
  assert.deepEqual(after?.details, {});
  assert.deepEqual(after?.detailErrors, {});
  assert.equal(after?.capabilities, undefined);
  assert.equal(after?.nextCursor, undefined);
  assert.equal(after?.loadedPageCount, 0);
  assert.strictEqual(after?.wallet, wallet);
});

test("history pages merge newest-first, remove duplicates, and keep the loaded-page cursor", async () => {
  const state = await liveUiState() as {
    mergeHistoryPage?: (
      current: { runs: ResearchRunSummary[]; nextCursor?: string; loadedPageCount: number },
      page: { runs: ResearchRunSummary[]; nextCursor?: string },
    ) => { runs: ResearchRunSummary[]; nextCursor?: string; loadedPageCount: number };
  };
  const base: ResearchRunSummary = {
    id: "11111111-1111-4111-8111-111111111111",
    topicId: "security-evidence",
    topic: "Older run",
    status: "completed",
    currentStage: "completed",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:01:00.000Z",
    agents: [],
    sourceCount: 1,
    availableSourceCount: 1,
    findingCount: 1,
    events: [],
  };
  const newest: ResearchRunSummary = {
    ...base,
    id: "22222222-2222-4222-8222-222222222222",
    topic: "Newest run",
    createdAt: "2026-10-20T00:00:00.000Z",
  };
  const middle: ResearchRunSummary = {
    ...base,
    id: "33333333-3333-4333-8333-333333333333",
    topic: "Middle run",
    createdAt: "2026-10-19T00:00:00.000Z",
  };
  const duplicateUpdate = { ...middle, topic: "Updated middle run" };
  const oldest = { ...base, id: "44444444-4444-4444-8444-444444444444" };

  const result = state.mergeHistoryPage?.(
    { runs: [newest, middle], nextCursor: "cursor-after-middle", loadedPageCount: 2 },
    { runs: [duplicateUpdate, oldest], nextCursor: "cursor-after-oldest" },
  );

  assert.deepEqual(result?.runs.map((run) => run.id), [newest.id, middle.id, oldest.id]);
  assert.equal(result?.runs[1]?.topic, "Updated middle run");
  assert.equal(result?.nextCursor, "cursor-after-oldest");
  assert.equal(result?.loadedPageCount, 3);
});

test("polling the first page merges fresh runs without discarding pages already loaded", async () => {
  const state = await liveUiState() as {
    mergeFirstHistoryPage?: (
      current: { runs: ResearchRunSummary[]; nextCursor?: string; loadedPageCount: number },
      page: { runs: ResearchRunSummary[]; nextCursor?: string },
    ) => { runs: ResearchRunSummary[]; nextCursor?: string; loadedPageCount: number };
  };
  const oldRun: ResearchRunSummary = {
    id: "11111111-1111-4111-8111-111111111111",
    topicId: "security-evidence",
    topic: "Older loaded run",
    status: "completed",
    currentStage: "completed",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:01:00.000Z",
    agents: [],
    sourceCount: 1,
    availableSourceCount: 1,
    findingCount: 1,
    events: [],
  };
  const newest: ResearchRunSummary = {
    ...oldRun,
    id: "22222222-2222-4222-8222-222222222222",
    topic: "New run from poll",
    createdAt: "2026-10-20T00:00:00.000Z",
  };

  const result = state.mergeFirstHistoryPage?.(
    { runs: [oldRun], nextCursor: "cursor-after-loaded-pages", loadedPageCount: 3 },
    { runs: [newest, oldRun], nextCursor: "cursor-after-first-page" },
  );

  assert.deepEqual(result?.runs.map((run) => run.id), [newest.id, oldRun.id]);
  assert.equal(result?.nextCursor, "cursor-after-loaded-pages");
  assert.equal(result?.loadedPageCount, 3);
});

test("research history client sends the existing cursor without changing the endpoint contract", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return Response.json({ runs: [], nextCursor: "next" });
  };
  try {
    const page = await listSecurityRuns({ limit: 20, cursor: "older-than-20" });
    assert.match(requestedUrl, /cursor=older-than-20/);
    assert.equal(page.nextCursor, "next");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("live wallet model exposes selected chain, mismatch, RPC loading, and RPC errors", async () => {
  const liveModel = await import("@/features/dashboard/live-model");
  const wallet: ReadOnlyWalletState = {
    status: "connected",
    address: "0x0000000000000000000000000000000000000001",
    chainId: 46_630,
    networkName: "Robinhood Chain Testnet",
    isQevraTargetNetwork: true,
    balance: {
      symbol: "ETH",
      amount: "0.1",
      wei: "100000000000000000",
      blockNumber: "16",
      blockHash: `0x${"a".repeat(64)}`,
      provider: "connected_wallet_rpc",
      observedAt: "2026-10-20T00:00:00.000Z",
    },
  };
  const build = (networkRpc: { status: "loading" } | { status: "unavailable"; errorCode: string; message: string }) => liveModel.buildLiveAppModel({
    wallet,
    selectedNetwork: "mainnet",
    networkRpc,
    runs: null,
    isRefreshing: false,
    isCreating: false,
  });

  const loading = build({ status: "loading" });
  assert.equal(loading.wallet.connection?.address, wallet.address);
  assert.equal(loading.wallet.connection?.chainId, 46_630);
  assert.equal(loading.wallet.eoa.assets[0]?.amount, "0.1");
  assert.equal(loading.network.selected, "mainnet");
  assert.equal(loading.network.walletMismatch, true);
  assert.equal(loading.network.rpc.status, "loading");
  assert.equal(loading.network.options.find((network) => network.id === "testnet")?.chainId, 46_630);
  assert.equal(loading.network.options.find((network) => network.id === "mainnet")?.chainId, 4_663);

  const walletLoading = liveModel.buildLiveAppModel({
    wallet: { status: "loading", message: "Waiting for account access" },
    selectedNetwork: "testnet",
    networkRpc: { status: "loading" },
    runs: null,
    isRefreshing: false,
    isCreating: false,
  });
  assert.equal(walletLoading.wallet.connection?.status, "loading");
  assert.equal(walletLoading.wallet.connection?.message, "Waiting for account access");

  const unavailable = build({ status: "unavailable", errorCode: "rpc_unavailable", message: "Public RPC offline" });
  assert.equal(unavailable.network.rpc.status, "unavailable");
  assert.equal(unavailable.network.rpc.message, "Public RPC offline");
  assert.equal(unavailable.wallet.connection?.balance?.amount, "0.1");

  const walletError = liveModel.buildLiveAppModel({
    wallet: { status: "rpc_unavailable", address: wallet.address, chainId: 46_630, networkName: "Robinhood Chain Testnet", message: "Wallet RPC offline" },
    selectedNetwork: "testnet",
    networkRpc: { status: "loading" },
    runs: null,
    isRefreshing: false,
    isCreating: false,
  });
  assert.equal(walletError.wallet.connection?.status, "rpc_unavailable");
  assert.equal(walletError.wallet.connection?.message, "Wallet RPC offline");
  assert.equal(walletError.wallet.eoa.assets.length, 0);
  assert.match(walletError.wallet.eoa.emptyAssets ?? "", /unavailable/i);
});
