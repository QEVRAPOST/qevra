import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CopyAddressButton } from "@/components/dashboard/CopyAddressButton";
import { DEFAULT_NETWORK_ID, getExplorerAddressUrl, getExplorerTransactionUrl } from "@/lib/config/networks";
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
  network: "testnet" | "mainnet" = DEFAULT_NETWORK_ID,
  rpc: Record<string, unknown> = { status: "loading" },
  records?: unknown[],
  wallet: Record<string, unknown> = { status: "disconnected" },
  standaloneRecords?: unknown[],
  architectureSlots?: unknown[],
): string {
  const inferredSlots = architectureSlots ?? (records ?? []).flatMap((record) => {
    if (!record || typeof record !== "object") return [];
    const candidate = record as Record<string, unknown>;
    if ((candidate.networkId !== "testnet" && candidate.networkId !== "mainnet")
      || typeof candidate.architectureSlot !== "number"
      || typeof candidate.name !== "string") return [];
    return [{
      networkId: candidate.networkId,
      slot: candidate.architectureSlot,
      solidityName: candidate.name,
      readiness: "blocked",
      reason: typeof candidate.purpose === "string" ? candidate.purpose : "Fixture blocker.",
    }];
  });
  return execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { ModelContext } from "./src/components/dashboard/AppModelContext.tsx"; import { NetworksView } from "./src/components/dashboard/NetworksView.tsx"; import { buildLiveAppModel } from "./src/features/dashboard/live-model.ts"; const model = buildLiveAppModel({ wallet: ${JSON.stringify(wallet)}, selectedNetwork: ${JSON.stringify(network)}, networkRpc: ${JSON.stringify(rpc)}, runs: null, accessState: "unauthenticated", isRefreshing: false, isCreating: false }); const value = { model, actions: { setNetwork() {}, setAmount() {}, pressSwapButton() {}, pressWalletButton() {}, pressLedgerAction() {}, refreshWallet() {}, refreshNetwork() {}, createSecurityRun() {}, logout() {} } }; process.stdout.write(renderToStaticMarkup(createElement(ModelContext.Provider, { value }, createElement(NetworksView, { deploymentRecords: ${JSON.stringify(records)}, standaloneResearchEvidenceAnchors: ${JSON.stringify(standaloneRecords)}, architectureSlots: ${JSON.stringify(inferredSlots)} }))))`,
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

test("the registry defaults to Testnet and follows the selected network without showing a second registry", () => {
  const testnetMarkup = renderNetworks();
  const mainnetMarkup = renderNetworks("mainnet");

  assert.equal(DEFAULT_NETWORK_ID, "testnet");
  assert.match(testnetMarkup, /aria-pressed="true">Robinhood Testnet · 46630/);
  assert.match(testnetMarkup, /<strong>0\/10<\/strong> deployed/);
  assert.match(testnetMarkup, /id="h-ne-registry-testnet"/);
  assert.doesNotMatch(testnetMarkup, /id="h-ne-registry-mainnet"/);
  assert.match(mainnetMarkup, /aria-pressed="true">Robinhood Mainnet · 4663/);
  assert.match(mainnetMarkup, /id="h-ne-registry-mainnet"/);
  assert.doesNotMatch(mainnetMarkup, /id="h-ne-registry-testnet"/);
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

  assert.match(markup, /<table class="ne-contract-table" aria-label="Architecture slot status on Robinhood Testnet">/);
  for (const column of ["Contract", "Deployment", "Contract Address", "Readiness", "Actions"]) {
    assert.match(markup, new RegExp(`<th scope="col">${column}<\\/th>`));
  }
  for (const omitted of ["Network", "On-chain", "Source Verification", "Operational Readiness"]) {
    assert.doesNotMatch(markup, new RegExp(`<th scope="col">${omitted}</th>`));
  }
  assert.match(markup, /PQ Smart Account/);
  assert.match(markup, /<td class="ne-address-cell" data-label="Contract Address"><a[^>]+><code>0x0000000000000000000000000000000000000009<\/code><\/a><\/td>/);
  assert.doesNotMatch(markup, /0x0000…0009/);
  assert.match(markup, /title="0x0000000000000000000000000000000000000009"/);
  assert.match(markup, /<dt>Source verification<\/dt><dd>VERIFIED<\/dd>/);
  assert.match(markup, /aria-label="Copy address"/);
  assert.match(markup, /data-tooltip="Copy address"/);
  assert.match(markup, /aria-label="View contract"/);
  assert.match(markup, /data-tooltip="View contract"/);
  assert.match(markup, /aria-label="View transaction"/);
  assert.match(markup, /data-tooltip="View transaction"/);
  assert.match(markup, /aria-live="polite"/);
  for (const label of ["Copy address", "View contract", "View transaction"]) {
    const action = markup.match(new RegExp(`aria-label="${label}" aria-describedby="([^"]+)" data-tooltip="${label}"`));
    assert.ok(action, `${label} should expose an accessible description`);
    assert.ok(markup.includes(`id="${action[1]}" role="tooltip">${label}</span>`), `${label} tooltip should be linked for keyboard and screen reader users`);
  }
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.match(markup, /href="https:\/\/explorer\.testnet\.chain\.robinhood\.com\/address\/0x0000000000000000000000000000000000000009"/);
  assert.match(markup, /href="https:\/\/explorer\.testnet\.chain\.robinhood\.com\/tx\/0x[a]{64}"/);
  assert.doesNotMatch(markup, />Open in Explorer</);
  assert.doesNotMatch(markup, />View deployment transaction</);
});

