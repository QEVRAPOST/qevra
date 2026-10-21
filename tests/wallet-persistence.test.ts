import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearPreferredWallet,
  readPreferredWallet,
  rememberPreferredWallet,
  restorePreferredReadOnlyWallet,
  type WalletIdentityStorage,
} from "@/features/wallet/persistence";
import { beginReadOnlyWalletRefresh, disconnectReadOnlyWallet, refreshReadOnlyWallet, type ReadOnlyEip1193Provider } from "@/features/wallet/read-only";
import type { InjectedReadOnlyWalletChoice } from "@/features/wallet/browser";

function memoryStorage(): WalletIdentityStorage {
  const values = new Map<string, string>();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

function choice(id: string, provider: ReadOnlyEip1193Provider): InjectedReadOnlyWalletChoice {
  return { id, name: "MetaMask", rdns: "io.metamask", provider };
}

test("wallet provider identity survives reload and restores its authorized account silently", async () => {
  const storage = memoryStorage();
  const firstProvider: ReadOnlyEip1193Provider = { async request() { return []; } };
  const originallySelected = choice("eip6963:metamask-before-reload", firstProvider);
  rememberPreferredWallet(originallySelected, storage);

  const methods: string[] = [];
  const address = "0x00000000000000000000000000000000000000aa" as const;
  const reloadedProvider: ReadOnlyEip1193Provider = {
    providerName: "MetaMask",
    async request({ method }) {
      methods.push(method);
      if (method === "eth_accounts") return [address];
      if (method === "eth_chainId") return "0xb626";
      if (method === "eth_getBlockByNumber") return { number: "0x2a", hash: `0x${"a".repeat(64)}` };
      if (method === "eth_getBalance") return "0x16345785d8a0000";
      throw new Error(`unexpected request: ${method}`);
    },
  };
  const discoveredAfterReload = choice("eip6963:metamask-after-reload", reloadedProvider);
  const preferred = readPreferredWallet(storage);
  assert.ok(preferred);

  const restored = await restorePreferredReadOnlyWallet(preferred, [discoveredAfterReload]);

  assert.equal(restored.choice, discoveredAfterReload, "stable RDNS matches the selected provider if its EIP-6963 UUID changes");
  assert.equal(restored.state.status, "connected");
  assert.equal(restored.state.address, address);
  assert.equal(restored.state.providerName, "MetaMask");
  assert.equal(restored.state.chainId, 46_630);
  assert.equal(restored.state.networkName, "Robinhood Chain Testnet");
  assert.equal(restored.state.balance?.amount, "0.1");
  assert.equal(methods.includes("eth_requestAccounts"), false);
  assert.deepEqual(methods, ["eth_accounts", "eth_chainId", "eth_getBlockByNumber", "eth_getBalance", "eth_accounts", "eth_chainId"]);
});

test("missing or revoked wallet access never prompts and keeps provider choice available for recovery", async () => {
  const storage = memoryStorage();
  const provider: ReadOnlyEip1193Provider = {
    providerName: "MetaMask",
    async request({ method }) {
      assert.equal(method, "eth_accounts", "only a silent account check is allowed without a matched provider");
      return [];
    },
  };
  rememberPreferredWallet(choice("eip6963:metamask", provider), storage);
  const preferred = readPreferredWallet(storage);
  assert.ok(preferred);

  const missing = await restorePreferredReadOnlyWallet(preferred, []);
  assert.equal(missing.choice, undefined);
  assert.equal(missing.state.status, "wallet_not_installed");

  const restored = await restorePreferredReadOnlyWallet(preferred, [choice("eip6963:metamask", provider)]);
  assert.equal(restored.state.status, "disconnected");
  assert.match(restored.state.message ?? "", /unlock.*reconnect/i);
  assert.ok(readPreferredWallet(storage), "locked or revoked access retains only the provider identity for later recovery");
});

test("a rejected silent account check is reported without treating it as fresh permission or signature access", async () => {
  const provider: ReadOnlyEip1193Provider = {
    async request({ method }) {
      assert.equal(method, "eth_accounts");
      throw Object.assign(new Error("request denied"), { code: 4001 });
    },
  };
  const restored = await restorePreferredReadOnlyWallet(
    { id: "injected:0", name: "Wallet", rdns: "example.wallet" },
    [{ id: "injected:0", name: "Wallet", rdns: "example.wallet", provider }],
  );
  assert.equal(restored.state.status, "provider_error");
  assert.match(restored.state.message ?? "", /silent account check.*reconnect manually/i);
});

test("balance refresh preserves the selected provider while local disconnect clears it without wallet RPC", async () => {
  const storage = memoryStorage();
  const methods: string[] = [];
  const provider: ReadOnlyEip1193Provider = {
    async request({ method }) {
      methods.push(method);
      if (method === "eth_accounts") return ["0x0000000000000000000000000000000000000001"];
      if (method === "eth_chainId") return "0x1237";
      if (method === "eth_getBlockByNumber") return { number: "0x1", hash: `0x${"b".repeat(64)}` };
      if (method === "eth_getBalance") return "0x0";
      throw new Error(`unexpected request: ${method}`);
    },
  };
  const selected = choice("injected:0", provider);
  rememberPreferredWallet(selected, storage);
  const preferred = readPreferredWallet(storage);
  assert.ok(preferred);
  const restored = await restorePreferredReadOnlyWallet(preferred, [selected]);
  methods.length = 0;

  const refreshed = await refreshReadOnlyWallet(restored.choice?.provider);
  assert.equal(refreshed.status, "connected");
  assert.ok(readPreferredWallet(storage), "refreshing a public balance must not erase the provider identity");
  assert.equal(methods.includes("eth_requestAccounts"), false);

  const disconnected = disconnectReadOnlyWallet();
  clearPreferredWallet(storage);
  assert.equal(disconnected.status, "disconnected");
  assert.equal(readPreferredWallet(storage), undefined);
  assert.equal(methods.includes("eth_requestAccounts"), false);
});

test("a pending balance refresh keeps the connected identity and actual chain but hides stale balance data", () => {
  const connected = {
    status: "connected" as const,
    address: "0x0000000000000000000000000000000000000001" as const,
    providerName: "MetaMask",
    chainId: 46_630,
    networkName: "Robinhood Chain Testnet" as const,
    isQevraTargetNetwork: true,
    balance: {
      symbol: "ETH" as const,
      amount: "0.1",
      wei: "100000000000000000",
      blockNumber: "12",
      blockHash: `0x${"c".repeat(64)}` as `0x${string}`,
      provider: "connected_wallet_rpc" as const,
      observedAt: "2026-10-22T00:00:00.000Z",
    },
  };

  const pending = beginReadOnlyWalletRefresh(connected);

  assert.equal(pending.status, "loading");
  assert.equal(pending.address, connected.address);
  assert.equal(pending.providerName, "MetaMask");
  assert.equal(pending.chainId, 46_630);
  assert.equal(pending.networkName, "Robinhood Chain Testnet");
  assert.equal(pending.balance, undefined, "the previous balance is not shown as current while refreshing");
});
