import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { discoverInjectedReadOnlyWallets } from "@/features/wallet/browser";
import { connectReadOnlyWallet } from "@/features/wallet/read-only";

function withFakeWindow<T>(windowValue: object, run: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowValue });
  return run().finally(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  });
}

function eventTargetWithAnnouncements(
  announcements: Array<{ info: { uuid: string; name: string; rdns: string; icon?: string }; provider: { request: (args: { method: string }) => Promise<unknown> } }>,
) {
  const target = new EventTarget() as EventTarget & { ethereum?: unknown };
  const dispatch = target.dispatchEvent.bind(target);
  target.dispatchEvent = ((event: Event) => {
    const result = dispatch(event);
    if (event.type === "eip6963:requestProvider") {
      for (const detail of announcements) {
        dispatch(Object.assign(new Event("eip6963:announceProvider"), { detail }));
      }
    }
    return result;
  }) as EventTarget["dispatchEvent"];
  return target;
}

test("EIP-6963 discovery lists MetaMask, Phantom, Rabby, and Coinbase Wallet without requesting account access", async () => {
  const requestedBy: string[] = [];
  const metamaskIcon = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";
  const phantomIcon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
  const makeProvider = (name: string) => ({
    async request({ method }: { method: string }) {
      requestedBy.push(`${name}:${method}`);
      return [];
    },
  });
  const metamask = makeProvider("MetaMask");
  const phantom = makeProvider("Phantom");
  const rabby = makeProvider("Rabby Wallet");
  const coinbase = makeProvider("Coinbase Wallet");
  const fakeWindow = eventTargetWithAnnouncements([
    { info: { uuid: "mm-uuid", name: "MetaMask", rdns: "io.metamask", icon: metamaskIcon }, provider: metamask },
    { info: { uuid: "phantom-uuid", name: "Phantom", rdns: "app.phantom", icon: phantomIcon }, provider: phantom },
    { info: { uuid: "rabby-uuid", name: "Rabby Wallet", rdns: "io.rabby" }, provider: rabby },
    { info: { uuid: "coinbase-uuid", name: "Coinbase Wallet", rdns: "com.coinbase.wallet" }, provider: coinbase },
  ]);

  await withFakeWindow(fakeWindow, async () => {
    const wallets = await discoverInjectedReadOnlyWallets(0);
    assert.deepEqual(wallets.map(({ name, rdns }) => ({ name, rdns })), [
      { name: "MetaMask", rdns: "io.metamask" },
      { name: "Phantom", rdns: "app.phantom" },
      { name: "Rabby Wallet", rdns: "io.rabby" },
      { name: "Coinbase Wallet", rdns: "com.coinbase.wallet" },
    ]);
    assert.deepEqual(wallets.map(({ icon }) => icon), [metamaskIcon, phantomIcon, undefined, undefined]);
    assert.deepEqual(wallets.map(({ provider }) => provider.providerName), ["MetaMask", "Phantom", "Rabby Wallet", "Coinbase Wallet"]);
    assert.deepEqual(requestedBy, [], "discovery must not request account access or call wallet RPC");
    await connectReadOnlyWallet(wallets[0].provider);
    await connectReadOnlyWallet(wallets[1].provider);
    assert.deepEqual(requestedBy, [
      "MetaMask:eth_requestAccounts",
      "Phantom:eth_requestAccounts",
    ], "only the explicitly selected MetaMask and Phantom providers request account access");
  });
});

