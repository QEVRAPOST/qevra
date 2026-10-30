import assert from "node:assert/strict";
import { test } from "node:test";
import { keccak256, type Address } from "viem";
import {
  ROBINHOOD_MAINNET_SAFE,
  verifyMainnetSafeOwner,
  verifyMainnetEoaOwner,
  buildDeploymentPreflight,
  deploymentReadiness,
  explorerReadiness,
  resolveRobinhoodNetwork,
  verifyDeploymentEvidence,
} from "../scripts/robinhood";
import type { MainnetEoaOwnerReader, MainnetSafeOwnerReader } from "../scripts/robinhood";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const SAFE_OWNER = "0x0000000000000000000000000000000000000466" as Address;
const DEPLOYER = "0x0000000000000000000000000000000000000002" as Address;
const ATTESTOR = "0x0000000000000000000000000000000000000a77" as Address;
const SIGNER_1 = "0x0000000000000000000000000000000000001001" as Address;
const SIGNER_2 = "0x0000000000000000000000000000000000001002" as Address;
const SIGNER_3 = "0x0000000000000000000000000000000000001003" as Address;

function safeOwnerReader(overrides: Partial<MainnetSafeOwnerReader> = {}): MainnetSafeOwnerReader {
  const reader: MainnetSafeOwnerReader = {
    getChainId: async () => 4_663,
    hasCode: async () => true,
    getCodeHash: async (address) => {
      if (address === ROBINHOOD_MAINNET_SAFE.singleton) return ROBINHOOD_MAINNET_SAFE.singletonCodeHash;
      if (address === ROBINHOOD_MAINNET_SAFE.proxyFactory) return ROBINHOOD_MAINNET_SAFE.proxyFactoryCodeHash;
      if (address === ROBINHOOD_MAINNET_SAFE.fallbackHandler) return ROBINHOOD_MAINNET_SAFE.fallbackHandlerCodeHash;
      return null;
    },
    getFactoryProxySingleton: async () => ROBINHOOD_MAINNET_SAFE.singleton,
    getSingleton: async () => ROBINHOOD_MAINNET_SAFE.singleton,
    getVersion: async () => "1.4.1",
    getOwners: async () => [SIGNER_1, SIGNER_2, SIGNER_3],
    getThreshold: async () => BigInt(2),
    getModules: async () => ({ modules: [], next: ROBINHOOD_MAINNET_SAFE.moduleSentinel }),
    getStorageAddress: async (_owner, slot) => slot === ROBINHOOD_MAINNET_SAFE.fallbackSlot
      ? ROBINHOOD_MAINNET_SAFE.fallbackHandler
      : ZERO_ADDRESS,
  };
  return { ...reader, ...overrides };
}

test("Robinhood CLI resolves only the configured official read-only networks", () => {
  assert.equal(resolveRobinhoodNetwork("testnet").chainId, 46_630);
  assert.equal(resolveRobinhoodNetwork("mainnet").chainId, 4_663);
  assert.throws(() => resolveRobinhoodNetwork("ethereum"), /unsupported Robinhood network/i);
});

test("deployment readiness always blocks the vulnerable Phase 0 harness and gates Mainnet", () => {
  const testnet = deploymentReadiness("testnet");
  const mainnet = deploymentReadiness("mainnet");
  assert.equal(testnet.ready, false);
  assert.match(testnet.reason, /evidenceanchor.*explicit owner authorization/i);
  assert.match(testnet.reason, /phase 0 research harness and verifier remain excluded/i);
  assert.equal(mainnet.ready, false);
  assert.match(mainnet.reason, /explicit release policy.*owner authorization/i);
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
  } as unknown as NodeJS.ProcessEnv);
  assert.match(mainnetReused.reason, /must not reuse/i);
});

