"use client";

import { Chip } from "@/components/ui/Chip";
import { SimTag } from "@/components/ui/SimTag";
import { pipelineFor, runBadge, STATUS_TEXT } from "@/lib/swarm-view";
import type { SwarmRun } from "@/types";
import { MiniPipeline } from "./SwarmPipeline";

export function RunHistoryItem({
  run,
  selected,
  illustrating,
  detailId,
  onSelect,
}: {
  run: SwarmRun;
  selected: boolean;
  illustrating: boolean;
  detailId: string;
  onSelect: (id: string) => void;
}) {
  const badge = runBadge(run);
  const pipeline = pipelineFor(run);
  const record = run.liveDetail ?? run.liveSummary;
  const visibleId = run.origin === "live" ? `${run.id.slice(0, 8)}…${run.id.slice(-4)}` : run.id;

  return (
    <li className="run-history-item">
      <button
        type="button"
        className={`run${run.exampleTag ? " ex" : ""}`}
        aria-pressed={!illustrating && selected}
        aria-controls={detailId}
        onClick={() => onSelect(run.id)}
      >
        <span className="rt">
          <span title={run.id}>{visibleId}</span>
          {run.exampleTag ? <SimTag /> : null}
        </span>
        <span className="rg" title={run.goal}>{run.goal}</span>
        <span className="rb">
          <Chip tone={badge.tone} material={badge.material}>{badge.label}</Chip>
          <MiniPipeline model={pipeline} />
        </span>
      </button>
      <details className="run-expansion">
        <summary>
          <span>Run details</span>
          <span className="run-expansion-hint">Full question and metadata</span>
        </summary>
        <div className="run-expansion-content">
          <p className="run-full-question">{run.goal}</p>
          <dl className="run-meta-grid">
            <div><dt>Run ID</dt><dd><code>{run.id}</code></dd></div>
            <div><dt>Topic</dt><dd>{record?.topic ?? run.role}</dd></div>
            <div><dt>Status</dt><dd>{badge.label}</dd></div>
            <div><dt>Started</dt><dd>{record?.createdAt ?? "Not recorded"}</dd></div>
            {record?.updatedAt ? <div><dt>Updated</dt><dd>{record.updatedAt}</dd></div> : null}
            {record?.completedAt ? <div><dt>Completed</dt><dd>{record.completedAt}</dd></div> : null}
            <div><dt>Human review</dt><dd>{run.humanReview.recorded ? "Recorded" : "Not recorded"}</dd></div>
            {record ? (
              <>
                <div><dt>Sources available</dt><dd>{record.availableSourceCount} of {record.sourceCount}</dd></div>
                <div><dt>Findings recorded</dt><dd>{record.findingCount}</dd></div>
                {record.errorCode ? <div><dt>Run error code</dt><dd><code>{record.errorCode}</code></dd></div> : null}
              </>
            ) : null}
          </dl>
          {pipeline ? (
            <ol className="run-stage-status" aria-label="Recorded Research, Analysis and Verification stage status">
              {pipeline.stages.map((stage) => (
                <li key={stage.role}>
                  <span>{stage.title}</span>
                  <span>{STATUS_TEXT[stage.status]}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </details>
    </li>
  );
}
