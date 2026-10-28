import type { NetworkId, NetworkOption } from "@/types";

/** Robinhood networks available to public reads; Mainnet is the default product context. */
export const NETWORKS: readonly NetworkOption[] = [
  {
    id: "mainnet",
    label: "Robinhood Mainnet",
    short: "Mainnet",
    chainId: 4_663,
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    available: true,
  },
  {
    id: "testnet",
    label: "Robinhood Testnet",
    short: "Testnet",
    chainId: 46_630,
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    available: true,
  },
];

/** Mainnet is the app's default; the Networks page has a separate public-read selector. */
export const DEFAULT_NETWORK_ID: NetworkId = "mainnet";

export const isNetworkAvailable = (id: NetworkId): boolean => NETWORKS.some((n) => n.id === id && n.available);

/** Build a trusted explorer URL only for a configured network and a well-formed public EVM address. */
export function getExplorerAddressUrl(networkId: NetworkId, address: string): string | undefined {
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network || !/^0x[0-9a-f]{40}$/i.test(address)) return undefined;
  return new URL(`/address/${encodeURIComponent(address)}`, network.explorerUrl).toString();
}

/** Build a trusted explorer URL only for a configured network and a well-formed transaction hash. */
export function getExplorerTransactionUrl(networkId: NetworkId, transactionHash: string): string | undefined {
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network || !/^0x[0-9a-f]{64}$/i.test(transactionHash)) return undefined;
  return new URL(`/tx/${encodeURIComponent(transactionHash)}`, network.explorerUrl).toString();
}
