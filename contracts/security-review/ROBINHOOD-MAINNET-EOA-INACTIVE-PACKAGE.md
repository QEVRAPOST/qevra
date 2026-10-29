# Robinhood Mainnet EOA_INACTIVE Deployment Review Package

**Review status: NOT REVIEWED / NOT APPROVED.** This is a source and test
package for an independent reviewer. It is not an audit, deployment receipt,
owner approval, or claim that the contracts are safe to activate.

## Scope and deployment decision

Scope is architecture slots 6–10 only:

| Slot | Contract | Intended first-deployment state | Current decision |
|---:|---|---|---|
| 6 | `VeyraTokenPolicyRegistry` | Empty; no token policy enabled | NO-GO until independent review and owner approval |
| 7 | `VeyraRouterRegistry` | Empty; no router enabled | NO-GO until independent review and owner approval |
| 8 | `VeyraSwapIntentGuard` | Bound to slot 6, slot 7, and slot 9; no route | NO-GO until independent review and owner approval |
| 9 | `VeyraSwapExecutor` | Deployed with immutable slot 8 guard; no route can pass empty registries | NO-GO until execution review and route integration review |
| 10 | `VeyraResearchAttestationRegistry` | Initial attestor assigned; publication disabled | NO-GO until independent review, privacy policy, and owner approval |

The EOA owner profile is deliberately accepted only as `EOA_INACTIVE`. It is a
single-key authority and is not equivalent to a Safe. An inactive deployment
is not permission to configure a token/router, execute swaps, or publish
attestations. Slots 1–5 remain separate future account/PQ research and are not
included in this batch. The standalone Evidence Anchor is not slot 10 and is
not part of this batch.

## Chain and role configuration

- Network: Robinhood Chain Mainnet, chain ID `4663`.
- RPC: `https://rpc.mainnet.chain.robinhood.com`.
- Explorer: `https://robinhoodchain.blockscout.com`.
- Owner profile: `EOA_INACTIVE`.
- Deployer: `0x160CD6fe46aa4A5eb3F3a471C7ae0f07B0c2fb97`.
- Owner: `0x3cdb91a29b73dab9219d9a287543800b417b6dbb`.
- Attestor: `0x6dEdb07C81D315fF493C0ABCD8c9e5E0b0287bB0`.
- Foundry signer alias: `veyra-robinhood-mainnet` (alias presence and key
  control have not been inspected or proven by this review package).
- No Mainnet receipt or contract address is claimed. The Mainnet manifest
  remains `no_verified_deployments` with an empty `contracts` array.

The EOA owner must have no code at simulation and broadcast time. That proves
only that the address is currently an EOA, not that the operator controls its
key. The owner EIP-191 approval signature is the required proof of control for
this batch. The deployer key must remain encrypted in Foundry's keystore and
must be independently confirmed to correspond to the configured deployer
address without printing or exporting key material.

## Build and deployment configuration

Observed repository settings:

| Setting | Value |
|---|---|
| Foundry | `forge 1.8.3` |
| Solidity | `0.8.30` |
| EVM target | `cancun` |
| Optimizer | enabled |
| Optimizer runs | `200` |
| Profile | `robinhood_mainnet` |
| Profile chain ID | `4663` |
| Deployment mode | `EOA_INACTIVE` |
| Deployment operations | five creates, one `setExecutor`, four ownership transfers |

The five deployable runtime bytecodes are all below EIP-170's 24,576-byte
runtime limit: token registry 2,656 B, router registry 2,115 B, intent guard
5,148 B, executor 2,507 B, and attestation registry 2,489 B. Their initcode
sizes are respectively 2,845 B, 2,304 B, 5,569 B, 2,680 B, and 3,055 B.
`forge build --sizes --root contracts` exits nonzero because the Foundry
deployment script itself is 30,819 B of runtime bytecode; it is a local script
artifact and is not one of the five on-chain contracts. This is a tooling-size
report, not evidence that any deployable contract exceeds EIP-170. The actual
non-broadcast script simulation below succeeded. Reviewers should preserve
this distinction and independently confirm their toolchain's script execution.

Previous non-broadcast RPC-backed simulation (2026-10-29, before the
MetaMask-compatible approval-message helper):

