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

## Standalone research evidence anchor

`VeyraResearchEvidenceAnchor` is a separate hash-only Testnet utility. It is not
one of the ten proposed contracts and does not implement the broader proposed
`VeyraResearchAttestationRegistry` role. The anchor records a nonzero report
hash and run-identifier hash once each, with the immutable deployer as its only
publisher, a timestamp, and a public read API. It stores no report text, user
secret, signature, audit verdict, or research conclusion. An event proves only
that those hashes were published; it does not prove that a finding is true,
correct, reviewed, or safe.

The owner cannot be changed, records cannot be edited or removed, and there is
no payable method, receive/fallback handler, asset-transfer method, arbitrary
call, account authorization, or ML-DSA dependency. Ordinary ETH transfers
revert. As with any contract, forced native-currency or unsolicited token
transfers cannot be prevented; this contract has no method to recover or move
such assets. Do not send assets to it. Only publish hashes of research material
that is safe to identify publicly; hashes of private or low-entropy values can
still disclose information through guessing.

The standalone Evidence Anchor is deployed on Robinhood Testnet at
`0x10A47a16A6A903574Ed4058B67750073cC992632` (chain ID 46630), from the funded
deployer, with a successful receipt in block `140219918`. Its runtime-bytecode
hash is
`0x75145cfa0c4eae7612db613f469eeafbf81ba898e07b3a96e1888378dffa798b`.
Blockscout reports `is_verified: false`; source code is **not verified**.
The record is stored in `standaloneResearchEvidenceAnchor`, separate from the
roadmap `contracts` array. The ten proposed roadmap slots remain empty at 0/10.
The Mainnet profile has no anchor deployment script and remains read-only
preflight tooling only.

## Proposed-contract readiness

The ten-slot manifests preserve the proposed roles and keep their addresses
empty. The standalone Evidence Anchor is tracked separately. Current readiness
of the nine proposed roles other than the optional research-attestation role is:

| Proposed contract | Readiness | Blocking condition |
|---|---|---|
| `VeyraKeyRegistrationValidator` | **Blocked; no deployment** | The ML-DSA key-registration forgery is not closed by an independently reviewed proof. |
| `VeyraKeyRegistry` | **Blocked; no deployment** | It depends on a reviewed `VeyraKeyRegistrationValidator`, which does not exist. |
| `VeyraRecoveryPolicy` | **Blocked; no deployment** | Guardian, threshold, delay, and recovery behavior remain undecided. |
| `VeyraAccount` | **Hard NO-GO; no deployment** | Phase 0B authorization, custody, recovery, deposits, and withdrawals remain disabled. |
| `VeyraAccountFactory` | **Blocked; no deployment** | Account initialization, front-running resistance, and factory authority are not reviewed. |
| `VeyraTokenPolicyRegistry` | **Blocked; no deployment** | There is no verified Robinhood token allowlist or transfer-semantics review. |
| `VeyraRouterRegistry` | **Blocked; no deployment** | No compatible Robinhood router address and runtime-code hash have been independently verified. |
| `VeyraSwapIntentGuard` | **Blocked; no deployment** | There is no approved route or complete user-intent validation policy. |
| `VeyraSwapExecutor` | **Hard NO-GO; no deployment** | Signing and swap execution remain disabled; no verified route exists. |

`VeyraResearchAttestationRegistry` (proposed slot 10) is also **blocked and not
implemented**: public attestor authority, privacy policy, and on-chain
usefulness have not been approved. The narrower Evidence Anchor is not a
substitute for that contract or a protocol-wide approval.

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

The Mainnet configuration is separate (`chain_id = 4663`, RPC alias
`robinhood_mainnet`, Mainnet explorer, and `robinhood-mainnet.json`). The
preflight requires a separately configured `VEYRA_MAINNET_ACCOUNT`, rejects
reuse of `veyra-testnet`, reads the public chain ID, and remains blocked. No
Mainnet signing or broadcast command is provided for this milestone. Never pass
a raw private key or password.

Testnet-only non-broadcast deployment simulation and gas estimate:

```sh
forge script script/DeployVeyraResearchEvidenceAnchor.s.sol:DeployVeyraResearchEvidenceAnchor \
  --profile robinhood_testnet --rpc-url robinhood_testnet --chain-id 46630 \
  --sender 0xfA142bF0383782Caa349C5C56A7B7D565eEFA562 \
  --estimate market --gas-estimate-multiplier 130
```

The simulation uses no keystore and does not broadcast. Foundry's market fee
preset and 130% gas-estimate multiplier provide a conservative estimate, not a
guaranteed maximum fee; report the gas limit and fee cap used with the computed
ETH cost. Check the current public deployer balance independently before
requesting transaction authorization.

This is the command used for the first deployment after owner approval. **Do not
run it again without a separate approval**; a repeat would create another
standalone anchor:

```sh
forge script script/DeployVeyraResearchEvidenceAnchor.s.sol:DeployVeyraResearchEvidenceAnchor \
  --profile robinhood_testnet --rpc-url robinhood_testnet --chain-id 46630 \
  --keystore "$HOME/.foundry/keystores/robinhood-testnet/veyra-testnet" \
  --sender 0xfA142bF0383782Caa349C5C56A7B7D565eEFA562 --broadcast --slow
```

Foundry prompts for the encrypted keystore password; do not put a password or
raw key in the command or environment. Both the contract constructor and the
script reject every chain ID other than 46630, and the script checks that the
deployed contract owner is the supplied public deployer.

The non-broadcast simulation returns `runtimeBytecodeHash` after applying the
deployer-specific immutable owner to the exact compiled runtime. For the
completed deployment, the RPC receipt, deployer, contract address, chain ID,
owner, and runtime-bytecode hash were independently checked. The RPC returned
the matching code hash at the receipt block once, then later reported historical
state unavailable; the repository's generic verifier consequently returned a
read failure on retry. A latest-state `cast code` hash and Blockscout's
successful creation record also match. The Blockscout address response reports
source verification as false.

For future deployments on a provider with historical-state access, pass the
simulated expected runtime hash to the existing read-only verifier. It checks
observed chain ID, successful receipt, receipt address, and bytecode hash at the
receipt block:

```sh
bun scripts/robinhood.ts deploy verify testnet <CONTRACT_ADDRESS> <TX_HASH> <EXPECTED_RUNTIME_CODE_HASH>
```

Use `runtimeBytecodeHash` from a non-broadcast simulation made with the same
profile, source, compiler, and deployer as the broadcast. Record a future
Testnet-only deployment in `contracts/deployments/robinhood-testnet.json` only
after receipt and runtime-code verification. Keep
`sourceVerification: "not_verified"` unless source verification is
independently confirmed.

The verifier is read-only and cannot populate a manifest or frontend registry
automatically. After a successful verification, write the verified record to
the Testnet manifest's `standaloneResearchEvidenceAnchor` field; keep
`architectureSlots` limited to the proposed ten-contract roadmap and leave
unverified addresses blank. The historical 0.01 ETH balance observation is not
a current balance or spending authorization.
