"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Chip, DemoChip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { ToggleGroup } from "@/components/ui/ToggleGroup";
import { pipelineFor, runBadge } from "@/lib/swarm-view";
import type { ActivityRow, SwarmRun } from "@/types";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";
import { MiniPipeline } from "./SwarmPipeline";

type View = "runs" | "transactions";
type RunFilter = "all" | "progress" | "completed" | "stopped";
type TxFilter = "all" | "confirmed" | "pending" | "failed";

/** Which group a run belongs to for the filter: a stopped agent wins, then all-completed, else it is still waiting or running. */
function runGroup(run: SwarmRun): Exclude<RunFilter, "all"> {
  const stages = pipelineFor(run)?.stages;
  if (!stages) return "progress";
  if (stages.some((s) => s.status === "failed" || s.status === "blocked")) return "stopped";
  if (stages.every((s) => s.status === "completed")) return "completed";
  return "progress";
}

const txGroup = (r: ActivityRow): Exclude<TxFilter, "all"> => (r.state === "confirmed" ? "confirmed" : r.state === "pending" ? "pending" : "failed");

/** Newest first when the runs carry a time (live runs do); fixtures keep their own order. */
function newestFirst(runs: SwarmRun[]): SwarmRun[] {
  if (!runs.every((r) => r.liveSummary?.createdAt)) return runs;
  return [...runs].sort((a, b) => Date.parse(b.liveSummary!.createdAt) - Date.parse(a.liveSummary!.createdAt));
}