- RPC chain ID: `4663`.
- Starting deployer nonce: `0`.
- Configured owner runtime code: absent at the read block.
- Deployer ETH balance: `0`.
- Simulated operation count: `10`.
- Estimated aggregate gas limit: `5,022,946` across ten transactions.
- Fixed legacy gas price: `0.041540001 gwei` (`41,540,001 wei`).
- Estimated maximum gas funding for this simulation: `0.000208653181862946 ETH`
  (`208,653,181,862,946 wei`).
- Current nonce-bound deployment batch hash:
  `0x79a2b5882781ffd036697c82945842d9909bf954754f4c50cdd1fe7f1151889d`.

Subsequent read-only RPC probes succeeded. PublicNode at block `101036006` and
the official Robinhood RPC at block `101036350` both reported chain `4663`,
deployer nonce `0`, deployer balance `300000000000000 wei` (`0.0003 ETH`), and
no owner runtime code. The observed gas prices were `20744000 wei` and
`20776000 wei` respectively. Applying the official RPC gas price to the prior
`5,022,946` gas limit gives a reference of `104356726096000 wei`
(`0.000104356726096 ETH`); this is not a fresh simulation or funding target.
No funds should be sent based on that calculation.

Since the last full simulation, the deployment script and approval library
gained a read-only helper that emits pre-prefix messages for standard MetaMask
`personal_sign`; it preserves the existing approval digests and verification
conditions, and adds no deployment operation. A fresh full simulation remains
required after independent review and before signing.

The simulated address predictions were not retained in the manifest or this
package. The historical simulation's exact funding figure is not an instruction
to fund; the latest read-only balance observation is time- and provider-bound,
and a fresh estimate plus owner-approved margin is required after independent
review. The historical estimate used Foundry's explicit
`--legacy --with-gas-price 41540001` parameters and RPC gas estimation.

Robinhood's current official developer documentation describes Robinhood
Chain as EVM-compatible and gives chain ID 4663, but does not identify an exact
supported hardfork. A successful RPC-backed Foundry simulation is evidence
that this exact current bytecode and transaction batch passed the RPC's
`eth_estimateGas`; it does not prove all Cancun opcodes are supported or
replace chain-specific verification.

The script's initial state is:

1. Deploy token policy registry with no enabled tokens.
2. Deploy router registry with no enabled routers.
3. Deploy guard with those registries.
4. Deploy executor with the guard address.
5. Set the guard's executor exactly once.
6. Deploy the attestation registry with the configured attestor.
7. Transfer ownership of slots 6, 7, 8, and 10 to the configured EOA.
8. Leave attestation publication disabled; do not add any token or router
   policies.

## Exact release gates

| Gate | Implementation | Current behavior |
|---|---|---|
| CLI Mainnet readiness | `scripts/robinhood.ts`: `deploymentReadiness()` and `buildDeploymentPreflight()` | Always returns `deploymentReady: false` for Mainnet with the independent-review/owner-approval blocker. It additionally requires public deployer/owner addresses, `VEYRA_MAINNET_OWNER_MODE=EOA_INACTIVE`, and a separate non-Testnet encrypted `VEYRA_MAINNET_ACCOUNT` alias. It never reads key material. |
| CLI EOA checks | `verifyMainnetEoaOwner()` | Reads chain ID and owner runtime code, rejects role overlap and RPC failure; reports `keyControlProven: false`. It cannot establish control of either key. |
| Foundry configuration | `DeployVeyraMainnetMvp.run()` / `_validateDeploymentConfiguration()` | Requires chain 4663, `tx.origin` equal to the configured deployer, deployer distinct from the Testnet deployer, distinct nonzero roles, and an EOA owner with no code for `EOA_INACTIVE`. It binds the current deployer nonce, role addresses, five creation-code hashes, owner profile, and fixed operation plan into the batch hash. |
| Foundry broadcast authorization | `run()` checks `ScriptBroadcast`, then `_requireBroadcastApproval()` before `startBroadcast()` | For `EOA_INACTIVE`, requires a distinct reviewer signature and owner signature over the package/report/batch/role context; rejects expired or >24-hour approval, malformed/high-s signatures, and any `tx.gasprice` not exactly the owner-signed legacy gas price. `SAFE_2_OF_3` remains rejected by this broadcast authorization path; it is not an alternate bypass. |
| Aggregate fee limit | `MainnetDeploymentApproval.Record.maxTotalFeeWei` and operator procedure | The total cap is bound into the owner's signature but is not mechanically checked by Solidity because Foundry does not expose the aggregate transaction gas limits to the script. Before any deployer signature, the operator must verify `sum(tx gas limits) × signed gas price <= maxTotalFeeWei`; stop if false. |