test("contract rows expose a keyboard-operable details toggle and retain full deployment evidence", () => {
  const address = "0x0000000000000000000000000000000000000009";
  const tx = `0x${"a".repeat(64)}`;
  const hash = `0x${"b".repeat(64)}`;
  const markup = renderNetworks("testnet", { status: "loading" }, [{
    name: "VeyraTokenPolicyRegistry",
    purpose: "Registers approved Robinhood tokens for read-only policy checks.",
    networkId: "testnet",
    chainId: 46_630,
    architectureSlot: 6,
    address,
    deploymentStatus: "verified",
    observedChainId: 46_630,
    deployerAddress: "0x0000000000000000000000000000000000000001",
    transactionHash: tx,
    receiptStatus: "success",
    blockNumber: "12345",
    runtimeBytecodeHash: hash,
    sourceVerification: "not_verified",
  }]);

  assert.match(markup, /aria-label="Show details for VeyraTokenPolicyRegistry"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-controls="[^\"]+"/);
  assert.match(markup, /class="ne-detail-row" id="[^"]+" hidden=""/);
  for (const value of [address, tx, "0x0000000000000000000000000000000000000001", "12345", hash,
    "Verified on-chain record", "NOT VERIFIED", "Registers approved Robinhood tokens for read-only policy checks.", "Swap execution is disabled"]) {
    assert.ok(markup.includes(value), `${value} should remain available in contract details`);
  }
});

