"use client";

import { useCallback, useEffect, useState } from "react";
import { ApertureCanvas } from "@/components/aperture/ApertureCanvas";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { ToggleGroup } from "@/components/ui/ToggleGroup";
import type { ApertureScene } from "@/lib/aperture/engine";
import { GLYPH_INITIAL } from "@/lib/aperture/keyframes";
import type { RingsInfo } from "@/lib/aperture/types";
import { brandizeProjectName, PROJECT_NAME } from "@/lib/project-brand";
import { INTENT_LOCK_CAPTION } from "@/lib/content/copy-lock";
import { GLYPH_LABEL } from "@/lib/content/landing";
import { buildDemoIntentComparison } from "@/lib/demo/swap";
import type { IntentComparison, IntentMatch } from "@/types";

const MATCH: Record<IntentMatch, { label: string; material: "solid" | "outline" | "dotted" }> = {
  "not-reviewed": { label: "Not reviewed", material: "dotted" },
  same: { label: "Same", material: "outline" },
  changed: { label: "Changed", material: "solid" },
  "not-set": { label: "Not set", material: "dotted" },
};

/** The amount ring, which "Change the amount" turns. */
const AMOUNT_RING = 3;
/** How far the amount ring turns out of line in the demonstration, radians. */
const AMOUNT_TURN = 0.78;
const NO_RINGS: RingsInfo = { selected: -1, turned: [false, false, false, false, false, false, false, false] };

function ComparisonChip({ c, demo }: { c: IntentComparison; demo: boolean }) {
  if (demo) return <Chip tone="demo">DESIGN DEMONSTRATION</Chip>;
  if (!c.reviewed) return <Chip tone="unk" material="dotted">Not reviewed yet</Chip>;
  if (c.changedCount > 0) {
    return (
      <Chip tone="bad" material="solid">
        {c.changedCount} {c.changedCount === 1 ? "detail" : "details"} changed
      </Chip>
    );
  }
  return <Chip material="outline">Matches your review</Chip>;
}

function LiveCaption({ c, demo, projectName }: { c: IntentComparison; demo: boolean; projectName: string }) {
  const names = c.rows.filter((r) => r.match === "changed").map((r) => r.label).join(", ");
  if (demo) {
    return c.changedCount > 0 ? (
      <>
        <b>
          {c.changedCount} {c.changedCount === 1 ? "detail differs" : "details differ"} in this demonstration: {names}.
        </b>{" "}
        The light stops at the first ring that is out of line. Turn it back, or press Reset.
      </>
    ) : (
      <>
        <b>Every ring is in line.</b> Light passes through all eight. Drag a ring, or use the arrow keys, to turn one out of line.
      </>
    );
  }
  if (!c.reviewed) {
    return c.setupComplete ? (
      <>
        <b>Nothing is reviewed yet.</b> Review the intent, and the rings light up if every detail matches.
      </>
    ) : (
      <>
        <b>Nothing is reviewed yet.</b> Finish the setup to review a swap. The rings stay dark until you do.
      </>
    );
  }
  if (c.changedCount > 0) {
    return (
      <>
        <b>
          {c.changedCount} {c.changedCount === 1 ? "detail differs" : "details differ"} from what you reviewed: {names}.
        </b>{" "}
         {brandizeProjectName("The light stops at that ring. QEVRA is designed to ask for a fresh review before anything is signed.", projectName)}
      </>
    );
  }
  return (
    <>
      <b>Every set detail matches what you reviewed.</b> The router is not set, so there is nothing to compare there yet.
    </>
  );
}

/**
 * Intent Lock: the same ring renderer as the landing at glyph scale, now interactive.
 *
 * It renders the comparison it is given and never decides on its own whether something matches. The draggable
 * rings are a separate, labelled DESIGN DEMONSTRATION on example values: turning a ring changes this picture and
 * nothing else. It verifies nothing, signs nothing and writes no state.
 */
