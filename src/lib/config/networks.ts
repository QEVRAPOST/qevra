import type { NetworkId, NetworkOption } from "@/types";

/** Robinhood application networks offered strictly for public read-only observations. */
export const NETWORKS: readonly NetworkOption[] = [
  {
    id: "testnet",
    label: "Robinhood Testnet",
    short: "Testnet",
    chainId: 46_630,
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    available: true,
  },
  {
    id: "mainnet",
    label: "Robinhood Mainnet",
    short: "Mainnet",
    chainId: 4_663,
    rpcUrl: "https://robinhood.rpc.pinax.network",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    available: true,
  },
];

/** Keep the local preview on Testnet; selecting Mainnet changes only public read requests. */
export const DEFAULT_NETWORK_ID: NetworkId = "testnet";

export const isNetworkAvailable = (id: NetworkId): boolean => NETWORKS.some((n) => n.id === id && n.available);

/** Build a trusted explorer URL only for a configured network and a well-formed public EVM address. */
export function getExplorerAddressUrl(networkId: NetworkId, address: string): string | undefined {
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network || !/^0x[0-9a-f]{40}$/i.test(address)) return undefined;
  return new URL(`/address/${encodeURIComponent(address)}`, network.explorerUrl).toString();
}
