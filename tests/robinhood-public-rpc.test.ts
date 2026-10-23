import assert from "node:assert/strict";
import { test } from "node:test";
import * as publicRpc from "@/features/wallet/public-rpc";
import { readRobinhoodNetwork, RobinhoodRpcError } from "@/features/wallet/public-rpc";

function rpcResponse(id: number, result: string): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

type PublicAddressSnapshot = {
  networkId: "testnet" | "mainnet";
  chainId: number;
  address: string;
  balanceWei: string;
  observedBlock: string;
  observedAt: string;
};

type PublicAddressReader = (networkId: "testnet" | "mainnet", address: string, fetchImpl?: typeof fetch) => Promise<PublicAddressSnapshot>;

function getPublicAddressReader(): PublicAddressReader {
  const reader = (publicRpc as unknown as { readRobinhoodPublicAddress?: PublicAddressReader }).readRobinhoodPublicAddress;
  assert.equal(typeof reader, "function", "the Robinhood public RPC adapter should expose watch-only address reads");
  return reader!;
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

test("Mainnet public status reads use the official RPC and verify chain 4663", async () => {
  const calls: Array<{ url: string; body: { id: number; method: string } }> = [];
  const snapshot = await readRobinhoodNetwork("mainnet", async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as { id: number; method: string } });
    return calls.length === 1 ? rpcResponse(1, "0x1237") : rpcResponse(2, "0x2a");
  });

  assert.equal(snapshot.networkId, "mainnet");
  assert.equal(snapshot.chainId, 4_663);
  assert.equal(snapshot.latestBlock, "42");
  assert.deepEqual(calls.map((call) => call.body.method), ["eth_chainId", "eth_blockNumber"]);
  assert.ok(calls.every((call) => call.url === "https://rpc.mainnet.chain.robinhood.com"));
});

test("public RPC rejects a response from the wrong chain before reading its block", async () => {
  let calls = 0;
  await assert.rejects(
    readRobinhoodNetwork("mainnet", async () => {
      calls += 1;
      return rpcResponse(1, "0x1");
    }),
    (error: unknown) => error instanceof RobinhoodRpcError && error.code === "rpc_chain_id_mismatch" && error.observedChainId === 1,
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

test("public address reads verify Testnet and Mainnet and return the latest native balance and observed block", async () => {
  const address = "0x0000000000000000000000000000000000000001";
  const cases = [
    { networkId: "testnet" as const, chainId: 46_630, rpcUrl: "https://rpc.testnet.chain.robinhood.com", rpcChain: "0xb626" },
    { networkId: "mainnet" as const, chainId: 4_663, rpcUrl: "https://rpc.mainnet.chain.robinhood.com", rpcChain: "0x1237" },
  ];
  const readAddress = getPublicAddressReader();

  for (const item of cases) {
    const calls: Array<{ url: string; method: string; params: unknown[] }> = [];
    const snapshot = await readAddress(item.networkId, address, async (input, init) => {
      const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
      calls.push({ url: String(input), method: body.method, params: body.params });
      const result = body.method === "eth_chainId" ? item.rpcChain
        : body.method === "eth_getBalance" ? "0x2386f26fc10000"
          : "0x2a";
      return rpcResponse(body.id, result);
    });

    assert.equal(snapshot.networkId, item.networkId);
    assert.equal(snapshot.chainId, item.chainId);
    assert.equal(snapshot.address, address);
    assert.equal(snapshot.balanceWei, "10000000000000000");
    assert.equal(snapshot.observedBlock, "42");
    assert.match(snapshot.observedAt, /^\d{4}-\d\d-\d\dT/);
    assert.deepEqual(calls.map(({ method }) => method), ["eth_chainId", "eth_blockNumber", "eth_getBalance"]);
    assert.deepEqual(calls.map(({ params }) => params), [[], [], [address, "0x2a"]]);
    assert.ok(calls.every(({ url }) => url === item.rpcUrl));
  }
});

test("public address reads reject malformed addresses before making an RPC request", async () => {
  let calls = 0;
  await assert.rejects(
    getPublicAddressReader()("testnet", "0xnot-an-address", async () => {
      calls += 1;
      return rpcResponse(1, "0x0");
    }),
    (error: unknown) => error instanceof RobinhoodRpcError && error.code === "invalid_address",
  );
  assert.equal(calls, 0);
});

test("public address reads stop before balance access when the RPC reports a different chain", async () => {
  let calls = 0;
  await assert.rejects(
    getPublicAddressReader()("mainnet", "0x0000000000000000000000000000000000000001", async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as { id: number };
      return rpcResponse(body.id, "0x1");
    }),
    (error: unknown) => error instanceof RobinhoodRpcError && error.code === "rpc_chain_id_mismatch" && error.observedChainId === 1,
  );
  assert.equal(calls, 1);
});
