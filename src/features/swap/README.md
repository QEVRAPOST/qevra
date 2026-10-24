# Robinhood Mainnet swap integration

The application swap path is an external-wallet integration for Robinhood Chain
Mainnet (chain ID `4663`). It uses the server-side 0x Swap API v2
AllowanceHolder `price` and `quote` endpoints. It does not depend on, deploy, or
execute through the proposed VEYRA-owned Solidity swap contracts.

## Runtime configuration

- Set `QEVRA_APP_MODE=live` on the server. The quote API fails closed unless
  this value is exactly `live`.
- Set `ZEROX_API_KEY` as a server-only secret. Never expose it through a
  `NEXT_PUBLIC_*` variable or return it to the browser.
- The API and independent deployment reads use
  `https://rpc.mainnet.chain.robinhood.com` and chain ID `4663`.
- A missing key, non-live app mode, unavailable RPC metadata, rejected route,
  or incomplete 0x simulation returns an unavailable/error response. No mock
  price or route is substituted.

## Validation and execution boundary

The API supports only the configured Mainnet ETH, WETH, and USDG identifiers.
It reads token code, symbol, and decimals from Robinhood Mainnet before sending
an amount to 0x. A firm quote must match the request, report liquidity and a
complete simulation, pass expiry/slippage checks, and include executable
calldata. The reported AllowanceHolder spender and transaction target are
required to equal 0x's published AllowanceHolder address, then checked for
Mainnet bytecode and against the live 0x Settler registry; the Settler is never
an approval target.

The browser rechecks the quote digest, wallet account and chain, current
balance/allowance, contract code, registry state, gas estimate, and pending
transaction nonce. Network switching, any exact-amount ERC-20 approval, and the
swap transaction each require a separate explicit wallet action. The browser
never receives the 0x API key. The API explicitly sets the connected wallet as
the recipient for ordinary routes; 0x documents that native wrap/unwrap routes
do not accept a custom recipient and default to the taker. This implementation
does not bypass token or regional restrictions.

The API/unit and wallet-execution tests use provider and RPC fixtures. They do
not prove that a particular token pair has live Robinhood Mainnet liquidity.
No live 0x quote, wallet transaction, receipt, or funded swap is claimed by
this repository status. A configured-key quote preflight and owner-reviewed
browser acceptance are still required before describing a route as available.

## Off-chain ML-DSA-44 attestation

An optional browser-local ML-DSA-44 attestation is domain-separated and binds
the canonical Robinhood Mainnet swap intent, quote digest, account, recipient,
chain, token amounts, slippage, spender, transaction target/data/value, wallet
nonce, and short expiry. If created, the browser verifies the signature against
the displayed intent, and verifies it again before the wallet transaction
prompt. Changing any bound field invalidates the attestation. It remains
optional and does not gate the separately reviewed EVM transaction.

The implementation uses native WebCrypto ML-DSA-44 when available and a
JavaScript `@noble/post-quantum` fallback when the algorithm is unsupported.
Both paths use browser cryptographic randomness. The fallback is not
constant-time, has no independent audit, and can only clear caller-owned secret
buffers on a best-effort basis; JavaScript cannot guarantee memory erasure.
No private key is persisted or sent to the server. This is an experimental
off-chain review aid: it does not authorize, execute, or make an EVM swap
quantum-resistant. The vulnerable on-chain PQ custody path remains blocked.