function Runs() {
  const { model } = useAppModel();
  const sec = model.security;
  const live = sec.origin === "live";
  const [filter, setFilter] = useState<RunFilter>("all");
  const runs = useMemo(() => newestFirst(sec.runs), [sec.runs]);
  const count = (g: RunFilter) => (g === "all" ? runs.length : runs.filter((r) => runGroup(r) === g).length);
  const shown = filter === "all" ? runs : runs.filter((r) => runGroup(r) === filter);

  return (
    <>
      <p className="ac-lede">Research runs from the Security Swarm. They are model research, not blockchain transactions, and none is an audit.</p>
      {sec.status === "ready" ? (
        <ToggleGroup
          label="Filter research runs"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All (${count("all")})` },
            { value: "progress", label: `In progress (${count("progress")})`, disabled: count("progress") === 0 },
            { value: "completed", label: `Completed (${count("completed")})`, disabled: count("completed") === 0 },
            { value: "stopped", label: `Stopped (${count("stopped")})`, disabled: count("stopped") === 0 },
          ]}
        />
      ) : null}
      <ol className="ac-time" aria-label={live ? "Live research runs" : "Example research runs"} aria-busy={sec.status === "loading" || undefined}>
        {sec.status === "ready" &&
          shown.map((r) => {
            const badge = runBadge(r);
            const when = r.liveSummary?.createdAt;
            return (
              <li key={r.id}>
                <span className="ac-when">{when ?? (r.exampleTag ? "Example" : "")}</span>
                <span className="ac-what">
                  <span className="ac-g">{r.goal}</span>
                  <span className="ac-m">
                    {r.exampleTag ? <DemoChip>{r.exampleTag}</DemoChip> : null}
                    <Chip tone={badge.tone} material={badge.material}>{badge.label}</Chip>
                    <MiniPipeline model={pipelineFor(r)} />
                  </span>
                </span>
                <Link className="ov-l" href={`/app/security?run=${encodeURIComponent(r.id)}`}>
                  Open evidence<span aria-hidden="true">→</span>
                </Link>
              </li>
            );
          })}
        {sec.status === "loading" && <EmptyState as="li" title="Loading live run history.">Checking the authenticated Security Research API. No example runs are substituted.</EmptyState>}
        {sec.status === "empty" && (
          <EmptyState as="li" title="No research runs yet.">
            Start one in the <Link href="/app/security">Security Swarm</Link>. It will appear here with its evidence and its limits. This is not a statement that the system is safe.
          </EmptyState>
        )}
        {sec.status === "unavailable" && <EmptyState as="li" title="Run history unavailable.">{sec.unavailableMessage ?? "The run feed is not connected. No example runs are substituted, and this is not a statement that there are none."}</EmptyState>}
        {sec.status === "ready" && shown.length === 0 ? <EmptyState as="li" title="No runs match this filter.">Choose All to see every run.</EmptyState> : null}
      </ol>
    </>
  );
}

function Transactions() {
  const { model } = useAppModel();
  const a = model.activity;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TxFilter>("all");
  const rows = filter === "all" ? a.rows : a.rows.filter((r) => txGroup(r) === filter);
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];
  const count = (g: TxFilter) => (g === "all" ? a.rows.length : a.rows.filter((r) => txGroup(r) === g).length);

  return (
    <>
      <p className="ac-lede">Blockchain transactions only: each swap in one plain sentence, with its real state. Research runs are in the other view.</p>
      {a.status === "ready" ? (
        <ToggleGroup
          label="Filter transactions"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All (${count("all")})` },
            { value: "confirmed", label: `Confirmed (${count("confirmed")})`, disabled: count("confirmed") === 0 },
            { value: "pending", label: `Pending (${count("pending")})`, disabled: count("pending") === 0 },
            { value: "failed", label: `Failed (${count("failed")})`, disabled: count("failed") === 0 },
          ]}
        />
      ) : null}
      <div className="act-body">
        <ul className="acts" aria-label={a.origin === "demo" ? "Example transactions" : "Live transaction activity"}>
          {a.status === "ready" &&
            rows.map((r) => (
              <li key={r.id}>
                <button type="button" className="act" aria-pressed={r.id === selected?.id} onClick={() => setSelectedId(r.id)}>
                  <span className="as">{r.sentence}</span>
                  <Chip tone={r.tone} material={r.material}>
                    {r.stateLabel}
                  </Chip>
                  <span className="am">{r.exampleTag ?? [r.hash, r.time].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          {a.status === "empty" && (
            <EmptyState as="li" title="No transactions yet.">
              Swaps are switched off, so none can be made. When they exist, each appears here with a plain sentence and a link to the block explorer.
            </EmptyState>
          )}
          {a.status === "unavailable" && (
            <EmptyState as="li" title="Transactions unavailable.">
              {a.origin === "live"
                ? "Live transaction history is not connected in this read-only dashboard. No transaction was requested or sent. This does not mean there are none."
                : "The transaction feed is not connected, so no transactions can be shown. This is not a statement that there are none."}
            </EmptyState>
          )}
          {a.status === "ready" && rows.length === 0 ? <EmptyState as="li" title="No transactions match this filter.">Choose All to see every transaction.</EmptyState> : null}
        </ul>
        {a.status === "ready" && selected ? (
          <aside className="actd" aria-labelledby="act-detail-h">
            <h3 id="act-detail-h">{selected.sentence}</h3>
            <p className="note">{selected.note}</p>
            <dl className="kv">
              {selected.detail.map((d) => (
                <div key={d.label}>
                  <dt>{d.label}</dt>
                  <dd>
                    {d.href ? (
                      <a href={d.href} target="_blank" rel="noopener noreferrer">
                        {d.value}
                      </a>
                    ) : (
                      d.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        ) : null}
      </div>
    </>
  );
}

/** Activity: research history and blockchain transactions, kept apart on purpose. Example rows are always labelled. */
export function ActivityView() {
  const { model } = useAppModel();
  const [view, setView] = useState<View>("runs");
  const a = model.activity;
  return (
    <section className="route" aria-labelledby="h-act">
      <PageHead id="h-act" kicker="Activity · history" title="Activity" lede="What has happened: research runs the Swarm made, and transactions made from a wallet. They are different things, so they are shown apart." />
      <Panel
        title={view === "runs" ? "Research runs" : "Transactions"}
        aside={
          view === "transactions" && a.origin === "live" ? (
            <Chip tone="unk" material="dotted">NOT CONNECTED</Chip>
          ) : view === "transactions" && a.sourceTag ? (
            <DemoChip>{a.sourceTag}</DemoChip>
          ) : view === "runs" && model.security.sourceTag ? (
            <DemoChip>{model.security.sourceTag}</DemoChip>
          ) : undefined
        }
      >
        <ToggleGroup
          label="Choose what to see"
          value={view}
          onChange={setView}
          options={[
            { value: "runs", label: "Research runs" },
            { value: "transactions", label: "Transactions" },
          ]}
        />
        {view === "runs" ? <Runs /> : <Transactions />}
      </Panel>
    </section>
  );
}
