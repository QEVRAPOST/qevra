import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLiveAppModel } from "@/features/dashboard/live-model";
import { DEFAULT_NETWORK_ID, NETWORKS } from "@/lib/config/networks";

test("Robinhood read-only targets use documented RPC URLs and chain IDs", () => {
  assert.deepEqual(
    NETWORKS.map(({ id, chainId, rpcUrl, available }) => ({ id, chainId, rpcUrl, available })),
    [
      { id: "mainnet", chainId: 4663, rpcUrl: "https://rpc.mainnet.chain.robinhood.com", available: true },
      { id: "testnet", chainId: 46630, rpcUrl: "https://rpc.testnet.chain.robinhood.com", available: true },
    ],
  );
  assert.equal(DEFAULT_NETWORK_ID, "mainnet");
});

test("the live app model defaults to Mainnet when no network selection is supplied", () => {
  const model = buildLiveAppModel({
    wallet: { status: "disconnected" },
    runs: null,
    accessState: "unauthenticated",
    isRefreshing: false,
    isCreating: false,
  });

  assert.equal(model.network.selected, "mainnet");
  assert.equal(model.network.options[0]?.chainId, 4663);
});

test("each Robinhood network exposes its official explorer base URL", () => {
  assert.equal(NETWORKS.find((network) => network.id === "testnet")?.explorerUrl, "https://explorer.testnet.chain.robinhood.com");
  assert.equal(NETWORKS.find((network) => network.id === "mainnet")?.explorerUrl, "https://robinhoodchain.blockscout.com");
});
