import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CopyAddressButton } from "@/components/dashboard/CopyAddressButton";
import { getExplorerAddressUrl, getExplorerTransactionUrl } from "@/lib/config/networks";
import { loadVerifiedVeyraDeployments } from "@/lib/config/load-veyra-deployments";
import { getVerifiedVeyraDeployments } from "@/lib/config/veyra-deployments";

test("network explorer address links are derived from the selected wallet chain configuration", () => {
  assert.equal(
    getExplorerAddressUrl("testnet", "0x0000000000000000000000000000000000000001"),
    "https://explorer.testnet.chain.robinhood.com/address/0x0000000000000000000000000000000000000001",
  );
  assert.equal(
    getExplorerAddressUrl("mainnet", "0x0000000000000000000000000000000000000001"),
    "https://robinhoodchain.blockscout.com/address/0x0000000000000000000000000000000000000001",
  );
  assert.equal(getExplorerTransactionUrl("testnet", `0x${"a".repeat(64)}`), `https://explorer.testnet.chain.robinhood.com/tx/0x${"a".repeat(64)}`);
  assert.equal(getExplorerTransactionUrl("mainnet", `0x${"a".repeat(64)}`), `https://robinhoodchain.blockscout.com/tx/0x${"a".repeat(64)}`);
  assert.equal(getExplorerAddressUrl("mainnet", "not-an-address"), undefined);
  assert.equal(getExplorerTransactionUrl("testnet", "not-a-hash"), undefined);
});

test("the registry helper does not invent deployment records", () => {
  assert.deepEqual(getVerifiedVeyraDeployments("testnet", []), []);
  assert.deepEqual(getVerifiedVeyraDeployments("mainnet", []), []);
});

test("registry entries are shown only for a valid address on the selected configured chain", () => {
  const valid = {
    name: "PQ Smart Account",
    networkId: "testnet" as const,
    chainId: 46_630,
    architectureSlot: 10,
    address: "0x0000000000000000000000000000000000000009" as const,
    deploymentStatus: "verified" as const,
    observedChainId: 46_630,
    deployerAddress: "0x0000000000000000000000000000000000000001" as const,
    transactionHash: `0x${"a".repeat(64)}` as `0x${string}`,
    receiptStatus: "success" as const,
    blockNumber: "12345",
    runtimeBytecodeHash: `0x${"b".repeat(64)}` as `0x${string}`,
    sourceVerification: "verified" as const,
  };
  const wrongChain = { ...valid, chainId: 4_663 };
  const invalidAddress = { ...valid, address: "0xnot-an-address" as `0x${string}` };
  const noDeploymentEvidence = { ...valid, transactionHash: undefined, runtimeBytecodeHash: undefined } as unknown as typeof valid;

  assert.deepEqual(getVerifiedVeyraDeployments("testnet", [valid, wrongChain, invalidAddress, noDeploymentEvidence]), [valid]);
  assert.deepEqual(getVerifiedVeyraDeployments("mainnet", [valid]), []);
});

