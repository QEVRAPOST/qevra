import assert from "node:assert/strict";
import { test } from "node:test";
import { keccak256, toBytes, TransactionNotFoundError, TransactionReceiptNotFoundError, type Address, type Hex } from "viem";
import { verifyErc20OutputSettlement, verifySwapTransactionIdentity } from "@/features/swap/receipt-evidence";
import { createSwapReceiptHandler, type SwapReceiptRpcClient } from "@/features/swap/receipt-route";

const account = "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;
const token = "0x3333333333333333333333333333333333333333" as Address;
const calldata = "0x1234" as Hex;
const transferTopic = keccak256(toBytes("Transfer(address,address,uint256)"));
const wordAddress = (address: Address) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}` as Hex;
const wordUint = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}` as Hex;

test("receipt identity requires the reviewed sender, target, value, and calldata hash", () => {
  const expected = { account, to: target, value: BigInt(123), dataHash: keccak256(calldata) };
  const transaction = { hash: `0x${"aa".repeat(32)}` as Hex, from: account, to: target, value: BigInt(123), input: calldata };
  assert.equal(verifySwapTransactionIdentity(transaction, expected), true);
  assert.equal(verifySwapTransactionIdentity({ ...transaction, input: "0xabcd" as Hex }, expected), false);
  assert.equal(verifySwapTransactionIdentity({ ...transaction, value: BigInt(124) }, expected), false);
  assert.equal(verifySwapTransactionIdentity({ ...transaction, from: token }, expected), false);
});

test("output settlement requires the quoted token, recipient, and minimum amount", () => {
  const expected = { token, recipient: account, minimumAmount: "950000" };
  const logs = [{
    address: token,
    topics: [transferTopic, wordAddress(target), wordAddress(account)],
    data: wordUint(BigInt(1_000_000)),
  }];
  assert.deepEqual(verifyErc20OutputSettlement(logs, expected), { status: "verified", receivedAmount: "1000000" });
  assert.deepEqual(verifyErc20OutputSettlement([{ ...logs[0]!, address: target }], expected), { status: "not_verified" });
  assert.deepEqual(verifyErc20OutputSettlement([{ ...logs[0]!, topics: [transferTopic, wordAddress(target), wordAddress(token)] }], expected), { status: "not_verified" });
  assert.deepEqual(verifyErc20OutputSettlement([{ ...logs[0]!, data: wordUint(BigInt(900_000)) }], expected), { status: "not_verified" });
});

function receiptClient(overrides: Partial<SwapReceiptRpcClient> = {}): SwapReceiptRpcClient {
  return {
    getChainId: async () => 4_663,
    getTransaction: async () => ({ hash: `0x${"aa".repeat(32)}` as Hex, from: account, to: target, value: BigInt(123), input: calldata }),
    getTransactionReceipt: async () => ({
      transactionHash: `0x${"aa".repeat(32)}` as Hex,
      status: "success",
      blockNumber: BigInt(9_876),
      logs: [{ address: token, topics: [transferTopic, wordAddress(target), wordAddress(account)], data: wordUint(BigInt(1_000_000)) }],
    }),
    ...overrides,
  };
}

function receiptRequest(expected = { to: target, dataHash: keccak256(calldata), value: "123", outputToken: token, outputNative: false, recipient: account, minimumOutput: "950000" }) {
  return new Request("http://localhost/api/swap/receipt", {
    method: "POST",
    headers: { origin: "http://localhost", host: "localhost", "content-type": "application/json" },
    body: JSON.stringify({ hash: `0x${"aa".repeat(32)}`, account, kind: "swap", expected }),
  });
}

test("receipt API confirms only the reviewed transaction and returns verified output-transfer evidence", async () => {
  const response = await createSwapReceiptHandler(receiptClient())(receiptRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "confirmed",
    identityVerified: true,
    blockNumber: "9876",
    transactionHash: `0x${"aa".repeat(32)}`,
    settlement: { status: "verified", receivedAmount: "1000000" },
  });
});

test("receipt API rejects transaction identity mismatch and wrong Mainnet RPC", async () => {
  const wrongTransaction = receiptClient({ getTransaction: async () => ({ hash: `0x${"aa".repeat(32)}` as Hex, from: account, to: token, value: BigInt(123), input: calldata }) });
  assert.equal((await createSwapReceiptHandler(wrongTransaction)(receiptRequest())).status, 409);
  const wrongChain = receiptClient({ getChainId: async () => 1 });
  assert.equal((await createSwapReceiptHandler(wrongChain)(receiptRequest())).status, 503);
});

test("receipt API distinguishes an observed pending transaction from a missing transaction", async () => {
  const pending = receiptClient({ getTransactionReceipt: async () => null });
  const response = await createSwapReceiptHandler(pending)(receiptRequest());
  assert.deepEqual(await response.json(), {
    status: "pending",
    identityVerified: true,
    transactionHash: `0x${"aa".repeat(32)}`,
  });
});

test("receipt API treats viem transaction-not-found responses as pending propagation", async () => {
  const missing = receiptClient({
    getTransaction: async () => { throw new TransactionNotFoundError({ hash: `0x${"aa".repeat(32)}` as Hex }); },
    getTransactionReceipt: async () => { throw new TransactionReceiptNotFoundError({ hash: `0x${"aa".repeat(32)}` as Hex }); },
  });
  const response = await createSwapReceiptHandler(missing)(receiptRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "not_observed",
    identityVerified: false,
    transactionHash: `0x${"aa".repeat(32)}`,
  });
});

test("receipt API never calls an unverified output transfer a successful settlement", async () => {
  const noSettlement = receiptClient({ getTransactionReceipt: async () => ({ transactionHash: `0x${"aa".repeat(32)}` as Hex, status: "success", blockNumber: BigInt(9_876), logs: [] }) });
  const response = await createSwapReceiptHandler(noSettlement)(receiptRequest());
  const result = await response.json() as { status: string; settlement: { status: string } };
  assert.equal(result.status, "confirmed");
  assert.equal(result.settlement.status, "not_verified");
});