export function IntentLockPanel({ comparison }: { comparison: IntentComparison }) {
  const [scene, setScene] = useState<ApertureScene | null>(null);
  const [rings, setRings] = useState<RingsInfo>(NO_RINGS);
  /* the demonstration was started with a button; dragging a ring out of line also starts it */
  const [started, setStarted] = useState(false);
  const turnedCount = rings.turned.filter(Boolean).length;
  const demo = started || turnedCount > 0;
  const shown = demo ? buildDemoIntentComparison(rings.turned) : comparison;
  const selected = rings.selected;

  /* lit (once reviewed) and mis (the app's own amount change) come from the app; a demonstration forces the light on */
  useEffect(() => {
    scene?.set({ lit: demo || comparison.reviewed ? 1 : 0, mis: !demo && comparison.changedCount > 0 ? 1 : 0 });
  }, [scene, demo, comparison.reviewed, comparison.changedCount]);

  const reset = useCallback(() => {
    scene?.resetRings();
    scene?.setSelected(-1);
    setStarted(false);
  }, [scene]);

  const asReviewed = useCallback(() => {
    scene?.resetRings();
    setStarted(true);
  }, [scene]);

  const changeAmount = useCallback(() => {
    scene?.resetRings();
    scene?.setSelected(AMOUNT_RING);
    scene?.setRingAngle(AMOUNT_RING, AMOUNT_TURN);
    setStarted(true);
  }, [scene]);

  const select = useCallback((i: number) => scene?.setSelected(Math.max(0, Math.min(7, i))), [scene]);
  const turn = useCallback(
    (delta: number) => {
      if (!scene || scene.selected < 0) return;
      scene.turnRing(scene.selected, delta);
    },
    [scene],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.5 : 0.15;
    const cur = selected < 0 ? 0 : selected;
    switch (e.key) {
      case "ArrowUp":
        select(selected < 0 ? 7 : cur + 1);
        break;
      case "ArrowDown":
        select(selected < 0 ? 0 : cur - 1);
        break;
      case "ArrowLeft":
        turn(-step);
        break;
      case "ArrowRight":
        turn(step);
        break;
      case "Escape":
        reset();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const selectedName = selected >= 0 ? shown.rows[selected].label : null;
  const pressed = !demo ? null : rings.turned[AMOUNT_RING] && turnedCount === 1 ? "changed" : turnedCount === 0 ? "reviewed" : null;

  return (
    <Panel title="Intent Lock" aside={<ComparisonChip c={shown} demo={demo} />} className="intent">
      <p className="corep2">
        Intent Lock compares the swap details you reviewed with the details that would be signed, one ring for each of eight details. If any detail differs, the light stops at that ring.
      </p>
      <figure
        className="glyphbox interactive"
        tabIndex={0}
        role="group"
        aria-label="Intent Lock rings, an interactive design demonstration. Up and Down arrows choose a ring, Left and Right arrows turn it, Escape resets."
        onKeyDown={onKeyDown}
      >
        <ApertureCanvas
          mode="glyph"
          initial={GLYPH_INITIAL}
          fitExplode={0}
          pointer
          interactive
          label={GLYPH_LABEL}
          onSceneChange={setScene}
          onRingsChange={setRings}
        />
      </figure>

      <div className="ilctl">
        <div className="row">
          <span id="il-demo-l">Design demonstration</span>
          <ToggleGroup
            labelledBy="il-demo-l"
            options={[
              { value: "reviewed", label: "As reviewed" },
              { value: "changed", label: "Change the amount" },
            ]}
            value={pressed}
            onChange={(v) => (v === "reviewed" ? asReviewed() : changeAmount())}
          />
          <Button variant="ghost" size="small" onClick={reset} disabled={!demo && selected < 0}>
            Reset
          </Button>
        </div>
        <div className="row" role="group" aria-label="Selected ring">
          <span className="sel" aria-live="polite">
            {selectedName ? `Selected: ${selectedName}` : "Select a ring: click it, pick a row, or use the arrow keys."}
          </span>
          <span className="btns">
            <Button variant="ghost" size="small" onClick={() => select(selected < 0 ? 0 : selected - 1)}>
              Lower ring
            </Button>
            <Button variant="ghost" size="small" onClick={() => select(selected < 0 ? 7 : selected + 1)}>
              Upper ring
            </Button>
            <Button variant="ghost" size="small" disabled={selected < 0} onClick={() => turn(-0.15)}>
              Turn left
            </Button>
            <Button variant="ghost" size="small" disabled={selected < 0} onClick={() => turn(0.15)}>
              Turn right
            </Button>
          </span>
        </div>
      </div>

      <p className="dnote">Each row is one parameter of the transaction. “Reviewed” is what you approved; “To be signed” is what would be sent. Any difference is marked.</p>
      <ScrollRegion className="itwrap" label="Swap details as reviewed and as they would be signed">
        <table className="itable">
          <caption className="sr">Swap details as reviewed and as they would be signed</caption>
          <thead>
            <tr>
              <th scope="col">Detail</th>
              <th scope="col">Reviewed</th>
              <th scope="col">To be signed</th>
              <th scope="col">Match</th>
            </tr>
          </thead>
          <tbody>
            {shown.rows.map((r, i) => {
              const m = MATCH[r.match];
              const cls = [r.match === "changed" ? "chg" : r.dim ? "unc" : "", i === selected ? "sel" : ""].filter(Boolean).join(" ");
              return (
                <tr key={r.id} className={cls || undefined}>
                  <td className="k">
                    <button type="button" className="rowbtn" aria-pressed={i === selected} onClick={() => select(i)}>
                      {r.label}
                    </button>
                  </td>
                  <td className="v">{r.reviewed}</td>
                  <td className="v">{r.toSign}</td>
                  <td className="m">
                    <StatusMaterial material={m.material} />
                    {m.label}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollRegion>
      <p className="livecap" aria-live="polite">
        <LiveCaption c={shown} demo={demo} projectName={PROJECT_NAME} />
      </p>
      <p className="inote">{brandizeProjectName(INTENT_LOCK_CAPTION, PROJECT_NAME)}</p>
      {demo ? (
        <p className="inote demo-note">
          <StatusMaterial material="outline" /> Design demonstration on example values. Turning a ring changes this picture only. Nothing is verified, signed or sent.
        </p>
      ) : null}
    </Panel>
  );
}