function renderNetworks(
  network: "testnet" | "mainnet",
  rpc: Record<string, unknown>,
  records?: unknown[],
  wallet: Record<string, unknown> = { status: "disconnected" },
  standaloneRecords?: unknown[],
): string {
  return execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { ModelContext } from "./src/components/dashboard/AppModelContext.tsx"; import { NetworksView } from "./src/components/dashboard/NetworksView.tsx"; import { buildLiveAppModel } from "./src/features/dashboard/live-model.ts"; const model = buildLiveAppModel({ wallet: ${JSON.stringify(wallet)}, selectedNetwork: ${JSON.stringify(network)}, networkRpc: ${JSON.stringify(rpc)}, runs: null, accessState: "unauthenticated", isRefreshing: false, isCreating: false }); const value = { model, actions: { setNetwork() {}, setAmount() {}, pressSwapButton() {}, pressWalletButton() {}, pressLedgerAction() {}, refreshWallet() {}, refreshNetwork() {}, createSecurityRun() {}, logout() {} } }; process.stdout.write(renderToStaticMarkup(createElement(ModelContext.Provider, { value }, createElement(NetworksView, { deploymentRecords: ${JSON.stringify(records)}, standaloneResearchEvidenceAnchors: ${JSON.stringify(standaloneRecords)} }))))`,
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
  assert.match(markup, /No verified VEYRA deployments\./);
});

test("network explorer uses full-width vertical status, address, and registry sections", () => {
  const markup = renderNetworks("testnet", {
    status: "available",
    chainId: 46_630,
    latestBlock: "98765",
    observedAt: "2026-10-21T00:00:00.000Z",
  });
  const statusPosition = markup.indexOf("01 · NETWORK STATUS");
  const addressPosition = markup.indexOf("02 · WATCH-ONLY ADDRESS");
  const registryPosition = markup.indexOf("03 · CONTRACT REGISTRY");

  assert.match(markup, /class="ne-sections"/);
  assert.doesNotMatch(markup, /class="ne-grid"/);
  assert.ok(statusPosition >= 0 && statusPosition < addressPosition);
  assert.ok(addressPosition < registryPosition);
  assert.match(markup, /Expected chain ID/);
  assert.match(markup, /Observed chain ID/);
  assert.match(markup, /Latest block/);
  assert.match(markup, /No verified VEYRA deployments\./);
});

test("network status keeps connected wallet provider, actual chain, and manual mismatch guidance visible", () => {
  const markup = renderNetworks("testnet", { status: "available", chainId: 46_630, latestBlock: "42" }, undefined, {
    status: "unsupported_network",
    address: "0x0000000000000000000000000000000000000001",
    providerName: "MetaMask",
    chainId: 4_663,
    networkName: "Robinhood Chain",
  });

  assert.match(markup, /MetaMask/);
  assert.match(markup, /Robinhood Chain/);
  assert.match(markup, /Wallet chain ID/);
  assert.match(markup, /manually select Robinhood Testnet \(chain ID 46630\)/i);
  assert.match(markup, /VEYRA will not switch it/);
});

test("network explorer provides a separate empty watch-only public address inspector", () => {
  const markup = renderNetworks("testnet", { status: "loading" });

  assert.match(markup, /Inspect Public Address/);
  assert.match(markup, /Watch-only/i);
  assert.match(markup, /Testnet · 46630/);
  assert.match(markup, /Mainnet · 4663/);
  assert.match(markup, /name="public-address"/);
  assert.match(markup, /No wallet connection or account permission is used/);
  assert.doesNotMatch(markup, /0xfA142bF0383782Caa349C5C56A7B7D565eEFA562/);
});

test("watch-only copy action uses the explicit Copy Address label", () => {
  const markup = renderToStaticMarkup(createElement(CopyAddressButton, {
    address: "0x0000000000000000000000000000000000000001",
    label: "Copy Address",
  }));
  assert.match(markup, />Copy Address<\/button>/);
});

test("network explorer renders a controlled verified entry without merging wallet addresses", () => {
  const deployment = {
    name: "PQ Smart Account",
    networkId: "testnet",
    chainId: 46_630,
    architectureSlot: 10,
    address: "0x0000000000000000000000000000000000000009",
    deploymentStatus: "verified",
    observedChainId: 46_630,
    deployerAddress: "0x0000000000000000000000000000000000000001",
    transactionHash: `0x${"a".repeat(64)}`,
    receiptStatus: "success",
    blockNumber: "12345",
    runtimeBytecodeHash: `0x${"b".repeat(64)}`,
    sourceVerification: "verified",
  };
  const markup = renderNetworks("testnet", { status: "loading" }, [deployment]);

  assert.match(markup, /PQ Smart Account/);
  assert.match(markup, /0x0000000000000000000000000000000000000009/);
  assert.match(markup, /Source verified/);
  assert.match(markup, /Copy address/);
  assert.match(markup, /Open in Explorer/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.match(markup, /href="https:\/\/explorer\.testnet\.chain\.robinhood\.com\/address\/0x0000000000000000000000000000000000000009"/);
  assert.match(markup, /href="https:\/\/explorer\.testnet\.chain\.robinhood\.com\/tx\/0x[a]{64}"/);
});

test("four verified Testnet manifest entries render as 4/10 while Mainnet stays empty", () => {
  const names = [
    "VeyraTokenPolicyRegistry",
    "VeyraRouterRegistry",
    "VeyraSwapIntentGuard",
    "VeyraSwapExecutor",
  ];
  const records = names.map((name, index) => {
    const slot = index + 6;
    return {
      name,
      purpose: `Verified Testnet fixture for ${name}.`,
      networkId: "testnet",
      chainId: 46_630,
      architectureSlot: slot,
      address: `0x${slot.toString(16).padStart(40, "0")}`,
      deploymentStatus: "verified",
      observedChainId: 46_630,
      deployerAddress: "0x0000000000000000000000000000000000000001",
      transactionHash: `0x${slot.toString(16).padStart(64, "0")}`,
      receiptStatus: "success",
      blockNumber: String(2000 + slot),
      runtimeBytecodeHash: `0x${"a".repeat(63)}${slot.toString(16)}`,
      sourceVerification: "not_verified",
    };
  });
  const markup = renderNetworks("testnet", { status: "loading" }, records);

  assert.match(markup, /<strong>4\/10<\/strong>/);
  assert.match(markup, /<strong>0\/10<\/strong>/);
  assert.equal((markup.match(/<dd>DEPLOYED · INACTIVE<\/dd>/g) ?? []).length, 4);
  assert.equal((markup.match(/<dd>Swap execution disabled<\/dd>/g) ?? []).length, 4);
  assert.equal((markup.match(/<dd>Manifest verified<\/dd>/g) ?? []).length, 4);
  for (const record of records) {
    assert.match(markup, new RegExp(record.name));
    assert.match(markup, new RegExp(record.address));
    assert.match(markup, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/address/${record.address}"`));
    assert.match(markup, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/tx/${record.transactionHash}"`));
    assert.doesNotMatch(markup, new RegExp(`href="https://robinhoodchain\\.blockscout\\.com/(?:address/${record.address}|tx/${record.transactionHash})"`));
  }
});

