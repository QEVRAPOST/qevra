import assert from "node:assert/strict";
import { test } from "node:test";
import {
  completeWalletAuthChallenge,
  getWalletSessionStatus,
  logoutWalletSession,
  requestWalletAuthChallenge,
  signWalletAuthenticationMessage,
} from "@/features/security/client";
import type { ReadOnlyEip1193Provider } from "@/features/wallet/read-only";

const address = "0x0000000000000000000000000000000000000001";
const message = "example VEYRA one-time EIP-191 sign-in challenge";
const signature = `0x${"1".repeat(130)}`;
test("wallet session client checks the user-owned server session", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return Response.json({ configured: true, authenticated: true, address, expiresAt: "2026-10-21T12:00:00.000Z" });
  };
  try {
    const status = await getWalletSessionStatus();
    assert.equal(status.authenticated, true);
    assert.equal(status.address, address);
    assert.equal(requestUrl, "/api/auth/user/session");
    assert.equal(requestInit?.credentials, "same-origin");
    assert.equal(requestInit?.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wallet sign-in requests one chain-bound challenge without signing it", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return Response.json({ nonce: "a".repeat(32), message, expiresAt: "2026-10-21T12:00:00.000Z" });
  };
  try {
    const challenge = await requestWalletAuthChallenge({ networkId: "testnet", address });
    assert.equal(challenge.message, message);
    assert.equal(requestUrl, "/api/auth/user/challenge");
    assert.equal(requestInit?.method, "POST");
    assert.equal(requestInit?.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { networkId: "testnet", address });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wallet sign-in sends only the returned challenge and its EIP-191 signature", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return Response.json({ authenticated: true, address, expiresAt: "2026-10-21T12:00:00.000Z" });
  };
  try {
    await completeWalletAuthChallenge({ address, nonce: "a".repeat(32), signature });
    assert.equal(requestUrl, "/api/auth/user/session");
    assert.equal(requestInit?.method, "POST");
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { address, nonce: "a".repeat(32), signature });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wallet session sign-out uses the separate user-session endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestMethod: string | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestMethod = init?.method;
    return Response.json({ authenticated: false });
  };
  try {
    await logoutWalletSession();
    assert.equal(requestUrl, "/api/auth/user/session");
    assert.equal(requestMethod, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("EIP-191 wallet approval is a single explicit personal_sign request", async () => {
  const calls: unknown[] = [];
  const provider = {
    async request(args: unknown) {
      calls.push(args);
      return signature;
    },
  } as ReadOnlyEip1193Provider;
  const result = await signWalletAuthenticationMessage(provider, address, message);
  assert.equal(result, signature);
  assert.deepEqual(calls, [{ method: "personal_sign", params: [message, address] }]);
});

test("wallet sign-in rejects malformed challenge and signature data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ nonce: "bad", message: "", expiresAt: "not-a-date" });
  try {
    await assert.rejects(requestWalletAuthChallenge({ networkId: "testnet", address }));
  } finally {
    globalThis.fetch = originalFetch;
  }
  const provider = { async request() { return "0x1234"; } } as unknown as ReadOnlyEip1193Provider;
  await assert.rejects(signWalletAuthenticationMessage(provider, address, message));
});
