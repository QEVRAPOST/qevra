# VEYRA swap backend status

The supported request shape, quote validation, and Intent Lock comparison live
in `validation.ts`. `POST /api/swap/quote` accepts bounded, chain-checked inputs
and currently returns `status: "unavailable"`, `reason: "no_verified_route"`,
and `quote: null` for both networks. Signing and execution stay disabled.

The official Robinhood Chain documentation currently lists public/provider RPCs,
canonical token information, and L1/L2 gateway contracts. The documented L2
Gateway Router is for bridging; it is not a DEX router or quote source. The
Token Contracts page lists Mainnet WETH and USDG but does not establish a swap
route, executable liquidity, or the needed Testnet pair/router. No supported
quote integration or router is configured in this repository. Consequently,
token presence or chain connectivity is not treated as evidence of liquidity.

Before enabling quote discovery, add a supported provider/route, verify its
chain-specific router runtime hash, token addresses and decimals, route output,
expiry, and actual calldata parameters. The current validators reject unknown
providers and routers; no API response fabricates a price or quote.
