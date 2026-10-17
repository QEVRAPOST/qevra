"use client";

import { useState } from "react";
import { Chip, DemoChip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import {
  CORE_SENTENCE,
  PASSED_LEGEND_BODY,
  PASSED_LEGEND_COMPLETED,
  PASSED_LEGEND_COMPLETED_BODY,
  PASSED_LEGEND_PASSED,
  SWARM_PARAGRAPH,
} from "@/lib/content/copy-lock";
import type { SwarmRun } from "@/types";
import { useAppModel } from "./DemoAppProvider";

function RunDrawer({ run }: { run: SwarmRun }) {
  const review = run.humanReview;
  return (
    <aside className="drawer" aria-live="polite">
      <h3>{run.goal}</h3>
      <div className="dm">
        <span>{run.id}</span>
        <span>{run.role}</span>
        {run.exampleTag ? <DemoChip>{run.exampleTag}</DemoChip> : null}
      </div>
      <div className="tr">
        <b>What this shows</b>
        <span>{run.shows}</span>
      </div>
      <div className="tr">
        <b>How it was measured</b>
        <span>{run.how}</span>
      </div>
      <div className="tr">
        <b>What it does not show</b>
        <span>{run.notShown}</span>
      </div>
      <div className="tr">
        <b>Limitation</b>
        <span>{run.limitation}</span>
      </div>
      <div className="tr">
        <b>Evidence</b>
        <span>
          {run.unavailableSource ? <StatusMaterial material="dotted" /> : null}
          {run.unavailableSource ? " " : null}
          {run.evidence}
        </span>
      </div>
      {run.zeroFindings ? (
        <EmptyState title="No findings recorded.">This is not a statement that none exist. It only says no finding has been recorded.</EmptyState>
      ) : null}
      {run.withheld ? (
        <div className="withheld">Detail withheld. A real finding links to its responsible disclosure path here, not a blank.</div>
      ) : null}
      <div className="dock">
        <i className={review.recorded ? "lit" : undefined} aria-hidden="true" />
        <span>
          {review.recorded
            ? `Human review recorded by ${review.by}, ${review.at}.`
            : "Human review dock: unlit. No human review has been recorded."}
        </span>
      </div>
      <p className="wrapnote">By design, a run has no access to keys, signing or funds.</p>
    </aside>
  );
}

/** Security Swarm: runs with their evidence and limits. A finished run is never called safe. */
export function SecurityView() {
  const { model } = useAppModel();
  const sec = model.security;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sec.runs.find((r) => r.id === selectedId) ?? sec.runs[0];
  return (
    <section className="route" aria-labelledby="h-sec">
      <div className="rhead">
        <h1 id="h-sec">Security Swarm</h1>
        <p>What the Swarm is working on, with its evidence and its limits.</p>
      </div>
      <Panel title="Research and tests" aside={sec.sourceTag ? <DemoChip>{sec.sourceTag}</DemoChip> : undefined}>
        <p className="core2">{CORE_SENTENCE}</p>
        <p className="corep2">{SWARM_PARAGRAPH}</p>
        <div className="swarm-body">
          <ul className="runs" aria-label="Example runs">
            {sec.status === "ready" &&
              sec.runs.map((r) => (
                <li key={r.id}>
                  <button type="button" className="run" aria-pressed={r.id === selected?.id} onClick={() => setSelectedId(r.id)}>
                    <span className="rt">
                      <span>{r.id}</span>
                      <span>{r.role}</span>
                    </span>
                    <span className="rg">{r.goal}</span>
                    <span>
                      <Chip tone={r.status.tone} material={r.status.material}>
                        {r.status.label}
                      </Chip>
                    </span>
                  </button>
                </li>
              ))}
            {sec.status === "empty" && (
              <EmptyState as="li" title="No runs recorded yet.">
                This is not a statement that the system is safe. When a run is recorded, it appears here with its evidence and its limits.
              </EmptyState>
            )}
            {sec.status === "unavailable" && (
              <EmptyState as="li" title="Run feed unavailable.">
                The Swarm run feed is not connected, so no runs can be shown. This is not a statement that the system is safe.
              </EmptyState>
            )}
          </ul>
          {sec.status === "ready" && selected ? <RunDrawer run={selected} /> : null}
        </div>
        <p className="legend">
          <StatusMaterial material="outline" />
          <span>
            <b>{PASSED_LEGEND_PASSED}</b> {PASSED_LEGEND_BODY} <b>{PASSED_LEGEND_COMPLETED}</b> {PASSED_LEGEND_COMPLETED_BODY}
          </span>
        </p>
      </Panel>
    </section>
  );
}
