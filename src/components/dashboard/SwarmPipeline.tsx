"use client";

import { useId, useState } from "react";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { defaultStage, pipelineAnnouncement, STAGE_META, STAGE_ORDER, STATUS_TEXT, type PipelineModel, type PipelineStage } from "@/lib/swarm-view";
import type { Material, ResearchAgentRole, ResearchAgentStatus } from "@/types";

/** A pipeline agent's status as a status circle: waiting and blocked are dotted, running and completed are outlined, failed is solid red. */
const MATERIAL: Record<ResearchAgentStatus, Material> = {
  pending: "dotted",
  running: "outline",
  completed: "outline",
  failed: "solid",
  blocked: "dotted",
};

function time(iso: string | undefined): string {
  return iso ?? "not recorded";
}

/** The arc the three agents sit on. Sources and the human review are its two ends, drawn apart on purpose. */
const SEGMENTS = [
  "M110 230 C190 230 260 160 350 130",
  "M350 130 C450 100 510 80 600 80",
  "M600 80 C690 80 750 100 850 130",
  "M850 130 C940 160 1010 230 1090 230",
] as const;

function Inspector({ stage, model, id }: { stage: PipelineStage; model: PipelineModel; id: string }) {
  const facts: Array<[string, React.ReactNode]> = [];
  if (!model.example) {
    facts.push(["Started", time(stage.startedAt)], ["Finished", time(stage.completedAt)]);
    if (stage.tokens !== undefined) facts.push(["Provider-reported tokens", String(stage.tokens)]);
    if (stage.role === "research" && model.sources) facts.push(["Sources", `${model.sources.available} of ${model.sources.total} available`]);
    if (stage.role === "verification" && model.quotes) facts.push(["Quotes matched", `${model.quotes.matched} of ${model.quotes.total}`]);
  }
  if (stage.errorCode) facts.push(["Error code", <code key="c">{stage.errorCode}</code>]);
  return (
    <div className="pipe-detail" id={id} role="group" aria-label={`${stage.title} detail`}>
      <div className="pd-head">
        <h3>{stage.title}</h3>
        <span className={`pd-st s-${stage.status}`}>
          <StatusMaterial material={MATERIAL[stage.status]} />
          {STATUS_TEXT[stage.status]}
        </span>
      </div>
      <p className="pd-does">{stage.does}</p>
      {model.illustration ? (
        <p className="pd-ex">Illustration: nothing is running. It replays the order of a run, so there is no time, token count or source to show.</p>
      ) : model.example ? (
        <p className="pd-ex">Simulated: no agent ran, so there is no time, token count or source to show.</p>
      ) : null}
      {stage.status === "blocked" ? <p className="pd-warn">Blocked: an earlier stage stopped, so this agent did not run.</p> : null}
      {stage.status === "failed" ? <p className="pd-warn">This agent stopped with an error. Nothing it would have produced is shown as a result.</p> : null}
      {stage.unreported && !model.example ? <p className="pd-ex">The service did not report this agent, so it is shown as waiting.</p> : null}
      {facts.length > 0 ? (
        <dl className="pd-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {stage.role === "verification" && model.verificationNote ? <p className="pd-note"><b>Note from the agent.</b> {model.verificationNote}</p> : null}
      {stage.events.length > 0 ? (
        <ol className="pd-events" aria-label={`${stage.title} events`}>
          {stage.events.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <time>{e.at}</time> {e.message}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/**
 * The Security Swarm canvas: Research → Analysis → Verification on an arc, then a separate Human review station.
 *
 * Each station is drawn from the agent's own state (nothing is invented and nothing is added): waiting is a dotted ring, running
 * an amber ring with a signal travelling into it, completed a silver ring, failed a red one with its error code, blocked a hatched,
 * dim one. The signal moves only for a genuinely running agent of a live run, or during an illustration the visitor started.
 * A completed run is never drawn as verified: the review station stays unlit until a person records a review.
 *
 * `compact` drops the counts, the legend and the standing note (the overview shows the canvas alone).
 */
export function SwarmPipeline({ model, compact = false, title, level = 2 }: { model: PipelineModel | null; compact?: boolean; title?: string; /** the heading level of the canvas title, so the page never skips one */ level?: 2 | 3 }) {
  const uid = useId();
  const [picked, setPicked] = useState<ResearchAgentRole | null>(null);
  const guide = model === null;
  const stages: PipelineStage[] = model
    ? model.stages
    : STAGE_ORDER.map((role) => ({ role, ...STAGE_META[role], status: "pending" as const, events: [] }));
  const sel = picked ?? (model ? defaultStage(model) : "research");
  const selected = stages.find((s) => s.role === sel) ?? stages[0];
  const moves = !!model && (!model.example || !!model.illustration);
  const running = (i: number) => moves && stages[i].status === "running";
  const detailId = `${uid}-detail`;
  const Heading = level === 2 ? "h2" : "h3";
  const hasInspector = !guide && !compact;
  /* the signal that arrives at stage i travels on segment i (segment 0 is Sources → Research) */
  const segState = (i: number): string => (i < 3 ? stages[i].status : "pending");

  return (
    <section
      className={["pipe", model?.example ? "is-example" : "", model?.illustration ? "is-illustration" : "", guide ? "is-guide" : "", compact ? "is-compact" : ""].filter(Boolean).join(" ")}
      id="swarm-pipe"
      aria-labelledby={`${uid}-h`}
    >
      <header className="pipe-head">
        <Heading id={`${uid}-h`}>{title ?? (guide ? "How a run works" : "Agent pipeline")}</Heading>
        <span className="pipe-tag">
          {model?.illustration ? "Illustration · no agent ran" : model?.example ? "Simulated · no agent ran" : guide ? "Reference, no run selected" : "From the run record"}
        </span>
      </header>
      {model ? (
        <p className="sr" role="status">
          {pipelineAnnouncement(model)}
        </p>
      ) : null}

      <div className="pipe-track om">
        <svg className="om-svg" viewBox="0 0 1200 330" aria-hidden="true" focusable="false">
          <g className="om-rings">
            <ellipse cx="600" cy="345" rx="585" ry="285" />
            <ellipse cx="600" cy="345" rx="470" ry="225" />
            <ellipse cx="600" cy="345" rx="350" ry="165" />
          </g>
          {SEGMENTS.map((d, i) => (
            <g key={d} className={`om-seg s-${segState(i)}${i === 3 ? " out" : ""}`}>
              <path className="om-line" d={d} />
              {i < 3 && running(i) ? <path className="om-flow" d={d} /> : null}
            </g>
          ))}
        </svg>

        <div className="pipe-src om-src" role="group" aria-label="Sources">
          <span className="om-sring" aria-hidden="true" />
          <span className="ps-k">Sources</span>
          <b>{model?.sources ? `${model.sources.available} of ${model.sources.total}` : model?.example ? "none read" : "approved"}</b>
          <span className="ps-s">{model?.sources ? "available" : model?.example ? "simulated" : "public pages"}</span>
        </div>

        <ol className="pipe-nodes" aria-label="Agents, in the order they run">
          {stages.map((stage, i) => (
            <li key={stage.role} className={`pipe-li om-n${i + 1}`}>
              {i > 0 ? <span className={`plink s-${stage.status}${running(i) ? " flow" : ""}`} aria-hidden="true" /> : null}
              <button
                type="button"
                className={`pn s-${stage.status}`}
                aria-pressed={hasInspector ? sel === stage.role : undefined}
                aria-controls={hasInspector ? detailId : undefined}
                disabled={guide}
                onClick={() => setPicked(stage.role)}
              >
                <span className="om-ring" aria-hidden="true">
                  <i className="om-halo" />
                  <b>{i + 1}</b>
                </span>
                <span className="pn-body">
                  <span className="pn-step">Step {i + 1}</span>
                  <span className="pn-title">{stage.title}</span>
                  <span className="pn-state">
                    <StatusMaterial material={MATERIAL[stage.status]} />
                    {guide ? "Waiting for a run" : STATUS_TEXT[stage.status]}
                    {model?.example && stage.status === "running" ? " (simulated)" : ""}
                  </span>
                  <span className="pn-does">{stage.does}</span>
                  {stage.status === "failed" || stage.status === "blocked" ? (
                    <span className="pn-err">
                      {stage.status === "failed" ? "Error" : "Did not run"}
                      {stage.errorCode ? <>: <code>{stage.errorCode}</code></> : null}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div className={`pipe-dock om-dock${model?.review.recorded ? " lit" : ""}`}>
          <span className="pd-lamp" aria-hidden="true" />
          <div>
            <b>Human review</b>
            <span>
              {model?.review.recorded
                ? `Recorded by ${model.review.by ?? "a reviewer"}${model.review.at ? `, ${model.review.at}` : ""}.`
                : guide
                  ? "A person decides. Nothing is approved without one."
                  : "Not recorded. A finished run is not a review."}
            </span>
          </div>
        </div>
      </div>

      {!guide && !compact ? <Inspector key={selected.role} stage={selected} model={model} id={detailId} /> : null}

      {model && !model.example && !compact ? (
        <dl className="pipe-stats" aria-label="Evidence in this run">
          <div>
            <dt>Findings</dt>
            <dd>{model.findings ?? "not reported"}</dd>
          </div>
          <div>
            <dt>Quotes matched</dt>
            <dd>{model.quotes ? `${model.quotes.matched} of ${model.quotes.total}` : "detail not loaded"}</dd>
          </div>
          <div>
            <dt>Deterministic tests</dt>
            <dd>{model.tests ? (model.tests.total === 0 ? "none requested" : `${model.tests.passed} passed of ${model.tests.total}${model.tests.failed ? `, ${model.tests.failed} failed` : ""}`) : "detail not loaded"}</dd>
          </div>
          <div>
            <dt>Human review</dt>
            <dd>{model.review.recorded ? "recorded" : "not recorded"}</dd>
          </div>
        </dl>
      ) : null}

      {compact ? null : (
        <>
          <ul className="pipe-key" aria-label="What the circles mean">
            {(["pending", "running", "completed", "failed", "blocked"] as const).map((s) => (
              <li key={s} className={`pk-${s}`}>
                <StatusMaterial material={MATERIAL[s]} /> {STATUS_TEXT[s]}
              </li>
            ))}
          </ul>
          {!guide ? <p className="pipe-note">Completed means an agent returned output. It is not an audit, a passed test, or a human review.</p> : null}
        </>
      )}
    </section>
  );
}

/** Three small circles for a run's three agents: a glance at where it is, for the run list. The words are in the chip beside it. */
export function MiniPipeline({ model }: { model: PipelineModel | null }) {
  if (!model) return null;
  return (
    <span className="mini" aria-hidden="true">
      {model.stages.map((s, i) => (
        <span key={s.role} className="mini-i">
          {i > 0 ? <i className="mini-l" /> : null}
          <span className={`mini-n s-${s.status}`} title={`${s.title}: ${STATUS_TEXT[s.status]}`}>
            <StatusMaterial material={MATERIAL[s.status]} />
          </span>
        </span>
      ))}
    </span>
  );
}
