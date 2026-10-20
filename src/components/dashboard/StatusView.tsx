"use client";

import { CoverageTable } from "@/components/ui/CoverageTable";
import { Panel } from "@/components/ui/Panel";
import { PqNote } from "@/components/ui/PqNote";
import { useAppModel } from "./DemoAppProvider";

/** Status and limits: the same coverage rows that drive the landing table, plus the post-quantum note. */
export function StatusView() {
  const { model } = useAppModel();
  return (
    <section className="route" aria-labelledby="h-stat">
      <div className="rhead">
        <h1 id="h-stat">Status and limits</h1>
        <p>
          {model.mode === "live"
            ? "Reading a connected wallet and the research history is live and read-only. The account, swaps and signing are not built. This is how much is known about each part now."
            : "Nothing in this preview is implemented. This is what each part is meant to become, and how much is known now."}
        </p>
      </div>
      <Panel>
        <CoverageTable rows={model.coverage} caption="Status of each property in this preview" />
        <PqNote variant="app" flush />
      </Panel>
    </section>
  );
}
