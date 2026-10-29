import assert from "node:assert/strict";
import { test } from "node:test";
import { createPendingNonceHandler } from "@/features/swap/pending-nonce-route";
import { RobinhoodRpcError } from "@/features/wallet/public-rpc";

const owner = "0x3cdb91a29b73dab9219d9a287543800b417b6dbb";

test("public pending nonce endpoint returns a no-store chain-verified snapshot", async () => {
  const calls: string[] = [];
  const handler = createPendingNonceHandler(async (address) => {
    calls.push(address);
    return { networkId: "mainnet", chainId: 4_663, address, pendingNonce: "9", observedAt: new Date().toISOString() };
  });
  const response = await handler(new Request(`https://veyraapp.net/api/swap/pending-nonce?address=${owner}`));
  const result = await response.json() as { networkId: string; chainId: number; address: string; pendingNonce: string };

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls, [owner]);
  assert.equal(result.networkId, "mainnet");
  assert.equal(result.chainId, 4_663);
  assert.equal(result.address, owner);
  assert.equal(result.pendingNonce, "9");
});

test("public pending nonce endpoint rejects missing, malformed, and duplicate addresses before RPC access", async () => {
  let calls = 0;
  const handler = createPendingNonceHandler(async () => {
    calls += 1;
    return { networkId: "mainnet", chainId: 4_663, address: owner, pendingNonce: "9", observedAt: new Date().toISOString() };
  });

  for (const url of [
    "https://veyraapp.net/api/swap/pending-nonce",
    "https://veyraapp.net/api/swap/pending-nonce?address=invalid",
    `https://veyraapp.net/api/swap/pending-nonce?address=${owner}&address=${owner}`,
  ]) {
    const response = await handler(new Request(url));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(calls, 0);
});

test("public pending nonce endpoint reports only sanitized RPC failure categories", async () => {
  const handler = createPendingNonceHandler(async () => {
    throw new RobinhoodRpcError("rpc_chain_id_mismatch", "raw upstream response body must not escape");
  });
  const response = await handler(new Request(`https://veyraapp.net/api/swap/pending-nonce?address=${owner}`));
  const result = await response.json() as { error: { code: string; message: string } };

  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(result.error, {
    code: "rpc_chain_id_mismatch",
    message: "The public RPC did not confirm Robinhood Mainnet chain 4663.",
  });
  assert.equal(JSON.stringify(result).includes("raw upstream"), false);
});