The broadcast signature check closes a reproducible gap in the prior script:
its comment said to simulate until owner approval, but direct `forge script
--broadcast` did not enforce an approval record. This patch places the signed
gate before `startBroadcast`. A non-broadcast simulation remains available and
does not request a signer. No approval signatures exist yet.

`VeyraSwapExecutor` is not ownable. It accepts only a caller equal to the
intent account, consumes an exact fresh guard lock, performs typed token and
router calls, resets router allowance, and checks input/output balance
postconditions. This does not establish compatibility with the 0x Allowance
Holder transaction shape; no Mainnet route is configured or approved.

## Dormant-state invariants to verify

The reviewer should independently confirm these against the code and the
simulated/post-deployment state:

- Token registry has no policy entries and returns no enabled token policy.
- Router registry has no policy entries and returns no enabled router.
- Guard points only to the two newly deployed registries and the new executor.
- Executor points to that guard; no alternate executor can be installed later.
- Registry owners are the exact configured owner after the four transfers.
- The attestor role is assigned only to the configured attestor at construction.
- `attestationPublishingEnabled()` is false and `attest()` reverts while false.
- No constructor or script call funds or accepts ETH into these contracts.
- No swap transaction, token approval, token transfer, token/router activation,
  custody operation, or PQ action is part of this batch.

These invariants are initial-state properties. The EOA owner can later enable
token/router configuration, grant/revoke roles, transfer ownership, or enable
attestation publication. Each such action needs separate reviewed policy and
explicit operator authorization.

## Adversarial test evidence

Run `forge test --root contracts` against the exact reviewed source snapshot.
The maintained tests currently exercise:

- Wrong chain, deployer mismatch, Testnet deployer reuse, missing roles, EOA
  owner overlap, invalid profile, and strict Safe-profile checks.
- Empty token/router policies, owner-only configuration, exact token decimals,
  exact-transfer assertions, and router runtime-code-hash matching.
- Wrong-chain/invalid intent conditions, weak minimum output, unauthorized
  execution, missing locks, replay, and a lock consumed in a later block.
- Exact recipient output delta and no residual executor input for the mocked
  router path.
- Attestor authorization, duplicate run protection, zero digests, disabled
  publication, owner-controlled publication toggle, and inability to receive
  ETH.
- Reviewer/owner signature recovery, role separation, EIP-191 digest binding
  to source package/report, nonce, batch and fees, bounded approval expiry,
  malformed signature rejection, and low-s signature enforcement.

The EVM tests use mock tokens, routers, and deterministic test-only signing
keys. They are not a third-party audit, a proof about every ERC-20/router, a
Mainnet fork test, or evidence of live swap execution. There is no current test
of a malicious token callback/reentrancy attempt, token-specific transfer
semantics outside mocks, real 0x execution compatibility, or an invariant/fuzz
campaign covering arbitrary route configurations. These are reviewer work,
not assumed passes.

Exact local check evidence on this prepared source: `forge test --root contracts`
passed 65 tests across 9 suites, with 0 failures and 0 skips. The focused
Mainnet deployment and approval suites passed 24 tests (15 deployment-script
tests and 9 approval tests). `bun test tests/robinhood-cli.test.ts` passed 12
tests; the full `bun run test` suite passed 409 tests, skipped 5, and failed 0.
`bun run typecheck`, `bun run lint`, targeted `forge fmt --check`, and
`forge build --root contracts` passed. The full Foundry build emitted existing
lint warnings in the Phase 0 harness and timestamp checks; those remain review
items, not test failures. These are local checks, not independent review.

## Source and configuration hashes

The reviewer must check every hash at the same checkout and reject any mismatch.
Hashes are SHA-256 over the literal file bytes; no generated artifacts or
private environment files are included.

