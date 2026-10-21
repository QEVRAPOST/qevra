"use client";

import type { InjectedReadOnlyWalletChoice } from "./browser";
import { refreshReadOnlyWallet } from "./read-only";
import type { ReadOnlyWalletState } from "@/types/integrations";

export interface WalletProviderIdentity {
  id: string;
  name: string;
  rdns?: string;
}

export interface WalletIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PREFERRED_WALLET_STORAGE_KEY = "veyra.preferred-wallet";

function browserStorage(): WalletIdentityStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function identityText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text.length <= maxLength ? text : undefined;
}

export function rememberPreferredWallet(
  choice: Pick<InjectedReadOnlyWalletChoice, "id" | "name" | "rdns">,
  storage: WalletIdentityStorage | undefined = browserStorage(),
): void {
  if (!storage) return;
  const id = identityText(choice.id, 256);
  const name = identityText(choice.name, 60);
  const rdns = identityText(choice.rdns, 128);
  if (!id || !name) return;
  try {
    storage.setItem(PREFERRED_WALLET_STORAGE_KEY, JSON.stringify({ id, name, ...(rdns ? { rdns } : {}) }));
  } catch {
    // A blocked browser storage API must not block a successful in-memory connection.
  }
}

export function readPreferredWallet(
  storage: WalletIdentityStorage | undefined = browserStorage(),
): WalletProviderIdentity | undefined {
  if (!storage) return undefined;
  try {
    const serialized = storage.getItem(PREFERRED_WALLET_STORAGE_KEY);
    if (!serialized || serialized.length > 512) return undefined;
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    const id = identityText(record.id, 256);
    const name = identityText(record.name, 60);
    const rdns = identityText(record.rdns, 128);
    if (!id || !name) return undefined;
    return { id, name, ...(rdns ? { rdns } : {}) };
  } catch {
    return undefined;
  }
}

export function clearPreferredWallet(storage: WalletIdentityStorage | undefined = browserStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(PREFERRED_WALLET_STORAGE_KEY);
  } catch {
    // Local disconnect still succeeds if browser storage is unavailable.
  }
}

export function findPreferredWalletChoice(
  identity: WalletProviderIdentity,
  choices: readonly InjectedReadOnlyWalletChoice[],
): InjectedReadOnlyWalletChoice | undefined {
  if (identity.rdns) {
    const matches = choices.filter((choice) => choice.rdns === identity.rdns);
    return matches.find((choice) => choice.id === identity.id) ?? matches[0];
  }
  const idMatch = choices.find((choice) => choice.id === identity.id);
  if (idMatch) return idMatch;
  const nameMatches = choices.filter((choice) => !choice.rdns && choice.name.toLowerCase() === identity.name.toLowerCase());
  return nameMatches.length === 1 ? nameMatches[0] : undefined;
}

export async function restorePreferredReadOnlyWallet(
  identity: WalletProviderIdentity,
  choices: readonly InjectedReadOnlyWalletChoice[],
  onProviderSelected?: (choice: InjectedReadOnlyWalletChoice) => void,
): Promise<{ choice?: InjectedReadOnlyWalletChoice; state: ReadOnlyWalletState }> {
  const choice = findPreferredWalletChoice(identity, choices);
  if (!choice) {
    return {
      state: {
        status: "wallet_not_installed",
        message: `${identity.name} was not found. Re-enable that extension or choose another wallet to reconnect.`,
      },
    };
  }
  onProviderSelected?.(choice);
  return { choice, state: await refreshReadOnlyWallet(choice.provider) };
}
