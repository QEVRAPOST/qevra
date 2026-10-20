import assert from "node:assert/strict";
import { test } from "node:test";
import { simulateDeployment } from "../scripts/deploy-simulate";

const jsonRpc = (id: number, result: string) => Response.json({ jsonrpc: "2.0", id, result });

test("simulates a read-only Testnet preflight using the configured chain and RPC", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const result = await simulateDeployment("testnet", {
    projectName: "YEVRA",
    color: false,
    fetchImpl: async (url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      calls.push({ url: String(url), method: request.method });
      return request.method === "eth_chainId" ? jsonRpc(request.id, "0xb626") : jsonRpc(request.id, "0x2a");
    },
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Y E V R A/);
  assert.match(result.output, /Robinhood Testnet/);
  assert.match(result.output, /Chain ID\s+46630/);
  assert.match(result.output, /RPC status\s+AVAILABLE/);
  assert.match(result.output, /Latest block\s+42/);
  assert.match(result.output, /No verified deployment address/);
  assert.match(result.output, /Phase 0B.*NO-GO/i);
  assert.match(result.output, /Broadcast\s+DISABLED/);
  assert.match(result.output, /SIMULATION ONLY — NO TRANSACTION SENT/);
  assert.deepEqual(calls, [
    { url: "https://rpc.testnet.chain.robinhood.com", method: "eth_chainId" },
    { url: "https://rpc.testnet.chain.robinhood.com", method: "eth_blockNumber" },
  ]);
  assert.doesNotMatch(result.output, /0x[a-f\d]{40}|0x[a-f\d]{64}|gas estimate/i);
});

test("simulates Mainnet with the configured chain and RPC", async () => {
  const result = await simulateDeployment("mainnet", {
    projectName: "YEVRA",
    color: false,
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      return jsonRpc(request.id, request.method === "eth_chainId" ? "0x1237" : "0x2a");
    },
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Robinhood Mainnet/);
  assert.match(result.output, /Chain ID\s+4663/);
});

test("keeps the simulation blocked and reports 403 and 429 RPC responses without response content", async () => {
  for (const status of [403, 429]) {
    const result = await simulateDeployment("testnet", {
      projectName: "YEVRA",
      color: false,
      fetchImpl: async () => new Response("secret response body must not be printed", { status }),
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /PREFLIGHT BLOCKED/);
    assert.match(result.output, /rpc_http_error/);
    assert.match(result.output, /Broadcast\s+DISABLED/);
    assert.doesNotMatch(result.output, /secret response body|[A-Za-z0-9_-]{32,}/);
  }
});

test("reports an actual chain mismatch and does not request a block", async () => {
  let calls = 0;
  const result = await simulateDeployment("mainnet", {
    projectName: "YEVRA",
    color: false,
    fetchImpl: async (_url, init) => {
      calls += 1;
      const request = JSON.parse(String(init?.body)) as { id: number };
      return jsonRpc(request.id, "0x1");
    },
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /CHAIN MISMATCH[\s\S]*expected 4663; observed 1/i);
  assert.equal(calls, 1);
});

test("reports a sanitized timeout and never prints environment secrets", async () => {
  const original = process.env.DEPLOY_PRIVATE_KEY;
  process.env.DEPLOY_PRIVATE_KEY = "do-not-print-this-secret";
  try {
    const result = await simulateDeployment("testnet", {
      projectName: "YEVRA",
      color: false,
      fetchImpl: async () => { throw Object.assign(new Error("secret socket detail"), { name: "TimeoutError" }); },
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /rpc_timeout/);
    assert.match(result.output, /Broadcast\s+DISABLED/);
    assert.doesNotMatch(result.output, /do-not-print-this-secret|secret socket detail/);
  } finally {
    if (original === undefined) delete process.env.DEPLOY_PRIVATE_KEY;
    else process.env.DEPLOY_PRIVATE_KEY = original;
  }
});
