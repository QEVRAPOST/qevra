import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CopyAddressButton } from "@/components/dashboard/CopyAddressButton";
import { PublicAddressActionButton, PublicAddressResult, publicAddressActionLabel } from "@/components/dashboard/PublicAddressInspector";
import { getExplorerTransactionUrl } from "@/lib/config/networks";
import type { VerifiedVeyraDeployment, VerifiedVeyraStandaloneDeployment } from "@/lib/config/veyra-deployments";

function deployment(networkId: "testnet" | "mainnet", index: number): VerifiedVeyraDeployment {
  const chainId = networkId === "testnet" ? 46_630 : 4_663;
  const address = `0x${index.toString(16).padStart(40, "0")}` as `0x${string}`;
  return {
    name: `${networkId} contract ${index}`,
    purpose: `Purpose for ${networkId} contract ${index}.`,
    architectureSlot: ((index - 1) % 10) + 1,
    networkId,
    chainId,
    address,
    deploymentStatus: "verified",
    observedChainId: chainId,
    deployerAddress: `0x${"1".repeat(40)}`,
    transactionHash: `0x${index.toString(16).padStart(64, "a")}` as `0x${string}`,
    receiptStatus: "success",
    blockNumber: String(index),
    runtimeBytecodeHash: `0x${"b".repeat(64)}`,
  };
}

