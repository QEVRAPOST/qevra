# Contracts workspace

This Foundry workspace is reserved for Solidity contracts and local tests.
The production smart-account architecture, verifier integration, key
registration, recovery policy, and upgrade policy remain undecided pending the
Phase 0 feasibility gate.

The isolated Phase 0 harness under `src/phase0` and `phase0-tests` is research
code only. It is not a production account implementation and must not receive
funds.

## Proposed ten-contract architecture

These are proposed protocol roles, not existing source files or approval to
deploy. No contract below is currently eligible for Testnet or Mainnet. The
Phase 0 ML-DSA key-registration forgery remains a hard stop for account
authorization, custody, funding, recovery, deposits, and withdrawals.

| # | Proposed Solidity name | Purpose and required dependencies | Source / Foundry coverage | Security gate | Testnet / Mainnet |
|---:|---|---|---|---|---|
| 1 | `VeyraKeyRegistrationValidator` | Binds the canonical ML-DSA public key to its prepared verification blob and rejects degenerate/noncanonical keys; prerequisite for #2. | Not implemented; no tests. | **Blocked:** no reviewed registration proof closes the known forgery. | No / No |
| 2 | `VeyraKeyRegistry` | Records immutable validated account-key bindings; depends on #1 and binds records to account identity. | Not implemented; no tests. | **Blocked:** cannot accept keys until #1 is independently reviewed. | No / No |
| 3 | `VeyraRecoveryPolicy` | Encodes a reviewed threshold recovery transition without a unilateral EOA bypass; depends on #2 and a product-approved recovery model. | Not implemented; no tests. | **Blocked:** key-loss, guardian, threshold, and delay policies remain undecided. | No / No |
| 4 | `VeyraAccount` | Non-upgradeable account with ML-DSA-authorized, bounded execution; depends on #1–#3 and #8. | Not implemented; no tests. | **Hard NO-GO:** verifier registration vulnerability and custody policy remain unresolved. | No / No |
| 5 | `VeyraAccountFactory` | Deterministically creates accounts without initializer front-running or retained factory authority; depends on #2 and #4. | Not implemented; no tests. | **Blocked:** account initialization and deployment authority are not reviewed. | No / No |
| 6 | `VeyraTokenPolicyRegistry` | Names tokens, decimals, transfer semantics, and permitted asset behavior for a swap; consumed by #8 and #9. | Not implemented; no tests. | **Blocked:** no verified Robinhood token allowlist or route exists. | No / No |
| 7 | `VeyraRouterRegistry` | Pins supported router addresses and runtime-code hashes by chain; consumed by #8 and #9. | Not implemented; no tests. | **Blocked:** no compatible, independently verified Robinhood router has been established. | No / No |
| 8 | `VeyraSwapIntentGuard` | Compares user-reviewed chain, tokens, amount, recipient, router, slippage, minimum output, calldata, and deadline against executable parameters; depends on #6 and #7. | Not implemented; no tests. | **Blocked:** no verified quote/execution route is configured. | No / No |
| 9 | `VeyraSwapExecutor` | Executes only an exact intent accepted by #8 and constrained by #6/#7; never holds assets beyond an atomic call. | Not implemented; no tests. | **Blocked:** no route or execution integration; signing and swap execution remain disabled. | No / No |
| 10 | `VeyraResearchAttestationRegistry` | Optionally anchors a completed Research→Analysis→Verification report digest and evidence-manifest digest; stores no report text and requires a defined attestor policy. | Not implemented; no tests. | **Blocked:** public attestation authority, privacy, and on-chain usefulness need approval; the existing Swarm remains off-chain. | No / No |

The ten-name target is an architecture boundary, not a requirement to create
placeholder contracts. The current `QevraAuthorizationHarness` is a separate
research artifact and is excluded from the ten proposed VEYRA identities. Its
Foundry tests use a behavior-only mock verifier and do not validate ML-DSA
cryptography or production safety.

## Current Foundry tests

The maintained test suite is in `test/`, matching `foundry.toml`. The legacy
Phase 0 FFI test source in `phase0-tests/` imports verifier and Foundry support
files that are not present in this repository, so it is not part of the
maintained test target. The replacement state-machine tests compile the local
research harness with a deliberately insecure mock verifier and assert
constructor checks, rejected calls, nonce rollback/monotonicity, malformed
calldata, target reverts, and reentrancy behavior. Passing those tests does not
change the Phase 0 deployment gate.

## Chain-separated deployment preparation

`foundry.toml` defines explicit `robinhood_testnet` (46630) and
`robinhood_mainnet` (4663) profiles and RPC aliases. The corresponding JSON
manifests contain no contracts or addresses until verified deployments exist.

Read-only preflight (does not read a keystore or construct a transaction):

```sh
bun scripts/robinhood.ts deploy preflight testnet <PUBLIC_DEPLOYER_ADDRESS>
bun scripts/robinhood.ts deploy preflight mainnet <PUBLIC_DEPLOYER_ADDRESS>
```

The Testnet encrypted account alias is `veyra-testnet`. Mainnet requires a
different caller-configured `VEYRA_MAINNET_ACCOUNT`; the preflight rejects reuse
of the Testnet alias. Never pass a raw private key or password. After a future
contract has passed its security gate and the owner has approved the exact
contract list and budget, the signing command must use `--account`:

```sh
# Template only; the DeployVeyra script and an approved contract do not exist yet.
forge script script/DeployVeyra.s.sol:DeployVeyra \
  --profile robinhood_testnet --rpc-url robinhood_testnet \
  --account veyra-testnet --sender <APPROVED_PUBLIC_DEPLOYER_ADDRESS> --broadcast

# Mainnet is a separate, permanently broadcast-blocked workflow for this milestone.
forge script script/DeployVeyra.s.sol:DeployVeyra \
  --profile robinhood_mainnet --rpc-url robinhood_mainnet \
  --account "$VEYRA_MAINNET_ACCOUNT" --sender <APPROVED_PUBLIC_DEPLOYER_ADDRESS>
```

After a separately approved Testnet transaction, `bun scripts/robinhood.ts deploy
verify testnet <ADDRESS> <TX_HASH> <EXPECTED_RUNTIME_CODE_HASH>` checks the
observed chain ID, successful receipt/address match, and exact runtime-bytecode
hash at the receipt block, then reports the deployer, receipt gas used, and
chain-specific explorer URLs. The expected hash must be derived from the exact
deployment artifact/constructor configuration. Its `sourceVerification` field
remains `not_verified`; explorer source verification requires separate
explorer/API support. The verifier is read-only and cannot populate either
manifest or registry automatically.

There are no deployable contracts today, so preflight remains blocked and no
deployment gas estimate is available. Do not treat the historical 0.01 ETH
Testnet observation as a current balance or spending authorization.
