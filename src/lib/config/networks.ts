import type { NetworkId, NetworkOption } from "@/types";

/**
 * The networks offered in the app's network menu.
 *
 * Chain ids are the ones Robinhood documents (docs/QEVRA_ENGINEERING_ADDENDUM.md): testnet 46630, mainnet 4663.
 * Mainnet is listed so the menu is ready for it, but it cannot be picked: no QEVRA contract or route exists on it,
 * and release to mainnet needs the independent security review and release gate in the PM brief.
 *
 * When Robinhood Mainnet is released for QEVRA: set `available: true` on mainnet and DEFAULT_NETWORK_ID to "mainnet".
 * Nothing else in the UI needs to change. This file is configuration only; it reads no chain and holds no key.
 */
export const NETWORKS: readonly NetworkOption[] = [
  { id: "testnet", label: "Robinhood Testnet", short: "Testnet", chainId: 46630, available: true },
  { id: "mainnet", label: "Robinhood Mainnet", short: "Mainnet", chainId: 4663, available: false, note: "not available yet" },
];

/** The network the app opens on. Testnet while mainnet is unavailable. */
export const DEFAULT_NETWORK_ID: NetworkId = "testnet";

export const isNetworkAvailable = (id: NetworkId): boolean => NETWORKS.some((n) => n.id === id && n.available);