function renderNetworks(
  records: readonly VerifiedVeyraDeployment[],
  selectedNetwork: "testnet" | "mainnet" = "testnet",
  standaloneResearchEvidenceAnchor?: VerifiedVeyraStandaloneDeployment,
): string {
  const slotsByNetworkAndNumber = new Map<string, {
    networkId: VerifiedVeyraDeployment["networkId"];
    slot: number;
    solidityName: string;
    readiness: string;
    reason: string;
  }>();
  for (const record of records) {
    const key = `${record.networkId}:${record.architectureSlot}`;
    if (slotsByNetworkAndNumber.has(key)) continue;
    slotsByNetworkAndNumber.set(key, {
      networkId: record.networkId,
      slot: record.architectureSlot,
      solidityName: record.name,
      readiness: "blocked",
      reason: record.purpose ?? "Fixture blocker.",
    });
  }
  const architectureSlots = [...slotsByNetworkAndNumber.values()];
  const source = [
    'import { createElement } from "react"',
    'import { renderToStaticMarkup } from "react-dom/server"',
    'import { ModelContext } from "./src/components/dashboard/AppModelContext.tsx"',
    'import { NetworksView } from "./src/components/dashboard/NetworksView.tsx"',
    'import { buildLiveAppModel } from "./src/features/dashboard/live-model.ts"',
    `const model = buildLiveAppModel({ wallet: { status: "disconnected" }, selectedNetwork: ${JSON.stringify(selectedNetwork)}, networkRpc: { status: "available", chainId: ${selectedNetwork === "testnet" ? 46630 : 4663}, latestBlock: "123", observedAt: "2026-10-21T00:00:00.000Z" }, runs: null, accessState: "unauthenticated", isRefreshing: false, isCreating: false })`,
    'const value = { model, actions: { setNetwork() {}, setAmount() {}, pressSwapButton() {}, pressWalletButton() {}, pressLedgerAction() {}, refreshWallet() {}, refreshNetwork() {}, createSecurityRun() {}, logout() {} } }',
    `process.stdout.write(renderToStaticMarkup(createElement(ModelContext.Provider, { value }, createElement(NetworksView, { deploymentRecords: ${JSON.stringify(records)}, standaloneResearchEvidenceAnchors: ${JSON.stringify(standaloneResearchEvidenceAnchor ? [standaloneResearchEvidenceAnchor] : [])}, architectureSlots: ${JSON.stringify(architectureSlots)} }))))`,
  ].join(";\n");
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", source], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

test("Networks explorer action controls use the shared Aperture button typography", () => {
  const networkMarkup = renderNetworks([]);
  const controls = [
    [networkMarkup, "Refresh public RPC"],
    [networkMarkup, "Open Testnet explorer"],
    [networkMarkup, "Inspect Address"],
  ] as const;
  for (const [markup, label] of controls) {
    const position = markup.indexOf(label);
    assert.notEqual(position, -1, `${label} should be rendered`);
    const tagStart = Math.max(markup.lastIndexOf("<button", position), markup.lastIndexOf("<a", position));
    const openingTag = markup.slice(tagStart, markup.indexOf(">", tagStart) + 1);
    assert.match(openingTag, /font-sans/);
    assert.match(openingTag, /text-sm/);
    assert.doesNotMatch(openingTag, /font-mono/);
  }

  const copyMarkup = renderToStaticMarkup(createElement(CopyAddressButton, {
    address: "0x0000000000000000000000000000000000000001",
  }));
  assert.match(copyMarkup, /class="[^"]*font-sans[^"]*text-sm/);
  assert.doesNotMatch(copyMarkup, /font-mono/);
});

test("watch-only balance controls keep their action labels and shared button typography", () => {
  const available = { status: "available" as const, snapshot: {
    networkId: "testnet" as const,
    chainId: 46_630,
    address: "0x0000000000000000000000000000000000000001" as `0x${string}`,
    balanceWei: "10000000000000000",
    observedBlock: "123",
    observedAt: "2026-10-21T00:00:00.000Z",
  } };
  assert.equal(publicAddressActionLabel(available), "Refresh public balance");
  const actionMarkup = renderToStaticMarkup(createElement(PublicAddressActionButton, { state: available }));
  assert.match(actionMarkup, /Refresh public balance/);
  assert.match(actionMarkup, /class="[^"]*font-sans[^"]*text-sm/);
  assert.doesNotMatch(actionMarkup, /font-mono/);
  const loadingMarkup = renderToStaticMarkup(createElement(PublicAddressActionButton, { state: { status: "loading" } }));
  assert.match(loadingMarkup, /disabled=""/);
  assert.match(loadingMarkup, /Reading public address/);

  const markup = renderToStaticMarkup(createElement(PublicAddressResult, { snapshot: {
    networkId: "testnet",
    chainId: 46_630,
    address: "0x0000000000000000000000000000000000000001",
    balanceWei: "10000000000000000",
    observedBlock: "123",
    observedAt: "2026-10-21T00:00:00.000Z",
  } }));
  assert.match(markup, /Watch-only address/);
  assert.match(markup, /Open in Explorer/);
  assert.match(markup, /font-sans/);
  assert.doesNotMatch(markup, /font-mono/);
});

test("deployment registry follows the selected network, caps slots at ten, and exposes provenance", () => {
  const records = [
    ...Array.from({ length: 11 }, (_, index) => deployment("testnet", index + 1)),
    deployment("mainnet", 101),
  ];
  const testnetMarkup = renderNetworks(records);
  const mainnetMarkup = renderNetworks(records, "mainnet");
  const networkRegistrySection = (markup: string) => {
    const start = markup.indexOf('class="ne-section ne-registry"');
    const end = markup.indexOf('class="ne-section ne-infrastructure"', start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    return markup.slice(start, end);
  };
  const testnetRegistry = networkRegistrySection(testnetMarkup);
  const mainnetRegistry = networkRegistrySection(mainnetMarkup);

  assert.match(testnetMarkup, /Robinhood Testnet/);
  assert.doesNotMatch(testnetMarkup, /id="h-ne-registry-mainnet"/);
  assert.equal((testnetRegistry.match(/class="ne-contract"/g) ?? []).length, 10);
  assert.equal((testnetMarkup.match(/class="ne-contract"/g) ?? []).length, 15, "the five read-only infrastructure rows stay outside the ten architecture rows");
  assert.match(testnetMarkup, /testnet contract 10/);
  assert.doesNotMatch(testnetMarkup, /testnet contract 11/);
  assert.doesNotMatch(testnetMarkup, /mainnet contract 101/);
  assert.match(testnetMarkup, /Purpose for testnet contract 1\./);
  assert.match(testnetMarkup, /Full contract address/);
  assert.match(testnetMarkup, /5\/5<\/strong> MVP contracts deployed/);
  assert.match(testnetMarkup, /Deployer/);
  assert.match(testnetMarkup, /Block number/);
  assert.match(testnetMarkup, /Verified on-chain record/);
  assert.match(testnetMarkup, /NOT REPORTED/);
  assert.match(testnetMarkup, /aria-label="View deployment evidence"/);
  assert.match(testnetMarkup, /\/tx\/0x/);
  assert.match(testnetMarkup, /aria-label="Open explorer"/);
  assert.equal((mainnetRegistry.match(/class="ne-contract"/g) ?? []).length, 1);
  assert.match(mainnetMarkup, /mainnet contract 101/);
  assert.doesNotMatch(mainnetMarkup, /testnet contract 1/);
  assert.match(mainnetMarkup, /0\/5<\/strong> MVP contracts deployed/);
});

test("empty deployment manifests show independent zero-of-five MVP progress", () => {
  const markup = renderNetworks([]);
  assert.match(markup, /No verified VEYRA MVP deployments\./);
  assert.equal((markup.match(/0\/5/g) ?? []).length, 1);
  assert.match(markup, /No deployed VEYRA MVP contracts on Robinhood Testnet\./);
  assert.doesNotMatch(markup, /No deployed VEYRA MVP contracts on Robinhood Mainnet\./);
});

test("standalone Evidence Anchor is displayed separately and excluded from roadmap progress", () => {
  const anchor: VerifiedVeyraStandaloneDeployment = {
    name: "VeyraResearchEvidenceAnchor",
    purpose: "Anchors hashes only; it does not attest to research truth.",
    networkId: "testnet",
    chainId: 46_630,
    address: "0x0000000000000000000000000000000000000001",
    deploymentStatus: "verified",
    observedChainId: 46_630,
    deployerAddress: `0x${"1".repeat(40)}`,
    transactionHash: `0x${"a".repeat(64)}`,
    receiptStatus: "success",
    blockNumber: "1",
    runtimeBytecodeHash: `0x${"b".repeat(64)}`,
  };
  const markup = renderNetworks([], "testnet", anchor);

  assert.match(markup, /VeyraResearchEvidenceAnchor/);
  assert.match(markup, /Standalone research utility/i);
  assert.match(markup, /excluded from the five-contract MVP progress/i);
  assert.match(markup, /0\/5/);
  assert.match(markup, /Full contract address/);
  assert.match(markup, /Deployer/);
  assert.match(markup, /Block number/);
  assert.match(markup, /aria-label="View deployment evidence"/);
});

test("transaction explorer URLs accept only hashes for configured public networks", () => {
  const hash = `0x${"a".repeat(64)}`;
  assert.equal(getExplorerTransactionUrl("testnet", hash), `https://explorer.testnet.chain.robinhood.com/tx/${hash}`);
  assert.equal(getExplorerTransactionUrl("mainnet", hash), `https://robinhoodchain.blockscout.com/tx/${hash}`);
  assert.equal(getExplorerTransactionUrl("testnet", "not-a-hash"), undefined);
});
