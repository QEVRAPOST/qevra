import assert from "node:assert/strict";
import { test } from "node:test";
import { keccak256 } from "viem";
import {
  buildDeploymentPreflight,
  deploymentReadiness,
  explorerReadiness,
  resolveRobinhoodNetwork,
  verifyDeploymentEvidence,
} from "../scripts/robinhood";

test("Robinhood CLI resolves only the configured official read-only networks", () => {
  assert.equal(resolveRobinhoodNetwork("testnet").chainId, 46_630);
  assert.equal(resolveRobinhoodNetwork("mainnet").chainId, 4_663);
  assert.throws(() => resolveRobinhoodNetwork("ethereum"), /unsupported Robinhood network/i);
});

test("deployment readiness always blocks the vulnerable Phase 0 harness and gates Mainnet", () => {
  const testnet = deploymentReadiness("testnet");
  const mainnet = deploymentReadiness("mainnet");
  assert.equal(testnet.ready, false);
  assert.match(testnet.reason, /no approved deployment artifact/i);
  assert.equal(mainnet.ready, false);
  assert.match(mainnet.reason, /security review and owner approval/i);
});

test("Explorer readiness requires HTTPS and remains blocked without an approved artifact", () => {
  assert.equal(explorerReadiness("testnet").ready, false);
  assert.match(explorerReadiness("testnet").reason, /no approved deployment artifact/i);
  assert.match(explorerReadiness("mainnet", "http://explorer.example").reason, /HTTPS/i);
});

test("deployment preflight keeps network keystore aliases separate and never reads key material", () => {
  const deployer = "0x0000000000000000000000000000000000000001";
  const testnet = buildDeploymentPreflight("testnet", deployer, {} as NodeJS.ProcessEnv);
  assert.equal(testnet.chainId, 46_630);
  assert.equal(testnet.accountAlias, "veyra-testnet");
  assert.equal(testnet.keyMaterialAccessed, false);
  assert.equal(testnet.deploymentReady, false);

  const mainnetMissing = buildDeploymentPreflight("mainnet", deployer, {} as NodeJS.ProcessEnv);
  assert.equal(mainnetMissing.chainId, 4_663);
  assert.equal(mainnetMissing.accountAlias, null);
  assert.equal(mainnetMissing.deploymentReady, false);

  const mainnetReused = buildDeploymentPreflight("mainnet", deployer, {
    VEYRA_TESTNET_ACCOUNT: "veyra-testnet",
    VEYRA_MAINNET_ACCOUNT: "veyra-testnet",
    NODE_ENV: "test",
  } as NodeJS.ProcessEnv);
  assert.match(mainnetReused.reason, /must not reuse/i);
});

test("deployment verification requires matching observed chain, successful receipt, address, and runtime code", async () => {
  const address = "0x0000000000000000000000000000000000000009";
  const txHash = `0x${"a".repeat(64)}` as `0x${string}`;
  const code = "0x6001600055" as `0x${string}`;
  const expectedCodeHash = keccak256(code);
  const reader = {
    getChainId: async () => 46_630,
    getTransactionReceipt: async () => ({
      status: "success" as const,
      contractAddress: address,
      blockNumber: BigInt(123),
      from: "0x0000000000000000000000000000000000000001",
      gasUsed: BigInt(500_000),
    }),
    getCode: async () => code,
  };
  const result = await verifyDeploymentEvidence("testnet", address, txHash, expectedCodeHash, reader);
  assert.equal(result.verified, true);
  if (!result.verified) return;
  assert.equal(result.evidence.chainId, 46_630);
  assert.equal(result.evidence.transactionHash, txHash);
  assert.equal(result.evidence.address, address);
  assert.equal(result.evidence.sourceVerification, "not_verified");
  assert.notEqual(result.evidence.runtimeBytecodeHash, `0x${"0".repeat(64)}`);

  const mismatch = await verifyDeploymentEvidence("mainnet", address, txHash, expectedCodeHash, reader);
  assert.deepEqual(mismatch, { verified: false, reason: "chain_id_mismatch" });
  const badHash = await verifyDeploymentEvidence("testnet", address, txHash, `0x${"e".repeat(64)}`, reader);
  assert.deepEqual(badHash, { verified: false, reason: "runtime_bytecode_mismatch" });
  const noCode = await verifyDeploymentEvidence("testnet", address, txHash, expectedCodeHash, { ...reader, getCode: async () => "0x" });
  assert.deepEqual(noCode, { verified: false, reason: "runtime_bytecode_missing" });
});
