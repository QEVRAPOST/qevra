import assert from "node:assert/strict";
import { test } from "node:test";
import { parseVerifiedVeyraManifest, type VeyraDeploymentManifest } from "@/lib/config/veyra-deployment-manifest";
import { loadVerifiedVeyraDeployments } from "@/lib/config/load-veyra-deployments";

function verifiedContract(overrides: Record<string, unknown> = {}) {
  return {
    solidityName: "VeyraResearchAttestationRegistry",
    purpose: "Stores approved research report attestations.",
    address: "0x0000000000000000000000000000000000000009",
    deploymentStatus: "verified",
    observedChainId: 46_630,
    deployerAddress: "0x0000000000000000000000000000000000000001",
    transactionHash: `0x${"a".repeat(64)}`,
    receiptStatus: "success",
    blockNumber: "12345",
    runtimeBytecodeHash: `0x${"b".repeat(64)}`,
    sourceVerification: "not_verified",
    ...overrides,
  };
}

function manifest(networkId: "testnet" | "mainnet", contracts: unknown[]): VeyraDeploymentManifest {
  return {
    schema: "veyra-contract-manifest-v1",
    project: "VEYRA",
    networkId,
    chainId: networkId === "testnet" ? 46_630 : 4_663,
    rpcAlias: `robinhood_${networkId}`,
    explorerBaseUrl: networkId === "testnet"
      ? "https://explorer.testnet.chain.robinhood.com"
      : "https://robinhoodchain.blockscout.com",
    deploymentStatus: contracts.length ? "verified_deployments" : "no_verified_deployments",
    sourceVerification: contracts.length ? "not_verified" : "not_applicable",
    contracts,
    architectureSlots: [
      "VeyraKeyRegistrationValidator",
      "VeyraKeyRegistry",
      "VeyraRecoveryPolicy",
      "VeyraAccount",
      "VeyraAccountFactory",
      "VeyraTokenPolicyRegistry",
      "VeyraRouterRegistry",
      "VeyraSwapIntentGuard",
      "VeyraSwapExecutor",
      "VeyraResearchAttestationRegistry",
    ].map((solidityName, index) => ({ slot: index + 1, solidityName, readiness: "blocked", reason: "Fixture." })),
  } as VeyraDeploymentManifest;
}

test("manifest adapter maps verified evidence from each chain-specific manifest", () => {
  const testnet = parseVerifiedVeyraManifest("testnet", manifest("testnet", [verifiedContract()]));
  const mainnet = parseVerifiedVeyraManifest("mainnet", manifest("mainnet", [verifiedContract({
    address: "0x0000000000000000000000000000000000000010",
    observedChainId: 4_663,
  })]));

  assert.equal(testnet.roadmapContracts.length, 1);
  assert.deepEqual(testnet.roadmapContracts[0], {
    name: "VeyraResearchAttestationRegistry",
    purpose: "Stores approved research report attestations.",
    architectureSlot: 10,
    networkId: "testnet",
    chainId: 46_630,
    address: "0x0000000000000000000000000000000000000009",
    deploymentStatus: "verified",
    observedChainId: 46_630,
    deployerAddress: "0x0000000000000000000000000000000000000001",
    transactionHash: `0x${"a".repeat(64)}`,
    receiptStatus: "success",
    blockNumber: "12345",
    runtimeBytecodeHash: `0x${"b".repeat(64)}`,
    sourceVerification: "not_verified",
  });
  assert.equal(mainnet.roadmapContracts[0]?.networkId, "mainnet");
  assert.equal(mainnet.roadmapContracts[0]?.chainId, 4_663);
  assert.deepEqual(parseVerifiedVeyraManifest("testnet", manifest("testnet", [])).roadmapContracts, []);
});

test("manifest adapter excludes unverified, incomplete, and cross-network records", () => {
  const records = [
    verifiedContract({ deploymentStatus: "planned" }),
    verifiedContract({ receiptStatus: "reverted" }),
    verifiedContract({ observedChainId: 4_663 }),
    verifiedContract({ address: "0xnot-an-address" }),
    verifiedContract({ runtimeBytecodeHash: `0x${"0".repeat(64)}` }),
    verifiedContract({ networkId: "mainnet", chainId: 4_663 }),
    verifiedContract(),
  ];

  const parsed = parseVerifiedVeyraManifest("testnet", manifest("testnet", records));
  assert.equal(parsed.roadmapContracts.length, 1);
  assert.equal(parsed.roadmapContracts[0]?.networkId, "testnet");
});

