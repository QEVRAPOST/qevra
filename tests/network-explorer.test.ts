import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { getExplorerAddressUrl } from "@/lib/config/networks";
import { getVerifiedVeyraDeployments, VEYRA_DEPLOYMENTS } from "@/lib/config/veyra-deployments";

test("network explorer address links are derived from the selected wallet chain configuration", () => {
  assert.equal(
    getExplorerAddressUrl("testnet", "0x0000000000000000000000000000000000000001"),
    "https://explorer.testnet.chain.robinhood.com/address/0x0000000000000000000000000000000000000001",
  );
  assert.equal(getExplorerAddressUrl("mainnet", "not-an-address"), undefined);
});

test("verified VEYRA deployments remain empty until there is a trusted deployment record", () => {
  assert.deepEqual(VEYRA_DEPLOYMENTS, []);
  assert.deepEqual(getVerifiedVeyraDeployments("testnet"), []);
  assert.deepEqual(getVerifiedVeyraDeployments("mainnet"), []);
});

test("registry entries are shown only for a valid address on the selected configured chain", () => {
  const valid = {
    name: "PQ Smart Account",
    networkId: "testnet" as const,
    chainId: 46_630,
    address: "0x0000000000000000000000000000000000000009" as const,
    deploymentStatus: "verified" as const,
    sourceVerification: "verified" as const,
  };
  const wrongChain = { ...valid, chainId: 4_663 };
  const invalidAddress = { ...valid, address: "0xnot-an-address" as `0x${string}` };

  assert.deepEqual(getVerifiedVeyraDeployments("testnet", [valid, wrongChain, invalidAddress]), [valid]);
  assert.deepEqual(getVerifiedVeyraDeployments("mainnet", [valid]), []);
});

function renderNetworks(network: "testnet" | "mainnet", rpc: Record<string, unknown>, records?: unknown[]): string {
  return execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { ModelContext } from "./src/components/dashboard/AppModelContext.tsx"; import { NetworksView } from "./src/components/dashboard/NetworksView.tsx"; import { buildLiveAppModel } from "./src/features/dashboard/live-model.ts"; const model = buildLiveAppModel({ wallet: { status: "disconnected" }, selectedNetwork: ${JSON.stringify(network)}, networkRpc: ${JSON.stringify(rpc)}, runs: null, accessState: "unauthenticated", isRefreshing: false, isCreating: false }); const value = { model, actions: { setNetwork() {}, setAmount() {}, pressSwapButton() {}, pressWalletButton() {}, pressLedgerAction() {}, refreshWallet() {}, refreshNetwork() {}, createSecurityRun() {}, logout() {} } }; process.stdout.write(renderToStaticMarkup(createElement(ModelContext.Provider, { value }, createElement(NetworksView, { deploymentRecords: ${JSON.stringify(records)} }))))`,
  ], { cwd: process.cwd(), encoding: "utf8" });
}

test("network explorer shows separate Testnet and Mainnet reads and the honest empty registry", () => {
  const markup = renderNetworks("testnet", {
    status: "available",
    chainId: 46_630,
    latestBlock: "98765",
    observedAt: "2026-10-21T00:00:00.000Z",
  });

  assert.match(markup, /Robinhood Testnet/);
  assert.match(markup, /Robinhood Mainnet/);
  assert.match(markup, /98765/);
  assert.match(markup, /https:\/\/explorer\.testnet\.chain\.robinhood\.com/);
  assert.match(markup, /No verified VEYRA contract deployments on this network\./);
});

test("network explorer renders a controlled verified entry without merging wallet addresses", () => {
  const deployment = {
    name: "PQ Smart Account",
    networkId: "testnet",
    chainId: 46_630,
    address: "0x0000000000000000000000000000000000000009",
    deploymentStatus: "verified",
    sourceVerification: "verified",
  };
  const markup = renderNetworks("testnet", { status: "loading" }, [deployment]);

  assert.match(markup, /PQ Smart Account/);
  assert.match(markup, /0x0000000000000000000000000000000000000009/);
  assert.match(markup, /Source verified/);
  assert.match(markup, /Copy address/);
  assert.match(markup, /Open in Explorer/);
});

test("network explorer surfaces public RPC failures and a retry action", () => {
  const markup = renderNetworks("mainnet", {
    status: "unavailable",
    errorCode: "rpc_unavailable",
    message: "The public RPC could not be reached.",
  });

  assert.match(markup, /The public RPC could not be reached\./);
  assert.match(markup, /Retry public RPC/);
});
