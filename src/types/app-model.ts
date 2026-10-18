import type { ActivityView } from "./activity";
import type { NetworkId, NetworkOption } from "./network";
import type { SecurityView } from "./security";
import type { CoverageRow, StatusBarItem } from "./status";
import type { SwapView } from "./swap";
import type { LedgerActionId, WalletView } from "./wallet";

/**
 * The single view model every dashboard screen renders.
 *
 * Presentation components only read this. Wallet, chain, quote and Security Swarm integration is
 * engineering-owned: to connect real data, provide an object of this shape (and the actions below) through
 * AppModelProvider instead of the demo provider. Nothing here creates a key, signs, or sends a transaction.
 */
export interface AppModel {
  /** "demo" means every value is a labelled fixture. There is no "live" provider yet. */
  mode: "demo";
  statusBar: StatusBarItem[];
  coverage: CoverageRow[];
  /** the network the app is pointed at, and the ones the menu lists (unavailable ones cannot be picked) */
  network: { selected: NetworkId; options: NetworkOption[] };
  wallet: WalletView;
  swap: SwapView;
  activity: ActivityView;
  security: SecurityView;
}

/**
 * User intents the UI can raise. A real provider decides what each one does; the demo provider only moves
 * labelled example state. None of them may sign or move funds from UI code.
 */
export interface AppActions {
  /**
   * The network menu in the top bar. A real provider switches its chain and RPC; the demo provider only records the
   * choice. A network that is not available is refused.
   */
  setNetwork(id: NetworkId): void;
  setAmount(value: string): void;
  /** the primary swap button */
  pressSwapButton(): void;
  /** the wallet button in the top bar */
  pressWalletButton(): void;
  /** a button inside a ledger */
  pressLedgerAction(id: LedgerActionId): void;
}

export interface AppModelValue {
  model: AppModel;
  actions: AppActions;
}
