import assert from "node:assert/strict";
import { test } from "node:test";
import * as networkClient from "@/features/wallet/network-client";
import { getRobinhoodNetworkStatus, NetworkStatusClientError } from "@/features/wallet/network-client";

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
  const reader = (networkClient as unknown as { getRobinhoodPublicAddress?: PublicAddressReader }).getRobinhoodPublicAddress;
  assert.equal(typeof reader, "function", "the same-origin network client should expose watch-only address reads");
  return reader!;
}

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

test("network client distinguishes upstream HTTP 403 and 429 while keeping errors sanitized", async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    { code: 403, message: "The public Robinhood RPC returned HTTP 403.", expected: /denied.*403/i },
    { code: 429, message: "The public Robinhood RPC returned HTTP 429.", expected: /rate.limit.*429/i },
  ];
  try {
    for (const item of cases) {
      globalThis.fetch = async () => Response.json({ error: { code: "rpc_http_error", message: item.message } }, { status: 502 });
      await assert.rejects(
        getRobinhoodNetworkStatus("testnet"),
        (error: unknown) => error instanceof NetworkStatusClientError
          && error.code === "rpc_http_error"
          && error.status === 502
          && item.expected.test(error.message),
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public address client uses a same-origin no-store read and validates the snapshot", async () => {
  const originalFetch = globalThis.fetch;
  const address = "0x0000000000000000000000000000000000000001";
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return Response.json({
      networkId: "mainnet",
      chainId: 4_663,
      address,
      balanceWei: "10000000000000000",
      observedBlock: "42",
      observedAt: "2026-10-19T00:00:00.000Z",
    });
  };
  try {
    const snapshot = await getPublicAddressReader()("mainnet", address);
    assert.equal(snapshot.chainId, 4_663);
    assert.equal(snapshot.address, address);
    assert.equal(snapshot.balanceWei, "10000000000000000");
    assert.equal(requestedUrl, `/api/network/mainnet?address=${address}`);
    assert.equal(requestedInit?.credentials, "same-origin");
    assert.equal(requestedInit?.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public address client rejects a response for a different address or network", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    networkId: "testnet",
    chainId: 46_630,
    address: "0x0000000000000000000000000000000000000002",
    balanceWei: "10000000000000000",
    observedBlock: "42",
    observedAt: "2026-10-19T00:00:00.000Z",
  });
  try {
    await assert.rejects(
      getPublicAddressReader()("mainnet", "0x0000000000000000000000000000000000000001"),
      (error: unknown) => error instanceof NetworkStatusClientError && error.code === "rpc_invalid_response",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Mainnet infrastructure client validates chain identity and calls only its fixed read endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return Response.json({
      networkId: "mainnet",
      chainId: 4_663,
      latestBlock: "42",
      observedAt: "2026-10-19T00:00:00.000Z",
      contracts: {
        allowanceHolder: { address: "0x0000000000001fF3684f28c67538d4D072C22734", bytecode: "present" },
        settlerRegistry: { address: "0x00000000000004533Fe15556B1E086BB1A72cEae", bytecode: "present" },
        currentSettler: { address: "0x2222222222222222222222222222222222222222", status: "available", bytecode: "present" },
        weth: { address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", bytecode: "present" },
        usdg: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", bytecode: "absent" },
      },
    });
  };
  try {
    const snapshot = await networkClient.getRobinhoodMainnetInfrastructure();
    assert.equal(snapshot.chainId, 4_663);
    assert.equal(snapshot.contracts.currentSettler.address, "0x2222222222222222222222222222222222222222");
    assert.equal(snapshot.contracts.usdg.bytecode, "absent");
    assert.equal(requestedUrl, "/api/network/mainnet?infrastructure=1");
    assert.equal(requestedInit?.credentials, "same-origin");
    assert.equal(requestedInit?.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Mainnet infrastructure client rejects Testnet or malformed code status", async () => {
  const originalFetch = globalThis.fetch;
  const fixture = {
    networkId: "testnet",
    chainId: 46_630,
    latestBlock: "42",
    observedAt: "2026-10-19T00:00:00.000Z",
    contracts: {
      allowanceHolder: { address: "0x0000000000001fF3684f28c67538d4D072C22734", bytecode: "present" },
      settlerRegistry: { address: "0x00000000000004533Fe15556B1E086BB1A72cEae", bytecode: "present" },
      currentSettler: { address: null, status: "unavailable", bytecode: "unavailable" },
      weth: { address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", bytecode: "present" },
      usdg: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", bytecode: "absent" },
    },
  };
  globalThis.fetch = async () => Response.json(fixture);
  try {
    await assert.rejects(
      networkClient.getRobinhoodMainnetInfrastructure(),
      (error: unknown) => error instanceof networkClient.NetworkStatusClientError && error.code === "rpc_invalid_response",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
