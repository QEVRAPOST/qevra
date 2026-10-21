import assert from "node:assert/strict";
import { test } from "node:test";
import { parseVerifiedVeyraManifest, type VeyraDeploymentManifest } from "@/lib/config/veyra-deployment-manifest";
import { loadVerifiedVeyraDeployments } from "@/lib/config/load-veyra-deployments";

function verifiedContract(overrides: Record<string, unknown> = {}) {
  return {
    solidityName: "VeyraResearchRegistry",
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
  } as VeyraDeploymentManifest;
}

test("manifest adapter maps verified evidence from each chain-specific manifest", () => {
  const testnet = parseVerifiedVeyraManifest("testnet", manifest("testnet", [verifiedContract()]));
  const mainnet = parseVerifiedVeyraManifest("mainnet", manifest("mainnet", [verifiedContract({
    address: "0x0000000000000000000000000000000000000010",
    observedChainId: 4_663,
  })]));

  assert.equal(testnet.length, 1);
  assert.deepEqual(testnet[0], {
    name: "VeyraResearchRegistry",
    purpose: "Stores approved research report attestations.",
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
  assert.equal(mainnet[0]?.networkId, "mainnet");
  assert.equal(mainnet[0]?.chainId, 4_663);
  assert.equal(parseVerifiedVeyraManifest("testnet", manifest("testnet", [] )).length, 0);
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
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.networkId, "testnet");
});

test("manifest adapter rejects the wrong project, schema, and chain envelope", () => {
  const wrongProject = { ...manifest("testnet", [verifiedContract()]), project: "OTHER" };
  const wrongSchema = { ...manifest("testnet", [verifiedContract()]), schema: "unknown" };
  const wrongChain = { ...manifest("testnet", [verifiedContract()]), chainId: 4_663 };

  assert.deepEqual(parseVerifiedVeyraManifest("testnet", wrongProject), []);
  assert.deepEqual(parseVerifiedVeyraManifest("testnet", wrongSchema), []);
  assert.deepEqual(parseVerifiedVeyraManifest("testnet", wrongChain), []);
  assert.deepEqual(parseVerifiedVeyraManifest("mainnet", manifest("testnet", [verifiedContract()])), []);
});

test("server loader reads only validated records from the checked-in chain manifests", () => {
  const records = loadVerifiedVeyraDeployments();
  assert.ok(records.every((record) => record.networkId === "testnet" || record.networkId === "mainnet"));
  assert.ok(records.every((record) => record.deploymentStatus === "verified" && record.receiptStatus === "success"));
  assert.ok(records.every((record) => record.chainId === record.observedChainId));
  assert.equal(new Set(records.map((record) => `${record.networkId}:${record.address.toLowerCase()}`)).size, records.length);
});