test("Mainnet preflight carries the configured contract owner as a public-only address", () => {
  const owner = "0x0000000000000000000000000000000000004663";
  const plan = buildDeploymentPreflight("mainnet", "0x0000000000000000000000000000000000000002", {
    VEYRA_MAINNET_ACCOUNT: "robinhood-mainnet",
    VEYRA_MAINNET_OWNER: owner,
    VEYRA_MAINNET_OWNER_MODE: "EOA_INACTIVE",
    VEYRA_MAINNET_RELEASE_POLICY: "OWNER_APPROVED_DORMANT",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(plan.ownerAddress, owner);
  assert.equal(plan.ownerMode, "EOA_INACTIVE");
  assert.equal(plan.releasePolicy, "OWNER_APPROVED_DORMANT");
  assert.equal(plan.keyMaterialAccessed, false);
  assert.equal(plan.deploymentReady, false);
});

test("Mainnet release policy is explicit and fails closed when missing or invalid", () => {
  const base = {
    VEYRA_MAINNET_ACCOUNT: "robinhood-mainnet",
    VEYRA_MAINNET_OWNER: "0x0000000000000000000000000000000000004663",
    VEYRA_MAINNET_OWNER_MODE: "EOA_INACTIVE",
  } as unknown as NodeJS.ProcessEnv;
  assert.equal(buildDeploymentPreflight("mainnet", DEPLOYER, base).releasePolicy, null);
  assert.equal(buildDeploymentPreflight("mainnet", DEPLOYER, {
    ...base,
    VEYRA_MAINNET_RELEASE_POLICY: "OWNER_APPROVED_ANYTHING",
  } as unknown as NodeJS.ProcessEnv).releasePolicy, null);
  const reviewPolicy = buildDeploymentPreflight("mainnet", DEPLOYER, {
    ...base,
    VEYRA_MAINNET_RELEASE_POLICY: "INDEPENDENT_REVIEW_REQUIRED",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(reviewPolicy.releasePolicy, "INDEPENDENT_REVIEW_REQUIRED");
  assert.match(reviewPolicy.reason, /independent reviewer signature/i);
});

function eoaOwnerReader(overrides: Partial<MainnetEoaOwnerReader> = {}): MainnetEoaOwnerReader {
  return {
    getChainId: async () => 4_663,
    hasCode: async () => false,
    ...overrides,
  };
}

test("EOA owner preflight requires Mainnet, no deployed code, and distinct public role addresses", async () => {
  const valid = await verifyMainnetEoaOwner(SIGNER_1, DEPLOYER, ATTESTOR, eoaOwnerReader());
  assert.deepEqual(valid, {
    verified: true,
    ownerAddress: SIGNER_1,
    codeAbsent: true,
    keyControlProven: false,
  });

  const deployedCode = await verifyMainnetEoaOwner(
    SIGNER_1,
    DEPLOYER,
    ATTESTOR,
    eoaOwnerReader({ hasCode: async () => true }),
  );
  assert.deepEqual(deployedCode, { verified: false, reason: "owner_code_present" });

  const roleOverlap = await verifyMainnetEoaOwner(SIGNER_1, SIGNER_1, ATTESTOR, eoaOwnerReader());
  assert.deepEqual(roleOverlap, { verified: false, reason: "role_address_overlap" });

  const wrongChain = await verifyMainnetEoaOwner(
    SIGNER_1,
    DEPLOYER,
    ATTESTOR,
    eoaOwnerReader({ getChainId: async () => 46_630 }),
  );
  assert.deepEqual(wrongChain, { verified: false, reason: "chain_id_mismatch" });
});

test("Mainnet deployment profile fails closed when omitted or invalid", () => {
  const base = {
    VEYRA_MAINNET_ACCOUNT: "robinhood-mainnet",
    VEYRA_MAINNET_OWNER: "0x0000000000000000000000000000000000000466",
  } as unknown as NodeJS.ProcessEnv;
  assert.equal(buildDeploymentPreflight("mainnet", DEPLOYER, base).ownerMode, null);
  assert.equal(buildDeploymentPreflight("mainnet", DEPLOYER, {
    ...base,
    VEYRA_MAINNET_OWNER_MODE: "EOA",
  } as unknown as NodeJS.ProcessEnv).ownerMode, null);
});

test("Safe owner preflight rejects an otherwise valid Safe when any execution module is enabled", async () => {
  const result = await verifyMainnetSafeOwner(
    SAFE_OWNER,
    DEPLOYER,
    ATTESTOR,
    safeOwnerReader({ getModules: async () => ({ modules: ["0x0000000000000000000000000000000000000bad" as Address], next: ROBINHOOD_MAINNET_SAFE.moduleSentinel }) }),
  );
  assert.deepEqual(result, { verified: false, reason: "modules_enabled" });
});

test("Safe owner preflight accepts only canonical SafeL2 1.4.1 with 2-of-3 independent signers and no control bypasses", async () => {
  const result = await verifyMainnetSafeOwner(SAFE_OWNER, DEPLOYER, ATTESTOR, safeOwnerReader());
  assert.equal(result.verified, true);
  if (!result.verified) return;
  assert.equal(result.threshold, 2);
  assert.equal(result.signers.length, 3);
  assert.equal(result.enabledModules.length, 0);
  assert.equal(result.guard, ZERO_ADDRESS);
  assert.equal(result.moduleGuard, ZERO_ADDRESS);
  assert.equal(result.fallbackHandler, ROBINHOOD_MAINNET_SAFE.fallbackHandler);
  assert.equal(result.implementation, ROBINHOOD_MAINNET_SAFE.singleton);
});

test("Safe owner preflight requires proxy-creation evidence from the canonical Safe factory", async () => {
  const reader = {
    ...safeOwnerReader(),
    getFactoryProxySingleton: async () => null,
  };
  const result = await verifyMainnetSafeOwner(SAFE_OWNER, DEPLOYER, ATTESTOR, reader);
  assert.deepEqual(result, { verified: false, reason: "owner_not_factory_created_safe" });
});

test("Safe owner preflight rejects invalid threshold, signer overlap, and unexpected fallback handler", async () => {
  const badThreshold = await verifyMainnetSafeOwner(SAFE_OWNER, DEPLOYER, ATTESTOR, safeOwnerReader({ getThreshold: async () => BigInt(1) }));
  assert.deepEqual(badThreshold, { verified: false, reason: "threshold_or_owner_count_mismatch" });

  const badFallback = await verifyMainnetSafeOwner(
    SAFE_OWNER,
    DEPLOYER,
    ATTESTOR,
    safeOwnerReader({ getStorageAddress: async (_owner, slot) => slot === ROBINHOOD_MAINNET_SAFE.fallbackSlot ? "0x0000000000000000000000000000000000000bad" : ZERO_ADDRESS }),
  );
  assert.deepEqual(badFallback, { verified: false, reason: "fallback_handler_mismatch" });

  const signerOverlap = await verifyMainnetSafeOwner(
    SAFE_OWNER,
    DEPLOYER,
    ATTESTOR,
    safeOwnerReader({ getOwners: async () => [DEPLOYER as Address, SIGNER_2, SIGNER_3] }),
  );
  assert.deepEqual(signerOverlap, { verified: false, reason: "invalid_or_overlapping_signer" });

  for (const invalidSigner of [ZERO_ADDRESS, ROBINHOOD_MAINNET_SAFE.moduleSentinel]) {
    const invalidIdentity = await verifyMainnetSafeOwner(
      SAFE_OWNER,
      DEPLOYER,
      ATTESTOR,
      safeOwnerReader({ getOwners: async () => [invalidSigner, SIGNER_2, SIGNER_3] }),
    );
    assert.deepEqual(invalidIdentity, { verified: false, reason: "invalid_or_overlapping_signer" });
  }
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
