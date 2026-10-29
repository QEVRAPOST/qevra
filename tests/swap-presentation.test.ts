import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { test } from "node:test";
import {
  formatMainnetPreflightBalances,
  formatMainnetTokenAmount,
  getMainnetSwapNetworkReadiness,
  getMldsa44PublicKeyFingerprint,
  isWalletRequestRejection,
  hasMainnetSwapContextChanged,
} from "@/features/swap/presentation";
import type { SwapPreflightResult } from "@/features/swap/execution";
import { toMainnetActivityRow, type StoredSwapTransaction } from "@/features/swap/activity";

test("Mainnet quote readiness requires both VEYRA and the connected wallet on chain 4663", () => {
  assert.deepEqual(getMainnetSwapNetworkReadiness(46_630, 46_630), {
    applicationReady: false,
    walletReady: false,
    ready: false,
  });
  assert.deepEqual(getMainnetSwapNetworkReadiness(4_663, 46_630), {
    applicationReady: true,
    walletReady: false,
    ready: false,
  });
  assert.deepEqual(getMainnetSwapNetworkReadiness(4_663, 4_663), {
    applicationReady: true,
    walletReady: true,
    ready: true,
  });
});

test("Mainnet preflight balances format actual token, ETH, allowance, and fee amounts", () => {
  const snapshot: SwapPreflightResult = {
    status: "ready",
    quoteDigest: "0x" + "11".repeat(32),
    account: "0x1111111111111111111111111111111111111111",
    currentAllowance: BigInt("5000000000000000"),
    tokenBalance: BigInt("15000000000000000"),
    nativeBalance: BigInt("2000000000000000000"),
    estimatedGas: BigInt("180000"),
    gasPrice: BigInt("1000000000"),
    feeRequirement: BigInt("180000000000000"),
    transactionNonce: BigInt("7"),
    nonceSource: "wallet_and_rpc",
  };

  assert.deepEqual(formatMainnetPreflightBalances(snapshot, {
    symbol: "WETH",
    decimals: 18,
    native: false,
  }), {
    sellTokenBalance: "0.015 WETH",
    nativeBalance: "2 ETH",
    allowance: "0.005 WETH",
    estimatedGas: "180000 units",
    estimatedFee: "0.00018 ETH",
  });

  assert.deepEqual(formatMainnetPreflightBalances(snapshot, {
    symbol: "ETH",
    decimals: 18,
    native: true,
  }), {
    sellTokenBalance: "2 ETH",
    nativeBalance: "2 ETH",
    allowance: "Not applicable",
    estimatedGas: "180000 units",
    estimatedFee: "0.00018 ETH",
  });
});

test("quote-provider token balance values format as exact token units without coercing malformed amounts", () => {
  assert.equal(formatMainnetTokenAmount("15000000", 6), "15");
  assert.equal(formatMainnetTokenAmount("995000", 6), "0.995");
  assert.equal(formatMainnetTokenAmount("not-an-integer", 6), undefined);
  assert.equal(formatMainnetTokenAmount("1", 37), undefined);
});

test("wallet account, app network, wallet network, or provider changes invalidate Mainnet review context", () => {
  const provider = {};
  const previous = {
    account: "0x1111111111111111111111111111111111111111",
    applicationChainId: 4_663,
    walletChainId: 4_663,
    provider,
  };
  assert.equal(hasMainnetSwapContextChanged(previous, { ...previous, account: previous.account.toUpperCase() }), false);
  assert.equal(hasMainnetSwapContextChanged(previous, { ...previous, account: "0x2222222222222222222222222222222222222222" }), true);
  assert.equal(hasMainnetSwapContextChanged(previous, { ...previous, applicationChainId: 46_630 }), true);
  assert.equal(hasMainnetSwapContextChanged(previous, { ...previous, walletChainId: 46_630 }), true);
  assert.equal(hasMainnetSwapContextChanged(previous, { ...previous, provider: {} }), true);
});

test("wallet rejection is distinct and Mainnet Activity maps pending, confirmed, and failed receipts honestly", () => {
  assert.equal(isWalletRequestRejection({ code: 4001 }), true);
  assert.equal(isWalletRequestRejection({ code: -32000 }), false);

  const transaction: StoredSwapTransaction = {
    hash: `0x${"ab".repeat(32)}`,
    account: "0x1111111111111111111111111111111111111111",
    kind: "swap",
    tokenInSymbol: "WETH",
    tokenOutSymbol: "USDG",
    amountIn: "0.01",
    createdAt: "2026-10-24T00:00:00.000Z",
  };
  assert.match(toMainnetActivityRow(transaction, "pending").stateLabel, /Waiting for receipt/);
  assert.match(toMainnetActivityRow(transaction, "confirmed", "100").stateLabel, /Included/);
  assert.match(toMainnetActivityRow(transaction, "reverted").stateLabel, /Reverted/);
});

test("ML-DSA public-key fingerprint is the SHA-256 digest of the decoded public key", async () => {
  const publicKey = new Uint8Array(1_312).fill(23);
  const base64Url = Buffer.from(publicKey).toString("base64url");
  const fingerprint = await getMldsa44PublicKeyFingerprint({ publicKey: base64Url }, webcrypto as Crypto);
  const expected = `0x${createHash("sha256").update(publicKey).digest("hex")}`;
  assert.equal(fingerprint, expected);
});

test("ML-DSA public-key fingerprint rejects malformed key encodings", async () => {
  await assert.rejects(getMldsa44PublicKeyFingerprint({ publicKey: "not a public key" }, webcrypto as Crypto));
});
