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
