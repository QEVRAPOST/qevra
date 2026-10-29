import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { buildLiveAppModel } from "@/features/dashboard/live-model";
import { buildReadiness } from "@/lib/app-readiness";

function renderOverview(wallet: Record<string, unknown>): string {
  return execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { ModelContext } from "./src/components/dashboard/AppModelContext.tsx"; import { OverviewView } from "./src/components/dashboard/OverviewView.tsx"; import { buildLiveAppModel } from "./src/features/dashboard/live-model.ts"; const model = buildLiveAppModel({ wallet: ${JSON.stringify(wallet)}, selectedNetwork: "testnet", runs: null, accessState: "unauthenticated", isRefreshing: false, isCreating: false }); const value = { model, actions: { setNetwork() {}, setAmount() {}, pressSwapButton() {}, pressWalletButton() {}, pressLedgerAction() {}, refreshWallet() {}, createSecurityRun() {}, logout() {} } }; process.stdout.write(renderToStaticMarkup(createElement(ModelContext.Provider, { value }, createElement(OverviewView))))`,
  ], { cwd: process.cwd(), encoding: "utf8" });
}

function renderAppRoute(wallet: Record<string, unknown>): string {
  return execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import AppIndex from "./src/app/app/page.tsx"; import { ModelContext } from "./src/components/dashboard/AppModelContext.tsx"; import { buildLiveAppModel } from "./src/features/dashboard/live-model.ts"; const model = buildLiveAppModel({ wallet: ${JSON.stringify(wallet)}, selectedNetwork: "testnet", runs: null, accessState: "unauthenticated", isRefreshing: false, isCreating: false }); const value = { model, actions: { setNetwork() {}, setAmount() {}, pressSwapButton() {}, pressWalletButton() {}, pressLedgerAction() {}, refreshWallet() {}, createSecurityRun() {}, logout() {} } }; process.stdout.write(renderToStaticMarkup(createElement(ModelContext.Provider, { value }, createElement(AppIndex))))`,
  ], { cwd: process.cwd(), encoding: "utf8" });
}