test("legacy injected provider discovery offers every installed provider without wallet RPC calls", async () => {
  const requestedMethods: string[] = [];
  const providers = ["Wallet One", "Wallet Two"].map((name) => ({
    info: {
      name,
      rdns: `example.${name.toLowerCase().replaceAll(" ", "")}`,
      ...(name === "Wallet One" ? { icon: "https://untrusted.example/wallet.svg" } : { icon: "data:image/webp;base64,UklGRg==" }),
    },
    async request({ method }: { method: string }) {
      requestedMethods.push(method);
      return [];
    },
  }));
  const legacyMetaMask = {
    isMetaMask: true,
    async request({ method }: { method: string }) {
      requestedMethods.push(method);
      return [];
    },
  };
  const legacyPhantom = {
    async request({ method }: { method: string }) {
      requestedMethods.push(method);
      return [];
    },
  };
  const fakeWindow = eventTargetWithAnnouncements([]);
  fakeWindow.ethereum = { providers: [...providers, legacyMetaMask] };
  (fakeWindow as EventTarget & { phantom?: { ethereum?: unknown } }).phantom = { ethereum: legacyPhantom };

  await withFakeWindow(fakeWindow, async () => {
    const wallets = await discoverInjectedReadOnlyWallets(0);
    assert.deepEqual(wallets.map(({ name }) => name), ["Wallet One", "Wallet Two", "MetaMask", "Phantom"]);
    assert.equal(wallets[2]?.rdns, "io.metamask", "legacy MetaMask should retain a stable provider identity across reloads");
    assert.equal(wallets[3]?.rdns, "app.phantom", "the detected Phantom provider should have a stable brand fallback key");
    assert.deepEqual(wallets.slice(0, 2).map(({ icon }) => icon), [undefined, "data:image/webp;base64,UklGRg=="]);
    assert.deepEqual(requestedMethods, []);
  });
});

test("Phantom with no usable announced icon renders the local official wallet mark", async () => {
  const provider = { async request() { return []; } };
  const fakeWindow = eventTargetWithAnnouncements([
    { info: { uuid: "phantom-no-icon", name: "Phantom", rdns: "app.phantom" }, provider },
  ]);

  const choices = await withFakeWindow(fakeWindow, () => discoverInjectedReadOnlyWallets(0));
  assert.equal(choices[0]?.icon, undefined);

  const markup = execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { WalletPickerDialog } from "./src/components/dashboard/WalletPickerDialog.tsx"; const choices = [{ id: "phantom-no-icon", name: "Phantom", rdns: "app.phantom", provider: { async request() { return []; } } }]; process.stdout.write(renderToStaticMarkup(createElement(WalletPickerDialog, { open: true, choices, isDiscovering: false, onSelect() {}, onClose() {} })))`,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.match(markup, /src="\/wallets\/phantom\.svg"/);

  const localAsset = readFileSync(resolve(process.cwd(), "public/wallets/phantom.svg"), "utf8");
  assert.match(localAsset, /viewBox="0 0 267 267"/);
  assert.match(localAsset, /fill="#AB9FF2"/i);
});

test("wallet picker exposes each discovered provider as an explicit read-only connection choice", () => {
  const markup = execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { WalletPickerDialog } from "./src/components/dashboard/WalletPickerDialog.tsx"; const choices = [{ id: "MetaMask", name: "MetaMask", rdns: "io.metamask", icon: "data:image/svg+xml,%3Csvg%2F%3E", provider: { async request() { return []; } } }, { id: "Phantom", name: "Phantom", rdns: "app.phantom", icon: "data:image/png;base64,iVBORw0KGgo=", provider: { async request() { return []; } } }, { id: "Rabby", name: "Rabby Wallet", rdns: "io.rabby", provider: { async request() { return []; } } }, { id: "Coinbase", name: "Coinbase Wallet", rdns: "com.coinbase.wallet", provider: { async request() { return []; } } }]; process.stdout.write(renderToStaticMarkup(createElement(WalletPickerDialog, { open: true, choices, isDiscovering: false, onSelect() {}, onClose() {} })))`,
  ], { cwd: process.cwd(), encoding: "utf8" });

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /Continue with MetaMask/);
  assert.match(markup, /Continue with Phantom/);
  assert.match(markup, /Continue with Rabby Wallet/);
  assert.match(markup, /Continue with Coinbase Wallet/);
  assert.match(markup, /Account access is requested only after you choose a wallet/);
  assert.match(markup, /No signing, transactions, or network switching/);
  assert.equal((markup.match(/class="wallet-picker-icon"/g) ?? []).length, 2);
  assert.match(markup, /<img[^>]+alt=""[^>]+aria-hidden="true"/);
  assert.doesNotMatch(markup, /<svg\b/i, "provider SVG is not inserted into the document as markup");
});
