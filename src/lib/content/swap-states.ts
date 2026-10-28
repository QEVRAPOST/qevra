import type { SwapButtonKey, SwapButtonState } from "@/types";

/**
 * Every state of the swap button and the state card beneath it (docs/QEVRA_DESIGN_DIRECTION.md section 7.5).
 * The rule for every state: say what is true, and say what did not happen. Errors do not apologise.
 *
 * `token` is the unsupported-token pattern specified in section 7.14.
 */
export const SWAP_STATES: Readonly<Record<SwapButtonKey, SwapButtonState>> = {
  connect: { key: "connect", label: "Connect wallet", severity: "info", disabled: false, cause: "No wallet is connected.", notDone: "Nothing was requested from your wallet." },
  network: { key: "network", label: "Switch network", severity: "blocked", disabled: false, cause: "Your wallet is on another network. Expected: Robinhood Mainnet (4663).", notDone: "No transaction was sent." },
  account: { key: "account", label: "Create QEVRA account", severity: "blocked", disabled: false, cause: "This demo illustrates an experimental QEVRA account concept. Live Robinhood Mainnet swaps use the connected external wallet, not this account.", notDone: "This example account holds no assets and is not part of the live Mainnet swap flow." },
  key: { key: "key", label: "Register authorization key", severity: "blocked", disabled: false, cause: "The account needs an authorization key before it can swap. This part is experimental.", notDone: "No key was created and nothing was signed." },
  fund: { key: "fund", label: "Fund your QEVRA account", severity: "info", disabled: false, cause: "The QEVRA account holds no assets to swap.", notDone: "No transaction was sent." },
  amount: { key: "amount", label: "Enter amount", severity: "info", disabled: true, cause: "Type an amount to swap.", notDone: "Nothing has been reviewed yet." },
  balance: { key: "balance", label: "Insufficient TKN-A", severity: "blocked", disabled: true, cause: "The QEVRA account holds less TKN-A than this amount.", notDone: "No transaction was sent." },
  gas: { key: "gas", label: "Insufficient gas", severity: "blocked", disabled: true, cause: "The QEVRA account cannot cover the network fee.", notDone: "No transaction was sent." },
  expired: { key: "expired", label: "Quote expired, refresh", severity: "blocked", disabled: false, cause: "The quote ran out of time, so the intent has to be checked again.", notDone: "No transaction was sent." },
  token: { key: "token", label: "Choose another token", severity: "blocked", disabled: true, cause: "This token is not on the reviewed list.", notDone: "No transaction was sent." },
  review: { key: "review", label: "Review intent", severity: "info", disabled: false, cause: "Check every detail in the Intent Lock, then review it. Nothing is signed by reviewing.", notDone: "Nothing has been signed." },
  rereview: { key: "rereview", label: "Review intent again", severity: "blocked", disabled: false, cause: "A detail changed after you reviewed. Review the new details before you sign.", notDone: "Nothing has been signed." },
  route: { key: "route", label: "Route unavailable", severity: "blocked", disabled: true, cause: "You reviewed these details. No verified route is configured, so signing is switched off.", notDone: "No quote is shown, because none exists." },
  awaiting: { key: "awaiting", label: "Awaiting wallet approval", severity: "info", disabled: true, cause: "Your wallet is asking you to approve.", notDone: "Nothing is sent until you approve." },
  pending: { key: "pending", label: "Pending", severity: "info", disabled: true, cause: "The transaction was sent and is waiting for the chain to confirm it.", notDone: "It is not final yet. No result is shown until the chain reports one." },
  confirmed: { key: "confirmed", label: "Confirmed", severity: "done", disabled: true, cause: "The chain confirmed the transaction.", notDone: "A link to the block explorer appears here for a real transaction." },
  reverted: { key: "reverted", label: "Reverted", severity: "failed", disabled: true, cause: "The transaction reverted, so the swap did not happen.", notDone: "Network fees may have been spent." },
  rejected: { key: "rejected", label: "Rejected", severity: "info", disabled: true, cause: "You declined the request in your wallet.", notDone: "No transaction was sent." },
};

/** Order used by the preview controls select. */
export const SWAP_STATE_ORDER: readonly SwapButtonKey[] = [
  "connect",
  "network",
  "account",
  "key",
  "fund",
  "amount",
  "balance",
  "gas",
  "expired",
  "token",
  "review",
  "rereview",
  "route",
  "awaiting",
  "pending",
  "confirmed",
  "reverted",
  "rejected",
];
