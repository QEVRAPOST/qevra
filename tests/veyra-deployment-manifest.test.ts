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
  assert.deepEqual(registry.roadmapContracts.filter((record) => record.networkId === "testnet"), [
    {
      name: "VeyraTokenPolicyRegistry",
      purpose: "Owner-managed token policy registry; deployed dormant with no token policies configured.",
      architectureSlot: 6,
      networkId: "testnet",
      chainId: 46_630,
      address: "0x2e305620414e642f6Ec35FBBbda59930359B8B04",
      deploymentStatus: "verified",
      observedChainId: 46_630,
      deployerAddress: "0xfA142bF0383782Caa349C5C56A7B7D565eEFA562",
      transactionHash: "0x99abf9f70770939fe61824b640162c940aa8ded4a7f7e15a56a5d51905c333cf",
      receiptStatus: "success",
      blockNumber: "140283737",
      runtimeBytecodeHash: "0xfb960c0e27c6a4bd4112ba3e11085d07c389e4f8687aa455d68d30a8f708c0c3",
      sourceVerification: "not_verified",
    },
    {
      name: "VeyraRouterRegistry",
      purpose: "Owner-managed router registry; deployed dormant with no routers configured.",
      architectureSlot: 7,
      networkId: "testnet",
      chainId: 46_630,
      address: "0xc07B087D5be957a2953fda58b60247fa81a64eCA",
      deploymentStatus: "verified",
      observedChainId: 46_630,
      deployerAddress: "0xfA142bF0383782Caa349C5C56A7B7D565eEFA562",
      transactionHash: "0x8a4b96d298fcb999b8e251862e022655367a30b61a176ef8a28f2b32fa988edd",
      receiptStatus: "success",
      blockNumber: "140283745",
      runtimeBytecodeHash: "0x66fd6737cf28ac0d8d6f8acfd82e44a219d003c7f21b15d13a3924fb4e28a540",
      sourceVerification: "not_verified",
    },
    {
      name: "VeyraSwapIntentGuard",
      purpose: "Intent guard; executor is bound once, with no token policies or routers active.",
      architectureSlot: 8,
      networkId: "testnet",
      chainId: 46_630,
      address: "0xd87b791487ed843D9FAA2ec5694d6Fe625B345B0",
      deploymentStatus: "verified",
      observedChainId: 46_630,
      deployerAddress: "0xfA142bF0383782Caa349C5C56A7B7D565eEFA562",
      transactionHash: "0xc95ede3afb2c7c81158822729730aac90ba62eb7f627c870d671368f53d57817",
      receiptStatus: "success",
      blockNumber: "140283752",
      runtimeBytecodeHash: "0x975d583262cacf8444a1a7c105814ced1b794356c08b82b3915e856c4e77018a",
      sourceVerification: "not_verified",
    },
    {
      name: "VeyraSwapExecutor",
      purpose: "Typed swap executor; inactive because no token policies or routers are configured.",
      architectureSlot: 9,
      networkId: "testnet",
      chainId: 46_630,
      address: "0x98af2968c1f3Ca323F4F50f0D0DDE95640c24b24",
      deploymentStatus: "verified",
      observedChainId: 46_630,
      deployerAddress: "0xfA142bF0383782Caa349C5C56A7B7D565eEFA562",
      transactionHash: "0x197871e86462503dcc1d91f321c580aa5552a25344e28dcbe494f8fbfee550d6",
      receiptStatus: "success",
      blockNumber: "140283772",
      runtimeBytecodeHash: "0xeeefe9013d19f884798ce7e33b7165b2c43a5c534706d0f9a312d789c27547bf",
      sourceVerification: "not_verified",
    },
  ]);
  assert.deepEqual(registry.roadmapContracts.filter((record) => record.networkId === "mainnet"), []);
  assert.deepEqual(registry.standaloneResearchEvidenceAnchors, [{
    name: "VeyraResearchEvidenceAnchor",
    purpose: "Anchors only nonzero hashes of research reports and run identifiers; does not attest to truth or implement architecture slot 10.",
    networkId: "testnet",
    chainId: 46_630,
    address: "0x10A47a16A6A903574Ed4058B67750073cC992632",
    deploymentStatus: "verified",
    observedChainId: 46_630,
    deployerAddress: "0xfA142bF0383782Caa349C5C56A7B7D565eEFA562",
    transactionHash: "0xb512a881c0bfa01d33786a6726c40db9b31f64f2598f02022f10a752e0b2ebae",
    receiptStatus: "success",
    blockNumber: "140219918",
    runtimeBytecodeHash: "0x75145cfa0c4eae7612db613f469eeafbf81ba898e07b3a96e1888378dffa798b",
    sourceVerification: "not_verified",
  }]);
});
