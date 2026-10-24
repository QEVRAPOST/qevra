import assert from "node:assert/strict";
import { test } from "node:test";
import { readStoredSwapTransactions, saveSwapTransaction, SWAP_ACTIVITY_STORAGE_KEY, toMainnetActivityRow } from "@/features/swap/activity";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

test("browser activity stores wallet-returned hashes and builds Robinhood Mainnet explorer links", () => {
  const storage = memoryStorage();
  const transaction = {
    hash: `0x${"ab".repeat(32)}` as `0x${string}`,
    account: "0x1111111111111111111111111111111111111111" as `0x${string}`,
    kind: "swap" as const,
    tokenInSymbol: "WETH",
    tokenOutSymbol: "USDG",
    amountIn: "0.01",
    createdAt: "2026-10-24T00:00:00.000Z",
  };
  assert.equal(saveSwapTransaction(transaction, storage), true);
  assert.deepEqual(readStoredSwapTransactions(storage), [transaction]);
  assert.equal(storage.getItem(SWAP_ACTIVITY_STORAGE_KEY)?.includes("ab".repeat(32)), true);
  const row = toMainnetActivityRow(transaction, "confirmed", "100");
  assert.equal(row.explorerUrl, `https://robinhoodchain.blockscout.com/tx/${transaction.hash}`);
  assert.match(row.stateLabel, /Included/);
  assert.match(row.note, /does not establish finality/);
});

test("browser activity ignores malformed storage and never claims a full address history", () => {
  const storage = memoryStorage();
  storage.setItem(SWAP_ACTIVITY_STORAGE_KEY, JSON.stringify([{ hash: "not-a-hash", account: "wrong" }]));
  assert.deepEqual(readStoredSwapTransactions(storage), []);
  assert.equal(saveSwapTransaction({
    hash: `0x${"12".repeat(32)}` as `0x${string}`,
    account: "0x2222222222222222222222222222222222222222" as `0x${string}`,
    kind: "approval",
    tokenInSymbol: "USDG",
    tokenOutSymbol: "AllowanceHolder",
    amountIn: "1",
    createdAt: "2026-10-24T00:00:00.000Z",
  }, storage), true);
  const row = toMainnetActivityRow(readStoredSwapTransactions(storage)[0]!, "pending");
  assert.match(row.note, /provide a complete wallet transaction history/);
});
