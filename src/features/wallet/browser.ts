"use client";

import type { ReadOnlyEip1193Provider } from "./read-only";

interface Eip1193Like {
  request?: unknown;
  on?: unknown;
  removeListener?: unknown;
  providers?: unknown;
  info?: unknown;
}

export interface InjectedReadOnlyWalletChoice {
  id: string;
  name: string;
  rdns?: string;
  icon?: string;
  provider: ReadOnlyEip1193Provider;
}

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const safe = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
  return safe || undefined;
}

function safeWalletIcon(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 65_536) return undefined;
  if (!/^data:image\/(?:svg\+xml|png|jpe?g|webp|gif|x-icon|avif)(?:;charset=[a-z0-9._-]+)?(?:;base64)?,/i.test(value)) return undefined;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return undefined;
  return value;
}

function wrapProvider(candidate: unknown, announcedName?: string): ReadOnlyEip1193Provider | undefined {
  if (!candidate || typeof candidate !== "object") return undefined;
  const provider = candidate as Eip1193Like;
  if (typeof provider.request !== "function") return undefined;
  const info = provider.info && typeof provider.info === "object" ? provider.info as { name?: unknown } : undefined;
  const providerName = safeText(announcedName, 60) ?? safeText(info?.name, 60);
  return {
    request: ({ method, params }) => (provider.request as (this: unknown, args: { method: string; params?: unknown[] }) => Promise<unknown>)
      .call(candidate, { method, ...(params ? { params: [...params] } : {}) }),
    ...(providerName ? { providerName } : {}),
    ...(typeof provider.on === "function"
      ? { on: (event, listener) => (provider.on as (this: unknown, event: string, listener: (...args: unknown[]) => void) => void).call(candidate, event, listener) }
      : {}),
    ...(typeof provider.removeListener === "function"
      ? { removeListener: (event, listener) => (provider.removeListener as (this: unknown, event: string, listener: (...args: unknown[]) => void) => void).call(candidate, event, listener) }
      : {}),
  };
}

/**
 * Discovers installed EIP-6963 wallets and legacy injected providers without calling their RPC APIs.
 * The account permission request remains in the explicit wallet-choice click handler.
 */
export async function discoverInjectedReadOnlyWallets(waitMs = 300): Promise<InjectedReadOnlyWalletChoice[]> {
  if (typeof window === "undefined") return [];

  const discovered = new Map<string, InjectedReadOnlyWalletChoice>();
  const announcedProviders = new Set<object>();
  const seenUuids = new Set<string>();
  const announce = (event: Event) => {
    const detail = (event as Event & { detail?: unknown }).detail;
    if (!detail || typeof detail !== "object") return;
    const announcement = detail as { info?: unknown; provider?: unknown };
    if (!announcement.info || typeof announcement.info !== "object") return;
    const info = announcement.info as { uuid?: unknown; name?: unknown; rdns?: unknown; icon?: unknown };
    const uuid = safeText(info.uuid, 128);
    const name = safeText(info.name, 60);
    const rdns = safeText(info.rdns, 128);
    if (!uuid || !name || !rdns || !announcement.provider || typeof announcement.provider !== "object") return;
    if (seenUuids.has(uuid) || announcedProviders.has(announcement.provider)) return;
    const provider = wrapProvider(announcement.provider, name);
    if (!provider) return;
    const icon = safeWalletIcon(info.icon);
    seenUuids.add(uuid);
    announcedProviders.add(announcement.provider);
    discovered.set(`eip6963:${uuid}`, { id: `eip6963:${uuid}`, name, rdns, ...(icon ? { icon } : {}), provider });
  };

  window.addEventListener("eip6963:announceProvider", announce);
  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, Math.max(0, waitMs)));
  } finally {
    window.removeEventListener("eip6963:announceProvider", announce);
  }

  const ethereum = (window as Window & { ethereum?: unknown }).ethereum;
  const legacyCandidates: unknown[] = [];
  if (ethereum && typeof ethereum === "object") {
    const providers = (ethereum as Eip1193Like).providers;
    legacyCandidates.push(...(Array.isArray(providers) && providers.length > 0 ? providers : [ethereum]));
  }
  const phantomProvider = (window as Window & { phantom?: { ethereum?: unknown } }).phantom?.ethereum;
  if (phantomProvider) legacyCandidates.push(phantomProvider);

  const uniqueCandidates = [...new Set(legacyCandidates.filter((candidate): candidate is object => Boolean(candidate) && typeof candidate === "object"))];
  let legacyIndex = 0;
  for (const candidate of uniqueCandidates) {
    if (announcedProviders.has(candidate)) continue;
    const provider = wrapProvider(candidate);
    if (!provider) continue;
    const info = (candidate as Eip1193Like).info;
    const metadata = info && typeof info === "object" ? info as { name?: unknown; rdns?: unknown; icon?: unknown } : undefined;
    const legacyProvider = candidate as Eip1193Like & { isMetaMask?: unknown; isPhantom?: unknown };
    const legacyName = candidate === phantomProvider || legacyProvider.isPhantom === true
      ? "Phantom"
      : legacyProvider.isMetaMask === true ? "MetaMask" : undefined;
    const name = safeText(metadata?.name, 60) ?? legacyName ?? `Injected EVM wallet ${legacyIndex + 1}`;
    const rdns = safeText(metadata?.rdns, 128);
    const icon = safeWalletIcon(metadata?.icon);
    const id = `injected:${legacyIndex++}`;
    discovered.set(id, { id, name, ...(rdns ? { rdns } : {}), ...(icon ? { icon } : {}), provider: { ...provider, providerName: name } });
  }
  return [...discovered.values()];
}

/** Reads an injected EIP-1193 provider handle; it sends no request and is called only from a user action. */
export function getInjectedReadOnlyProvider(): ReadOnlyEip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  const ethereum = (window as Window & { ethereum?: unknown }).ethereum;
  if (!ethereum || typeof ethereum !== "object") return undefined;
  const providers = (ethereum as Eip1193Like).providers;
  if (Array.isArray(providers)) {
    for (const candidate of providers) {
      const provider = wrapProvider(candidate);
      if (provider) return provider;
    }
  }
  return wrapProvider(ethereum);
}
