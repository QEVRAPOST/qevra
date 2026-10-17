"use client";

import { useEffect, useState } from "react";
import { ApertureCanvas } from "@/components/aperture/ApertureCanvas";
import { Chip } from "@/components/ui/Chip";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import type { ApertureScene } from "@/lib/aperture/engine";
import { GLYPH_INITIAL } from "@/lib/aperture/keyframes";
import { INTENT_LOCK_CAPTION } from "@/lib/content/copy-lock";
import { GLYPH_LABEL } from "@/lib/content/landing";
import type { IntentComparison, IntentMatch } from "@/types";

const MATCH: Record<IntentMatch, { label: string; material: "solid" | "outline" | "dotted" }> = {
  "not-reviewed": { label: "Not reviewed", material: "dotted" },
  same: { label: "Same", material: "outline" },
  changed: { label: "Changed", material: "solid" },
  "not-set": { label: "Not set", material: "dotted" },
};

function ComparisonChip({ c }: { c: IntentComparison }) {
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

function LiveCaption({ c }: { c: IntentComparison }) {
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
    const names = c.rows.filter((r) => r.match === "changed").map((r) => r.label).join(", ");
    return (
      <>
        <b>
          {c.changedCount} {c.changedCount === 1 ? "detail differs" : "details differ"} from what you reviewed: {names}.
        </b>{" "}
        The light stops at that ring. QEVRA is designed to ask for a fresh review before anything is signed.
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
 * Intent Lock: the same ring renderer as the landing at glyph scale, plus the field-by-field table.
 * It renders the comparison it is given. It never decides on its own whether something matches.
 */
export function IntentLockPanel({ comparison }: { comparison: IntentComparison }) {
  const [scene, setScene] = useState<ApertureScene | null>(null);

  /* the app drives two values only: lit (once reviewed) and mis (while the amount differs from the review) */
  useEffect(() => {
    scene?.set({ lit: comparison.reviewed ? 1 : 0, mis: comparison.changedCount > 0 ? 1 : 0 });
  }, [scene, comparison.reviewed, comparison.changedCount]);

  return (
    <Panel title="Intent Lock" aside={<ComparisonChip c={comparison} />} className="intent">
      <figure className="glyphbox">
        <ApertureCanvas mode="glyph" initial={GLYPH_INITIAL} fitExplode={0} label={GLYPH_LABEL} onSceneChange={setScene} />
      </figure>
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
            {comparison.rows.map((r) => {
              const m = MATCH[r.match];
              return (
                <tr key={r.id} className={r.match === "changed" ? "chg" : r.dim ? "unc" : undefined}>
                  <td className="k">{r.label}</td>
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
        <LiveCaption c={comparison} />
      </p>
      <p className="inote">{INTENT_LOCK_CAPTION}</p>
    </Panel>
  );
}
