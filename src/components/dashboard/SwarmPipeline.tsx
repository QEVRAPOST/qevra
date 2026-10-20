"use client";

import { useId, useState } from "react";
import { DemoChip } from "@/components/ui/Chip";
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

function StageDetail({ stage, model, id }: { stage: PipelineStage; model: PipelineModel; id: string }) {
  const facts: Array<[string, React.ReactNode]> = [["Status", STATUS_TEXT[stage.status]]];
  if (!model.example) {
    facts.push(["Started", time(stage.startedAt)], ["Finished", time(stage.completedAt)]);
    if (stage.tokens !== undefined) facts.push(["Provider-reported tokens", String(stage.tokens)]);
    if (stage.role === "research" && model.sources) facts.push(["Sources", `${model.sources.available} of ${model.sources.total} available`]);
    if (stage.role === "verification" && model.quotes) facts.push(["Quotes matched", `${model.quotes.matched} of ${model.quotes.total}`]);
  }
  if (stage.errorCode) facts.push(["Error code", <code key="c">{stage.errorCode}</code>]);
  return (
    <div className="pipe-detail" id={id} role="group" aria-label={`${stage.title} detail`}>
      {model.illustration ? <p className="pd-ex">Illustration: nothing is running. It replays the order of a run, so there is no time, token count or source to show.</p> : model.example ? <p className="pd-ex">Example: no agent ran, so there is no time, token count or source to show.</p> : null}
      {stage.status === "blocked" ? <p className="pd-warn">Blocked: an earlier stage stopped, so this agent did not run.</p> : null}
      {stage.status === "failed" ? <p className="pd-warn">This agent stopped with an error. Nothing it would have produced is shown as a result.</p> : null}
      {stage.unreported && !model.example ? <p className="pd-ex">The service did not report this agent, so it is shown as waiting.</p> : null}
      <dl className="pd-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
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
 * The Security Swarm pipeline: Research → Analysis → Verification, then a separate Human review dock.
 *
 * Each node is drawn from the agent's own state (nothing is invented and nothing is added): waiting is dotted, running is
 * outlined with a signal travelling into it, completed is outlined, failed is red with its error code, blocked is hatched.
 * The signal moves only for a genuinely running agent of a live run; an example run never moves.
 * A completed run is never drawn as verified: the dock stays unlit until a person records a review.
 */
export function SwarmPipeline({ model }: { model: PipelineModel | null }) {
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

  return (
    <section
      className={["pipe", model?.example ? "is-example" : "", model?.illustration ? "is-illustration" : "", guide ? "is-guide" : ""].filter(Boolean).join(" ")}
      id="swarm-pipe"
      aria-labelledby={`${uid}-h`}
    >
      <header className="pipe-head">
        <h3 id={`${uid}-h`}>{guide ? "How a run works" : "Agent pipeline"}</h3>
        {model?.example ? <DemoChip>{model.illustration ? "ILLUSTRATION · NO AGENT RAN" : "EXAMPLE · NO AGENT RAN"}</DemoChip> : guide ? <span className="pipe-tag">Reference, no run selected</span> : <span className="pipe-tag">From the run record</span>}
      </header>
      {model ? (
        <p className="sr" role="status">
          {pipelineAnnouncement(model)}
        </p>
      ) : null}

      <div className="pipe-track">
        <div className="pipe-src" role="group" aria-label="Sources">
          <span className="ps-k">Sources</span>
          <b>{model?.sources ? `${model.sources.available} of ${model.sources.total}` : model?.example ? "none read" : "approved"}</b>
          <span className="ps-s">{model?.sources ? "available" : model?.example ? "example" : "public pages"}</span>
        </div>
        <span className={`plink in s-${stages[0].status}${running(0) ? " flow" : ""}`} aria-hidden="true" />
        <ol className="pipe-nodes" aria-label="Agents, in the order they run">
          {stages.map((stage, i) => (
            <li key={stage.role} className="pipe-li">
              {i > 0 ? <span className={`plink s-${stage.status}${running(i) ? " flow" : ""}`} aria-hidden="true" /> : null}
              <button
                type="button"
                className={`pn s-${stage.status}`}
                aria-pressed={!guide && sel === stage.role}
                aria-controls={guide ? undefined : detailId}
                disabled={guide}
                onClick={() => setPicked(stage.role)}
              >
                <span className="pn-top">
                  <span className="pn-step">Step {i + 1}</span>
                  <span className="pn-state">
                    <StatusMaterial material={MATERIAL[stage.status]} />
                    {guide ? "—" : STATUS_TEXT[stage.status]}
                    {model?.example && stage.status === "running" ? " (example)" : ""}
                  </span>
                </span>
                <span className="pn-title">{stage.title}</span>
                <span className="pn-does">{stage.does}</span>
                {stage.status === "failed" || stage.status === "blocked" ? (
                  <span className="pn-err">
                    {stage.status === "failed" ? "Error" : "Did not run"}
                    {stage.errorCode ? <>: <code>{stage.errorCode}</code></> : null}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
        <span className="plink out" aria-hidden="true" />
        <div className={`pipe-dock${model?.review.recorded ? " lit" : ""}`}>
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

      {!guide ? <StageDetail key={selected.role} stage={selected} model={model} id={detailId} /> : null}

      {model && !model.example ? (
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

      <ul className="pipe-key" aria-label="What the circles mean">
        {(["pending", "running", "completed", "failed", "blocked"] as const).map((s) => (
          <li key={s} className={`pk-${s}`}>
            <StatusMaterial material={MATERIAL[s]} /> {STATUS_TEXT[s]}
          </li>
        ))}
      </ul>
      {!guide ? <p className="pipe-note">Completed means an agent returned output. It is not an audit, a passed test, or a human review.</p> : null}
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
