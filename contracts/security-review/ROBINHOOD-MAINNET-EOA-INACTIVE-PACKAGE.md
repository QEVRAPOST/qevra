# Robinhood Mainnet EOA_INACTIVE Deployment Review Package

**Review status: NOT INDEPENDENTLY REVIEWED / NO OWNER BROADCAST APPROVAL.**
This is a source, test, and deployment-policy package. `OWNER_APPROVED_DORMANT`
is an opt-in alternative to the application's reviewer-signature release
policy; it is not an audit, deployment receipt, or claim that the contracts
are safe to activate.

## Scope and deployment decision

Scope is architecture slots 6–10 only:

| Slot | Contract | Intended first-deployment state | Current decision |
|---:|---|---|---|
| 6 | `VeyraTokenPolicyRegistry` | Empty; no token policy enabled | CONDITIONAL GO for dormant deployment only; NO-GO for activation |
| 7 | `VeyraRouterRegistry` | Empty; no router enabled | CONDITIONAL GO for dormant deployment only; NO-GO for activation |
| 8 | `VeyraSwapIntentGuard` | Bound to slot 6, slot 7, and slot 9; no route | CONDITIONAL GO for dormant deployment only; NO-GO for activation |
| 9 | `VeyraSwapExecutor` | Deployed with immutable slot 8 guard; empty registries prevent a supported route | CONDITIONAL GO for dormant deployment only; NO-GO for execution until independent route review |
| 10 | `VeyraResearchAttestationRegistry` | Initial attestor assigned; publication disabled | CONDITIONAL GO for dormant deployment only; NO-GO for publication pending privacy policy |

The EOA owner profile is deliberately accepted only as `EOA_INACTIVE`. It is a
single-key authority and is not equivalent to a Safe. An inactive deployment
is not permission to configure a token/router, execute swaps, or publish
attestations. Slots 1–5 remain separate future account/PQ research and are not
included in this batch. The standalone Evidence Anchor is not slot 10 and is
not part of this batch.

The conditional deployment decision is available only after an explicit
`OWNER_APPROVED_DORMANT` EIP-191 signature for the fresh exact batch and fees.
This is application-level release authorization, not a Robinhood Chain rule.
It does not technically lock later activation: the EOA owner can enable token
and router policies or attestation publication with the contracts' existing
owner permissions. A separate review/approval rule for those later actions is
operational only. Do not use this path if the owner cannot accept that residual
authority.

## Chain and role configuration

- Network: Robinhood Chain Mainnet, chain ID `4663`.
- RPC: `https://rpc.mainnet.chain.robinhood.com`.
- Explorer: `https://robinhoodchain.blockscout.com`.
- Owner profile: `EOA_INACTIVE`.
- Deployer: `0x160CD6fe46aa4A5eb3F3a471C7ae0f07B0c2fb97`.
- Owner: `0x3cdb91a29b73dab9219d9a287543800b417b6dbb`.
- Attestor: `0x6dEdb07C81D315fF493C0ABCD8c9e5E0b0287bB0`.
- Foundry signer alias: `veyra-robinhood-mainnet` (a local file with this name
  exists, but its JSON has no address field and the default Foundry wallet list
  does not include the configured deployer address; the alias-to-deployer
  match and key control remain unverified).
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

Fresh non-broadcast preflight evidence (2026-10-29):

- The official Robinhood RPC, PublicNode, and dRPC independently returned
  chain ID `4663`; latest blocks `101183776`, `101183787`, and `101183788`.
- All three returned deployer balance `300000000000000 wei` (`0.0003 ETH`),
  latest nonce `0`, pending nonce `0`, and no runtime code at the configured
  EOA owner address.
- Observed `eth_gasPrice`: official `24238000 wei`, PublicNode `22800000 wei`,
  dRPC `22864000 wei`.
