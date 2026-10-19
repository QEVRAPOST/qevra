import assert from "node:assert/strict";
import { test } from "node:test";
import { getRobinhoodNetworkStatus, NetworkStatusClientError } from "@/features/wallet/network-client";

test("network client uses a same-origin no-store read endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return Response.json({ networkId: "mainnet", chainId: 4663, latestBlock: "42", observedAt: "2026-10-19T00:00:00.000Z" });
  };
  try {
    const snapshot = await getRobinhoodNetworkStatus("mainnet");
    assert.equal(snapshot.chainId, 4663);
    assert.equal(requestedUrl, "/api/network/mainnet");
    assert.equal(requestedInit?.credentials, "same-origin");
    assert.equal(requestedInit?.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("network client preserves sanitized unavailable errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { code: "rpc_chain_id_mismatch", message: "Wrong chain." } }, { status: 502 });
  try {
    await assert.rejects(
      getRobinhoodNetworkStatus("testnet"),
      (error: unknown) => error instanceof NetworkStatusClientError && error.code === "rpc_chain_id_mismatch",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
