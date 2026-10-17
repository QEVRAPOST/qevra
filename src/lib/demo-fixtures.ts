/**
 * DEMO DATA. Every value in this file is an example and is labelled as one wherever it is shown.
 *
 * Fixtures live here, apart from the typed application contracts in src/types, so they can be removed in one
 * step. Nothing in this file is read from a chain, a wallet or a Security Swarm run. Do not label a fixture
 * "Verified" or "Live", and do not add a hash, address, balance or time that looks real.
 */
import type { ActivityRow, SwarmRun } from "@/types";

/** Example balance of the example token in the funded QEVRA account. Used by the "Insufficient" state. */
export const DEMO_QEVRA_BALANCE_A = 100;

export const DEMO_TOKENS = { pay: "TKN-A", receive: "TKN-B" } as const;

export const DEMO_EOA_ASSETS = {
  tknA: { beforeFunding: "400.00", afterFunding: "300.00" },
  gas: "0.50",
} as const;

export const DEMO_QEVRA_ASSETS_FUNDED = [
  { symbol: "TKN-A", amount: "100.00" },
  { symbol: "TKN-B", amount: "0.00" },
] as const;

/** The three runs shown by default. */
const EXAMPLE_RUNS: SwarmRun[] = [
  {
    id: "RUN-EXAMPLE-01",
    role: "Source watcher",
    goal: "Watch public advisories for notices about ML-DSA libraries",
    status: { label: "Needs human review", tone: "exp", material: "outline" },
    shows: "Which public advisories mention a library QEVRA would depend on.",
    how: "Reads a fixed list of public pages and records the time each one was read.",
    notShown: "It does not say the library is safe, and it cannot see private disclosures.",
    limitation: "Example run. No real source was read.",
    evidence: "Two source links would be listed here, each with the time it was read.",
    humanReview: { recorded: false },
    exampleTag: "EXAMPLE",
  },
  {
    id: "RUN-EXAMPLE-02",
    role: "Test agent",
    goal: "Check that a changed amount is never treated as the reviewed one",
    status: { label: "Queued", tone: "unk", material: "dotted" },
    shows: "Whether the comparison treats a changed amount as a different intent.",
    how: "A named, deterministic test that compares two example intents field by field.",
    notShown: "It does not test your wallet, the chain or a router.",
    limitation: "Queued, not run. Passed can appear only after a recorded run.",
    evidence: "No evidence yet. A test result would link to its definition.",
    humanReview: { recorded: false },
    exampleTag: "EXAMPLE",
  },
  {
    id: "RUN-EXAMPLE-03",
    role: "Skeptic",
    goal: "Look for a claim that goes further than its evidence",
    status: { label: "Finding detected", tone: "bad", material: "outline" },
    shows: "A claim in the public copy that no recorded evidence supports.",
    how: "Compares each claim in a list of public pages with the evidence list.",
    notShown: "It does not say the claim is false, only that no evidence is recorded.",
    limitation: "Example finding. Severity is labelled and the details are withheld.",
    evidence: "One footnote would point at the page and the claim.",
    withheld: true,
    humanReview: { recorded: false },
    exampleTag: "EXAMPLE",
  },
];

/**
 * Extra example states from docs/QEVRA_DESIGN_DIRECTION.md section 7.14, built from the same parts: a paused run,
 * a failed run, a completed run with zero findings, and a run whose evidence source was unavailable.
 * They appear only when the preview controls ask for them.
 */