- A fresh Foundry simulation at `2026-10-29T20:33:37.506Z` passed on the
  official RPC without `--broadcast`, without opening the keystore, and with
  the public role addresses supplied in the deployment brief. It simulated 10
  operations (5 creates and 5 calls) and summed 5,022,946 transaction gas
  limits. Its fixed legacy simulation gas price was `21020000 wei`
  (`0.02102 gwei`), for a nominal aggregate fee of `105582324920000 wei`
  (`0.000105582324920000 ETH`). At the later official `eth_gasPrice` sample,
  multiplying the same simulated gas limits gives `121746165148000 wei`
  (`0.000121746165148000 ETH`). This arithmetic is not an approved fee ceiling
  or funding instruction and does not include an operator-approved margin.
- The nonce-bound batch hash was independently recomputed from the compiled
  creation-code hashes and confirmed as
  `0x79a2b5882781ffd036697c82945842d9909bf954754f4c50cdd1fe7f1151889d`.
- The encrypted keystore alias file exists locally, but the alias-to-deployer
  address match has not been verified. The runtime `.env` has no Mainnet
  deployment role or approval values; `.env.example` contains only empty
  placeholders for public role/profile/alias values and no approval fields.
  No approval signatures or independent reviewer report are present in this
  package.

Fresh read-only preflight and fixed-price non-broadcast simulation (2026-10-30):

- Official Robinhood RPC and PublicNode both returned chain ID `4663`, latest
  and pending deployer nonces `0`, deployer balance `300000000000000 wei`
  (`0.0003 ETH`), and no owner runtime code. The attestor address also had no
  runtime code. Official `eth_gasPrice` returned `20000000 wei` (`0.02 gwei`).
- A new `OWNER_APPROVED_DORMANT` simulation used no account, key, signature, or
  broadcast. It passed chain `4663` and generated 10 non-broadcast operation
  records with no receipts. With the fixed legacy price `40036001 wei/gas`
  (`0.040036001 gwei`), the transaction gas-limit sum is `5,090,509`; the
  conservative aggregate fee ceiling is `203803623414509 wei`
  (`0.000203803623414509 ETH`). This candidate is not owner-approved. Against
  the observed balance it leaves `0.000096196376585491 ETH` before any other
  spending or safety reserve. Re-simulate if nonce, roles, bytecode, price, or
  operation set changes.
- The read-only batch-hash helper returned
  `0x7c47ca63b965a10c8846cde6da507f149bdd2027c0699dd793fafbc17c0d53ae`
  for starting nonce `0` and `OWNER_APPROVED_DORMANT`. It is only a preflight
  hash, not deployment evidence or an owner signature.
- The current encrypted account file could not be matched to the configured
  deployer from its metadata. Do not broadcast until the operator resolves the
  alias locally with `cast wallet address --account veyra-robinhood-mainnet`
  and confirms the displayed address privately.

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
| CLI Mainnet readiness | `scripts/robinhood.ts`: `deploymentReadiness()` and `buildDeploymentPreflight()` | Always returns `deploymentReady: false` until matching authorization and fees are validated. It additionally requires an explicit `VEYRA_MAINNET_RELEASE_POLICY`, public deployer/owner addresses, `VEYRA_MAINNET_OWNER_MODE=EOA_INACTIVE`, and a separate non-Testnet encrypted `VEYRA_MAINNET_ACCOUNT` alias. It never reads key material. |
| CLI EOA checks | `verifyMainnetEoaOwner()` | Reads chain ID and owner runtime code, rejects role overlap and RPC failure; reports `keyControlProven: false`. It cannot establish control of either key. |
| Foundry configuration | `DeployVeyraMainnetMvp.run()` / `_validateDeploymentConfiguration()` | Requires chain 4663, `tx.origin` equal to configured deployer, deployer distinct from Testnet deployer, distinct nonzero roles, and a code-free EOA owner. It binds the selected policy, nonce, role addresses, five creation-code hashes, owner profile, and fixed operation plan into the batch hash. |
| Foundry broadcast authorization | `run()` checks `ScriptBroadcast`, then `_requireBroadcastApproval()` before `startBroadcast()` | `INDEPENDENT_REVIEW_REQUIRED` requires reviewer and owner signatures. Opt-in `OWNER_APPROVED_DORMANT` requires an EIP-191 owner signature over single-key risk acceptance and exact chain, roles, policy, nonce, batch, fee ceilings, and expiry. Both reject malformed/high-s, expired or >24-hour signatures and require exact signed legacy gas price. `SAFE_2_OF_3` remains rejected by this broadcast path. |
| Aggregate fee limit | `MainnetDeploymentApproval.Record.maxTotalFeeWei` and operator procedure | The total cap is bound into the owner's signature but is not mechanically checked by Solidity because Foundry does not expose the aggregate transaction gas limits to the script. Before any deployer signature, the operator must verify `sum(tx gas limits) × signed gas price <= maxTotalFeeWei`; stop if false. |

