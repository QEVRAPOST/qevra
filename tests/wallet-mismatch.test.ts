import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { buildLiveAppModel } from "@/features/dashboard/live-model";
import { buildReadiness } from "@/lib/app-readiness";

const wallet = {
  status: "connected" as const,
  address: "0x0000000000000000000000000000000000000001" as const,
  providerName: "Example Injected Wallet",
  chainId: 46_630,
  networkName: "Robinhood Chain Testnet" as const,
  isQevraTargetNetwork: true,
  balance: {
    symbol: "ETH" as const,
    amount: "0.1",
    wei: "100000000000000000",
    blockNumber: "16",
    blockHash: `0x${"a".repeat(64)}` as `0x${string}`,
    provider: "connected_wallet_rpc" as const,
    observedAt: "2026-10-20T00:00:00.000Z",
  },
};

function render(component: "WalletBand" | "WalletView" | "NetworksView", selectedNetwork = "mainnet", connection: Record<string, unknown> = wallet): string {
  return execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { ModelContext } from "./src/components/dashboard/AppModelContext.tsx"; import { WalletBand } from "./src/components/dashboard/WalletBand.tsx"; import { WalletView } from "./src/components/dashboard/WalletView.tsx"; import { NetworksView } from "./src/components/dashboard/NetworksView.tsx"; import { buildLiveAppModel } from "./src/features/dashboard/live-model.ts"; const model = buildLiveAppModel({ wallet: ${JSON.stringify(connection)}, selectedNetwork: ${JSON.stringify(selectedNetwork)}, runs: null, accessState: "unauthenticated", isRefreshing: false, isCreating: false }); const value = { model, actions: { setNetwork() {}, setAmount() {}, pressSwapButton() {}, pressWalletButton() {}, pressLedgerAction() {}, refreshWallet() {}, refreshNetwork() {}, createSecurityRun() {}, logout() {} } }; const element = ${component === "NetworksView" ? 'createElement(NetworksView, { deploymentRecords: [] })' : `createElement(${component})`}; process.stdout.write(renderToStaticMarkup(createElement(ModelContext.Provider, { value }, element)))`,
  ], { cwd: process.cwd(), encoding: "utf8" });
}

test("a connected wallet balance is hidden when its chain differs from the selected app network", () => {
  const model = buildLiveAppModel({
    wallet,
    selectedNetwork: "mainnet",
    runs: null,
    accessState: "unauthenticated",
    isRefreshing: false,
    isCreating: false,
  });

  assert.equal(model.network.walletMismatch, true);
  assert.deepEqual(model.wallet.eoa.assets, []);
  assert.match(model.wallet.eoa.emptyAssets ?? "", /no balance is shown/i);
  assert.match(model.statusBar[0]?.text ?? "", /network mismatch/i);
  assert.equal(model.coverage.find((row) => row.id === "wallet-connection")?.statusLabel, "Connected · network mismatch");
  assert.match(buildReadiness(model).find((row) => row.id === "wallet")?.detail ?? "", /manually select Robinhood Mainnet.*4663/i);

  const markup = render("WalletBand");
  assert.match(markup, /Robinhood Chain Testnet/);
  assert.match(markup, /chain 46630/);
  assert.match(markup, /manually select Robinhood Mainnet.*4663/i);
  assert.match(markup, /Not available/);
  assert.doesNotMatch(markup, /0\.1/);
});

test("an unknown provider chain shows its ID, asks for a manual Testnet switch, and has no balance", () => {
  const unsupportedWallet = {
    status: "unsupported_network" as const,
    address: wallet.address,
    providerName: wallet.providerName,
    chainId: 1,
    networkName: "Unsupported network" as const,
    isQevraTargetNetwork: false,
    message: "This network is not configured as a VEYRA read-only target.",
  };
  const model = buildLiveAppModel({
    wallet: unsupportedWallet,
    selectedNetwork: "testnet",
    runs: null,
    accessState: "unauthenticated",
    isRefreshing: false,
    isCreating: false,
  });

  assert.equal(model.network.walletMismatch, true);
  assert.deepEqual(model.wallet.eoa.assets, []);
  assert.match(buildReadiness(model).find((row) => row.id === "wallet")?.detail ?? "", /chain ID 1.*Robinhood Testnet.*46630/i);
  const markup = render("WalletBand", "testnet", unsupportedWallet);
  assert.match(markup, /Unsupported network/);
  assert.match(markup, /chain 1/);
  assert.match(markup, /manually select Robinhood Testnet \(chain ID 46630\)/);
  assert.match(markup, /Not available/);
});

test("Wallet and Networks identify the same actual provider network and chain separately from selection", () => {
  const walletMarkup = render("WalletView");
  assert.match(walletMarkup, /Selected network<\/dt><dd>Robinhood Mainnet<\/dd>/);
  assert.match(walletMarkup, /Wallet network<\/dt><dd>Robinhood Chain Testnet<\/dd>/);
  assert.match(walletMarkup, /Wallet chain ID<\/dt><dd>46630<\/dd>/);

  const networksMarkup = render("NetworksView");
  assert.match(networksMarkup, /Wallet connection<\/dt><dd>Connected · network mismatch<\/dd>/);
  assert.match(networksMarkup, /Wallet network<\/dt><dd>Robinhood Chain Testnet<\/dd>/);
  assert.match(networksMarkup, /Wallet chain ID<\/dt><dd>46630<\/dd>/);
});
