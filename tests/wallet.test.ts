import assert from "node:assert/strict";
import { test } from "node:test";
import { copyTextToClipboard } from "@/features/wallet/clipboard";
import { getInjectedReadOnlyProvider } from "@/features/wallet/browser";
import { connectReadOnlyWallet, createWalletRequestGuard, disconnectReadOnlyWallet, refreshReadOnlyWallet, watchReadOnlyWallet, type ReadOnlyEip1193Provider } from "@/features/wallet/read-only";

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
      if (method === "eth_requestAccounts" || method === "eth_accounts") return ["0x0000000000000000000000000000000000000001"];
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
  assert.deepEqual(methods, ["eth_requestAccounts", "eth_chainId", "eth_getBlockByNumber", "eth_getBalance", "eth_accounts", "eth_chainId"]);
  assert.equal(methods.some((method) => /sign|send|transaction|approve/i.test(method)), false);
});

test("wallet refresh reads Robinhood Mainnet without requesting account permission again", async () => {
  const methods: string[] = [];
  const provider: ReadOnlyEip1193Provider = {
    async request({ method }) {
      methods.push(method);
      if (method === "eth_accounts") return ["0x0000000000000000000000000000000000000007"];
      if (method === "eth_chainId") return "0x1237";
      if (method === "eth_getBlockByNumber") return { number: "0x2a", hash: `0x${"e".repeat(64)}` };
      if (method === "eth_getBalance") return "0x0";
      throw new Error(`unexpected method: ${method}`);
    },
  };

  const state = await refreshReadOnlyWallet(provider);
  assert.equal(state.status, "connected");
  assert.equal(state.networkName, "Robinhood Chain");
  assert.equal(state.chainId, 4_663);
  assert.equal(state.balance?.amount, "0");
  assert.equal(state.balance?.blockNumber, "42");
  assert.equal(methods.includes("eth_requestAccounts"), false);
  assert.deepEqual(methods, ["eth_accounts", "eth_chainId", "eth_getBlockByNumber", "eth_getBalance", "eth_accounts", "eth_chainId"]);
});

test("wallet connection reports a missing injected provider without making a request", async () => {
  const state = await connectReadOnlyWallet();
  assert.equal(state.status, "wallet_not_installed");
  assert.match(state.message ?? "", /No EIP-1193 wallet provider/);
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

test("wallet RPC failure retains the authorized address and chain but never a stale balance", async () => {
  const address = "0x0000000000000000000000000000000000000008" as const;
  const provider: ReadOnlyEip1193Provider = {
    async request({ method }) {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
      if (method === "eth_chainId") return "0xb626";
      if (method === "eth_getBlockByNumber") throw Object.assign(new Error("RPC unavailable"), { code: -32000 });
      throw new Error(`unexpected method: ${method}`);
    },
  };

  const state = await connectReadOnlyWallet(provider);

  assert.equal(state.status, "rpc_unavailable");
  assert.equal(state.address, address);
  assert.equal(state.chainId, 46_630);
  assert.equal(state.networkName, "Robinhood Chain Testnet");
  assert.equal(state.balance, undefined);
});

test("copy address reports whether the clipboard accepted the exact public address", async () => {
  const copied: string[] = [];
  const address = "0x0000000000000000000000000000000000000009";

  const success = await copyTextToClipboard(address, { async writeText(value) { copied.push(value); } });
  const failure = await copyTextToClipboard(address, { async writeText() { throw new Error("clipboard denied"); } });

  assert.deepEqual(copied, [address]);
  assert.equal(success, true);
  assert.equal(failure, false);
});

test("wallet read fails closed when address or network changes during a balance read", async () => {
  for (const change of ["account", "network"] as const) {
    let accountReads = 0;
    let chainReads = 0;
    const provider: ReadOnlyEip1193Provider = {
      async request({ method }) {
        if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000005"];
        if (method === "eth_accounts") {
          accountReads += 1;
          return [change === "account" && accountReads >= 1
            ? "0x0000000000000000000000000000000000000006"
            : "0x0000000000000000000000000000000000000005"];
        }
        if (method === "eth_chainId") {
          chainReads += 1;
          return change === "network" && chainReads > 1 ? "0x1234" : "0xb626";
        }
        if (method === "eth_getBlockByNumber") return { number: "0x10", hash: `0x${"d".repeat(64)}` };
        if (method === "eth_getBalance") return "0x16345785d8a0000";
        throw new Error(`unexpected method: ${method}`);
      },
    };

    const state = await connectReadOnlyWallet(provider);
    assert.equal(state.status, "provider_error", `${change} changes during the read must not return a connected snapshot`);
    assert.equal(state.address, undefined);
    assert.equal(state.balance, undefined);
    assert.match(state.message ?? "", /changed while reading/);
  }
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

test("account, chain, and disconnect events trigger refresh and are removed on cleanup", () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let requests = 0;
  const provider: ReadOnlyEip1193Provider = {
    async request() { requests += 1; return undefined; },
    on(event, listener) {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
  };
  let refreshes = 0;
  const stopWatching = watchReadOnlyWallet(provider, () => { refreshes += 1; });

  for (const event of ["accountsChanged", "chainChanged", "disconnect"] as const) {
    listeners.get(event)?.forEach((listener) => listener());
  }
  assert.equal(refreshes, 3);
  assert.equal(requests, 0, "provider events schedule a fresh read without asking for account permission");

  stopWatching();
  for (const event of ["accountsChanged", "chainChanged", "disconnect"] as const) {
    listeners.get(event)?.forEach((listener) => listener());
    assert.equal(listeners.get(event)?.size, 0);
  }
  assert.equal(refreshes, 3);
});

test("browser provider discovery does not request accounts until the user-triggered connect function runs", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const methods: string[] = [];
  const injected = {
    async request({ method }: { method: string }) {
      methods.push(method);
      if (method === "eth_requestAccounts" || method === "eth_accounts") return ["0x0000000000000000000000000000000000000004"];
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
