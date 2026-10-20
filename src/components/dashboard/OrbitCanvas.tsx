"use client";

import { useId, useState } from "react";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { useMediaQuery } from "@/lib/use-media-query";
import { STAGE_DOING, STAGE_META, STAGE_ORDER, STATUS_TEXT, type PipelineModel, type PipelineStage } from "@/lib/swarm-view";
import type { Material, ResearchAgentRole, ResearchAgentStatus } from "@/types";

/** A pipeline agent's status as a status circle: waiting and blocked are dotted, running and completed are outlined, failed is solid red. */
export const AGENT_MATERIAL: Record<ResearchAgentStatus, Material> = {
  pending: "dotted",
  running: "outline",
  completed: "outline",
  failed: "solid",
  blocked: "dotted",
};

/** The arc the three agents sit on (viewBox 1200 × 330). Sources and the human review are its two ends, drawn apart on purpose. */
const SEGMENTS = [
  "M110 230 C190 230 260 160 350 130",
  "M350 130 C450 100 510 80 600 80",
  "M600 80 C690 80 750 100 850 130",
  "M850 130 C940 160 1010 230 1090 230",
] as const;
/** the centre of each agent's ring, in the same units */
const CENTRES = [
  [350, 130],
  [600, 80],
  [850, 130],
] as const;

/** A little glyph for what travels into each agent: a page, a claim, a quote. */
function Token({ kind }: { kind: 0 | 1 | 2 }) {
  if (kind === 0) {
    return (
      <g className="om-tok">
        <rect x="-5" y="-7" width="10" height="14" rx="1.5" />
        <path d="M-2.5 -3H2.5M-2.5 0H2.5M-2.5 3H1" />
      </g>
    );
  }
  if (kind === 1) {
    return (
      <g className="om-tok">
        <path d="M0 -6.5 6.5 0 0 6.5 -6.5 0Z" />
      </g>
    );
  }
  return (
    <g className="om-tok">
      <path d="M-6 -3.5H-1.5V1.5L-4 5M1.5 -3.5H6V1.5L3.5 5" />
    </g>
  );
}

/** What is happening at the agent that is running: pages flow in, claims are weighed, quotes are checked. Drawn only while that agent runs. */
function Activity({ role, i, pathId }: { role: ResearchAgentRole; i: number; pathId: string }) {
  const [cx, cy] = CENTRES[i] ?? CENTRES[0];
  return (
    <g className={`om-act om-act-${role}`}>
      {[0, 1, 2].map((k) => (
        <g key={k} opacity="0">
          <Token kind={i as 0 | 1 | 2} />
          <animateMotion dur="2.7s" begin={`${k * 0.9}s`} repeatCount="indefinite" rotate="0" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.6 1">
            <mpath href={`#${pathId}`} />
          </animateMotion>
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="2.7s" begin={`${k * 0.9}s`} repeatCount="indefinite" />
        </g>
      ))}
      {role === "analysis" ? (
        <g transform={`translate(${cx} ${cy})`}>
          <circle className="om-orb" cx="0" cy="0" r="46" />
          <circle className="om-orb" cx="0" cy="0" r="62" />
          <g>
            <circle cx="46" cy="0" r="4.5" />
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3.4s" repeatCount="indefinite" />
          </g>
          <g>
            <circle cx="-54" cy="0" r="3.4" />
            <animateTransform attributeName="transform" type="rotate" from="180" to="-180" dur="5.2s" repeatCount="indefinite" />
          </g>
          <g>
            <circle cx="0" cy="-62" r="3" />
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="7.5s" repeatCount="indefinite" />
          </g>
        </g>
      ) : null}
      {role === "verification" ? (
        <g transform={`translate(${cx} ${cy})`}>
          <path className="om-sweep" d="M0 0 L50 0 A50 50 0 0 1 36 35 Z">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2.2s" repeatCount="indefinite" />
          </path>
        </g>
      ) : null}
    </g>
  );
}

export interface OrbitCanvasProps {
  /** null draws the reference: three waiting agents and no run */
  model: PipelineModel | null;
  /** the station that is open in the inspector, if any */
  selected?: ResearchAgentRole | null;
  /** omit to make the stations plain (a reference, or a compact view with no inspector) */
  onSelect?: (role: ResearchAgentRole) => void;
  /** the id of the inspector the stations open, for assistive technology */
  controls?: string;
  /** draws an extra amber line over each stage link, for a scroll-driven explanation to light up in turn. Never shown for a real run. */
  trace?: boolean;
}

