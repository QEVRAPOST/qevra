import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_NETWORK_ID, NETWORKS } from "@/lib/config/networks";

test("Robinhood read-only targets use documented RPC URLs and chain IDs", () => {
  assert.deepEqual(
    NETWORKS.map(({ id, chainId, rpcUrl, available }) => ({ id, chainId, rpcUrl, available })),
    [
      { id: "testnet", chainId: 46630, rpcUrl: "https://rpc.testnet.chain.robinhood.com", available: true },
      { id: "mainnet", chainId: 4663, rpcUrl: "https://robinhood.rpc.pinax.network", available: true },
    ],
  );
  assert.equal(DEFAULT_NETWORK_ID, "testnet");
});