test("registry keeps Testnet and Mainnet contract and transaction links on their own explorers", () => {
  const testnetAddress = "0x0000000000000000000000000000000000000011";
  const mainnetAddress = "0x0000000000000000000000000000000000000022";
  const testnetTransaction = `0x${"a".repeat(64)}`;
  const mainnetTransaction = `0x${"c".repeat(64)}`;
  const base = {
    name: "VeyraKeyRegistry",
    deploymentStatus: "verified",
    observedChainId: 46_630,
    deployerAddress: "0x0000000000000000000000000000000000000001",
    receiptStatus: "success",
    blockNumber: "12345",
    runtimeBytecodeHash: `0x${"b".repeat(64)}`,
    sourceVerification: "not_verified",
  };
  const markup = renderNetworks("testnet", { status: "loading" }, [
    { ...base, networkId: "testnet", chainId: 46_630, architectureSlot: 2, address: testnetAddress, transactionHash: testnetTransaction },
    { ...base, networkId: "mainnet", chainId: 4_663, observedChainId: 4_663, architectureSlot: 2, address: mainnetAddress, transactionHash: mainnetTransaction },
  ]);

  assert.match(markup, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/address/${testnetAddress}"`));
  assert.match(markup, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/tx/${testnetTransaction}"`));
  assert.match(markup, new RegExp(`href="https://robinhoodchain\\.blockscout\\.com/address/${mainnetAddress}"`));
  assert.match(markup, new RegExp(`href="https://robinhoodchain\\.blockscout\\.com/tx/${mainnetTransaction}"`));
});

test("standalone Evidence Anchor remains linked and does not consume roadmap progress", () => {
  const address = "0x0000000000000000000000000000000000000033";
  const transactionHash = `0x${"d".repeat(64)}`;
  const anchor = {
    name: "VeyraResearchEvidenceAnchor",
    purpose: "Hash-only research evidence anchoring.",
    networkId: "testnet",
    chainId: 46_630,
    address,
    deploymentStatus: "verified",
    observedChainId: 46_630,
    deployerAddress: "0x0000000000000000000000000000000000000001",
    transactionHash,
    receiptStatus: "success",
    blockNumber: "100",
    runtimeBytecodeHash: `0x${"e".repeat(64)}`,
    sourceVerification: "not_verified",
  };
  const markup = renderNetworks("testnet", { status: "loading" }, [], { status: "disconnected" }, [anchor]);

  assert.match(markup, /VeyraResearchEvidenceAnchor/);
  assert.match(markup, /0\/10/);
  assert.match(markup, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/address/${address}"`));
  assert.match(markup, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/tx/${transactionHash}"`));
});

test("the checked-in Evidence Anchor remains visible and links to its Testnet address and transaction", () => {
  const registry = loadVerifiedVeyraDeployments();
  const anchor = registry.standaloneResearchEvidenceAnchors.find((record) => record.networkId === "testnet");
  assert.ok(anchor, "the validated Testnet Evidence Anchor should remain in the manifest registry");
  const markup = renderNetworks("testnet", { status: "loading" }, registry.roadmapContracts, { status: "disconnected" }, [anchor]);

  assert.match(markup, new RegExp(anchor.address));
  assert.match(markup, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/address/${anchor.address}"`));
  assert.match(markup, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/tx/${anchor.transactionHash}"`));
  assert.match(markup, new RegExp(`${registry.roadmapContracts.filter((record) => record.networkId === "testnet").length}/10`));
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
