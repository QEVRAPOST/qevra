"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimTag } from "@/components/ui/SimTag";
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
import { useIllustration } from "@/lib/use-illustration";
import { illustrationModel, JOURNEY, journeyPhase, pipelineFor, runBadge } from "@/lib/swarm-view";
import type { ResearchTopicId } from "@/types";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";
import { startBlocker, SwarmLaunch } from "./SwarmLaunch";
import { MiniPipeline, SwarmPipeline } from "./SwarmPipeline";
import { SwarmRunDetail } from "./SwarmRunDetail";
import { LiveResearchAccessBoundary, useLiveResearchAccess } from "@/features/dashboard/LiveAppProvider";

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
function SecurityResearchView() {
  const { model, actions } = useAppModel();
  const researchAccess = useLiveResearchAccess();
  const sec = model.security;
  const live = sec.origin === "live";
  const detailId = useId();
  const pipeRef = useRef<HTMLDivElement>(null);
  const wanted = useSearchParams().get("run");
  const [selectedId, setSelectedId] = useState<string | null>(wanted);
  const [seenWanted, setSeenWanted] = useState<string | null>(wanted);
  const requestedRunId = useRef<string | null>(null);
  /* a run the service has just persisted is shown at once: adjusted during render, once per new id */
  const [seenPreferred, setSeenPreferred] = useState<string | undefined>(undefined);
  const [topicId, setTopicId] = useState<ResearchTopicId>("security-evidence");
  const loadResearchRun = researchAccess?.loadResearchRun;
  if (wanted !== seenWanted) {
    setSeenWanted(wanted);
    setSelectedId(wanted);
  }
  useEffect(() => {
    if (!wanted) requestedRunId.current = null;
  }, [wanted]);
  useEffect(() => {
    if (live && wanted && requestedRunId.current !== wanted && !sec.runs.some((run) => run.id === wanted)) {
      requestedRunId.current = wanted;
      void loadResearchRun?.(wanted);
    }
  }, [live, wanted, sec.runs, loadResearchRun]);
  if (sec.preferredRunId && sec.preferredRunId !== seenPreferred) {
    setSeenPreferred(sec.preferredRunId);
    setSelectedId(sec.preferredRunId);
  }
  /* the example-mode walkthrough: step is null when it is not playing */
  const ill = useIllustration();
  const step = ill.step;
  const selected = sec.runs.find((r) => r.id === selectedId) ?? (live && wanted ? undefined : sec.runs[0]);
  const illustrating = step !== null;
  const pipeline = illustrating ? illustrationModel(step) : selected ? pipelineFor(selected) : null;
  const blocker = live ? startBlocker(sec.capabilities) : null;
  const canStart = live && blocker === null;
  const phase = journeyPhase(pipeline, illustrating ? undefined : selected, canStart);

  /* On a phone the history is below the pipeline: choosing a run brings its pipeline and detail into view. */
  const choose = (id: string) => {
    ill.stop();
    setSelectedId(id);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches) {
      requestAnimationFrame(() => pipeRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }));
    }
  };

  return (
    <section className="route sw" aria-labelledby="h-sec">
      <PageHead id="h-sec" kicker="Security Swarm · research only" title="Security Swarm" lede={CORE_SENTENCE} />
      <div className="sw-ws">
        <aside className="sw-side" aria-label="Start and history">
          <SwarmLaunch
            live={live}
            topicId={topicId}
            onTopic={setTopicId}
            onStart={() => actions.createSecurityRun(topicId)}
            canStart={canStart}
            isCreating={!!sec.isCreating}
            blocker={blocker}
            step={step}
            onIllustrate={ill.start}
            onNext={ill.next}
            onStop={ill.stop}
          />
          {sec.unavailableMessage ? <p role="status" className="sw-hint">{sec.unavailableMessage}</p> : null}
          {sec.actionMessage ? <p role="status" className="sw-hint">{sec.actionMessage}</p> : null}
          {live && sec.capabilities ? (
            <dl className="kv" aria-label="Live service status">
              <div><dt>Provider</dt><dd>{sec.capabilities.provider}{sec.capabilities.providerName ? ` · ${sec.capabilities.providerName}` : ""}</dd></div>
              <div><dt>Worker</dt><dd>{sec.capabilities.worker}</dd></div>
              <div><dt>Persistence</dt><dd>{sec.capabilities.persistence}</dd></div>
              <div><dt>Approved sources</dt><dd>{sec.capabilities.sourceCount}</dd></div>
            </dl>
          ) : null}
          <details className="sw-about">
            <summary>What the Swarm does, and what it cannot do</summary>
            <p>{brandizeProjectName(SWARM_PARAGRAPH, PROJECT_NAME)}</p>
          </details>
          <div className="sb-hist">
            <h2 className="ov-h">Runs</h2>
            <ul className="runs" aria-label={live ? "Live research runs" : "Simulated research runs"} aria-busy={sec.status === "loading" || undefined}>
              {sec.status === "ready" &&
                sec.runs.map((r) => {
                  const badge = runBadge(r);
                  return (
                    <li key={r.id}>
                      <button type="button" className={`run${r.exampleTag ? " ex" : ""}`} aria-pressed={!illustrating && r.id === selected?.id} aria-controls={detailId} onClick={() => choose(r.id)}>
                        <span className="rt">
                          <span title={r.id}>{r.origin === "live" ? `${r.id.slice(0, 8)}…${r.id.slice(-4)}` : r.id}</span>
                          {r.exampleTag ? <SimTag /> : null}
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
                <EmptyState as="li" title="Loading live run history.">Checking the authenticated Security Research API. No simulated runs are substituted.</EmptyState>
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
                  {sec.unavailableMessage ?? "The live run feed is unavailable. No simulated data is substituted."}
                </EmptyState>
              )}
              {sec.status === "ready" && live && wanted && !sec.runs.some((run) => run.id === wanted) ? (
                <EmptyState as="li" title="Loading the requested run.">Looking up this saved run directly from the authenticated Security Research API.</EmptyState>
              ) : null}
            </ul>
          </div>
        </aside>

        <div className="sw-main" ref={pipeRef}>
          <Trail phase={phase} />
          <div className="sw-stage">
            <SwarmPipeline key={illustrating ? "illustration" : (selected?.id ?? "guide")} model={pipeline} />
          </div>
          <div id={detailId} className="sb-detail">
            <h2 className="ov-h">Evidence</h2>
            {illustrating ? (
              <aside className="drawer is-example">
                <h3>This is an illustration, not a run</h3>
                <p className="dnote">
                  Nothing is running and nothing was read. It shows the order of a real run. When a run is recorded, its findings, quotes, sources, limits and recorded events appear here.
                </p>
              </aside>
            ) : sec.status === "ready" && selected ? (
              <SwarmRunDetail key={selected.id} run={selected} headingId={`${detailId}-h`} />
            ) : (
              <p className="dnote">Choose a run to read its evidence.</p>
            )}
          </div>
        </div>
      </div>
      <p className="legend">
        <StatusMaterial material="outline" />
        <span>
          <b>{PASSED_LEGEND_PASSED}</b> {PASSED_LEGEND_BODY} <b>{PASSED_LEGEND_COMPLETED}</b> {PASSED_LEGEND_COMPLETED_BODY}
        </span>
      </p>
    </section>
  );
}

export function SecurityView() {
  return <LiveResearchAccessBoundary><SecurityResearchView /></LiveResearchAccessBoundary>;
}