/**
 * The orbit canvas as a pure picture of a run. It holds no data of its own: hand it a run's model (live, simulated, an illustration, or null
 * for the reference) and it draws exactly that. Waiting is a dotted ring, running an amber ring with the work shown (pages flowing in, claims
 * weighed, quotes checked), completed a silver ring, failed a red one with its error code, blocked a hatched, dim one. The work is drawn only for
 * an agent that really is running in a live run, or in an illustration the visitor started; a simulated run is a still picture.
 * Used by the overview, the Security Swarm and the activity detail: the only difference between them is the model they pass.
 */
export function OrbitCanvas({ model, selected = null, onSelect, controls, trace = false }: OrbitCanvasProps) {
  const uid = useId().replace(/:/g, "");
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const guide = model === null;
  const stages: PipelineStage[] = model ? model.stages : STAGE_ORDER.map((role) => ({ role, ...STAGE_META[role], status: "pending" as const, events: [] }));
  const moves = !!model && (!model.example || !!model.illustration);
  const running = (i: number) => moves && stages[i].status === "running";
  const segState = (i: number): string => (i < 3 ? stages[i].status : "pending");

  /* a ring flashes once when its agent finishes while you are looking: never on first paint */
  const statusKey = stages.map((s) => s.status).join(",");
  const [prevKey, setPrevKey] = useState(statusKey);
  const [justDone, setJustDone] = useState<string[]>([]);
  if (statusKey !== prevKey) {
    const before = prevKey.split(",");
    setJustDone(stages.filter((s, i) => s.status === "completed" && before[i] !== "completed").map((s) => s.role));
    setPrevKey(statusKey);
  }

  return (
    <div className="pipe-track om">
      <svg className="om-svg" viewBox="0 0 1200 330" aria-hidden="true" focusable="false">
        <defs>
          {SEGMENTS.map((d, i) => (
            <path key={d} id={`${uid}-s${i}`} d={d} />
          ))}
        </defs>
        <g className="om-rings">
          <ellipse cx="600" cy="345" rx="585" ry="285" />
          <ellipse cx="600" cy="345" rx="470" ry="225" />
          <ellipse cx="600" cy="345" rx="350" ry="165" />
        </g>
        {SEGMENTS.map((d, i) => (
          <g key={d} className={`om-seg s-${segState(i)}${i === 3 ? " out" : ""}`} data-seg={i}>
            <path className="om-line" d={d} />
            {i < 3 && running(i) ? <path className="om-flow" d={d} /> : null}
          </g>
        ))}
        {trace
          ? SEGMENTS.slice(0, 3).map((d, i) => <path key={`t${i}`} className="om-trace" data-seg={i} d={d} />)
          : null}
        {!reduce ? stages.map((s, i) => (running(i) ? <Activity key={s.role} role={s.role} i={i} pathId={`${uid}-s${i}`} /> : null)) : null}
      </svg>

      <div className="pipe-src om-src" role="group" aria-label="Sources">
        <span className={`om-sring${running(0) ? " live" : ""}`} aria-hidden="true" />
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
              className={`pn s-${stage.status}${justDone.includes(stage.role) ? " pop" : ""}`}
              aria-pressed={onSelect ? selected === stage.role : undefined}
              aria-controls={onSelect ? controls : undefined}
              disabled={guide || !onSelect}
              onClick={() => onSelect?.(stage.role)}
            >
              <span className="om-ring" aria-hidden="true">
                <i className="om-halo" />
                <b>{i + 1}</b>
              </span>
              <span className="pn-body">
                <span className="pn-step">Step {i + 1}</span>
                <span className="pn-title">{stage.title}</span>
                <span className="pn-state">
                  <StatusMaterial material={AGENT_MATERIAL[stage.status]} />
                  {guide ? "Waiting for a run" : STATUS_TEXT[stage.status]}
                  {model?.example && !model.illustration && stage.status === "running" ? " (simulated)" : ""}
                </span>
                {running(i) ? <span className="pn-doing">{STAGE_DOING[stage.role]}<i aria-hidden="true">…</i></span> : null}
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
  );
}
