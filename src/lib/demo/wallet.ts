import { DEMO_EOA_ASSETS, DEMO_QEVRA_ASSETS_FUNDED } from "@/lib/demo-fixtures";
import type { LedgerAction, LedgerView, SetupStage, SetupStepView, WalletView } from "@/types";

/** Demo-only: ledgers and setup steps for each preview stage. Real data comes from wallet and chain reads. */

const DEPOSIT_WITHDRAW_FOOTNOTE = "Deposit and withdraw are not built. This preview cannot move funds.";

function buildEoa(stage: SetupStage): LedgerView {
  const base = { kind: "eoa" as const, title: "Connected wallet", subtitle: "External account (EOA). Your key stays with you." };
  if (stage === 0) {
    return {
      ...base,
      intro: "No wallet is connected.",
      facts: [],
      assets: [],
      actions: [{ id: "connect", label: "Connect wallet", variant: "primary" }],
    };
  }
  return {
    ...base,
    address: { label: "EXAMPLE ADDRESS", demo: true },
    facts: [
      { label: "Network", value: "Robinhood Testnet" },
      { label: "Protection by QEVRA", value: "None claimed" },
    ],
    assets: [
      { symbol: "TKN-A", amount: stage >= 4 ? DEMO_EOA_ASSETS.tknA.afterFunding : DEMO_EOA_ASSETS.tknA.beforeFunding },
      { symbol: "Gas token", amount: DEMO_EOA_ASSETS.gas },
    ],
    actions: [],
  };
}

function buildQevra(stage: SetupStage): LedgerView {
  const base = { kind: "qevra" as const, title: "QEVRA smart account", subtitle: "PQ Vault · experimental · testnet" };
  if (stage < 2) {
    return {
      ...base,
      intro: "No QEVRA account yet.",
      hint: "Illustrative account preview only; it holds no assets. Robinhood Mainnet swaps use the connected external wallet, not this example account.",
      facts: [],
      assets: [],
      actions: [{ id: "createAccount", label: "Create QEVRA account", variant: "ghost", disabled: stage === 0 }],
      footnote: stage === 0 ? "Connect a wallet first." : undefined,
    };
  }
  const actions: LedgerAction[] = [];
  if (stage === 2) actions.push({ id: "registerKey", label: "Register authorization key", variant: "ghost" });
  if (stage === 3) actions.push({ id: "fund", label: "Fund your QEVRA account", variant: "ghost" });
  actions.push({ id: "deposit", label: "Deposit", variant: "ghost", disabled: true }, { id: "withdraw", label: "Withdraw", variant: "ghost", disabled: true });
  return {
    ...base,
    address: { label: "EXAMPLE ACCOUNT", demo: true },
    facts: [
      { label: "Authorization", value: stage >= 3 ? "ML-DSA, under evaluation" : "No key registered" },
      { label: "Independent audit", value: "None yet" },
    ],
    assets: stage >= 4 ? [...DEMO_QEVRA_ASSETS_FUNDED] : [],
    emptyAssets: "No assets yet",
    actions,
    footnote: DEPOSIT_WITHDRAW_FOOTNOTE,
  };
}

const STEP_DEFS: ReadonlyArray<{ title: string; detail: string; tag: string }> = [
  { title: "Connect wallet", detail: "Use the wallet you already have.", tag: "" },
  { title: "Create your QEVRA account", detail: "A separate smart account. Your connected wallet stays as it is.", tag: "" },
  { title: "Register an authorization key", detail: "ML-DSA is under evaluation.", tag: "Experimental" },
  { title: "Fund your QEVRA account", detail: "Send assets to the account address, after checking the network.", tag: "" },
];

export function buildWalletView(stage: SetupStage): WalletView {
  const steps: SetupStepView[] = STEP_DEFS.map((d, i) => {
    const state: SetupStepView["state"] = stage > i ? "done" : stage === i ? "current" : "todo";
    return { title: d.title, detail: d.detail, tag: d.tag || (stage > i ? "Done in this preview" : ""), state };
  });
  return {
    origin: "demo",
    stage,
    setupDone: Math.min(4, stage),
    walletButtonLabel: stage === 0 ? "Connect wallet" : "Example wallet",
    eoa: buildEoa(stage),
    qevra: buildQevra(stage),
    steps,
  };
}
