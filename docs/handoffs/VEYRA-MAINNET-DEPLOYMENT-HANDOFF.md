# VEYRA Robinhood Mainnet Deployment Handoff

**Prepared:** 2026-10-30

**Repository:** QEVRO / VEYRA

**Network:** Robinhood Mainnet, chain ID `4663` (`0x1237`)

**Deployment profile:** `EOA_INACTIVE`

**Release policy:** `OWNER_APPROVED_DORMANT`

## 1. Executive summary

The five-contract VEYRA MVP deployment on Robinhood Mainnet is complete: **5/5
contracts are deployed**. The canonical Mainnet manifest, Foundry broadcast
artifact, receipts, and read-only Mainnet checks agree. The deployment batch
contains ten successful transactions and cost `0.000082043604622 ETH` in
receipt-reported network fees.

This is a dormant infrastructure deployment. It does not represent source
verification, an independent security audit, or production activation. No
token or router policy is configured, no swap route is enabled, and attestation
publication is disabled. The five contracts do not provide post-quantum
custody. **No further Mainnet deployment is needed for this MVP batch.**

| State | Result | Evidence boundary |
|---|---|---|
| **DEPLOYED** | **PASS — 5/5** | Successful receipts, deployed addresses, runtime code and manifest records. |
| **SOURCE VERIFIED** | **NO** | Every Mainnet manifest record says `sourceVerification: not_verified`. |
| **SECURITY AUDITED** | **NO** | The repository’s security package records unresolved review items; the deployment authorization was not an independent audit. |
| **PRODUCTION ACTIVATED** | **NO** | `EOA_INACTIVE`; empty registries; attestation publication disabled. |

## 2. Network and release configuration