test("deployed Testnet fixture records render from their actual count without a Mainnet registry", () => {
  const names = [
    "VeyraTokenPolicyRegistry",
    "VeyraRouterRegistry",
    "VeyraSwapIntentGuard",
    "VeyraSwapExecutor",
    "VeyraResearchAttestationRegistry",
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
  const deploymentCount = records.length;
  const inactiveCount = records.filter((record) => record.architectureSlot >= 6 && record.architectureSlot <= 9).length;
  const blockedCount = deploymentCount - inactiveCount;

  assert.match(markup, new RegExp(`<strong>${deploymentCount}\\/10<\\/strong> deployed`));
  assert.doesNotMatch(markup, /<strong>0\/10<\/strong> deployed/);
  assert.doesNotMatch(markup, /id="h-ne-registry-mainnet"/);
  assert.equal((markup.match(/>DEPLOYED<\/span>/g) ?? []).length, deploymentCount);
  assert.equal((markup.match(/<dd>NOT VERIFIED<\/dd>/g) ?? []).length, deploymentCount);
  assert.equal((markup.match(/>INACTIVE<\/span>/g) ?? []).length, inactiveCount);
  assert.equal((markup.match(/>SECURITY BLOCKED<\/span>/g) ?? []).length, blockedCount);
  assert.equal((markup.match(/<dd>Verified on-chain record<\/dd>/g) ?? []).length, deploymentCount);
  for (const record of records) {
    assert.match(markup, new RegExp(record.name));
    assert.match(markup, new RegExp(record.address));
    assert.match(markup, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/address/${record.address}"`));
    assert.match(markup, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/tx/${record.transactionHash}"`));
    assert.doesNotMatch(markup, new RegExp(`href="https://robinhoodchain\\.blockscout\\.com/(?:address/${record.address}|tx/${record.transactionHash})"`));
  }
});

test("Networks renders all ten slots for only the selected network and keeps three status dimensions separate", () => {
  const registry = loadVerifiedVeyraDeployments();
  const testnetMarkup = renderNetworks(
    "testnet",
    { status: "loading" },
    registry.roadmapContracts,
    { status: "disconnected" },
    registry.standaloneResearchEvidenceAnchors,
    registry.architectureSlots,
  );
  const mainnetMarkup = renderNetworks(
    "mainnet",
    { status: "loading" },
    registry.roadmapContracts,
    { status: "disconnected" },
    registry.standaloneResearchEvidenceAnchors,
    registry.architectureSlots,
  );
  const tableFor = (markup: string, label: string) => {
    const start = markup.indexOf(`<table class="ne-contract-table" aria-label="Architecture slot status on ${label}">`);
    assert.notEqual(start, -1, `${label} architecture table should render`);
    const end = markup.indexOf("</table>", start);
    return markup.slice(start, end + "</table>".length);
  };
  const testnetTable = tableFor(testnetMarkup, "Robinhood Testnet");
  const mainnetTable = tableFor(mainnetMarkup, "Robinhood Mainnet");
  const rowCount = (table: string) => (table.match(/class="ne-contract"/g) ?? []).length;
  const testnetRecords = registry.roadmapContracts.filter((record) => record.networkId === "testnet");
  const mainnetRecords = registry.roadmapContracts.filter((record) => record.networkId === "mainnet");
  const testnetSlots = registry.architectureSlots.filter((slot) => slot.networkId === "testnet");
  const mainnetSlots = registry.architectureSlots.filter((slot) => slot.networkId === "mainnet");
  const readinessCounts = (networkId: "testnet" | "mainnet") => {
    const slots = registry.architectureSlots.filter((slot) => slot.networkId === networkId);
    const records = registry.roadmapContracts.filter((record) => record.networkId === networkId);
    return slots.reduce<Record<string, number>>((counts, slot) => {
      const deployed = records.some((record) => record.architectureSlot === slot.slot);
      const readiness = (slot.readiness ?? "").toLowerCase();
      const status = deployed && slot.slot >= 6 && slot.slot <= 9
        ? "INACTIVE"
        : readiness === "active" || readiness === "ready"
          ? "ACTIVE"
          : readiness === "blocked" || readiness === "hard_no_go"
            ? "SECURITY BLOCKED"
            : "INACTIVE";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});
  };
  assert.equal(testnetSlots.length, 10);
  assert.equal(mainnetSlots.length, 10);
  assert.equal(rowCount(testnetTable), testnetSlots.length);
  assert.equal(rowCount(mainnetTable), mainnetSlots.length);
  assert.equal(testnetRecords.length, 5, "the validated Testnet manifest currently contains five architecture deployments");
  assert.equal(mainnetRecords.length, 0, "the validated Mainnet manifest currently contains no architecture deployments");
  assert.match(testnetMarkup, new RegExp(`<strong>${testnetRecords.length}\\/10<\\/strong> deployed`));
  assert.match(mainnetMarkup, new RegExp(`<strong>${mainnetRecords.length}\\/10<\\/strong> deployed`));
  assert.match(testnetMarkup, new RegExp(`aria-label="${testnetRecords.length} of 10 architecture contracts deployed based on verified on-chain records"`));
  assert.match(testnetMarkup, /manifest-verified on-chain records only/i);
  assert.doesNotMatch(testnetMarkup, /Architecture slot status on Robinhood Mainnet/);
  assert.doesNotMatch(mainnetMarkup, /Architecture slot status on Robinhood Testnet/);
  assert.doesNotMatch(testnetTable, new RegExp("<th scope=\"col\">Source Verification</th>"));
  assert.match(testnetTable, new RegExp("<dt>Source verification</dt><dd>NOT VERIFIED</dd>"));
  assert.equal((testnetTable.match(/>DEPLOYED<\/span>/g) ?? []).length, testnetRecords.length);
  assert.equal((testnetTable.match(/aria-label="Copy address"/g) ?? []).length, testnetRecords.length);
  assert.equal((testnetTable.match(/>NOT DEPLOYED<\/span>/g) ?? []).length, testnetSlots.length - testnetRecords.length);
  assert.equal((testnetTable.match(/<dd>NOT VERIFIED<\/dd>/g) ?? []).length, testnetRecords.filter((record) => record.sourceVerification === "not_verified").length);
  assert.equal((testnetTable.match(/<dd>NOT APPLICABLE<\/dd>/g) ?? []).length, testnetSlots.length - testnetRecords.length);
  assert.equal((testnetTable.match(/>INACTIVE<\/span>/g) ?? []).length, readinessCounts("testnet").INACTIVE ?? 0);
  assert.equal((testnetTable.match(/>SECURITY BLOCKED<\/span>/g) ?? []).length, readinessCounts("testnet")["SECURITY BLOCKED"] ?? 0);
  assert.equal((mainnetTable.match(/>NOT DEPLOYED<\/span>/g) ?? []).length, mainnetSlots.length - mainnetRecords.length);
  assert.equal((mainnetTable.match(/<dd>NOT APPLICABLE<\/dd>/g) ?? []).length, mainnetSlots.length - mainnetRecords.length);
  assert.equal((mainnetTable.match(/>SECURITY BLOCKED<\/span>/g) ?? []).length, readinessCounts("mainnet")["SECURITY BLOCKED"] ?? 0);

  for (const slot of registry.architectureSlots.filter((item) => item.networkId === "testnet")) {
    assert.ok(testnetTable.includes(slot.solidityName));
    assert.ok(testnetTable.includes(slot.reason ?? ""));
  }
  for (const record of registry.roadmapContracts.filter((item) => item.networkId === "testnet")) {
    assert.ok(testnetTable.includes(`<code>${record.address}</code>`));
    assert.match(testnetTable, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/address/${record.address}"`));
    assert.match(testnetTable, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/tx/${record.transactionHash}"`));
  }
  const standaloneTableStart = testnetMarkup.indexOf('<table class="ne-contract-table" aria-label="Standalone research utility deployments on Robinhood Testnet">');
  assert.notEqual(standaloneTableStart, -1);
  const standaloneTableEnd = testnetMarkup.indexOf("</table>", standaloneTableStart);
  const standaloneTable = testnetMarkup.slice(standaloneTableStart, standaloneTableEnd);
  assert.match(standaloneTable, /VeyraResearchEvidenceAnchor/);
  assert.match(standaloneTable, /<dd>NOT VERIFIED<\/dd>/);
});

test("all validated Testnet addresses are fully visible in their Contract Address cells", () => {
  const registry = loadVerifiedVeyraDeployments();
  const records = registry.roadmapContracts.filter((record) => record.networkId === "testnet");
  const slotTen = records.find((record) => record.architectureSlot === 10);
  assert.ok(slotTen, "the validated Testnet manifest should include architecture slot 10");
  assert.equal(slotTen.address, "0x61c3DC95B31977e6F3a3373eC5BAb52477E96Ba2");

  const markup = renderNetworks(
    "testnet",
    { status: "loading" },
    registry.roadmapContracts,
    { status: "disconnected" },
    registry.standaloneResearchEvidenceAnchors,
    registry.architectureSlots,
  );
  const tableStart = markup.indexOf('<table class="ne-contract-table" aria-label="Architecture slot status on Robinhood Testnet">');
  assert.notEqual(tableStart, -1, "the Testnet architecture table should render");
  const tableEnd = markup.indexOf("</table>", tableStart);
  const table = markup.slice(tableStart, tableEnd + "</table>".length);

  for (const record of records) {
    const nameOffset = table.indexOf(`<strong>${record.name}</strong>`);
    assert.notEqual(nameOffset, -1, `${record.name} should have a visible architecture row`);
    const rowStart = table.lastIndexOf('<tr class="ne-contract">', nameOffset);
    const rowEnd = table.indexOf("</tr>", nameOffset);
    const row = table.slice(rowStart, rowEnd + "</tr>".length);
    const cellStart = row.indexOf('<td class="ne-address-cell" data-label="Contract Address">');
    const cellEnd = row.indexOf("</td>", cellStart);
    assert.notEqual(cellStart, -1, `${record.name} should have a Contract Address cell`);
    const addressCell = row.slice(cellStart, cellEnd + "</td>".length);

    assert.ok(addressCell.includes(`<code>${record.address}</code>`), `${record.name} should show all 42 address characters in the table cell`);
    assert.match(addressCell, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/address/${record.address}"`));
    assert.doesNotMatch(addressCell, /…|\.\.\./, `${record.name} must not abbreviate its address`);
    assert.match(row, /aria-label="Copy address"/);
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
  const records = [
    { ...base, networkId: "testnet", chainId: 46_630, architectureSlot: 2, address: testnetAddress, transactionHash: testnetTransaction },
    { ...base, networkId: "mainnet", chainId: 4_663, observedChainId: 4_663, architectureSlot: 2, address: mainnetAddress, transactionHash: mainnetTransaction },
  ];
  const testnetMarkup = renderNetworks("testnet", { status: "loading" }, records);
  const mainnetMarkup = renderNetworks("mainnet", { status: "loading" }, records);

  assert.match(testnetMarkup, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/address/${testnetAddress}"`));
  assert.match(testnetMarkup, new RegExp(`href="https://explorer\\.testnet\\.chain\\.robinhood\\.com/tx/${testnetTransaction}"`));
  assert.doesNotMatch(testnetMarkup, /robinhoodchain\\.blockscout\\.com/);
  assert.match(mainnetMarkup, new RegExp(`href="https://robinhoodchain\\.blockscout\\.com/address/${mainnetAddress}"`));
  assert.match(mainnetMarkup, new RegExp(`href="https://robinhoodchain\\.blockscout\\.com/tx/${mainnetTransaction}"`));
  assert.doesNotMatch(mainnetMarkup, /explorer\\.testnet\\.chain\\.robinhood\\.com/);
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

  const tableStart = markup.indexOf('<table class="ne-contract-table" aria-label="Standalone research utility deployments on Robinhood Testnet">');
  assert.notEqual(tableStart, -1);
  const tableEnd = markup.indexOf("</table>", tableStart);
  const table = markup.slice(tableStart, tableEnd + "</table>".length);
  const nameOffset = table.indexOf(`<strong>${anchor.name}</strong>`);
  assert.notEqual(nameOffset, -1);
  const rowStart = table.lastIndexOf('<tr class="ne-contract">', nameOffset);
  const rowEnd = table.indexOf("</tr>", nameOffset);
  const row = table.slice(rowStart, rowEnd + "</tr>".length);
  const cellStart = row.indexOf('<td class="ne-address-cell" data-label="Contract Address">');
  const cellEnd = row.indexOf("</td>", cellStart);
  const addressCell = row.slice(cellStart, cellEnd + "</td>".length);
  assert.ok(addressCell.includes(`<code>${anchor.address}</code>`), "the full Evidence Anchor address should be visible in its address cell");
  assert.doesNotMatch(addressCell, /…|\.\.\./);
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
