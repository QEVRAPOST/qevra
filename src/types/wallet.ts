/** Presentational contracts for Wallet and PQ Vault. No account is created and no funds move here. */

/** 0 not connected, 1 wallet connected, 2 account created, 3 key registered, 4 funded (example). */
export type SetupStage = 0 | 1 | 2 | 3 | 4;

export type LedgerActionId = "connect" | "createAccount" | "registerKey" | "fund" | "deposit" | "withdraw";

export interface LedgerAction {
  id: LedgerActionId;
  label: string;
  variant: "primary" | "ghost";
  disabled?: boolean;
}

export interface LedgerFact {
  label: string;
  value: string;
}

export interface LedgerAsset {
  symbol: string;
  amount: string;
}

/**
 * One of the two ledgers. A missing value renders as the plain "not available" wording, never a made-up value.
 * The two ledgers are never added into one total.
 */
export interface LedgerView {
  kind: "eoa" | "qevra";
  title: string;
  /** mono subtitle under the title */
  subtitle: string;
  /** one plain line, shown before the account exists */
  intro?: string;
  /** mono hint line under the intro */
  hint?: string;
  address?: { label: string; demo: boolean };
  facts: LedgerFact[];
  assets: LedgerAsset[];
  /** shown instead of the asset list when there is nothing to list */
  emptyAssets?: string;
  actions: LedgerAction[];
  /** mono footnote under the actions */
  footnote?: string;
}

export interface SetupStepView {
  title: string;
  detail: string;
  /** right-hand tag, for example "Experimental" or "Done in this preview" */
  tag: string;
  state: "done" | "current" | "todo";
}

export interface WalletView {
  stage: SetupStage;
  /** steps finished, 0 to 4 */
  setupDone: number;
  walletButtonLabel: string;
  eoa: LedgerView;
  qevra: LedgerView;
  steps: SetupStepView[];
}
