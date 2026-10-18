/** The Robinhood Chain networks the app can be pointed at. */
export type NetworkId = "testnet" | "mainnet";

export interface NetworkOption {
  id: NetworkId;
  /** full name, shown in the network menu */
  label: string;
  /** short name for narrow screens */
  short: string;
  chainId: number;
  /** false until QEVRA is released for that network. An unavailable network is listed but cannot be picked. */
  available: boolean;
  /** why it cannot be picked, in a few words */
  note?: string;
}
