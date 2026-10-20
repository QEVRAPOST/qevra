"use client";

import { useId, useState } from "react";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { defaultStage, pipelineAnnouncement, STAGE_META, STAGE_ORDER, STATUS_TEXT, type PipelineModel, type PipelineStage } from "@/lib/swarm-view";
import type { ResearchAgentRole } from "@/types";
import { AGENT_MATERIAL as MATERIAL, OrbitCanvas } from "./OrbitCanvas";

function time(iso: string | undefined): string {
  return iso ?? "not recorded";
}

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
export function SwarmPipeline({ model, compact = false, title, level = 2, actions }: { model: PipelineModel | null; compact?: boolean; title?: string; /** the heading level of the canvas title, so the page never skips one */ level?: 2 | 3; /** controls shown at the end of the header (a visitor-started illustration, a link to the run) */ actions?: React.ReactNode }) {
  const uid = useId();
  const [picked, setPicked] = useState<ResearchAgentRole | null>(null);
  const guide = model === null;
  const stages: PipelineStage[] = model
    ? model.stages
    : STAGE_ORDER.map((role) => ({ role, ...STAGE_META[role], status: "pending" as const, events: [] }));
  const sel = picked ?? (model ? defaultStage(model) : "research");
  const selected = stages.find((s) => s.role === sel) ?? stages[0];
  const detailId = `${uid}-detail`;
  const Heading = level === 2 ? "h2" : "h3";
  const hasInspector = !guide && !compact;

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
        {actions ? <span className="pipe-actions">{actions}</span> : null}
      </header>
      {model ? (
        <p className="sr" role="status">
          {pipelineAnnouncement(model)}
        </p>
      ) : null}

      <OrbitCanvas model={model} selected={hasInspector ? sel : null} onSelect={hasInspector ? setPicked : undefined} controls={detailId} />

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