| File | SHA-256 |
|---|---|
| `.env.example` | `b02647c8da99ae3ce0ab0d4df8bf395eb9c77ca569dd47080a9419388ab8fbd5` |
| `scripts/robinhood.ts` | `da3693096d98b79412366f31f47ebd82f4e74a725fca3cf557be715c03aee21a` |
| `contracts/README.md` | `6251f49041adbd7070e31251e4eb23e679747a7129ae4b6a9d63a498236d3086` |
| `contracts/deployments/robinhood-mainnet.json` | `da4ce2385a1565bb2a9b7973d6f207bd8e2e64ee57c988c509112510e9184ccd` |
| `contracts/src/access/VeyraAccessManaged.sol` | `9cb6d650fc86066bd2e5e0c5cda248179b27a05f9362edb0c62ad27426886576` |
| `contracts/src/policy/VeyraTokenPolicyRegistry.sol` | `bda87598a092da6d6ad9f7813c2faf81dae1bf987a76c123fae893333419f284` |
| `contracts/src/policy/VeyraRouterRegistry.sol` | `84a69229a8392d7149b2ed15ef6f68051fd0da28ef2cf03cc8d4a4a36e4e3fbf` |
| `contracts/src/swap/VeyraSwapIntentGuard.sol` | `fe4bf09141ee7fd3769fd368142593a2a61e00fe93f5bf217ec28c417694208f` |
| `contracts/src/swap/VeyraSwapExecutor.sol` | `fb807282315323e6a3837f246c856a2869fb0b0eeb7ac5543d27c932bc925220` |
| `contracts/src/research/VeyraResearchAttestationRegistry.sol` | `58c8a576d687dcb89f9d881f0cd09968aa8d73e4c1af9485337ce2f739c62507` |
| `contracts/script/DeployVeyraMainnetMvp.s.sol` | `7dc749a76929b1969c965be992ba6ff7edefdfae8925eb1aa66d8506dc51807a` |
| `contracts/script/MainnetDeploymentApproval.sol` | `8c7cad77bbc0ff5f6a1a044616020545cd529e6336bfefa88aeac5cfec396a2a` |
| `contracts/foundry.toml` | `2cde2e67bde3308087c03df66779cec4c02cdd7a722d47a41948054d35bedecb` |
| `contracts/test/DeployVeyraMainnetMvp.t.sol` | `1b6edfd2baf9ef682d1efe731f6afca505a31f4fbbd74265761e2835e297c1e9` |
| `contracts/test/MainnetDeploymentApproval.t.sol` | `1f4b3ee8b0b6445628a329884df91b8788cdb426f44351b2c9668452440eeb44` |
| `contracts/test/VeyraArchitectureRegistry.t.sol` | `2ef59175f3d5186a6ebf55cdc3ba3d848cba6de9f7b43e5a85b76b20df0d2933` |
| `contracts/test/VeyraSwapExecution.t.sol` | `6cf09d01e1a0e4f6db03e3ea354180a23455817673310edcb8161d4cf432c796` |

Recompute with:

```sh
shasum -a 256 \
  contracts/src/access/VeyraAccessManaged.sol \
  contracts/src/policy/VeyraTokenPolicyRegistry.sol \
  contracts/src/policy/VeyraRouterRegistry.sol \
  contracts/src/swap/VeyraSwapIntentGuard.sol \
  contracts/src/swap/VeyraSwapExecutor.sol \
  contracts/src/research/VeyraResearchAttestationRegistry.sol \
  contracts/script/DeployVeyraMainnetMvp.s.sol \
  contracts/script/MainnetDeploymentApproval.sol \
  contracts/foundry.toml \
  contracts/test/DeployVeyraMainnetMvp.t.sol \
  contracts/test/MainnetDeploymentApproval.t.sol \
  contracts/test/VeyraArchitectureRegistry.t.sol \
  contracts/test/VeyraSwapExecution.t.sol \
  .env.example scripts/robinhood.ts contracts/README.md \
  contracts/deployments/robinhood-mainnet.json
```

Hash this complete package file separately as
`VEYRA_MAINNET_REVIEW_PACKAGE_SHA256` immediately before sending the review
bundle; any edit after hashing requires a new hash and fresh signatures. The independent reviewer must provide a
separate written finding report and its SHA-256 as
`VEYRA_MAINNET_INDEPENDENT_REVIEW_SHA256`; the report must name the reviewer,
scope, tool versions, tested source hashes, findings, remediations, and an
explicit decision limited to the inactive deployment batch.

## Signed approval record

The Foundry script refuses its `ScriptBroadcast` context until both signatures
verify. The record to preserve alongside the signed reviewer report contains:

