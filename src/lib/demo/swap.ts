import { SWAP_STATES } from "@/lib/content/swap-states";
import { DEMO_QEVRA_BALANCE_A, DEMO_TOKENS } from "@/lib/demo-fixtures";
import type { IntentComparison, IntentRow, SetupStage, SwapButtonKey, SwapButtonState, SwapView } from "@/types";

/** Demo-only logic. In production the swap state, the quote and the intent comparison are engineering-owned. */

/** Parse the amount field: a positive finite number, or NaN. */
export function parseAmount(value: string): number {
  const v = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(v) && v > 0 ? v : NaN;
}

export const formatAmount = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** The button state the preview shows without any forced override (docs section 7.5, "Automatic selection"). */
export function autoSwapState(stage: SetupStage, amount: number, reviewed: number | null): SwapButtonKey {
  if (stage === 0) return "connect";
  if (stage === 1) return "account";
  if (stage === 2) return "key";
  if (stage === 3) return "fund";
  if (Number.isNaN(amount)) return "amount";
  if (amount > DEMO_QEVRA_BALANCE_A) return "balance";
  if (reviewed == null) return "review";
  return reviewed === amount ? "route" : "rereview";
}

interface FixedRow {
  id: IntentRow["id"];
  label: string;
  value: string;
  dim?: boolean;
}

const FIXED_ROWS: readonly FixedRow[] = [
  { id: "recipient", label: "Recipient", value: "EXAMPLE" },
  { id: "chain", label: "Chain", value: "46630" },
  { id: "tokens", label: "Tokens", value: "TKN-A to TKN-B" },
  { id: "amount", label: "Amount", value: "" },
  { id: "router", label: "Router and allowance", value: "Not configured", dim: true },
  { id: "slippage", label: "Slippage and minimum out", value: "0.5%, no quote" },
  { id: "nonce", label: "Nonce", value: "EXAMPLE" },
  { id: "deadline", label: "Deadline", value: "EXAMPLE" },
];

/** Compare the reviewed amount with the typed amount. A client-side example of the comparison, not a check. */
export function buildIntentComparison(stage: SetupStage, amount: number, reviewed: number | null): IntentComparison {
  const isReviewed = reviewed != null;
  const changed = isReviewed && (Number.isNaN(amount) || amount !== reviewed);
  const rows: IntentRow[] = FIXED_ROWS.map((r) => {
    const isAmount = r.id === "amount";
    const chg = isAmount && changed;
    const reviewedText = !isReviewed ? "—" : isAmount ? `${formatAmount(reviewed)} ${DEMO_TOKENS.pay}` : r.value;
    const toSign = isAmount ? (Number.isNaN(amount) ? "—" : `${formatAmount(amount)} ${DEMO_TOKENS.pay}`) : r.value;
    const match: IntentRow["match"] = !isReviewed ? "not-reviewed" : chg ? "changed" : r.dim ? "not-set" : "same";
    return { id: r.id, label: r.label, reviewed: reviewedText, toSign, match, dim: r.dim && !chg };
  });
  return { rows, reviewed: isReviewed, changedCount: changed ? 1 : 0, setupComplete: stage >= 4 };
}

/**
 * The design-demonstration comparison used by the draggable Intent Lock rings. Example values only: it is a
 * picture of the idea ("a changed detail turns its ring out of line"), never a check of anything real.
 */
export function buildDemoIntentComparison(turned: readonly boolean[]): IntentComparison {
  const rows: IntentRow[] = FIXED_ROWS.map((r, i) => {
    const isAmount = r.id === "amount";
    const base = isAmount ? `100 ${DEMO_TOKENS.pay}` : r.value;
    const chg = !!turned[i];
    return {
      id: r.id,
      label: r.label,
      reviewed: base,
      toSign: chg ? (isAmount ? `120 ${DEMO_TOKENS.pay}` : "Changed (example)") : base,
      match: chg ? "changed" : r.dim ? "not-set" : "same",
      dim: r.dim && !chg,
    };
  });
  return { rows, reviewed: true, changedCount: turned.filter(Boolean).length, setupComplete: true };
}

export function buildSwapView(
  stage: SetupStage,
  amountText: string,
  reviewed: number | null,
  forced: SwapButtonKey | null,
): SwapView {
  const amount = parseAmount(amountText);
  const key = forced ?? autoSwapState(stage, amount, reviewed);
  const button: SwapButtonState = SWAP_STATES[key];
  return {
    amount: amountText,
    payToken: DEMO_TOKENS.pay,
    receiveToken: DEMO_TOKENS.receive,
    payHint: "Example token. A balance shows only after setup.",
    receive: { display: "No quote", hint: "No quote is shown, because no route is configured and none can be made up." },
    routeChip: { label: "Router not configured", tone: "unk", material: "dotted" },
    quote: [
      { label: "Slippage limit", value: "0.5%", tag: "example" },
      { label: "Network fee", value: "Not estimated" },
      { label: "Quote expires", value: "No quote" },
      { label: "Router", value: "Not configured" },
    ],
    button,
    comparison: buildIntentComparison(stage, amount, reviewed),
  };
}

/** The tokens the preview swap offers. Both are labelled examples with no price, balance or route. */
export const PREVIEW_TOKENS = ["TKN-A", "TKN-B"] as const;
export type PreviewToken = (typeof PREVIEW_TOKENS)[number];
export const PREVIEW_SLIPPAGES = ["0.1", "0.5", "1"] as const;
export type PreviewSlippage = (typeof PREVIEW_SLIPPAGES)[number];

/** The parameters of a previewed swap that Intent Lock reviews. Presentation state only: nothing here is sent anywhere. */
export interface PreviewParams {
  pay: PreviewToken;
  /** NaN when the field is empty or not a positive number */
  amount: number;
  slippage: PreviewSlippage;
  chainId: number;
}

export const otherToken = (t: PreviewToken): PreviewToken => (t === "TKN-A" ? "TKN-B" : "TKN-A");

function previewValues(p: PreviewParams): Record<IntentRow["id"], string> {
  return {
    recipient: "Simulated account",
    chain: String(p.chainId),
    tokens: `${p.pay} to ${otherToken(p.pay)}`,
    amount: Number.isNaN(p.amount) ? "—" : `${formatAmount(p.amount)} ${p.pay}`,
    router: "Not configured",
    slippage: `${p.slippage}%, no quote`,
    nonce: "Simulated",
    deadline: "Simulated",
  };
}

/**
 * Compare the parameters the visitor reviewed with the ones now on screen. A picture of the idea on simulated values, not a
 * check: change the amount, the pair, the slippage or the network after reviewing, and exactly that row (and its ring) turns out
 * of line. `driven` is the same result as one flag per row, in ring order.
 */
export function buildPreviewComparison(reviewed: PreviewParams | null, now: PreviewParams): { comparison: IntentComparison; driven: boolean[] } {
  const before = reviewed ? previewValues(reviewed) : null;
  const after = previewValues(now);
  const driven = FIXED_ROWS.map((r) => !!before && r.id !== "router" && before[r.id] !== after[r.id]);
  const rows: IntentRow[] = FIXED_ROWS.map((r, i) => ({
    id: r.id,
    label: r.label,
    reviewed: before ? before[r.id] : "—",
    toSign: after[r.id],
    match: !before ? "not-reviewed" : driven[i] ? "changed" : r.dim ? "not-set" : "same",
    dim: r.dim && !driven[i],
  }));
  return { comparison: { rows, reviewed: !!before, changedCount: driven.filter(Boolean).length, setupComplete: true }, driven };
}
