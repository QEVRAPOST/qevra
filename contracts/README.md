# Contracts workspace

> **Current Robinhood Mainnet status (2026-10-30):** the five MVP contracts
> in slots 6–10 are deployed and verified as on-chain records (5/5), with the
> `EOA_INACTIVE` profile and `OWNER_APPROVED_DORMANT` release policy. They are
> not source-verified, independently audited, or production-activated. No
> further Mainnet deployment is needed for this batch. See the
> [Mainnet deployment handoff](../docs/handoffs/VEYRA-MAINNET-DEPLOYMENT-HANDOFF.md)
> for receipts, bytecode evidence, roles, restrictions, and activation gates.

This Foundry workspace is reserved for Solidity contracts and local tests.
The production smart-account architecture, verifier integration, key
registration, recovery policy, and upgrade policy remain undecided pending the
Phase 0 feasibility gate.

The isolated Phase 0 harness under `src/phase0` and `phase0-tests` is research
code only. It is not a production account implementation and must not receive
funds.

The deployment and readiness rows below describe VEYRA-owned Solidity
contracts. The web application has a separate Robinhood Mainnet external-wallet
integration through server-side 0x Swap API v2; it does not require these
contracts for a provider route. A configured live quote and route still require
runtime preflight, and this application integration does not remove the
on-chain PQ custody and authorization blockers documented here.

## Ten-slot architecture and five-contract MVP

Slots 1–5 remain security research and are not implemented. Slots 6–10 are
implemented and deployed on Robinhood Testnet and Mainnet (5/5 on each chain).
Mainnet records are in `deployments/robinhood-mainnet.json`; they describe an
inactive EOA-owned deployment, not source verification, independent security
approval, or activation. The Phase 0 ML-DSA key-registration forgery remains a
hard stop for account authorization, custody, funding, recovery, deposits, and
withdrawals.

| # | Proposed Solidity name | Purpose and required dependencies | Source / Foundry coverage | Security gate | Testnet / Mainnet |
|---:|---|---|---|---|---|
| 1 | `VeyraKeyRegistrationValidator` | Binds the canonical ML-DSA public key to its prepared verification blob and rejects degenerate/noncanonical keys; prerequisite for #2. | Not implemented; no tests. | **Blocked:** no reviewed registration proof closes the known forgery. | No / No |
| 2 | `VeyraKeyRegistry` | Records immutable validated account-key bindings; depends on #1 and binds records to account identity. | Not implemented; no tests. | **Blocked:** cannot accept keys until #1 is independently reviewed. | No / No |
| 3 | `VeyraRecoveryPolicy` | Encodes a reviewed threshold recovery transition without a unilateral EOA bypass; depends on #2 and a product-approved recovery model. | Not implemented; no tests. | **Blocked:** key-loss, guardian, threshold, and delay policies remain undecided. | No / No |
| 4 | `VeyraAccount` | Non-upgradeable account with ML-DSA-authorized, bounded execution; depends on #1–#3 and #8. | Not implemented; no tests. | **Hard NO-GO:** verifier registration vulnerability and custody policy remain unresolved. | No / No |
| 5 | `VeyraAccountFactory` | Deterministically creates accounts without initializer front-running or retained factory authority; depends on #2 and #4. | Not implemented; no tests. | **Blocked:** account initialization and deployment authority are not reviewed. | No / No |
| 6 | `VeyraTokenPolicyRegistry` | Owner-managed token allowlist pins runtime code hash and decimals; accepts only explicitly marked exact-transfer semantics. | Implemented; focused Foundry coverage. | **Deployed dormant:** no independently reviewed Robinhood token allowlist or transfer-semantics review. Admin entries are assertions, not proofs. | Deployed dormant / Deployed dormant |
| 7 | `VeyraRouterRegistry` | Owner-managed allowlist pins exact router runtime code hash; consumed by #8/#9. | Implemented; focused Foundry coverage. | **Deployed dormant:** no compatible, independently verified Robinhood router is allowlisted. A code hash alone does not establish safe router behavior. | Deployed dormant / Deployed dormant |
| 8 | `VeyraSwapIntentGuard` | Consumes account-originated nonces; checks chain, tokens, router, deadline, quote/minimum output and slippage; locks an exact intent for same-block executor consumption. | Implemented; focused guard/executor integration tests. | **Deployed dormant:** linked to #6, #7 and #9, but no token or router policy enables a route. An account must itself authenticate the lock call. | Deployed dormant / Deployed dormant |
| 9 | `VeyraSwapExecutor` | Uses a typed exact-swap interface; input is held only during the atomic call, allowance is reset, output and zero residue are checked. | Implemented; focused tests include replay and caller authorization. | **Deployed inactive:** no verified route or independent Robinhood integration review. Test mocks do not establish live-router safety. | Deployed inactive / Deployed inactive |
| 10 | `VeyraResearchAttestationRegistry` | Role-gated digest-only run attestations; stores publisher and timestamp, never report text. An attestation records publication, not truth or review. | Implemented; focused Foundry coverage. | **Deployed restricted:** publication is disabled; review the privacy and attestor policy before enabling it. The Testnet deployment is unchanged. | Deployed restricted / Deployed restricted |

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
roadmap `contracts` array. Slots 1–5 remain unimplemented and undeployed;
slots 6–10 are recorded in the separate Testnet and Mainnet manifests. The
standalone Evidence Anchor has no Mainnet deployment script; it remains a
separate Testnet-only utility and is not included in the five-contract MVP.

