import assert from "node:assert/strict";
import { test } from "node:test";

const rpcUrl = process.env.QEVRA_RPC_INTEGRATION_URL;
const verifiedTestnetUrl = (() => {
  if (!rpcUrl) return false;
  try {
    const url = new URL(rpcUrl);
    return url.protocol === "https:" && url.hostname === "rpc.testnet.chain.robinhood.com" && url.pathname === "/";
  } catch {
    return false;
  }
})();

async function readRpc(method: "eth_chainId" | "eth_getBlockByNumber" | "eth_getBalance", params: unknown[] = []): Promise<unknown> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 2 && !response; attempt++) {
    try {
      response = await fetch(rpcUrl!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      if (attempt === 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.ok(response);
  assert.equal(response.ok, true, `RPC returned HTTP ${response.status}`);
  const payload = await response.json() as { result?: unknown; error?: { code?: number } };
  assert.equal(payload.error, undefined, `RPC error code ${payload.error?.code ?? "unknown"}`);
  return payload.result;
}

test("Robinhood Testnet answers read-only chain, block, and public-address balance queries", { skip: !verifiedTestnetUrl }, async () => {
  assert.equal(await readRpc("eth_chainId"), "0xb626");
  const block = await readRpc("eth_getBlockByNumber", ["latest", false]) as { number?: string; hash?: string };
  assert.match(block.number ?? "", /^0x[0-9a-f]+$/i);
  assert.match(block.hash ?? "", /^0x[a-f0-9]{64}$/i);
  // Public RPC backends can serve latest-block data from different sequencer/indexer replicas.
  // Use the canonical `latest` tag for this independent read rather than assuming archival access.
  const balance = await readRpc("eth_getBalance", ["0x0000000000000000000000000000000000000000", "latest"]);
  assert.match(balance as string, /^0x[0-9a-f]+$/i);
  assert.ok(BigInt(block.number!) > BigInt(0));

  const malformedRead = await fetch(rpcUrl!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getBalance", params: ["not-an-address", block.number] }),
    signal: AbortSignal.timeout(12_000),
  });
  const malformedBody = await malformedRead.json() as { error?: { code?: number }; result?: unknown };
  assert.ok(malformedBody.error, "the RPC must reject malformed read parameters");
  assert.equal(malformedBody.result, undefined);
});
