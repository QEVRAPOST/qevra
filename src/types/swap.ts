/** Presentational contracts for the Simple swap screen. Nothing here signs, quotes or sends. */

export type SwapButtonKey =
  | "connect"
  | "network"
  | "account"
  | "key"
  | "fund"
  | "amount"
  | "balance"
  | "gas"
  | "expired"
  | "token"
  | "review"
  | "rereview"
  | "route"
  | "awaiting"
  | "pending"
  | "confirmed"
  | "reverted"
  | "rejected";

export type SwapSeverity = "info" | "blocked" | "failed" | "done";

/** What the primary swap button and the state card beneath it say. */
export interface SwapButtonState {
  key: SwapButtonKey;
  label: string;
  severity: SwapSeverity;
  disabled: boolean;
  /** the cause: what is true right now */
  cause: string;
  /** what did not happen */
  notDone: string;
}

export type IntentRowId = "recipient" | "chain" | "tokens" | "amount" | "router" | "slippage" | "nonce" | "deadline";

export type IntentMatch = "not-reviewed" | "same" | "changed" | "not-set";

export interface IntentRow {
  id: IntentRowId;
  label: string;
  reviewed: string;
  toSign: string;
  match: IntentMatch;
  /** render the row muted (a value that is not set) */
  dim?: boolean;
}

/**
 * The result of comparing a reviewed intent with what would be signed.
 * Engineering owns the real comparison (the PM brief requires deterministic enforcement): the UI renders
 * this result and never decides on its own whether something matches.
 */
export interface IntentComparison {
  rows: IntentRow[];
  reviewed: boolean;
  changedCount: number;
  /** drives the caption wording only: whether the account setup is finished */
  setupComplete: boolean;
}

export interface QuoteLine {
  label: string;
  value: string;
  /** small mono "example" tag after the value */
  tag?: string;
}

/** Everything the Simple swap screen renders. */
export interface SwapView {
  amount: string;
  payToken: string;
  receiveToken: string;
  payHint: string;
  receive: { display: string; hint: string };
  routeChip: { label: string; tone: "unk" | "exp" | "neutral"; material: "dotted" | "outline" | "solid" };
  quote: QuoteLine[];
  button: SwapButtonState;
  comparison: IntentComparison;
}
