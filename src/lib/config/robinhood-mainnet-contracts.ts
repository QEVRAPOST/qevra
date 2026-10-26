/** Public Robinhood Mainnet contract configuration shared by swap and read-only explorer surfaces. */
export const ZEROX_ALLOWANCE_HOLDER = "0x0000000000001fF3684f28c67538d4D072C22734" as const;
export const ZEROX_SETTLER_REGISTRY = "0x00000000000004533Fe15556B1E086BB1A72cEae" as const;
export const NATIVE_ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

export const ROBINHOOD_MAINNET_TOKENS = {
  ETH: { id: "ETH", address: NATIVE_ETH_ADDRESS, symbol: "ETH", decimals: 18, native: true },
  WETH: { id: "WETH", address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", symbol: "WETH", decimals: 18, native: false },
  USDG: { id: "USDG", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG", decimals: 6, native: false },
} as const;