## Proposed-contract readiness

The standalone Evidence Anchor is tracked separately. Slots 1–5 remain blocked.
Slots 6–10 have completed Mainnet deployment; their operational activation
status remains restricted as follows:

| Proposed contract | Readiness | Blocking condition |
|---|---|---|
| `VeyraKeyRegistrationValidator` | **Blocked; no deployment** | The ML-DSA key-registration forgery is not closed by an independently reviewed proof. |
| `VeyraKeyRegistry` | **Blocked; no deployment** | It depends on a reviewed `VeyraKeyRegistrationValidator`, which does not exist. |
| `VeyraRecoveryPolicy` | **Blocked; no deployment** | Guardian, threshold, delay, and recovery behavior remain undecided. |
| `VeyraAccount` | **Hard NO-GO; no deployment** | Phase 0B authorization, custody, recovery, deposits, and withdrawals remain disabled. |
| `VeyraAccountFactory` | **Blocked; no deployment** | Account initialization, front-running resistance, and factory authority are not reviewed. |
| `VeyraTokenPolicyRegistry` | **Deployed dormant on Testnet and Mainnet** | No independently reviewed Mainnet token policy or transfer-semantics approval; registry remains empty. |
| `VeyraRouterRegistry` | **Deployed dormant on Testnet and Mainnet** | No independently reviewed Mainnet router/route approval; registry remains empty. |
| `VeyraSwapIntentGuard` | **Deployed dormant on Testnet and Mainnet** | Guard is linked to the executor and both registries, but an empty policy set prevents a supported route. |
| `VeyraSwapExecutor` | **Deployed inactive on Testnet and Mainnet** | No verified compatible route or independent integration review exists. The application 0x path remains separate. |

`VeyraResearchAttestationRegistry` (slot 10) has a tested digest-only
implementation and restricted Testnet and Mainnet deployments. The Mainnet
deployment assigns the configured attestor and starts with publication
disabled. A reviewed privacy/attestor policy and explicit owner action remain
required before publication. The narrower Evidence Anchor is not a substitute
for this contract or a protocol-wide approval.

## Ten-contract implementation milestone

Source implementations now exist for slots 6–10, with focused local Foundry
tests. Slots 1–5 remain intentionally unimplemented because they define the
key-registration, recovery, and custody trust boundary; names-only or
mock-backed contracts do not resolve the Phase 0B security proof. The Phase 0
harness is not any of those production implementations.

