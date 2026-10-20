/** The Robinhood Chain networks the app can be pointed at. */
export type NetworkId = "testnet" | "mainnet";

export interface NetworkOption {
  id: NetworkId;
  /** full name, shown in the network menu */
  label: string;
  /** short name for narrow screens */
  short: string;
  chainId: number;
  /** Official public read-only JSON-RPC endpoint. */
  rpcUrl: string;
  /** Official block explorer root for read-only address and block links. */
  explorerUrl: string;
  /** Whether the network can be selected for public reads; this grants no deployment or write capability. */
  available: boolean;
  /** why it cannot be picked, in a few words */
  note?: string;
}

export interface NetworkRpcState {
  status: "not_requested" | "loading" | "available" | "unavailable";
  chainId?: number;
  latestBlock?: string;
  observedAt?: string;
  errorCode?: string;
  message?: string;
}