The broadcast signature check closes a reproducible gap in the prior script:
its comment said to simulate until owner approval, but direct `forge script
--broadcast` did not enforce an approval record. This patch places the signed
gate before `startBroadcast`. The two policy signatures have separate domains;
neither can authorize the other path. A non-broadcast simulation remains
available and does not request a signer. No approval signatures exist yet.

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
passed 73 tests across 9 suites, with 0 failures and 0 skips. The focused
Mainnet deployment and approval suites passed 32 tests (16 deployment-script
tests and 16 approval tests). `bun test tests/robinhood-cli.test.ts` passed 13
tests; `bun run test` passed 461 tests, skipped 5, and failed 0.
`bun run typecheck`, `bun run lint`, targeted `forge fmt --check`, and
`forge build --offline` passed. Foundry emitted existing lint warnings in the
Phase 0 harness and timestamp checks; they are not test failures. The optional
`forge build --sizes` report exits nonzero because the local deployment script
artifact is 32,883 bytes, above EIP-170. It is not deployed; all five intended
contract runtime bytecodes remain below EIP-170 and the RPC-backed script
simulation completed. These checks are not independent review.

## Source and configuration hashes

The reviewer must check every hash at the same checkout and reject any mismatch.
Hashes are SHA-256 over the literal file bytes; no generated artifacts or
private environment files are included.

| File | SHA-256 |
|---|---|
| `.env.example` | `01e345591db776903732466e336053d1cca53e4077a27748419f2ff2bd6f38c3` |
| `scripts/robinhood.ts` | `54214ba4723ed51f24fc65a23cbf6871458584754f83cca354fb59ab07e53511` |
| `contracts/README.md` | `83666c636180966dc3f5698aa0c992ca01796330d9e38155221102403ba48b71` |
| `contracts/deployments/robinhood-mainnet.json` | `da4ce2385a1565bb2a9b7973d6f207bd8e2e64ee57c988c509112510e9184ccd` |
| `contracts/src/access/VeyraAccessManaged.sol` | `9cb6d650fc86066bd2e5e0c5cda248179b27a05f9362edb0c62ad27426886576` |
| `contracts/src/policy/VeyraTokenPolicyRegistry.sol` | `bda87598a092da6d6ad9f7813c2faf81dae1bf987a76c123fae893333419f284` |
| `contracts/src/policy/VeyraRouterRegistry.sol` | `84a69229a8392d7149b2ed15ef6f68051fd0da28ef2cf03cc8d4a4a36e4e3fbf` |
| `contracts/src/swap/VeyraSwapIntentGuard.sol` | `fe4bf09141ee7fd3769fd368142593a2a61e00fe93f5bf217ec28c417694208f` |
| `contracts/src/swap/VeyraSwapExecutor.sol` | `fb807282315323e6a3837f246c856a2869fb0b0eeb7ac5543d27c932bc925220` |
| `contracts/src/research/VeyraResearchAttestationRegistry.sol` | `58c8a576d687dcb89f9d881f0cd09968aa8d73e4c1af9485337ce2f739c62507` |
| `contracts/script/DeployVeyraMainnetMvp.s.sol` | `90bc768e694a757b0656102affb3312b221ac1016eb57f76dd520945348ce367` |
| `contracts/script/MainnetDeploymentApproval.sol` | `ec72950e14c57af46fdfe926cc7ec5ccc9cc95101c81f31e31791f9be983bbb1` |
| `contracts/foundry.toml` | `2cde2e67bde3308087c03df66779cec4c02cdd7a722d47a41948054d35bedecb` |
| `contracts/test/DeployVeyraMainnetMvp.t.sol` | `895716792983f7427a24b581665c95dc81aa5e8ef9ad062ac766e873dee78b08` |
| `contracts/test/MainnetDeploymentApproval.t.sol` | `78f628537eebb2a50c40c7d30d17c2e15b873c970fef9d4042dba55b441def2b` |
| `contracts/test/VeyraArchitectureRegistry.t.sol` | `2ef59175f3d5186a6ebf55cdc3ba3d848cba6de9f7b43e5a85b76b20df0d2933` |
| `contracts/test/VeyraSwapExecution.t.sol` | `6cf09d01e1a0e4f6db03e3ea354180a23455817673310edcb8161d4cf432c796` |
| `tests/robinhood-cli.test.ts` | `116f6e58d8e3e0807ca02f9179a9ce226efcf188d369aa9ef762603eead1697b` |

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
  tests/robinhood-cli.test.ts \
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

