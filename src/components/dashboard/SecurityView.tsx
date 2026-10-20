"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip, DemoChip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { brandizeProjectName, PROJECT_NAME } from "@/lib/project-brand";
import {
  CORE_SENTENCE,
  PASSED_LEGEND_BODY,
  PASSED_LEGEND_COMPLETED,
  PASSED_LEGEND_COMPLETED_BODY,
  PASSED_LEGEND_PASSED,
  SWARM_PARAGRAPH,
} from "@/lib/content/copy-lock";
import { pipelineFor, runBadge } from "@/lib/swarm-view";
import type { ResearchTopicId } from "@/types";
import { useAppModel } from "./DemoAppProvider";
import { MiniPipeline, SwarmPipeline } from "./SwarmPipeline";
import { SwarmRunDetail } from "./SwarmRunDetail";

/** Security Swarm: the three-agent pipeline, and the runs with their evidence and limits. A finished run is never called safe. */
export function SecurityView() {
  const { model, actions } = useAppModel();
  const sec = model.security;
  const detailId = useId();
  const pipeRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<ResearchTopicId>("security-evidence");
  const selected = sec.runs.find((r) => r.id === selectedId) ?? sec.runs[0];
  const pipeline = selected ? pipelineFor(selected) : null;
  const canStartRun = sec.origin === "live"
    && sec.capabilities?.provider === "available"
    && sec.capabilities.worker === "available"
    && sec.capabilities.persistence === "available";

  /* On a phone the runs stack above the pipeline: choosing one brings its pipeline and detail into view. */
  const choose = (id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches) {
      requestAnimationFrame(() => pipeRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }));
    }
  };

  return (
    <section className="route" aria-labelledby="h-sec">
      <div className="rhead">
        <h1 id="h-sec">Security Swarm</h1>
        <p>What the Swarm is working on, with its evidence and its limits.</p>
      </div>
      <Panel title="Research and tests" aside={sec.origin === "live" ? <Chip tone="neutral" material={sec.status === "ready" ? "solid" : "dotted"}>LIVE MODE</Chip> : sec.sourceTag ? <DemoChip>{sec.sourceTag}</DemoChip> : undefined}>
        <p className="core2">{CORE_SENTENCE}</p>
        <p className="corep2">{brandizeProjectName(SWARM_PARAGRAPH, PROJECT_NAME)}</p>
        {sec.origin === "live" && sec.capabilities ? (
          <dl className="kv" aria-label="Live service status">
            <div><dt>Provider</dt><dd>{sec.capabilities.provider}{sec.capabilities.providerName ? ` · ${sec.capabilities.providerName}` : ""}</dd></div>
            <div><dt>Worker</dt><dd>{sec.capabilities.worker}</dd></div>
            <div><dt>Persistence</dt><dd>{sec.capabilities.persistence}</dd></div>
            <div><dt>Approved sources</dt><dd>{sec.capabilities.sourceCount}</dd></div>
          </dl>
        ) : null}
        {sec.origin === "live" ? (
          <div className="startrun">
            <div className="acts-row" role="group" aria-label="Start live research">
              <label htmlFor="live-research-topic">Topic</label>
              <select id="live-research-topic" value={topicId} onChange={(event) => setTopicId(event.target.value as ResearchTopicId)} aria-describedby="startrun-note">
                <option value="mldsa-key-registration">ML-DSA key registration</option>
                <option value="robinhood-readonly-wallet">Robinhood read-only wallet</option>
                <option value="security-evidence">Security evidence</option>
              </select>
              <Button variant="primary" size="small" type="button" disabled={!canStartRun || sec.isCreating} onClick={() => actions.createSecurityRun(topicId)}>
                {sec.isCreating ? "Queueing…" : "Start research run"}
              </Button>
            </div>
            <p className="lt" id="startrun-note">
              A run asks the configured model provider to read this topic&rsquo;s approved public sources, in three stages. It cannot reach keys, sign, or move funds, and what it returns is model output, not an audit.
            </p>
          </div>
        ) : null}
        {sec.origin === "live" && sec.capabilities && sec.capabilities.provider !== "available" ? (
          <p role="status">Live research execution is unavailable until a server-side model provider is configured and billing is approved. Existing run history remains live and inspectable.</p>
        ) : null}
        {sec.origin === "live" && sec.capabilities?.provider === "available" && !canStartRun ? (
          <p role="status">Research cannot be queued while the worker or database is unavailable. Existing history remains live and inspectable.</p>
        ) : null}
        {sec.origin === "live" && !sec.capabilities ? <p role="status">Checking provider availability. Existing live history remains separate from demo data.</p> : null}
        {sec.unavailableMessage ? <p role="status">{sec.unavailableMessage}</p> : null}
        {sec.actionMessage ? <p role="status">{sec.actionMessage}</p> : null}

        <div className="swarm-body">
          <ul className="runs" aria-label={sec.origin === "demo" ? "Example runs" : "Live research runs"} aria-busy={sec.status === "loading" || undefined}>
            {sec.status === "ready" &&
              sec.runs.map((r) => {
                const badge = runBadge(r);
                return (
                  <li key={r.id}>
                    <button type="button" className={`run${r.exampleTag ? " ex" : ""}`} aria-pressed={r.id === selected?.id} aria-controls={detailId} onClick={() => choose(r.id)}>
                      <span className="rt">
                        <span title={r.id}>{r.origin === "live" ? `${r.id.slice(0, 8)}…${r.id.slice(-4)}` : r.id}</span>
                        {r.exampleTag ? <DemoChip>{r.exampleTag}</DemoChip> : null}
                      </span>
                      <span className="rg">{r.goal}</span>
                      <span className="rb">
                        <Chip tone={badge.tone} material={badge.material}>
                          {badge.label}
                        </Chip>
                        <MiniPipeline model={pipelineFor(r)} />
                      </span>
                    </button>
                  </li>
                );
              })}
            {sec.status === "loading" && (
              <EmptyState as="li" title="Loading live run history.">Checking the authenticated Security Research API. No example runs are substituted.</EmptyState>
            )}
            {sec.status === "empty" && (
              <EmptyState as="li" title="No runs recorded yet.">
                {sec.origin === "demo"
                  ? "This is not a statement that the system is safe. When a run is recorded, it appears here with its evidence and its limits."
                  : "The authenticated API returned no live runs. This is not a statement that the system is safe."}
              </EmptyState>
            )}
            {sec.status === "unavailable" && (
              <EmptyState as="li" title="Run feed unavailable.">
                {sec.unavailableMessage ?? "The live run feed is unavailable. No example data is substituted."}
              </EmptyState>
            )}
          </ul>
          <div className="sb-pipe" ref={pipeRef}>
            <SwarmPipeline key={selected?.id ?? "guide"} model={pipeline} />
          </div>
          {sec.status === "ready" && selected ? (
            <div id={detailId} className="sb-detail">
              <SwarmRunDetail run={selected} headingId={`${detailId}-h`} />
            </div>
          ) : null}
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
