"use client";

import type { ReadOnlyEip1193Provider } from "./read-only";

interface Eip1193Like {
  request?: unknown;
  on?: unknown;
  removeListener?: unknown;
  providers?: unknown;
}

function wrapProvider(candidate: unknown): ReadOnlyEip1193Provider | undefined {
  if (!candidate || typeof candidate !== "object") return undefined;
  const provider = candidate as Eip1193Like;
  if (typeof provider.request !== "function") return undefined;
  return {
    request: ({ method, params }) => (provider.request as (this: unknown, args: { method: string; params?: unknown[] }) => Promise<unknown>)
      .call(candidate, { method, ...(params ? { params: [...params] } : {}) }),
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
