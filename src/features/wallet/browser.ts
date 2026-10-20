"use client";

import type { ReadOnlyEip1193Provider } from "./read-only";

interface Eip1193Like {
  request?: unknown;
  on?: unknown;
  removeListener?: unknown;
  providers?: unknown;
  info?: unknown;
}

function wrapProvider(candidate: unknown): ReadOnlyEip1193Provider | undefined {
  if (!candidate || typeof candidate !== "object") return undefined;
  const provider = candidate as Eip1193Like;
  if (typeof provider.request !== "function") return undefined;
  const info = provider.info && typeof provider.info === "object" ? provider.info as { name?: unknown; rdns?: unknown } : undefined;
  const providerName = typeof info?.name === "string" && typeof info.rdns === "string"
    ? info.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60) || undefined
    : undefined;
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