const EXTRA_EXAMPLE_RUNS: SwarmRun[] = [
  {
    id: "RUN-EXAMPLE-04",
    role: "Source watcher",
    goal: "Re-read the public NIST FIPS 204 page for errata",
    status: { label: "Paused", tone: "unk", material: "dotted" },
    shows: "The run stopped before it finished.",
    how: "Reads a fixed list of public pages and records the time each one was read.",
    notShown: "It says nothing about whether the system is safe.",
    limitation: "Example run. It was paused before it read any source.",
    evidence: "No evidence yet. A paused run lists what it had read so far.",
    humanReview: { recorded: false },
    exampleTag: "EXAMPLE",
  },
  {
    id: "RUN-EXAMPLE-05",
    role: "Test agent",
    goal: "Replay an example authorization on a second chain ID",
    status: { label: "Failed", tone: "bad", material: "solid" },
    shows: "The run stopped before it finished.",
    how: "A named, deterministic test in an isolated sandbox.",
    notShown: "It says nothing about whether the system is safe.",
    limitation: "Example run. A real failed run states the reason for the stop here, if it is known.",
    evidence: "A real failed run links its log here.",
    humanReview: { recorded: false },
    exampleTag: "EXAMPLE",
  },
  {
    id: "RUN-EXAMPLE-06",
    role: "Skeptic",
    goal: "Look for a claim about recovery that goes further than its evidence",
    status: { label: "Completed with limitations", tone: "neutral", material: "outline" },
    shows: "Whether any public claim about recovery goes further than the recorded evidence.",
    how: "Compares each claim in a list of public pages with the evidence list.",
    notShown: "It does not say that no such claim exists.",
    limitation: "Example run. Only the pages on its fixed list would be read.",
    evidence: "Page links would be listed here, each with the time it was read.",
    zeroFindings: true,
    humanReview: { recorded: false },
    exampleTag: "EXAMPLE",
  },
  {
    id: "RUN-EXAMPLE-07",
    role: "Source watcher",
    goal: "Check a library release note for a changed key size",
    status: { label: "Evidence not yet verified", tone: "unk", material: "dotted" },
    shows: "A release note that may describe a changed key size.",
    how: "Reads one public page and records the time it was read.",
    notShown: "It does not say the note is correct.",
    limitation: "Example run. The source could not be read.",
    evidence: "Source unavailable when it was read. No time is recorded in this example. The claim is not verified.",
    unavailableSource: true,
    humanReview: { recorded: false },
    exampleTag: "EXAMPLE",
  },
];

export const DEMO_RUNS_DEFAULT: readonly SwarmRun[] = EXAMPLE_RUNS;
export const DEMO_RUNS_ALL: readonly SwarmRun[] = [...EXAMPLE_RUNS, ...EXTRA_EXAMPLE_RUNS];

const EXAMPLE_ACCOUNT = "EXAMPLE ACCOUNT";
const NETWORK = "Robinhood Testnet 46630";

function activityDetail(stateLabel: string, amount: string): ActivityRow["detail"] {
  return [
    { label: "State", value: stateLabel },
    { label: "Amount", value: amount },
    { label: "Slippage limit", value: "0.5%" },
    { label: "Account", value: EXAMPLE_ACCOUNT },
    { label: "Network", value: NETWORK },
    { label: "Block explorer", value: "Link for a real transaction" },
  ];
}

export const DEMO_ACTIVITY: readonly ActivityRow[] = [
  {
    id: "act-1",
    sentence: "Swap 100 TKN-A for TKN-B, up to 0.5% slippage",
    state: "pending",
    stateLabel: "Pending",
    tone: "unk",
    material: "dotted",
    amount: "100 TKN-A",
    note: "Waiting for the chain to confirm. No result is shown until it reports one.",
    exampleTag: "EXAMPLE · no hash, no real time",
    detail: activityDetail("Pending", "100 TKN-A"),
  },
  {
    id: "act-2",
    sentence: "Swap 40 TKN-A for TKN-B, up to 0.5% slippage",
    state: "confirmed",
    stateLabel: "Confirmed",
    tone: "neutral",
    material: "solid",
    amount: "40 TKN-A",
    note: "The chain confirmed this transaction. A link to the block explorer appears here for a real one.",
    exampleTag: "EXAMPLE · no hash, no real time",
    detail: activityDetail("Confirmed", "40 TKN-A"),
  },
  {
    id: "act-3",
    sentence: "Swap 250 TKN-A for TKN-B, up to 0.5% slippage",
    state: "reverted",
    stateLabel: "Reverted",
    tone: "bad",
    material: "solid",
    amount: "250 TKN-A",
    note: "The swap did not happen. Network fees may have been spent, even though the swap failed.",
    exampleTag: "EXAMPLE · no hash, no real time",
    detail: activityDetail("Reverted", "250 TKN-A"),
  },
  {
    id: "act-4",
    sentence: "Swap 10 TKN-A for TKN-B, up to 0.5% slippage",
    state: "rejected",
    stateLabel: "Rejected",
    tone: "unk",
    material: "outline",
    amount: "10 TKN-A",
    note: "You declined the request in your wallet. No transaction was sent.",
    exampleTag: "EXAMPLE · no hash, no real time",
    detail: activityDetail("Rejected", "10 TKN-A"),
  },
];