function renderWalletBand(wallet: Record<string, unknown>): string {
  return execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { ModelContext } from "./src/components/dashboard/AppModelContext.tsx"; import { WalletBand } from "./src/components/dashboard/WalletBand.tsx"; import { buildLiveAppModel } from "./src/features/dashboard/live-model.ts"; const model = buildLiveAppModel({ wallet: ${JSON.stringify(wallet)}, selectedNetwork: "testnet", runs: null, accessState: "unauthenticated", isRefreshing: false, isCreating: false }); const value = { model, actions: { setNetwork() {}, setAmount() {}, pressSwapButton() {}, pressWalletButton() {}, pressLedgerAction() {}, refreshWallet() {}, createSecurityRun() {}, logout() {} } }; process.stdout.write(renderToStaticMarkup(createElement(ModelContext.Provider, { value }, createElement(WalletBand))))`,
  ], { cwd: process.cwd(), encoding: "utf8" });
}

function overviewHeroActions(markup: string): string {
  const start = markup.indexOf('<div class="ov-cta">');
  const end = markup.indexOf("</div>", start);
  assert.notEqual(start, -1, "Overview should render its hero action group");
  assert.notEqual(end, -1, "Overview hero action group should close");
  return markup.slice(start, end);
}

test("Overview workspace always provides a consistent Wallet route", () => {
  const markup = renderOverview({
    status: "connected",
    address: "0x0000000000000000000000000000000000000001",
    chainId: 46_630,
    networkName: "Robinhood Chain Testnet",
  });

  assert.match(markup, /href="\/app\/wallet"[^>]*>Open Wallet/);
  assert.doesNotMatch(markup, /Connect wallet/);
});

test("Overview presents the three real workspace journeys instead of readiness diagnostics", () => {
  const markup = renderOverview({ status: "disconnected" });

  assert.match(markup, /Your VEYRA Workspace/);
  assert.match(markup, /Your wallet, your control\./);
  assert.match(markup, /Connect your wallet, explore balances, and access your VEYRA account\./);
  assert.match(markup, /href="\/app\/wallet"[^>]*>Open Wallet/);
  assert.match(markup, /Review before you execute\./);
  assert.match(markup, /Explore Robinhood Mainnet swaps with live quotes, transaction review, and wallet-controlled execution\./);
  assert.match(markup, /href="\/app\/swap"[^>]*>Explore Swap/);
  assert.match(markup, /Research beyond the surface\./);
  assert.match(markup, /Explore AI-assisted research, supporting evidence, and your research history\./);
  assert.match(markup, /href="\/app\/security"[^>]*>Explore Security Swarm/);
  assert.doesNotMatch(markup, /AVAILABLE NOW|NOT AVAILABLE|LATEST RESEARCH|Experimental|Provider unavailable|Route check required|None yet|Research failed/i);
});

test("the real /app route renders the updated workspace panels without legacy diagnostic copy", () => {
  const markup = renderAppRoute({ status: "disconnected" });

  for (const text of [
    "Your wallet, your control.",
    "Connect your wallet, explore balances, and access your VEYRA account.",
    "Open Wallet",
    "Review before you execute.",
    "Explore Robinhood Mainnet swaps with live quotes, transaction review, and wallet-controlled execution.",
    "Explore Swap",
    "Research beyond the surface.",
    "Explore AI-assisted research, supporting evidence, and your research history.",
    "Explore Security Swarm",
  ]) {
    assert.ok(markup.includes(text), `the /app route should include ${text}`);
  }

  assert.match(markup, /href="\/app\/wallet"/);
  assert.match(markup, /href="\/app\/swap"/);
  assert.match(markup, /href="\/app\/security"/);
  assert.doesNotMatch(markup, /AVAILABLE NOW|NOT AVAILABLE|LATEST RESEARCH|Experimental|Provider unavailable|Route check required|None yet|Research failed/i);
});

test("Overview workspace links do not depend on wallet connection state", () => {
  const disconnected = renderOverview({ status: "disconnected" });
  assert.match(disconnected, /href="\/app\/wallet"[^>]*>Open Wallet/);
  assert.doesNotMatch(overviewHeroActions(disconnected), /wallet|connect/i);

  const connected = renderOverview({
    status: "connected",
    address: "0x0000000000000000000000000000000000000001",
    chainId: 46_630,
    networkName: "Robinhood Chain Testnet",
  });
  assert.match(connected, /href="\/app\/wallet"[^>]*>Open Wallet/);
  assert.doesNotMatch(overviewHeroActions(connected), /wallet|connect/i);
});

test("global wallet action and Overview wallet navigation reflect the same wallet model state", () => {
  const connectedWallet = {
    status: "connected" as const,
    address: "0x0000000000000000000000000000000000000001" as const,
    chainId: 46_630,
    networkName: "Robinhood Chain Testnet" as const,
  };
  const common = { selectedNetwork: "testnet" as const, runs: null, accessState: "unauthenticated" as const, isRefreshing: false, isCreating: false };
  const connectedModel = buildLiveAppModel({ ...common, wallet: connectedWallet });
  const connectedOverview = renderOverview(connectedWallet);
  assert.equal(connectedModel.wallet.walletButtonLabel, "Disconnect wallet");
  assert.match(connectedOverview, /href="\/app\/wallet"[^>]*>Open Wallet/);
  assert.doesNotMatch(connectedOverview, />Connect wallet</);

  const disconnectedWallet = { status: "disconnected" as const };
  const disconnectedModel = buildLiveAppModel({ ...common, wallet: disconnectedWallet });
  const disconnectedOverview = renderOverview(disconnectedWallet);
  assert.equal(disconnectedModel.wallet.walletButtonLabel, "Connect wallet");
  assert.match(disconnectedOverview, /href="\/app\/wallet"[^>]*>Open Wallet/);
  assert.doesNotMatch(overviewHeroActions(disconnectedOverview), /wallet|connect/i);
});

test("pending wallet feedback stays in the global wallet action, not the Overview workspace", () => {
  const wallet = { status: "loading" as const, message: "Waiting for your wallet's account-access decision." };
  const model = buildLiveAppModel({
    wallet,
    selectedNetwork: "testnet",
    runs: null,
    accessState: "unauthenticated",
    isRefreshing: false,
    isCreating: false,
  });
  const markup = renderOverview(wallet);

  assert.equal(model.wallet.walletButtonLabel, "Connecting…");
  assert.doesNotMatch(markup, /Connecting/);
  assert.match(markup, /href="\/app\/wallet"[^>]*>Open Wallet/);
  assert.doesNotMatch(overviewHeroActions(markup), /wallet|connect/i);
});

test("Status readiness still uses the wallet's connecting and read-error states", () => {
  const common = { selectedNetwork: "testnet" as const, runs: null, accessState: "unauthenticated" as const, isRefreshing: false, isCreating: false };
  const pending = buildLiveAppModel({ ...common, wallet: { status: "loading", message: "Waiting for your wallet's account-access decision." } });
  const failedRead = buildLiveAppModel({ ...common, wallet: {
    status: "rpc_unavailable",
    address: "0x0000000000000000000000000000000000000001",
    chainId: 46_630,
    networkName: "Robinhood Chain Testnet",
    message: "The wallet's read-only RPC request failed.",
  } });

  assert.equal(buildReadiness(pending).find((row) => row.id === "wallet")?.value, "Connecting");
  assert.equal(buildReadiness(failedRead).find((row) => row.id === "wallet")?.value, "0x0000…0001 · read failed");
  assert.match(buildReadiness(failedRead).find((row) => row.id === "wallet")?.detail ?? "", /no previous balance is shown/i);
});

test("wallet UI preserves an authorized address after RPC failure and offers a fresh read", () => {
  const markup = renderWalletBand({
    status: "rpc_unavailable",
    address: "0x0000000000000000000000000000000000000001",
    chainId: 46_630,
    networkName: "Robinhood Chain Testnet",
    message: "The wallet's read-only RPC request failed. No write request was sent.",
  });

  assert.match(markup, /0x0000…0001/);
  assert.match(markup, /Not available/);
  assert.match(markup, /Retry wallet read/);
  assert.doesNotMatch(markup, /No wallet connected/);
  assert.doesNotMatch(markup, /Connected · read-only/);
});

test("connected wallet address actions share Aperture button typography and sizing", () => {
  const markup = renderWalletBand({
    status: "connected",
    address: "0x0000000000000000000000000000000000000001",
    chainId: 46_630,
    networkName: "Robinhood Chain Testnet",
  });

  for (const label of ["Show full address", "Copy address", "Open in Explorer"]) {
    const position = markup.indexOf(label);
    assert.notEqual(position, -1, `${label} should be rendered`);
    const buttonStart = markup.lastIndexOf("<button", position);
    const linkStart = markup.lastIndexOf("<a", position);
    const tagStart = Math.max(buttonStart, linkStart);
    const openingTag = markup.slice(tagStart, markup.indexOf(">", tagStart) + 1);
    assert.match(openingTag, /font-sans/, `${label} should use the shared UI font`);
    assert.match(openingTag, /text-sm/, `${label} should use the shared small action size`);
    assert.match(openingTag, /min-h-9/, `${label} should use the shared button height`);
    assert.doesNotMatch(openingTag, /font-mono/, `${label} is an action label, not technical data`);
  }
});