The Testnet-only `DeployVeyraArchitecture.s.sol` sequence deploys slots 6–9 in
dependency order. `DeployVeyraMainnetMvp.s.sol` deployed the five Mainnet
contracts in dependency order, left token/router policies empty, transferred
administrative ownership to the configured EOA, and assigned the configured
attestor while publication remained disabled. The Mainnet batch completed once
with 5 contract creations, one executor binding, and 4 ownership transfers
(10 successful transactions). Its verified records are in
`deployments/robinhood-mainnet.json` and are cross-linked in the final
[deployment handoff](../docs/handoffs/VEYRA-MAINNET-DEPLOYMENT-HANDOFF.md).
Do not repeat the batch: no further Mainnet deployment is needed for this MVP.

Current non-broadcast Testnet simulation estimates 4,008,318 gas and maximum
fee-per-gas 0.020000001 gwei, for an execution-fee estimate of
0.000080166364008318 ETH. It includes four contract creations and one
executor-binding transaction. This is not a guaranteed all-in cap; any separate
Robinhood L1 data-fee surcharge must be included in the final live estimate.
The live Testnet chain ID was 46630 and the approved deployer balance observed
for preflight was 0.009996942930000000 ETH. The standalone Evidence Anchor is
still tracked separately in its Testnet manifest field. Mainnet deployment
records now exist for slots 6–10; the Mainnet deployment profile is
`EOA_INACTIVE`, with operational activation left behind separate security and
privacy gates.

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
manifests are chain-separated; verified records are populated only after
receipt and runtime-code checks. Mainnet slots 6–10 are populated, and Testnet
records remain independent.

Read-only preflight (does not read a keystore or construct a transaction):

```sh
bun scripts/robinhood.ts deploy preflight testnet <PUBLIC_DEPLOYER_ADDRESS>
bun scripts/robinhood.ts deploy preflight mainnet <PUBLIC_DEPLOYER_ADDRESS>
```

The Mainnet configuration is separate (`chain_id = 4663`, RPC alias
`robinhood_mainnet`, Mainnet explorer, and `robinhood-mainnet.json`). The
read-only CLI preflight requires a separate encrypted account alias and rejects
the Testnet alias. The Foundry script requires public deployer, owner, and
attestor addresses plus `VEYRA_MAINNET_OWNER_MODE`, which must be exactly
`SAFE_2_OF_3` or `EOA_INACTIVE`, and `VEYRA_MAINNET_RELEASE_POLICY`, which must
be exactly `INDEPENDENT_REVIEW_REQUIRED` or `OWNER_APPROVED_DORMANT`. Missing
or invalid release policy values fail closed. Safe mode retains the SafeL2 v1.4.1 2-of-3
checks: canonical implementation and factory, three distinct owners, threshold
two, no modules or guards, canonical fallback handler, and no signer overlap
with deployer or attestor.

`EOA_INACTIVE` accepts only an owner address with no runtime code on Robinhood
Mainnet and distinct from deployer, attestor, and the Testnet deployer. The
read-only RPC check cannot prove that anyone controls the corresponding key or
that the address is not intended for future counterfactual code. EOA ownership
is a single-key authority model, not equivalent to a Safe. The deployment
script starts token and router registries empty, wires the guard to its
executor without adding a route, and starts attestation publication disabled.
The owner can later configure policies or enable publication. This deployment
approval authorizes no later activation. That restriction is an operator policy
only: the EOA owner has on-chain authority to activate these controls without a
contract-enforced reviewer gate. If that residual single-key authority is
unacceptable, do not deploy under the EOA profile. These configured addresses
are public addresses, not private keys.

Set the public role addresses and explicit profile in the local environment.
Keep the encrypted signer only in Foundry's keystore. Run the read-only CLI
preflight with `bun scripts/robinhood.ts deploy preflight mainnet
"$VEYRA_MAINNET_DEPLOYER"`. A passing identity/configuration check does not
remove the selected release-policy signature, fee approval, or owner
authorization gate.

### Historical release policy and broadcast approval

> The approved ten-transaction Mainnet batch has already completed. This
> section records how that release was authorized. Do not rerun its broadcast
> command or use `--resume`; no further Mainnet deployment is needed for the
> five-contract MVP.

