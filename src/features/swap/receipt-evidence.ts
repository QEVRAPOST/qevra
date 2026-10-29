import { keccak256, type Address, type Hex } from "viem";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const DATA_WORD = /^0x[0-9a-f]{64}$/i;

export interface SwapReceiptTransaction {
  hash: Hex;
  from: Address;
  to: Address | null;
  value: bigint;
  input: Hex;
}

export interface SwapTransactionExpectation {
  account: Address;
  to: Address;
  value: bigint;
  dataHash: Hex;
}

export function verifySwapTransactionIdentity(
  transaction: SwapReceiptTransaction,
  expected: SwapTransactionExpectation,
): boolean {
  try {
    return ADDRESS.test(transaction.from) && ADDRESS.test(expected.account)
      && transaction.from.toLowerCase() === expected.account.toLowerCase()
      && transaction.to !== null && ADDRESS.test(transaction.to)
      && ADDRESS.test(expected.to) && transaction.to.toLowerCase() === expected.to.toLowerCase()
      && transaction.value === expected.value
      && /^0x[0-9a-f]{64}$/i.test(expected.dataHash)
      && /^0x(?:[0-9a-f]{2})+$/i.test(transaction.input)
      && keccak256(transaction.input) === expected.dataHash.toLowerCase();
  } catch {
    return false;
  }
}

export interface SwapReceiptLog {
  address: Address;
  topics: readonly Hex[];
  data: Hex;
}

export type SwapSettlementEvidence =
  | { status: "verified"; receivedAmount: string }
  | { status: "not_verified" };

export function verifyErc20OutputSettlement(
  logs: readonly SwapReceiptLog[],
  expected: { token: Address; recipient: Address; minimumAmount: string },
): SwapSettlementEvidence {
  if (!ADDRESS.test(expected.token) || !ADDRESS.test(expected.recipient) || !/^[1-9][0-9]*$/.test(expected.minimumAmount)) {
    return { status: "not_verified" };
  }
  const recipientTopic = `0x${expected.recipient.slice(2).toLowerCase().padStart(64, "0")}`;
  let received = BigInt(0);
  for (const log of logs) {
    if (!ADDRESS.test(log.address) || log.address.toLowerCase() !== expected.token.toLowerCase()
      || log.topics.length < 3 || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC
      || log.topics[2]?.toLowerCase() !== recipientTopic.toLowerCase() || !DATA_WORD.test(log.data)) continue;
    try { received += BigInt(log.data); } catch { /* malformed public log: ignore it */ }
  }
  return received >= BigInt(expected.minimumAmount)
    ? { status: "verified", receivedAmount: received.toString() }
    : { status: "not_verified" };
}