- Chain ID: `4663` (`0x1237`).
- RPC: [Robinhood Mainnet RPC](https://rpc.mainnet.chain.robinhood.com).
- Explorer: [Robinhood Chain Blockscout](https://robinhoodchain.blockscout.com).
- Foundry profile: `robinhood_mainnet`; manifest RPC alias: `robinhood_mainnet`.
- Owner profile: `EOA_INACTIVE`. The owner is a single EOA, not a Safe or
  multisig.
- Release policy: `OWNER_APPROVED_DORMANT`. This authorized the exact dormant
  deployment batch; it does not authorize later configuration or activation.
- Broadcast record time: `2026-10-30T14:01:18.650Z`.
- Broadcast artifact source revision: `b0468c8`, as recorded in
  `contracts/broadcast/DeployVeyraMainnetMvp.s.sol/4663/run-latest.json`.

## 3. Deployed contracts and canonical addresses

Each address and creation receipt links to its Robinhood Mainnet Blockscout
record. Runtime code hashes are listed in section 7.

| Slot | Contract | Mainnet address | Creation transaction | Block |
|---:|---|---|---|---:|
| 6 | `VeyraTokenPolicyRegistry` | [0xe9fD2E8D70E59441f6524d5294A12319D91E865c](https://robinhoodchain.blockscout.com/address/0xe9fD2E8D70E59441f6524d5294A12319D91E865c) | [0x2ca8ade7c187f7a318e1f95b273c74bc8c1ed3095fce3a8fde61463db39b2033](https://robinhoodchain.blockscout.com/tx/0x2ca8ade7c187f7a318e1f95b273c74bc8c1ed3095fce3a8fde61463db39b2033) | 101780339 |
| 7 | `VeyraRouterRegistry` | [0x6e9Af9C6e69Ec9375d85E554e3b909F421Fbb385](https://robinhoodchain.blockscout.com/address/0x6e9Af9C6e69Ec9375d85E554e3b909F421Fbb385) | [0xf943794eba0b148c597937e0ad61afdc2d5d68ac29d5e3325b33e369135d290e](https://robinhoodchain.blockscout.com/tx/0xf943794eba0b148c597937e0ad61afdc2d5d68ac29d5e3325b33e369135d290e) | 101780371 |
| 8 | `VeyraSwapIntentGuard` | [0xC73744e090d9CAc6d9eB1883440862f9e8847098](https://robinhoodchain.blockscout.com/address/0xC73744e090d9CAc6d9eB1883440862f9e8847098) | [0xf9a7c55639a3d4628f4e3d9f0ab700a3aa10f7469b7d8d5cfc0535eda3552296](https://robinhoodchain.blockscout.com/tx/0xf9a7c55639a3d4628f4e3d9f0ab700a3aa10f7469b7d8d5cfc0535eda3552296) | 101780385 |
| 9 | `VeyraSwapExecutor` | [0x804d1A596AE0269f67A1B061eB1b963c376a2e9d](https://robinhoodchain.blockscout.com/address/0x804d1A596AE0269f67A1B061eB1b963c376a2e9d) | [0x32f52600c8d5731e9d0090dc9fefe384e43a6223f6666635fcd3802d11ab3935](https://robinhoodchain.blockscout.com/tx/0x32f52600c8d5731e9d0090dc9fefe384e43a6223f6666635fcd3802d11ab3935) | 101780404 |
| 10 | `VeyraResearchAttestationRegistry` | [0xCD9A244b9aE86dd7fF15402aAB7e138bf1D0eE51](https://robinhoodchain.blockscout.com/address/0xCD9A244b9aE86dd7fF15402aAB7e138bf1D0eE51) | [0x2227da7c184ae1db6f1d0974e91c583fecedb60bb67c5f2cf1d3f24412e2866d](https://robinhoodchain.blockscout.com/tx/0x2227da7c184ae1db6f1d0974e91c583fecedb60bb67c5f2cf1d3f24412e2866d) | 101780468 |

Slots **1–5** remain future security research. They have no deployment records
and are not counted in the five-contract MVP. The standalone Testnet Evidence
Anchor is separately recorded and is not one of these five Mainnet contracts.

## 4. Complete ten-transaction batch

The Foundry artifact contains ten transactions and ten receipts. Every receipt
has status `0x1`; the transaction nonces are consecutive from 0 through 9.
Fees below are calculated from each recorded `gasUsed × effectiveGasPrice`.

| # | Nonce | Operation | Transaction | Block | Receipt fee (ETH) |
|---:|---:|---|---|---:|---:|
| 1 | 0 | Create `VeyraTokenPolicyRegistry` | [0x2ca8ade7c187f7a318e1f95b273c74bc8c1ed3095fce3a8fde61463db39b2033](https://robinhoodchain.blockscout.com/tx/0x2ca8ade7c187f7a318e1f95b273c74bc8c1ed3095fce3a8fde61463db39b2033) | 101780339 | 0.000013877051986000 |
| 2 | 1 | Create `VeyraRouterRegistry` | [0xf943794eba0b148c597937e0ad61afdc2d5d68ac29d5e3325b33e369135d290e](https://robinhoodchain.blockscout.com/tx/0xf943794eba0b148c597937e0ad61afdc2d5d68ac29d5e3325b33e369135d290e) | 101780371 | 0.000011474384080000 |
| 3 | 2 | Create `VeyraSwapIntentGuard` with slots 6 and 7 | [0xf9a7c55639a3d4628f4e3d9f0ab700a3aa10f7469b7d8d5cfc0535eda3552296](https://robinhoodchain.blockscout.com/tx/0xf9a7c55639a3d4628f4e3d9f0ab700a3aa10f7469b7d8d5cfc0535eda3552296) | 101780385 | 0.000025101528816000 |
| 4 | 3 | Create `VeyraSwapExecutor` with slot 8 guard | [0x32f52600c8d5731e9d0090dc9fefe384e43a6223f6666635fcd3802d11ab3935](https://robinhoodchain.blockscout.com/tx/0x32f52600c8d5731e9d0090dc9fefe384e43a6223f6666635fcd3802d11ab3935) | 101780404 | 0.000012207254400000 |
| 5 | 4 | Call `VeyraSwapIntentGuard.setExecutor(slot 9)` | [0xb4e30ff05edea71114329d52b20bfa3c1d95afea4bde91b2e7c08b574857fc91](https://robinhoodchain.blockscout.com/tx/0xb4e30ff05edea71114329d52b20bfa3c1d95afea4bde91b2e7c08b574857fc91) | 101780436 | 0.000001024791824000 |
| 6 | 5 | Create `VeyraResearchAttestationRegistry` with the configured attestor | [0x2227da7c184ae1db6f1d0974e91c583fecedb60bb67c5f2cf1d3f24412e2866d](https://robinhoodchain.blockscout.com/tx/0x2227da7c184ae1db6f1d0974e91c583fecedb60bb67c5f2cf1d3f24412e2866d) | 101780468 | 0.000013866835364000 |
| 7 | 6 | Transfer slot 6 ownership to the configured owner | [0x752be6f63cef50855ffd0c48c063154eea96e48608ddee30af7035e58d2cd79f](https://robinhoodchain.blockscout.com/tx/0x752be6f63cef50855ffd0c48c063154eea96e48608ddee30af7035e58d2cd79f) | 101780503 | 0.000001117223068000 |
| 8 | 7 | Transfer slot 7 ownership to the configured owner | [0x4f78b269b5b0e54cc5f91ca122b560e6065d95c5d953e5fe4de95064086c92b8](https://robinhoodchain.blockscout.com/tx/0x4f78b269b5b0e54cc5f91ca122b560e6065d95c5d953e5fe4de95064086c92b8) | 101780534 | 0.000001129861338000 |
| 9 | 8 | Transfer slot 8 guard ownership to the configured owner | [0x6a78cf6ddffcd19841d349eb307af03183a062dafbf1d17497e4ca26793bfa25](https://robinhoodchain.blockscout.com/tx/0x6a78cf6ddffcd19841d349eb307af03183a062dafbf1d17497e4ca26793bfa25) | 101780567 | 0.000001128542562000 |
| 10 | 9 | Transfer slot 10 ownership to the configured owner | [0x606f97d025a5954c474a15cae843560e372e0c2d94e6a2c6574f5d628d2b7ff4](https://robinhoodchain.blockscout.com/tx/0x606f97d025a5954c474a15cae843560e372e0c2d94e6a2c6574f5d628d2b7ff4) | 101780581 | 0.000001116131184000 |

## 5. Deployment architecture and relationships

The batch created the MVP contracts in dependency order:

1. Slot 6 is the owner-managed token policy registry.
2. Slot 7 is the owner-managed router registry.
3. Slot 8 is the intent guard. Its constructor points to slots 6 and 7.
4. Slot 9 is the executor. Its immutable guard reference points to slot 8.
5. The guard’s one-time `setExecutor` call binds it to slot 9.
6. Slot 10 is the digest-only research attestation registry, constructed with
   the configured attestor role.
7. Ownership of slots 6, 7, 8, and 10 is transferred to the configured owner.

The executor itself is not owner-managed; it is bound to its guard. These
contracts are separate from the web app’s external-wallet 0x Swap integration.
The typed executor route has not been proven compatible with 0x AllowanceHolder
or a live Robinhood router.

## 6. Deployer, owner, and attestor

- **Deployer:**
  [`0x160CD6fe46aa4A5eb3F3a471C7ae0f07B0c2fb97`](https://robinhoodchain.blockscout.com/address/0x160CD6fe46aa4A5eb3F3a471C7ae0f07B0c2fb97).
  All ten receipt `from` fields and all ten transaction nonces match the
  recorded deployer/batch.
- **Owner:**
  [`0x3cdb91a29b73dab9219d9a287543800b417b6dbb`](https://robinhoodchain.blockscout.com/address/0x3cdb91a29b73dab9219d9a287543800b417b6dbb).
  Read-only `owner()` calls at handoff time returned this owner for slots 6,
  7, 8, and 10. This is a single EOA authority, not a multisig.
- **Attestor:**
  [`0x6dEdb07C81D315fF493C0ABCD8c9e5E0b0287bB0`](https://robinhoodchain.blockscout.com/address/0x6dEdb07C81D315fF493C0ABCD8c9e5E0b0287bB0).
  Read-only role checks confirmed this account has `ATTESTOR_ROLE`; the zero
  address does not. An attestor can publish digests only when the owner enables
  publication. The registry does not validate a report’s truth or quality.

The owner can change token/router policies or enable publication directly.
`OWNER_APPROVED_DORMANT` is a release authorization, not an on-chain
activation lock or a substitute for multisig key control.

## 7. Runtime bytecode verification evidence

The Mainnet manifest records `receiptStatus: success`, block, deployer,
transaction hash, and a nonzero `runtimeBytecodeHash` for every contract. A
fresh read-only RPC check observed chain ID `0x1237` and, at latest block
`101805550`, queried `eth_getCode` for every manifest address. The Keccak-256
hash of each returned runtime bytecode matched its manifest hash:

| Contract | Runtime bytes | Observed and manifest runtime hash |
|---|---:|---|
| `VeyraTokenPolicyRegistry` | 2656 | `0xfb960c0e27c6a4bd4112ba3e11085d07c389e4f8687aa455d68d30a8f708c0c3` |
| `VeyraRouterRegistry` | 2115 | `0x66fd6737cf28ac0d8d6f8acfd82e44a219d003c7f21b15d13a3924fb4e28a540` |
| `VeyraSwapIntentGuard` | 5148 | `0xad9255dcc456d1808a8e15999b9c9de04270fd2cc66c283f597fa0ac69c15947` |
| `VeyraSwapExecutor` | 2507 | `0x01ba61314e4fa2955c7a4775430ef49caad89c722ec80fbc255da7e53e8aa872` |
| `VeyraResearchAttestationRegistry` | 2489 | `0xed6e6873cf02a268651390aba07beafd84827f61320dcc44842ac9da38aa90b8` |

These checks establish that nonempty runtime code at the five addresses matches
the recorded runtime hashes. They do **not** establish source verification,
third-party audit status, or safety of future configuration.

## 8. Initial and current dormant-state configuration

Read-only calls at handoff time confirmed:

- Slots 6, 7, 8, and 10 have the configured owner.
- Slot 8 points to the slot 6 token registry, slot 7 router registry, and slot
  9 executor; slot 9 points back to slot 8.
- Slot 10 reports `attestationPublishingEnabled() == false`.
- The configured attestor role is granted; the zero address is not.
- Read-only event queries from block `101744211` (before deployment block
  `101780339`) through latest block `101805550` returned no `TokenPolicySet`,
  `RouterPolicySet`, or `AttestationRecorded` logs. The deployment batch itself
  contains no policy, router, or attestation publication calls.

The registry contracts are therefore deployed but empty and inactive in the
checked state. The owner retains authority to configure them. No user funds,
swap execution, custody, or PQ account functionality is enabled by this
deployment.

## 9. Canonical manifest and frontend integration

The canonical record is
[`contracts/deployments/robinhood-mainnet.json`](../../contracts/deployments/robinhood-mainnet.json).
It contains five `verified` deployment records for architecture slots 6–10,
chain ID 4663, successful receipt evidence, bytecode hashes, and
`sourceVerification: "not_verified"`. The Testnet manifest remains separate;
the standalone Evidence Anchor is not included in the Mainnet five-contract
count.

The server-side loading path is:

1. `src/lib/config/load-veyra-deployments.ts` imports both chain manifests.
2. `src/lib/config/veyra-deployment-manifest.ts` validates records against the
   selected network and verified evidence shape.
3. `src/app/app/networks/page.tsx` passes validated records and architecture
   slots to `NetworksView`.
4. The Network UI derives deployed counts from verified records; it does not
   hardcode these Mainnet addresses.

During this handoff, an unauthenticated HTTP GET to
[`https://veyraapp.net/app/networks`](https://veyraapp.net/app/networks)
returned HTTP 200. Its server-rendered HTML contained the Mainnet `5 / 5`
status and all five manifest addresses. This is HTTP/server-rendered evidence;
an interactive browser session was not exercised for this handoff.

## 10. Foundry, Bun, TypeScript, lint, and build verification

The latest recorded release checks before this documentation-only handoff were:

| Check | Recorded result |
|---|---|
| `forge test --root contracts` | 73 passed across 9 suites; 0 failed, 0 skipped. |
| `bun run test` | 461 passed; 5 skipped; 0 failed. |
| `bun run typecheck` | Passed. |
| `bun run lint` | Passed. |
| `forge fmt --check` | Passed. |
| `forge build --offline` | Passed. |
| `bun run build -- --webpack` | Production Webpack build passed in the prior release verification. |
| `node --import ./tests/register-test-hooks.mjs --import tsx --test tests/deploy-simulate.test.ts` | 25 passed during the preceding Git finalization. |

The Foundry optional size report previously exited nonzero because the local
deployment script artifact exceeded EIP-170; it is not a deployed contract.
The five deployed runtime bytecodes are all below EIP-170. These application
and Foundry checks were not rerun for this documentation-only change.

## 11. Actual transaction fees

Foundry broadcast receipts report a total of **`82043604622000 wei` =
`0.000082043604622 ETH`**. This sum is recomputed from each receipt’s `gasUsed`
and `effectiveGasPrice`; the per-transaction costs are in section 4. No
transaction was broadcast as part of preparing this handoff.

## 12. Git branch and release history

- Branch at handoff preparation: `main`.
- Base HEAD before this handoff: `abdc3a413b630504830c2f860420cb50c2336189`.
- `origin/main` was fetched and matched that base HEAD before documentation
  changes.
- The Mainnet manifest is already present in that release history; this task
  does not alter it.
- The Foundry broadcast artifact records source revision `b0468c8`.
- The final handoff commit follows the base release commit and is reported with
  the task’s Git push result.

## 13. Known limitations and outstanding risks

1. **No independent security audit:** passing local tests and a signed dormant
   deployment do not replace independent review.
2. **Single-EOA ownership:** compromise of the owner key allows configuration
   changes. It is not multisig and has no contract-enforced reviewer gate.
3. **No approved token policy:** the token registry’s admin entries are
   assertions; exact transfer behavior and token-specific risks require review.
4. **No approved router:** a matching code hash does not establish safe router
   behavior. The executor interface has not been demonstrated against a live
   Robinhood route or 0x AllowanceHolder.
5. **Adversarial coverage gaps:** the security package identifies missing
   malicious-token callback/reentrancy coverage and systematic fuzz/invariant
   testing for token and route behavior.
6. **Attestation privacy:** digests may be correlated or dictionary-tested.
   Publication is disabled, but the owner can enable it.
7. **EVM target certainty:** the repository uses a Cancun compiler target;
   chain documentation does not identify an exact hardfork revision.
8. **PQ account remains blocked:** slots 1–5 are not implemented or deployed;
   Phase 0B key-registration, custody, recovery, signing, deposits, and
   withdrawals remain security NO-GO.

## 14. Source verification and activation prerequisites

Before claiming **SOURCE VERIFIED**, submit exact source and compiler settings
to Robinhood Blockscout for each address and confirm the verified source and
immutable references reproduce the deployed runtime. The current manifest
correctly remains `not_verified`.

Before any operational activation:

- obtain an independent review of the exact deployed source and Mainnet
  configuration, especially token transfer semantics, router behavior,
  guard/executor integration, malicious callbacks, replay/expiry/slippage
  boundaries, and fuzz/invariant results;
- retain empty registries until each token and router/route has a separately
  reviewed address, runtime code hash, semantics, quote and execution path;
- prove a route in an isolated Mainnet fork and verify spender, target,
  recipient, calldata, allowance, output, and gas behavior before activation;
- approve the owner key-control model and an explicit, separately bounded
  activation action; the EOA can otherwise change the controls without an
  independent reviewer gate;
- approve an attestor/privacy policy before enabling digest publication, with
  a documented decision on identifiers, correlation risk, retention, and
  revocation limits;
- keep the experimental PQ custody/account path blocked until the known
  authorization flaw and recovery model receive a separate security solution
  and review.

The web application’s external-wallet 0x flow is separate from this
VEYRA-owned executor deployment. A successful external-wallet swap would not
mean the VEYRA executor is activated or that a VEYRA smart account executed it.

## 15. Production verification checklist

- [x] Read-only Mainnet `eth_chainId` returned `0x1237`.
- [x] All five manifest addresses returned nonempty runtime code; all five
  observed hashes matched the manifest.
- [x] Read-only ownership, guard/executor linkage, attestor role, and disabled
  publication checks matched the intended dormant configuration.
- [x] Mainnet manifest reports five verified MVP records and `not_verified`
  source status for each.
- [x] Public `/app/networks` HTTP response returned 200, server-rendered 5/5,
  and included all five Mainnet addresses.
- [ ] In a real browser, select Robinhood Mainnet and visually confirm all five
  rows, address links, transaction links, and inactive/source-verification
  states.
- [ ] Select Robinhood Testnet and confirm its five existing records remain
  unchanged; confirm the standalone Evidence Anchor remains separate.
- [ ] Confirm slots 1–5 are presented as future security research, with no
  fabricated addresses or deployment claims.
- [ ] Confirm no UI labels deployed contracts as source verified, audited,
  production-ready, or active.

The unchecked items require a browser/operator review; no interactive browser
test was performed in this handoff.

## 16. Maintenance and future development handoff

- Treat the Mainnet manifest and Foundry broadcast artifact as deployment
  evidence. Never infer a deployment from a simulation or regenerate an address.
- Preserve Testnet and Mainnet records separately. Keep the standalone
  Evidence Anchor outside the five-contract MVP count.
- For a code change or replacement deployment, make a new reviewed version and
  plan; never rerun the old batch or reuse its approval/signature.
- Keep `sourceVerification: "not_verified"` until independently confirmed.
- Keep router/token registries empty and attestation publication disabled until
  each activation prerequisite is met and separately authorized.
- Use read-only chain, receipt, and runtime-code checks for monitoring. Do not
  put private keys, seed phrases, keystore passwords, or approval signatures in
  this repository or handoff.

## 17. Deployment closure

The Robinhood Mainnet MVP deployment is formally **closed at 5/5 deployed**.
The five real addresses, ten successful transaction receipts, ownership,
linkage, current dormant state, and runtime bytecode hashes are documented
above and in the canonical manifest. **No further Mainnet deployment is
required.** Source verification, independent security review, browser review,
and any later production activation are separate work with separate evidence
and approval; none changes or extends this completed deployment batch.