test("manifest adapter rejects the wrong project, schema, and chain envelope", () => {
  const wrongProject = { ...manifest("testnet", [verifiedContract()]), project: "OTHER" };
  const wrongSchema = { ...manifest("testnet", [verifiedContract()]), schema: "unknown" };
  const wrongChain = { ...manifest("testnet", [verifiedContract()]), chainId: 4_663 };
  const missingArchitectureSlots = {
    ...manifest("testnet", [verifiedContract()]),
    architectureSlots: undefined,
    standaloneResearchEvidenceAnchor: verifiedContract({ solidityName: "VeyraResearchEvidenceAnchor" }),
  };

  assert.deepEqual(parseVerifiedVeyraManifest("testnet", wrongProject).roadmapContracts, []);
  assert.deepEqual(parseVerifiedVeyraManifest("testnet", wrongSchema).roadmapContracts, []);
  assert.deepEqual(parseVerifiedVeyraManifest("testnet", wrongChain).roadmapContracts, []);
  assert.deepEqual(parseVerifiedVeyraManifest("testnet", missingArchitectureSlots).roadmapContracts, []);
  assert.equal(parseVerifiedVeyraManifest("testnet", missingArchitectureSlots).standaloneResearchEvidenceAnchor, undefined);
  assert.deepEqual(parseVerifiedVeyraManifest("mainnet", manifest("testnet", [verifiedContract()])).roadmapContracts, []);
});

test("standalone Evidence Anchor uses its manifest field and does not consume a roadmap slot", () => {
  const anchor = {
    solidityName: "VeyraResearchEvidenceAnchor",
    purpose: "Anchors report and run hashes without attesting to their truth.",
    networkId: "testnet",
    chainId: 46_630,
    readiness: "verified",
    deploymentStatus: "verified",
    address: "0x0000000000000000000000000000000000000011",
    deployerAddress: "0x0000000000000000000000000000000000000001",
    transactionHash: `0x${"c".repeat(64)}`,
    blockNumber: "54321",
    runtimeBytecodeHash: `0x${"d".repeat(64)}`,
    sourceVerification: "not_verified",
  };
  const parsed = parseVerifiedVeyraManifest("testnet", {
    ...manifest("testnet", []),
    standaloneResearchEvidenceAnchor: anchor,
  });

  assert.deepEqual(parsed.roadmapContracts, []);
  assert.equal(parsed.standaloneResearchEvidenceAnchor?.name, "VeyraResearchEvidenceAnchor");
  assert.equal(parsed.standaloneResearchEvidenceAnchor?.address, anchor.address);
  assert.equal(parsed.standaloneResearchEvidenceAnchor?.networkId, "testnet");
  assert.equal(parsed.standaloneResearchEvidenceAnchor?.sourceVerification, "not_verified");
});

test("unverified and Mainnet Evidence Anchor candidates never appear as deployments", () => {
  const unverified = {
    solidityName: "VeyraResearchEvidenceAnchor",
    networkId: "testnet",
    chainId: 46_630,
    deploymentStatus: "not_deployed",
    address: "",
  };
  const mainnetCandidate = {
    solidityName: "VeyraResearchEvidenceAnchor",
    networkId: "mainnet",
    chainId: 4_663,
    deploymentStatus: "verified",
    address: "0x0000000000000000000000000000000000000011",
  };
  const testnet = parseVerifiedVeyraManifest("testnet", {
    ...manifest("testnet", []),
    standaloneResearchEvidenceAnchor: unverified,
  });
  const mainnet = parseVerifiedVeyraManifest("mainnet", {
    ...manifest("mainnet", []),
    standaloneResearchEvidenceAnchor: mainnetCandidate,
  });

  assert.equal(testnet.standaloneResearchEvidenceAnchor, undefined);
  assert.equal(mainnet.standaloneResearchEvidenceAnchor, undefined);
});

test("server loader reads only validated records from the checked-in chain manifests", () => {
  const registry = loadVerifiedVeyraDeployments();
  const records = [...registry.roadmapContracts, ...registry.standaloneResearchEvidenceAnchors];
  assert.ok(records.every((record) => record.networkId === "testnet" || record.networkId === "mainnet"));
  assert.ok(records.every((record) => record.deploymentStatus === "verified" && record.receiptStatus === "success"));
  assert.ok(records.every((record) => record.chainId === record.observedChainId));
  assert.equal(new Set(records.map((record) => `${record.networkId}:${record.address.toLowerCase()}`)).size, records.length);
  assert.deepEqual(registry.roadmapContracts, []);
  assert.deepEqual(registry.standaloneResearchEvidenceAnchors, []);
});
