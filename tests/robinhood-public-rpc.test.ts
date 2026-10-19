import assert from "node:assert/strict";
import { test } from "node:test";
import { readRobinhoodNetwork, RobinhoodRpcError } from "@/features/wallet/public-rpc";

function rpcResponse(id: number, result: string): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

test("public RPC health verifies the selected network's chain ID and latest block", async () => {
  const calls: Array<{ url: string; body: { id: number; method: string } }> = [];
  const snapshot = await readRobinhoodNetwork("testnet", async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as { id: number; method: string } });
    return calls.length === 1 ? rpcResponse(1, "0xb626") : rpcResponse(2, "0x2a");
  });

  assert.equal(snapshot.networkId, "testnet");
  assert.equal(snapshot.chainId, 46_630);
  assert.equal(snapshot.latestBlock, "42");
  assert.match(snapshot.observedAt, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(calls.map((call) => call.body.method), ["eth_chainId", "eth_blockNumber"]);
  assert.ok(calls.every((call) => call.url === "https://rpc.testnet.chain.robinhood.com"));
});

test("public RPC rejects a response from the wrong chain before reading its block", async () => {
  let calls = 0;
  await assert.rejects(
    readRobinhoodNetwork("mainnet", async () => {
      calls += 1;
      return rpcResponse(1, "0x1");
    }),
    (error: unknown) => error instanceof RobinhoodRpcError && error.code === "rpc_chain_id_mismatch",
  );
  assert.equal(calls, 1);
});

test("public RPC failures are sanitized and never retried", async () => {
  let calls = 0;
  await assert.rejects(
    readRobinhoodNetwork("testnet", async () => {
      calls += 1;
      throw Object.assign(new Error("private transport detail"), { name: "TimeoutError" });
    }),
    (error: unknown) => error instanceof RobinhoodRpcError && error.code === "rpc_timeout" && !error.message.includes("private"),
  );
  assert.equal(calls, 1);
});
