"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
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
import { ILLUSTRATION_LAST, illustrationModel, JOURNEY, journeyPhase, pipelineFor, runBadge } from "@/lib/swarm-view";
import type { ResearchTopicId } from "@/types";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";
import { startBlocker, SwarmLaunch } from "./SwarmLaunch";
import { MiniPipeline, SwarmPipeline } from "./SwarmPipeline";
import { SwarmRunDetail } from "./SwarmRunDetail";

/** The four phases of one run, as a trail. The current phase is marked; earlier ones are done. */
function Trail({ phase }: { phase: number }) {
  return (
    <ol className="sw-trail" aria-label="The steps of a research run">
      {JOURNEY.map((name, i) => (
        <li key={name} className={i < phase ? "done" : i === phase ? "cur" : ""} aria-current={i === phase ? "step" : undefined}>
          <span className="sw-tn" aria-hidden="true">{i + 1}</span>
          {name}
        </li>
      ))}
    </ol>
  );
}

/**
 * Security Swarm: the centre of the app. Choose a topic, start a run, watch the three agents, then read the evidence and its
 * limits. Saved runs are the history. A finished run is never called safe, audited or approved.
 */
export function SecurityView() {
  const { model, actions } = useAppModel();
  const sec = model.security;
  const live = sec.origin === "live";
  const detailId = useId();
  const pipeRef = useRef<HTMLDivElement>(null);
  const wanted = useSearchParams().get("run");
  const [selectedId, setSelectedId] = useState<string | null>(wanted);
  const [topicId, setTopicId] = useState<ResearchTopicId>("security-evidence");
  /* the example-mode walkthrough: null when it is not playing */
  const [step, setStep] = useState<number | null>(null);
  const selected = sec.runs.find((r) => r.id === selectedId) ?? sec.runs[0];
  const illustrating = step !== null;
  const pipeline = illustrating ? illustrationModel(step) : selected ? pipelineFor(selected) : null;
  const blocker = live ? startBlocker(sec.capabilities) : null;
  const canStart = live && blocker === null;
  const phase = journeyPhase(pipeline, illustrating ? undefined : selected, canStart);

  /* the walkthrough advances by itself, unless the visitor prefers less motion: then they press Next step */
  useEffect(() => {
    if (step === null || step >= ILLUSTRATION_LAST || prefersReducedMotion()) return;
    const t = window.setTimeout(() => setStep((s) => (s === null ? s : s + 1)), 1900);
    return () => window.clearTimeout(t);
  }, [step]);

  /* On a phone the history is below the pipeline: choosing a run brings its pipeline and detail into view. */
  const choose = (id: string) => {
    setStep(null);
    setSelectedId(id);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches) {
      requestAnimationFrame(() => pipeRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }));
    }
  };

  return (
    <section className="route" aria-labelledby="h-sec">
      <PageHead id="h-sec" kicker="Security Swarm · research only" title="Security Swarm" lede={CORE_SENTENCE} />
      <Panel title="Research and tests" aside={live ? <Chip tone="neutral" material={sec.status === "ready" ? "solid" : "dotted"}>LIVE MODE</Chip> : sec.sourceTag ? <DemoChip>{sec.sourceTag}</DemoChip> : undefined}>
        <details className="sw-about">
          <summary>What the Swarm does, and what it cannot do</summary>
          <p>{brandizeProjectName(SWARM_PARAGRAPH, PROJECT_NAME)}</p>
        </details>

        {live && sec.capabilities ? (
          <dl className="kv" aria-label="Live service status">
            <div><dt>Provider</dt><dd>{sec.capabilities.provider}{sec.capabilities.providerName ? ` · ${sec.capabilities.providerName}` : ""}</dd></div>
            <div><dt>Worker</dt><dd>{sec.capabilities.worker}</dd></div>
            <div><dt>Persistence</dt><dd>{sec.capabilities.persistence}</dd></div>
            <div><dt>Approved sources</dt><dd>{sec.capabilities.sourceCount}</dd></div>
          </dl>
        ) : null}
        {sec.unavailableMessage ? <p role="status">{sec.unavailableMessage}</p> : null}
        {sec.actionMessage ? <p role="status">{sec.actionMessage}</p> : null}

        <SwarmLaunch
          live={live}
          topicId={topicId}
          onTopic={setTopicId}
          onStart={() => actions.createSecurityRun(topicId)}
          canStart={canStart}
          isCreating={!!sec.isCreating}
          blocker={blocker}
          step={step}
          onIllustrate={() => setStep(0)}
          onNext={() => setStep((s) => (s === null ? s : Math.min(ILLUSTRATION_LAST, s + 1)))}
          onStop={() => setStep(null)}
        />

        <Trail phase={phase} />

        <div className="swarm-body">
          <div className="sb-pipe" ref={pipeRef}>
            <h3 className="ov-h">3 · Watch the agents</h3>
            <SwarmPipeline key={illustrating ? "illustration" : (selected?.id ?? "guide")} model={pipeline} />
          </div>
          <div id={detailId} className="sb-detail">
            <h3 className="ov-h">4 · Read the evidence</h3>
            {illustrating ? (
              <aside className="drawer is-example">
                <h3>This is an illustration, not a run</h3>
                <p className="dnote">
                  Nothing is running and nothing was read. It shows the order of a real run. When a run is recorded, its findings, quotes, sources, limits and recorded events appear here.
                </p>
              </aside>
            ) : sec.status === "ready" && selected ? (
              <SwarmRunDetail run={selected} headingId={`${detailId}-h`} />
            ) : (
              <p className="dnote">Choose a run from the history to read its evidence.</p>
            )}
          </div>
          <div className="sb-hist">
            <h3 className="ov-h">History</h3>
            <ul className="runs" aria-label={live ? "Live research runs" : "Example runs"} aria-busy={sec.status === "loading" || undefined}>
              {sec.status === "ready" &&
                sec.runs.map((r) => {
                  const badge = runBadge(r);
                  return (
                    <li key={r.id}>
                      <button type="button" className={`run${r.exampleTag ? " ex" : ""}`} aria-pressed={!illustrating && r.id === selected?.id} aria-controls={detailId} onClick={() => choose(r.id)}>
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
                  {live
                    ? "Choose a topic and start the first run. It appears here with its evidence and its limits. This is not a statement that the system is safe."
                    : "This is not a statement that the system is safe. When a run is recorded, it appears here with its evidence and its limits."}
                </EmptyState>
              )}
              {sec.status === "unavailable" && (
                <EmptyState as="li" title="Run feed unavailable.">
                  {sec.unavailableMessage ?? "The live run feed is unavailable. No example data is substituted."}
                </EmptyState>
              )}
            </ul>
          </div>
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
