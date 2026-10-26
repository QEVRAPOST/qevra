import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "@/app/api/network/[networkId]/route";

test("network route returns chain-verified public status without caching", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json(calls === 1
      ? { jsonrpc: "2.0", id: 1, result: "0xb626" }
      : { jsonrpc: "2.0", id: 2, result: "0x10" });
  };
  try {
    const response = await GET(new Request("http://localhost/api/network/testnet"), {
      params: Promise.resolve({ networkId: "testnet" }),
    });
    const body = await response.json() as { networkId: string; chainId: number; latestBlock: string };
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual({ networkId: body.networkId, chainId: body.chainId, latestBlock: body.latestBlock }, {
      networkId: "testnet",
      chainId: 46_630,
      latestBlock: "16",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("network route rejects unlisted networks without making an RPC request", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({});
  };
  try {
    const response = await GET(new Request("http://localhost/api/network/unknown"), {
      params: Promise.resolve({ networkId: "unknown" }),
    });
    assert.equal(response.status, 404);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("network route reads a validated watch-only address and returns its public balance snapshot", async () => {
  const originalFetch = globalThis.fetch;
  const address = "0x0000000000000000000000000000000000000001";
  const methods: Array<{ method: string; params: unknown[] }> = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
    methods.push({ method: body.method, params: body.params });
    const result = body.method === "eth_chainId" ? "0xb626"
      : body.method === "eth_getBalance" ? "0x2386f26fc10000"
        : "0x2a";
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  };
  try {
    const response = await GET(new Request(`http://localhost/api/network/testnet?address=${address}`), {
      params: Promise.resolve({ networkId: "testnet" }),
    });
    const body = await response.json() as {
      networkId: string; chainId: number; address: string; balanceWei: string; observedBlock: string; observedAt: string;
    };
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(body, {
      networkId: "testnet",
      chainId: 46_630,
      address,
      balanceWei: "10000000000000000",
      observedBlock: "42",
      observedAt: body.observedAt,
    });
    assert.deepEqual(methods, [
      { method: "eth_chainId", params: [] },
      { method: "eth_blockNumber", params: [] },
      { method: "eth_getBalance", params: [address, "0x2a"] },
    ]);
    assert.match(body.observedAt, /^\d{4}-\d\d-\d\dT/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("network route rejects malformed inspected addresses without making an RPC request", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({});
  };
  try {
    const response = await GET(new Request("http://localhost/api/network/testnet?address=not-an-address"), {
      params: Promise.resolve({ networkId: "testnet" }),
    });
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Mainnet infrastructure route is fixed to chain 4663 and rejects Testnet selection", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as { id: number; method: string };
    const result = body.method === "eth_chainId" ? "0x1237"
      : body.method === "eth_blockNumber" ? "0x2a"
      : body.method === "eth_call" ? `0x${"0".repeat(24)}${"3".repeat(40)}`
          : "0x60016000";
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  };
  try {
    const testnetResponse = await GET(new Request("http://localhost/api/network/testnet?infrastructure=1"), {
      params: Promise.resolve({ networkId: "testnet" }),
    });
    assert.equal(testnetResponse.status, 400);
    assert.equal(calls, 0);

    const mainnetResponse = await GET(new Request("http://localhost/api/network/mainnet?infrastructure=1"), {
      params: Promise.resolve({ networkId: "mainnet" }),
    });
    const body = await mainnetResponse.json() as { networkId: string; chainId: number; contracts: { currentSettler: { address: string | null } } };
    assert.equal(mainnetResponse.status, 200);
    assert.equal(body.networkId, "mainnet");
    assert.equal(body.chainId, 4_663);
    assert.equal(body.contracts.currentSettler.address, `0x${"3".repeat(40)}`);
    assert.ok(calls > 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