The Mainnet Foundry script keeps non-broadcast simulation available without
approval. A direct `forge script --broadcast` fails closed unless the exact
EOA_INACTIVE batch has the authorization selected by
`VEYRA_MAINNET_RELEASE_POLICY`. The batch hash includes the selected policy.

- `INDEPENDENT_REVIEW_REQUIRED` preserves the reviewer-plus-owner signature
  path and binds the report/package/batch/roles and the exact fee ceilings.
- `OWNER_APPROVED_DORMANT` is an explicit opt-in for deployment only. The owner
  signs acceptance of EOA single-key risk and the exact chain 4663, deployer,
  owner, attestor, profile, policy, starting nonce, batch hash, fee per gas,
  aggregate fee cap, and expiry. This path asserts no reviewer or report.

Both signatures are EIP-191, expire within 24 hours, and are checked before
`startBroadcast`. The selected price must equal the signed legacy gas price.
Neither policy authorizes a route, token policy, public attestation,
transaction execution, custody, or later activation. The EOA owner can still
activate these controls directly on-chain; no runtime contract enforces an
independent-review gate for future changes.

Common broadcast-only fee variables (keep signatures out of `.env.example`
and Git; signatures are authorization records, never signer keys):

```text
VEYRA_MAINNET_APPROVED_MAX_FEE_PER_GAS_WEI
VEYRA_MAINNET_APPROVED_MAX_TOTAL_FEE_WEI
VEYRA_MAINNET_APPROVAL_EXPIRES_AT
```

`INDEPENDENT_REVIEW_REQUIRED` additionally requires
`VEYRA_MAINNET_REVIEWER`, `VEYRA_MAINNET_REVIEW_PACKAGE_SHA256`,
`VEYRA_MAINNET_INDEPENDENT_REVIEW_SHA256`,
`VEYRA_MAINNET_REVIEWER_SIGNATURE`, and
`VEYRA_MAINNET_OWNER_APPROVAL_SIGNATURE`. `OWNER_APPROVED_DORMANT` instead
requires `VEYRA_MAINNET_OWNER_RISK_ACCEPTANCE_SIGNATURE` and does not read
reviewer/report fields. Keep authorization signatures in the ignored local
runtime environment.

For independent-review mode, the reviewer address must be distinct from the
deployer, owner, and attestor. The reviewer signs the package, independent
report, batch hash, and role configuration. The owner signs that context plus
the fee ceilings and expiry. The script rejects invalid, expired, overlong,
malformed, high-s, role-overlapping, or context-mismatched approvals. In both
modes, manually compare the sum of all ten simulated transaction gas limits
multiplied by the signed per-gas ceiling against the signed total-fee ceiling;
the script cannot enforce this aggregate bound. Do not use `--resume`: it does
not re-run the script approval gate. If a batch partially broadcasts, stop and
request a new state-aware recovery authorization.

Set the release policy, exact fee values, and expiry, then generate the current
nonce-bound batch hash and signing values without `--broadcast` or `--account`:

```sh
cd contracts
forge script script/DeployVeyraMainnetMvp.s.sol:DeployVeyraMainnetMvp \
  --profile robinhood_mainnet --rpc-url robinhood_mainnet \
  --sig 'currentMainnetDeploymentBatchHash()'

# For independent-review mode only, set reviewer/report/package fields. In
# either mode, set the exact fee ceilings and expiry first.
forge script script/DeployVeyraMainnetMvp.s.sol:DeployVeyraMainnetMvp \
  --profile robinhood_mainnet --rpc-url robinhood_mainnet \
  --sig 'currentMainnetApprovalDigests()'

# For MetaMask, return the raw 32-byte messages to pass to personal_sign.
forge script script/DeployVeyraMainnetMvp.s.sol:DeployVeyraMainnetMvp \
  --profile robinhood_mainnet --rpc-url robinhood_mainnet \
  --sig 'currentMainnetPersonalSignMessages()'
```

`currentMainnetApprovalDigests()` returns final digests for offline signers
such as `cast wallet sign --account <encrypted-alias> --no-hash <digest>`.
Those final digests already contain the EIP-191 prefix. MetaMask must instead
use the corresponding raw message from
`currentMainnetPersonalSignMessages()`:

```js
const announced = [];
const onAnnounce = (event) => announced.push(event.detail);
window.addEventListener("eip6963:announceProvider", onAnnounce);
window.dispatchEvent(new Event("eip6963:requestProvider"));
await new Promise((resolve) => setTimeout(resolve, 250));
window.removeEventListener("eip6963:announceProvider", onAnnounce);
const metaMask = announced.find(({ info }) => info?.rdns === "io.metamask");
if (!metaMask?.provider) throw new Error("MetaMask was not discovered through EIP-6963.");
const provider = metaMask.provider;
const chainId = await provider.request({ method: "eth_chainId" });
if (chainId.toLowerCase() !== "0x1237") throw new Error("Select Robinhood Mainnet 4663 manually in MetaMask.");
const [account] = await provider.request({ method: "eth_accounts" });
if (!account || account.toLowerCase() !== "<EXPECTED_SIGNER_ADDRESS>".toLowerCase()) {
  throw new Error("The selected MetaMask account does not match the expected signer.");
}
const signature = await provider.request({
  method: "personal_sign",
  params: ["0x<RAW_32_BYTE_MESSAGE>", account],
});
```

Use the reviewer message only for independent-review mode. In
`OWNER_APPROVED_DORMANT`, the helper returns a zero reviewer message and the
owner message encodes the single-key risk acceptance. This is a message
signature for the exact approval record, not a transaction. Do not sign a zero
message, call `personal_sign` on a final digest, or use deprecated `eth_sign`;
MetaMask must prefix the raw 32-byte message once. Before approving the hex
prompt, inspect the exact role addresses, policy, nonce, batch hash, fee limits,
and expiry. The helper does not request account access or switch networks.
Verify the returned signature against its final digest with
`cast wallet verify --address <signer> --no-hash <digest> <signature>`. Never
pass a private key or keystore password on the command line.

Historical Mainnet deployment simulation (the deployment is complete):

The following command is non-broadcast and documents the original release
preflight only. The broadcast command below is historical; executing it again
would create another set of contracts and is not a required MVP action.

```sh
VEYRA_MAINNET_RELEASE_POLICY=OWNER_APPROVED_DORMANT forge script script/DeployVeyraMainnetMvp.s.sol:DeployVeyraMainnetMvp \
  --profile robinhood_mainnet --rpc-url robinhood_mainnet --sender "$VEYRA_MAINNET_DEPLOYER" \
  --sig 'run()' --gas-estimate-multiplier 130
```

This non-broadcast simulation omits `--account`; it creates no receipt and
does not require approval signatures. It verifies only the selected initial
deployment path. Attestation publication remains disabled until the EOA owner
explicitly changes it.

After a fresh simulation, the selected policy's exact signatures, explicit
owner authorization, and manual aggregate-fee verification, use the encrypted
Foundry account alias with the exact approved price. The owner-risk path needs
`VEYRA_MAINNET_OWNER_RISK_ACCEPTANCE_SIGNATURE`; the review path needs its
reviewer and owner signatures plus report/package hashes:

```sh
forge script script/DeployVeyraMainnetMvp.s.sol:DeployVeyraMainnetMvp \
  --profile robinhood_mainnet --rpc-url robinhood_mainnet \
  --sender "$VEYRA_MAINNET_DEPLOYER" --account "$VEYRA_MAINNET_ACCOUNT" \
  --sig 'run()' --legacy \
  --with-gas-price "$VEYRA_MAINNET_APPROVED_MAX_FEE_PER_GAS_WEI" \
  --gas-estimate-multiplier 130 --broadcast --slow
```

If the current Mainnet RPC does not accept a legacy transaction at that exact
price, stop and obtain a revised, independently reviewed approval format; do
not switch transaction fee modes under the old signature. Never pass a raw
private key or password. Do not broadcast until the deployer balance, owner
control, attestor policy, and contract-by-contract GO/NO-GO checks have been
reviewed.

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
