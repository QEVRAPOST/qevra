import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MainnetExternalInfrastructurePanel } from "@/components/dashboard/NetworksView";
import type { RobinhoodMainnetInfrastructureSnapshot } from "@/features/wallet/public-rpc";

const currentSettler = "0x2222222222222222222222222222222222222222";
const workspaceStyles = readFileSync("src/styles/workspace.css", "utf8");

test("external infrastructure renders configured Mainnet contracts with honest RPC and source states", () => {
  const snapshot: RobinhoodMainnetInfrastructureSnapshot = {
    networkId: "mainnet",
    chainId: 4_663,
    latestBlock: "42",
    observedAt: "2026-10-21T00:00:00.000Z",
    contracts: {
      allowanceHolder: { address: "0x0000000000001fF3684f28c67538d4D072C22734", bytecode: "present" },
      settlerRegistry: { address: "0x00000000000004533Fe15556B1E086BB1A72cEae", bytecode: "present" },
      currentSettler: { address: currentSettler, status: "available", bytecode: "present" },
      weth: { address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", bytecode: "present" },
      usdg: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", bytecode: "absent" },
    },
  };
  const markup = renderToStaticMarkup(createElement(MainnetExternalInfrastructurePanel, {
    selectedNetwork: "mainnet",
    state: { status: "available", snapshot },
    onRefresh() {},
  }));

  for (const address of [
    "0x0000000000001fF3684f28c67538d4D072C22734",
    "0x00000000000004533Fe15556B1E086BB1A72cEae",
    currentSettler,
    "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  ]) {
    assert.match(markup, new RegExp(`href="https://robinhoodchain\\.blockscout\\.com/address/${address}"`));
  }
  assert.match(markup, /Current Settler/);
  assert.match(markup, new RegExp(currentSettler));
  assert.match(markup, /<code><span class="ne-address-full">0x0000000000001fF3684f28c67538d4D072C22734<\/span><span class="ne-address-compact" aria-hidden="true">0x000000…C22734<\/span><\/code>/, "addresses should remain single-line with a compact constrained-width form");
  assert.match(markup, /Bytecode present/);
  assert.match(markup, /Bytecode absent/);
  assert.match(markup, /Observed at Mainnet block 42/);
  assert.match(markup, /Bytecode presence does not verify Solidity source or establish a security audit/);
  assert.match(markup, /Source verification: not checked/);
  assert.match(markup, /Security audit: not assessed/);
  assert.equal((markup.match(/aria-label="Copy address"/g) ?? []).length, 5);
  assert.equal((markup.match(/aria-label="Open explorer"/g) ?? []).length, 5);
  assert.equal((markup.match(/class="ne-icon-action"/g) ?? []).length, 10);
  assert.match(markup, /<td class="ne-contract-actions" data-label="Actions"><div class="ne-infrastructure-actions">/);
  assert.doesNotMatch(markup, /<td class="[^"]*ne-infrastructure-actions/);
  for (const address of [
    "0x0000000000001fF3684f28c67538d4D072C22734",
    "0x00000000000004533Fe15556B1E086BB1A72cEae",
    currentSettler,
    "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  ]) {
    assert.ok(markup.includes(`title="${address}"`), "hover tooltip should expose the full address");
    assert.ok(markup.includes(address), "full address should remain in links and accessible labels");
  }
  assert.doesNotMatch(markup, />Explorer<\/a>/, "infrastructure actions should use compact icon controls");
  assert.doesNotMatch(markup, /explorer\.testnet\.chain\.robinhood\.com/);
});

test("infrastructure dividers span each shared table row instead of the flex action cell", () => {
  assert.match(workspaceStyles, /\.ne-contract-table tbody > tr\.ne-contract\s*\{\s*border-bottom:\s*1px solid var\(--line\);\s*\}/);
  assert.match(workspaceStyles, /\.ne-contract-table tbody > tr\.ne-contract > th,\s*\.ne-contract-table tbody > tr\.ne-contract > td\s*\{[^}]*border-bottom:\s*0;/);
  assert.match(workspaceStyles, /\.ne-infrastructure-actions\s*\{\s*display:\s*flex;/);
  assert.match(workspaceStyles, /@media \(min-width: 641px\) and \(max-width: 900px\)\s*\{\s*\.ne-address-full\s*\{\s*display:\s*none;\s*\}\s*\.ne-address-compact\s*\{\s*display:\s*inline;\s*\}\s*\}/);
  assert.match(workspaceStyles, /\.ne-address-cell code\s*\{[^}]*white-space:\s*nowrap;/);
});

test("four-column VEYRA deployment tables use balanced widths without changing Mainnet infrastructure widths", () => {
  assert.match(workspaceStyles, /\.ne-contract-table thead th:nth-child\(1\) \{ width: 31%; \}\s*\.ne-contract-table thead th:nth-child\(2\) \{ width: 14%; \}\s*\.ne-contract-table thead th:nth-child\(3\) \{ width: 37%; \}\s*\.ne-contract-table thead th:nth-child\(4\) \{ width: 18%; \}/);
  assert.match(workspaceStyles, /\.ne-contract-table\.ne-infrastructure-table thead th:nth-child\(1\) \{ width: 26%; \}\s*\.ne-contract-table\.ne-infrastructure-table thead th:nth-child\(2\) \{ width: 30%; \}\s*\.ne-contract-table\.ne-infrastructure-table thead th:nth-child\(3\) \{ width: 26%; \}\s*\.ne-contract-table\.ne-infrastructure-table thead th:nth-child\(4\) \{ width: 18%; \}/);
});

test("Testnet selection keeps infrastructure labeled Mainnet and does not present a stale Mainnet RPC read", () => {
  const markup = renderToStaticMarkup(createElement(MainnetExternalInfrastructurePanel, {
    selectedNetwork: "testnet",
    state: { status: "not_requested" },
    onRefresh() {},
  }));

  assert.match(markup, /External Infrastructure/);
  assert.match(markup, /Configured third-party contracts on Robinhood Mainnet · chain ID 4663/);
  assert.match(markup, /Bytecode not checked/);
  assert.match(markup, /Select Robinhood Mainnet to read configured contract bytecode/);
  assert.doesNotMatch(markup, />Bytecode present</);
});

test("Mainnet infrastructure RPC failures remain explicit and do not imply code absence", () => {
  const markup = renderToStaticMarkup(createElement(MainnetExternalInfrastructurePanel, {
    selectedNetwork: "mainnet",
    state: { status: "unavailable", message: "The public RPC request timed out." },
    onRefresh() {},
  }));

  assert.match(markup, /The public RPC request timed out\./);
  assert.match(markup, /Bytecode unavailable/);
  assert.doesNotMatch(markup, /Bytecode absent/);
  assert.match(markup, /Retry Mainnet read/);
});
