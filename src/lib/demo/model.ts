import { NETWORKS } from "@/lib/config/networks";
import { COVERAGE_ROWS, STATUS_BAR_ITEMS } from "@/lib/content/status";
import { brandizeDisplayStrings } from "@/lib/project-brand";
import { DEMO_ACTIVITY, DEMO_RUNS_ALL, DEMO_RUNS_DEFAULT } from "@/lib/demo-fixtures";
import { buildSwapView } from "./swap";
import { buildWalletView } from "./wallet";
import type { ActivityView, ActsMode, AppModel, NetworkId, RunsMode, SecurityView, SetupStage, SwapButtonKey } from "@/types";

export interface DemoInputs {
  stage: SetupStage;
  forced: SwapButtonKey | null;
  reviewed: number | null;
  amount: string;
  runsMode: RunsMode;
  actsMode: ActsMode;
  network: NetworkId;
}

function buildSecurity(mode: RunsMode): SecurityView {
  const sourceTag = "EXAMPLE RUNS";
  if (mode === "empty") return { origin: "demo", status: "empty", runs: [], sourceTag };
  if (mode === "unavailable") return { origin: "demo", status: "unavailable", runs: [], sourceTag };
  return { origin: "demo", status: "ready", runs: [...(mode === "more" ? DEMO_RUNS_ALL : DEMO_RUNS_DEFAULT)], sourceTag };
}

function buildActivity(mode: ActsMode): ActivityView {
  const sourceTag = "EXAMPLE ROWS";
  if (mode === "empty") return { origin: "demo", status: "empty", rows: [], sourceTag };
  if (mode === "unavailable") return { origin: "demo", status: "unavailable", rows: [], sourceTag };
  return { origin: "demo", status: "ready", rows: [...DEMO_ACTIVITY], sourceTag };
}

/** Assemble the demo view model. Pure: the same inputs always give the same model. */
export function buildDemoModel(i: DemoInputs): AppModel {
  const model: AppModel = {
    mode: "demo",
    statusBar: STATUS_BAR_ITEMS,
    coverage: COVERAGE_ROWS,
    network: { selected: i.network, options: [...NETWORKS], rpc: { status: "not_requested" }, walletMismatch: false },
    wallet: buildWalletView(i.stage),
    swap: buildSwapView(i.stage, i.amount, i.reviewed, i.forced),
    activity: buildActivity(i.actsMode),
    security: buildSecurity(i.runsMode),
  };
  return brandizeDisplayStrings(model);
}
