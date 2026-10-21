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

test("Overview routes connected wallet status to the Wallet page", () => {
  const markup = renderOverview({
    status: "connected",
    address: "0x0000000000000000000000000000000000000001",
    chainId: 46_630,
    networkName: "Robinhood Chain Testnet",
  });

  assert.match(markup, /href="\/app\/wallet"[^>]*>Open wallet/);
  assert.doesNotMatch(markup, /Connect wallet/);
});

test("Overview keeps wallet navigation in the readiness row instead of duplicating the global wallet action", () => {
  const disconnected = renderOverview({ status: "disconnected" });
  assert.match(disconnected, /href="\/app\/wallet"[^>]*>Connect read-only/);
  assert.doesNotMatch(overviewHeroActions(disconnected), /wallet|connect/i);

  const connected = renderOverview({
    status: "connected",
    address: "0x0000000000000000000000000000000000000001",
    chainId: 46_630,
    networkName: "Robinhood Chain Testnet",
  });
  assert.match(connected, /href="\/app\/wallet"[^>]*>Open wallet/);
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
  assert.match(connectedOverview, /href="\/app\/wallet"[^>]*>Open wallet/);
  assert.doesNotMatch(connectedOverview, />Connect wallet</);

  const disconnectedWallet = { status: "disconnected" as const };
  const disconnectedModel = buildLiveAppModel({ ...common, wallet: disconnectedWallet });
  const disconnectedOverview = renderOverview(disconnectedWallet);
  assert.equal(disconnectedModel.wallet.walletButtonLabel, "Connect wallet");
  assert.match(disconnectedOverview, /href="\/app\/wallet"[^>]*>Connect read-only/);
  assert.doesNotMatch(overviewHeroActions(disconnectedOverview), /wallet|connect/i);
});

test("Overview leaves pending wallet feedback in the global action and avoids a second connect CTA", () => {
  const markup = renderOverview({ status: "loading", message: "Waiting for your wallet's account-access decision." });

  assert.match(markup, /Connecting/);
  assert.doesNotMatch(overviewHeroActions(markup), /wallet|connect/i);
});

test("Overview readiness uses the wallet's connecting and read-error states", () => {
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