```text
schema: veyra-robinhood-mainnet-approval-v1
chainId: 4663
ownerProfile: EOA_INACTIVE
deployer: 0x160CD6fe46aa4A5eb3F3a471C7ae0f07B0c2fb97
owner: 0x3cdb91a29b73dab9219d9a287543800b417b6dbb
attestor: 0x6dEdb07C81D315fF493C0ABCD8c9e5E0b0287bB0
reviewer: <independent reviewer address, distinct from all three roles>
startingDeployerNonce: <fresh RPC value>
deploymentBatchHash: <from the non-broadcast simulation context>
reviewPackageSha256: <SHA-256 of this exact package file>
independentReviewReportSha256: <SHA-256 of separate signed reviewer report>
maxFeePerGasWei: <owner-approved exact ceiling>
maxTotalFeeWei: <owner-approved aggregate ceiling>
expiresAt: <Unix timestamp, no more than 24 hours after signing>
reviewerSignature: <EIP-191 signature over reviewer digest>
ownerSignature: <EIP-191 signature over owner digest>
```

The reviewer digest fixes the decision string to
`APPROVE_EOA_INACTIVE_DEPLOYMENT_ONLY` and binds chain, roles, profile, nonce,
batch, package hash, report hash, and reviewer. The owner digest binds that
reviewer digest and all the same fields plus both fee ceilings and expiry.
Signatures must be 65-byte EIP-191 signatures with canonical low-s values. The
Foundry gate requires the simulated `tx.gasprice` to equal the signed legacy
gas price. The aggregate fee is a human-verified bound: compare the sum
of every simulated transaction's gas limit times the approved per-gas ceiling
to `maxTotalFeeWei` before requesting any deployer signature.

An owner signature is transaction approval only for this exact inactive batch.
It does not approve route activation, token policies, public attestations,
future upgrades, custody, or any different batch. Never sign until the
independent report and fresh simulation match all fields above.

## Required human sequence after this package is reviewed

1. An independent reviewer verifies every source hash, runs the listed tests,
   reads the full deployment and authorization path, reviews the dormant-state
   invariants and unresolved R-01–R-08 items, and writes a report explicitly
   limited to deploying slots 6–10 in `EOA_INACTIVE` mode. The reviewer must
   identify themselves, explain any accepted residual risks, and not claim that
   the contracts are audited or safe to activate.
2. On a network that can reach Robinhood RPC, repeat a **non-broadcast** Foundry
   simulation. Record observed chain, nonce, owner code, ten transaction gas
   limits, fee quote, and batch hash. Stop if any code/config hash, nonce, role,
   or operation differs from the review. Re-run CLI public-address preflight;
   it must still report the hard review/owner gate and must not read keystore
   material.
3. Freeze the review package, hash it and the completed reviewer report, set
   the reviewer identity and proposed fee fields, then regenerate both digests
   with `currentMainnetApprovalDigests()` and the raw personal-sign messages
   with `currentMainnetPersonalSignMessages()` at the same nonce. The reviewer
   signs the reviewer message first. After reviewing the report and exact fee
   bounds, the owner signs the owner message with the configured MetaMask
   account using `personal_sign`. The helper messages are the pre-prefix
   32-byte values; MetaMask adds the EIP-191 prefix that yields the unchanged
   final digests. Never personal-sign a final digest or use deprecated
   `eth_sign`; do not use the deployer account as a substitute owner.
4. Independently verify each MetaMask signature against its corresponding
   final value from `currentMainnetApprovalDigests()` using
   `cast wallet verify --address <reviewer> --no-hash <reviewerDigest> <signature>`
   and the corresponding owner command. Confirm recovered addresses and every
   signed field. Check the ten-row total `sum(gasLimit × maxFeePerGasWei)` is
   no greater than `maxTotalFeeWei`; this comparison is not enforced by the
   script. If any field changes, discard both signatures and repeat review.
5. Only after written owner authorization for these exact contents and fee
   ceilings, fund the deployer with at least the freshly simulated aggregate
   fee plus an owner-approved margin. Recheck balance, chain, nonce, owner code,
   signatures and expiry immediately before broadcast. The initial balance was
   zero, so the prior estimate is not sufficient funding.
6. Broadcast once with the exact approved legacy gas price, encrypted Foundry
   alias and all signed approval fields. Do not use `--resume`; a partial batch
   requires a separately reviewed state-aware recovery authorization.
7. Verify all ten receipts and transaction ordering on chain 4663. Confirm the
   five runtime bytecodes and deployed getters (owner, registry emptiness,
   executor/guard references, configured attestor, publication disabled).
   Update the Mainnet manifest only with actual successful receipt and code
   evidence. Keep `sourceVerification` unverified unless separately proven.

## Unresolved findings and remediation

