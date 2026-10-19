import assert from "node:assert/strict";
import { test } from "node:test";
import { getInjectedReadOnlyProvider } from "@/features/wallet/browser";
import { connectReadOnlyWallet, createWalletRequestGuard, disconnectReadOnlyWallet, type ReadOnlyEip1193Provider } from "@/features/wallet/read-only";

test("local disconnect invalidates a pending wallet read", () => {
  const guard = createWalletRequestGuard();
  const pendingRead = guard.begin();
  guard.invalidate();

  assert.equal(guard.isCurrent(pendingRead), false);
});

test("wallet reads address, testnet, balance, and block using only allowlisted RPC methods", async () => {
  const methods: string[] = [];
  const provider: ReadOnlyEip1193Provider = {
    async request({ method }) {
      methods.push(method);
      if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000001"];
      if (method === "eth_chainId") return "0xb626";
      if (method === "eth_getBlockByNumber") return { number: "0x10", hash: `0x${"a".repeat(64)}` };
      if (method === "eth_getBalance") return "0x16345785d8a0000";
      throw new Error(`unexpected method: ${method}`);
    },
  };
  const state = await connectReadOnlyWallet(provider);
  assert.equal(state.status, "connected");
  assert.equal(state.networkName, "Robinhood Chain Testnet");
  assert.equal(state.chainId, 46_630);
  assert.equal(state.balance?.amount, "0.1");
  assert.equal(state.balance?.blockNumber, "16");
  assert.equal(state.balance?.blockHash, `0x${"a".repeat(64)}`);
  assert.equal(state.balance?.provider, "connected_wallet_rpc");
  assert.deepEqual(methods, ["eth_requestAccounts", "eth_chainId", "eth_getBlockByNumber", "eth_getBalance"]);
  assert.equal(methods.some((method) => /sign|send|transaction|approve/i.test(method)), false);
});

test("wallet connection rejection and RPC errors remain explicit and read-only", async () => {
  const rejected = await connectReadOnlyWallet({
    async request() { throw Object.assign(new Error("rejected"), { code: 4001 }); },
  });
  assert.equal(rejected.status, "connection_rejected");

  const rpcFailure = await connectReadOnlyWallet({
    async request({ method }) {
      if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000003"];
      if (method === "eth_chainId") return "0xb626";
      if (method === "eth_getBlockByNumber") return { number: "0x10", hash: `0x${"b".repeat(64)}` };
      throw Object.assign(new Error("rpc unavailable"), { code: -32000 });
    },
  });
  assert.equal(rpcFailure.status, "rpc_unavailable");
  assert.equal(rpcFailure.message, "The wallet's read-only RPC request failed. No write request was sent.");
});

test("wallet reports unsupported networks without fetching balances or switching networks", async () => {
  const methods: string[] = [];
  const provider: ReadOnlyEip1193Provider = {
    async request({ method }) {
      methods.push(method);
      if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000002"];
      if (method === "eth_chainId") return "0x1";
      throw new Error(`unexpected method: ${method}`);
    },
  };
  const state = await connectReadOnlyWallet(provider);
  assert.equal(state.status, "unsupported_network");
  assert.deepEqual(methods, ["eth_requestAccounts", "eth_chainId"]);
});

test("disconnect is local and sends no request to the wallet", () => {
  assert.deepEqual(disconnectReadOnlyWallet(), {
    status: "disconnected",
    message: "Wallet disconnected from this view. No wallet request was sent.",
  });
});

test("browser provider discovery does not request accounts until the user-triggered connect function runs", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const methods: string[] = [];
  const injected = {
    async request({ method }: { method: string }) {
      methods.push(method);
      if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000004"];
      if (method === "eth_chainId") return "0xb626";
      if (method === "eth_getBlockByNumber") return { number: "0x20", hash: `0x${"c".repeat(64)}` };
      if (method === "eth_getBalance") return "0x0";
      throw new Error("unexpected provider method");
    },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { ethereum: injected } });
  try {
    const provider = getInjectedReadOnlyProvider();
    assert.ok(provider);
    assert.deepEqual(methods, [], "provider discovery must be passive");
    const state = await connectReadOnlyWallet(provider);
    assert.equal(state.status, "connected");
    assert.equal(methods[0], "eth_requestAccounts", "account access is requested only after explicit connect");
    assert.equal(methods.some((method) => /sign|send|approve|switch/i.test(method)), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
