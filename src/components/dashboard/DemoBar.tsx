"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DemoChip } from "@/components/ui/Chip";
import { ToggleGroup } from "@/components/ui/ToggleGroup";
import { SWAP_STATE_ORDER, SWAP_STATES } from "@/lib/content/swap-states";
import type { ActsMode, RunsMode, SetupStage, SwapButtonKey } from "@/types";
import { usePreviewControls } from "./DemoAppProvider";

const STAGE_OPTIONS: ReadonlyArray<{ value: SetupStage; label: string }> = [
  { value: 0, label: "Not connected" },
  { value: 1, label: "Wallet connected" },
  { value: 2, label: "Account created" },
  { value: 3, label: "Key registered" },
  { value: 4, label: "Funded (example)" },
];

const RUNS_OPTIONS: ReadonlyArray<{ value: RunsMode; label: string }> = [
  { value: "examples", label: "Example runs" },
  { value: "more", label: "More states" },
  { value: "empty", label: "Empty state" },
  { value: "unavailable", label: "Unavailable" },
];

const ACTS_OPTIONS: ReadonlyArray<{ value: ActsMode; label: string }> = [
  { value: "examples", label: "Example rows" },
  { value: "empty", label: "Empty state" },
  { value: "unavailable", label: "Unavailable" },
];

/** The demo bar and its preview controls. Rendered only when the provider supplies PreviewControls (demo mode). */
export function DemoBar() {
  const preview = usePreviewControls();
  const [open, setOpen] = useState(false);
  if (!preview) return null;
  return (
    <div className="demobar">
      <div className="demo-row">
        <DemoChip>DEMO DATA</DemoChip>
        <p>
          <b>A design preview, not a working app.</b>{" "}
          <span className="long">No wallet is connected, no chain is read and nothing here can move funds.</span>
        </p>
        <Button variant="ghost" size="small" aria-expanded={open} aria-controls="pcPanel" onClick={() => setOpen((o) => !o)}>
          Preview controls
        </Button>
      </div>
      <div className="pcpanel" id="pcPanel" hidden={!open}>
        <div className="row">
          <span id="pc-stage-l">Setup state</span>
          <div className="pseg">
            <ToggleGroup labelledBy="pc-stage-l" options={STAGE_OPTIONS} value={preview.stage} onChange={preview.setStage} />
          </div>
        </div>
        <div className="row">
          <label htmlFor="pcState">Button state</label>
          <select id="pcState" value={preview.forced ?? ""} onChange={(e) => preview.setForced((e.target.value || null) as SwapButtonKey | null)}>
            <option value="">Automatic, from the setup state</option>
            {SWAP_STATE_ORDER.map((k) => (
              <option key={k} value={k}>
                {SWAP_STATES[k].label}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <span id="pc-runs-l">Security runs</span>
          <ToggleGroup labelledBy="pc-runs-l" options={RUNS_OPTIONS} value={preview.runsMode} onChange={preview.setRunsMode} />
        </div>
        <div className="row">
          <span id="pc-acts-l">Activity</span>
          <ToggleGroup labelledBy="pc-acts-l" options={ACTS_OPTIONS} value={preview.actsMode} onChange={preview.setActsMode} />
        </div>
        <div>
          <Button variant="ghost" size="small" onClick={preview.reset}>
            Reset the preview
          </Button>
        </div>
      </div>
    </div>
  );
}