| ID | Severity | Finding / unresolved question | Required action |
|---|---|---|---|
| R-01 | Critical release blocker | No independent security-review report or reviewer signature exists in this package. | Independent reviewer examines exact hashes, tests, bytecode, initial state, deployment script, and risks; issue a signed report explicitly approving only `EOA_INACTIVE` deployment, with findings and rationale. |
| R-02 | High | The owner is a single EOA. Read-only code absence does not prove operator key control or safe custody. | Confirm owner address through a hardware-backed wallet, verify the signed approval recovers to that address, document key custody and recovery; accept single-key risk explicitly. Do not call it multisig. |
| R-03 | High | Token and router registries enforce admin assertions and runtime hashes, not independent safety. | Keep both empty. Before any activation, review exact token semantics and router bytecode/source, test exact-transfer behavior and route calldata, then use a separately approved activation transaction. |
| R-04 | High | The executor's typed `swapExactTokensForTokens` route is not proven compatible with 0x Swap API v2 AllowanceHolder or any Robinhood Mainnet deployment. | Keep executor unreachable through empty policies. Build and independently review an adapter for one verified route, validate spender/target/recipient/chain/allowance/simulation, and test on an isolated fork before enabling. |
| R-05 | High | The guard/executor tests cover core lock, replay, caller, output, and residue checks but not malicious token callbacks or a systematic adversarial route matrix. | Add adversarial mocks and fuzz/invariant tests for callbacks/reentrancy, false/no-return/malformed token results, fee-on-transfer/rebase behavior, malicious router output/recipient behavior, nonce/expiry/slippage boundaries; review all results. |
| R-06 | High for publication | Attestation events and getters expose report, manifest, and run digests and their linkage. Hashes can still be correlated or dictionary-tested; owner can enable publication. | Keep publication disabled. Define which identifiers may be committed, use high-entropy salts where appropriate, document retention/revocation limits, and get privacy approval before enabling. |
| R-07 | Medium | Official docs state EVM compatibility but do not identify a hardfork. | Keep Cancun target explicit; preserve RPC `eth_estimateGas` evidence for exact creation code and require bytecode/receipt verification after any approved deployment. Resolve the target revision with chain documentation/support if possible. |
| R-08 | High | No Foundry signer alias/key-control proof, fresh simulation fee cap, owner approval signature, or approved funding decision is included. Read-only RPC observed a 0.0003 ETH deployer balance at blocks 101036006/101036350, but this observation is not funding authorization. | After review, refresh nonce, balance, fee market, simulation, and account-alias checks; obtain explicit owner approval for the exact funding amount; verify address control without exposing key material. |

No source change in this package should clear these findings by assertion. The
external reviewer owns the independent judgment; the operator owns the final
single-key transaction decision.

## Required approval and execution order

1. Freeze the reviewed checkout and recompute source hashes and package SHA-256.
2. An independent reviewer verifies code, tests, configuration, source hashes,
   dormant state, and unresolved findings; the reviewer supplies a signed
   report and an approval-or-rejection decision.
3. After that report exists, refresh chain ID, owner code, deployer nonce,
   balance, bytecode sizes, and non-broadcast simulation. The exact batch hash
   includes the starting nonce and compiled creation-code hashes; the package
   SHA-256 independently covers the deployment script source.
4. Compute both final EIP-191 digests using
   `currentMainnetApprovalDigests()` and both raw MetaMask messages using
   `currentMainnetPersonalSignMessages()`. The reviewer signs the reviewer
   message first. The owner reviews the report and exact fee budget, then
   explicitly signs the owner message in MetaMask with `personal_sign`.
5. Verify that all 10 transactions' aggregate gas limit times the exact
   per-gas ceiling fits the signed `maxTotalFeeWei`, and verify deployer
   balance covers that maximum plus an explicitly approved margin.
6. Only after a separate owner decision authorizes broadcast, set the
   broadcast-only approval variables and use the encrypted Foundry account.
   The invocation must use the signed fee ceiling and must not use `--resume`.
7. After each receipt, verify chain, sender, status, address, runtime bytecode
   hash, owner, guard/executor linkage, empty registries, and disabled
   attestation publication. Update `robinhood-mainnet.json` only from genuine
   receipts and verified post-deployment reads.

Any changed source hash, role address, nonce, batch, review report, fee ceiling,
or expiry invalidates the approvals and requires a fresh review/record. No
transaction has been signed or broadcast as part of preparing this package.