`INDEPENDENT_REVIEW_REQUIRED` uses the dual-signature record below. The
opt-in `OWNER_APPROVED_DORMANT` path uses a distinct owner-only record and
does not require a reviewer or report:

```text
schema: veyra-robinhood-mainnet-owner-approved-dormant-v1
chainId: 4663
ownerProfile: EOA_INACTIVE
releasePolicy: OWNER_APPROVED_DORMANT
deployer: 0x160CD6fe46aa4A5eb3F3a471C7ae0f07B0c2fb97
owner: 0x3cdb91a29b73dab9219d9a287543800b417b6dbb
attestor: 0x6dEdb07C81D315fF493C0ABCD8c9e5E0b0287bB0
startingDeployerNonce: <fresh RPC value>
deploymentBatchHash: <from fresh non-broadcast simulation>
maxFeePerGasWei: <owner-approved exact legacy gas price>
maxTotalFeeWei: <owner-approved aggregate ceiling>
expiresAt: <Unix timestamp, no more than 24 hours after signing>
riskAcceptance: VEYRA_OWNER_ACCEPTS_SINGLE_KEY_RISK_FOR_DORMANT_DEPLOYMENT_ONLY_V1
ownerRiskAcceptanceSignature: <EIP-191 owner signature>
```

This EIP-191 signature verifies against the configured owner and binds the
exact policy, deployment batch, roles, nonce, fees, and expiry. It authorizes
only the deployment batch. It is not independent security approval, and it
does not technically prevent the owner from activating the contracts later.
Do not treat it as a deployment approval unless the owner has inspected and
accepted the single-key and future-activation risks.

`INDEPENDENT_REVIEW_REQUIRED` refuses its `ScriptBroadcast` context until both
reviewer and owner signatures verify. Its record to preserve alongside the
signed reviewer report contains:

```text
schema: veyra-robinhood-mainnet-approval-v1
chainId: 4663
ownerProfile: EOA_INACTIVE
releasePolicy: INDEPENDENT_REVIEW_REQUIRED
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

## Independent-review-only signing sequence

The following steps apply only when `INDEPENDENT_REVIEW_REQUIRED` is selected.
They are not prerequisites for `OWNER_APPROVED_DORMANT`; that mode instead
requires the separate owner risk-acceptance record above and the explicit
operator broadcast decision below.

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
   it must report the selected policy and remain not-ready until all matching
   broadcast approval fields are configured. It must not read keystore
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
   signatures and expiry immediately before broadcast. A prior read observed
   0.0003 ETH; at the simulated candidate cap, that leaves approximately
   0.000096196376585491 ETH above the aggregate gas-limit ceiling before any
   other spending. This is not a fresh balance check or an approved reserve.
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
| R-01 | High before activation | No independent security review exists. The owner-risk release policy permits a dormant deployment without claiming one. | Before configuring policies, executing a route, or enabling publication, obtain independent review of exact token/router semantics, executor compatibility, adversarial tests, and attestation privacy. |
| R-02 | High | The owner is a single EOA. Read-only code absence does not prove operator key control or safe custody. | Confirm owner address through a hardware-backed wallet, verify the signed approval recovers to that address, document key custody and recovery; accept single-key risk explicitly. Do not call it multisig. |
| R-03 | High | Token and router registries enforce admin assertions and runtime hashes, not independent safety. | Keep both empty. Before any activation, review exact token semantics and router bytecode/source, test exact-transfer behavior and route calldata, then use a separately approved activation transaction. |
| R-04 | High | The executor's typed `swapExactTokensForTokens` route is not proven compatible with 0x Swap API v2 AllowanceHolder or any Robinhood Mainnet deployment. | Keep executor unreachable through empty policies. Build and independently review an adapter for one verified route, validate spender/target/recipient/chain/allowance/simulation, and test on an isolated fork before enabling. |
| R-05 | High | The guard/executor tests cover core lock, replay, caller, output, and residue checks but not malicious token callbacks or a systematic adversarial route matrix. | Add adversarial mocks and fuzz/invariant tests for callbacks/reentrancy, false/no-return/malformed token results, fee-on-transfer/rebase behavior, malicious router output/recipient behavior, nonce/expiry/slippage boundaries; review all results. |
| R-06 | High for publication | Attestation events and getters expose report, manifest, and run digests and their linkage. Hashes can still be correlated or dictionary-tested; owner can enable publication. | Keep publication disabled. Define which identifiers may be committed, use high-entropy salts where appropriate, document retention/revocation limits, and get privacy approval before enabling. |
| R-07 | Medium | Official docs state EVM compatibility but do not identify a hardfork. | Keep Cancun target explicit; preserve RPC `eth_estimateGas` evidence for exact creation code and require bytecode/receipt verification after any approved deployment. Resolve the target revision with chain documentation/support if possible. |
| R-08 | High before broadcast | The named keystore file exists, but it contains no address metadata and the default Foundry wallet list does not include the configured deployer. Owner signature, fee approval, and funding decision are also absent. | Run `cast wallet address --account veyra-robinhood-mainnet` locally and privately confirm it matches the deployer; if it does not, select the correct already-controlled encrypted account. Refresh nonce, balance, fees, and simulation before authorizing. |

No source change in this package should clear these findings by assertion. The
external reviewer owns the independent judgment; the operator owns the final
single-key transaction decision.

## Required approval and execution order

1. The owner reads the package and chooses a policy. For
   `OWNER_APPROVED_DORMANT`, explicitly accept single-key EOA authority and the
   fact that existing owner permissions can activate contracts later without a
   contract-enforced reviewer gate. If unacceptable, stop.
2. Verify locally that the encrypted Foundry alias resolves to the configured
   deployer without disclosing its password or key. Read-only verify role
   addresses, chain 4663, owner code absence, nonce, and balance.
3. Run a fresh non-broadcast simulation for the selected policy. Record the
   exact 10 transaction gas limits, fee quote, selected release policy, and
   nonce-bound batch hash. Stop if roles, bytecode, operation order, or dormant
   invariants differ from the intended plan.
4. Set release policy, exact per-gas and total fee ceilings, and an expiry of
   no more than 24 hours. Generate the current approval digests/messages. The
   owner-risk path has no reviewer fields; the configured owner signs its
   single-key risk-acceptance message after inspecting the exact record.
5. Verify the signature against the final digest and confirm the recovered
   address is the configured owner. Manually check
   `sum(gasLimit × maxFeePerGasWei) <= maxTotalFeeWei`; Solidity does not enforce
   this aggregate comparison. Any changed field invalidates the signature.
6. Obtain a separate explicit operator decision for the exact transaction plan
   and fee ceiling. Fund only the fresh aggregate estimate plus an approved
   margin, recheck chain/nonce/balance/owner code/signature/expiry, and broadcast
   once using the encrypted alias. Do not use `--resume`; partial execution
   needs a new state-aware plan and authorization.
7. Verify all ten receipts, ordering, runtime bytecode, owner, empty registries,
   guard/executor links, assigned attestor, and disabled publication. Update
   the manifest only from genuine receipt and code evidence.

Any changed source hash, role address, nonce, batch, release policy, fee ceiling,
or expiry invalidates the approval and requires a fresh record. No transaction
has been signed or broadcast as part of preparing this package.
