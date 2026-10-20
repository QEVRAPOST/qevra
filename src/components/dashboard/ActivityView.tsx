"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimTag } from "@/components/ui/SimTag";
import { ToggleGroup } from "@/components/ui/ToggleGroup";
import { pipelineFor, runBadge } from "@/lib/swarm-view";
import type { ActivityRow, SwarmRun } from "@/types";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";
import { MiniPipeline, SwarmPipeline } from "./SwarmPipeline";

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
  const [pickedId, setPickedId] = useState<string | null>(null);
  const runs = useMemo(() => newestFirst(sec.runs), [sec.runs]);
  const count = (g: RunFilter) => (g === "all" ? runs.length : runs.filter((r) => runGroup(r) === g).length);
  const shown = filter === "all" ? runs : runs.filter((r) => runGroup(r) === filter);
  const selected = shown.find((r) => r.id === pickedId) ?? shown[0];
  const pipeline = selected ? pipelineFor(selected) : null;
  const badge = selected ? runBadge(selected) : null;

  return (
    <>
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
      <div className="ac-body">
        <ol className="ac-time" aria-label={live ? "Live research runs" : "Simulated research runs"} aria-busy={sec.status === "loading" || undefined}>
          {sec.status === "ready" &&
            shown.map((r) => {
              const b = runBadge(r);
              const when = r.liveSummary?.createdAt;
              return (
                <li key={r.id} className={r.id === selected?.id ? "on" : ""}>
                  <button type="button" aria-pressed={r.id === selected?.id} onClick={() => setPickedId(r.id)}>
                    <span className={`ac-dot s-${runGroup(r)}`} aria-hidden="true" />
                    {when ? <span className="ac-when">{when}</span> : null}
                    <span className="ac-g">{r.goal}</span>
                    <span className="ac-m">
                      {r.exampleTag ? <SimTag /> : null}
                      <Chip tone={b.tone} material={b.material}>{b.label}</Chip>
                    </span>
                  </button>
                </li>
              );
            })}
          {sec.status === "loading" && <EmptyState as="li" title="Loading live run history.">Checking the authenticated Security Research API. No simulated runs are substituted.</EmptyState>}
          {sec.status === "empty" && (
            <EmptyState as="li" title="No research runs yet.">
              Start one in the <Link href="/app/security">Security Swarm</Link>. It will appear here with its evidence and its limits. This is not a statement that the system is safe.
            </EmptyState>
          )}
          {sec.status === "unavailable" && <EmptyState as="li" title="Run history unavailable.">{sec.unavailableMessage ?? "The run feed is not connected. No simulated runs are substituted, and this is not a statement that there are none."}</EmptyState>}
          {sec.status === "ready" && shown.length === 0 ? <EmptyState as="li" title="No runs match this filter.">Choose All to see every run.</EmptyState> : null}
        </ol>
        {sec.status === "ready" && selected && badge ? (
          <aside className="ac-detail" key={selected.id} aria-labelledby="ac-detail-h">
            <p className="pg-kick">{selected.liveSummary?.createdAt ? `Started ${selected.liveSummary.createdAt}` : "Simulated run"}</p>
            <h3 id="ac-detail-h">{selected.goal}</h3>
            <div className="ac-m">
              {selected.exampleTag ? <SimTag /> : null}
              <Chip tone={badge.tone} material={badge.material}>{badge.label}</Chip>
              <MiniPipeline model={pipeline} />
            </div>
            <SwarmPipeline model={pipeline} compact title="Pipeline" />
            <p className="ac-sum">{selected.shows}</p>
            <Link className="ov-l" href={`/app/security?run=${encodeURIComponent(selected.id)}`}>
              Open the evidence in Security Swarm<span aria-hidden="true">→</span>
            </Link>
          </aside>
        ) : null}
      </div>
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
      <p className="ac-lede">Blockchain transactions only. Research runs are in the other view.</p>
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
      <div className="ac-body">
        <ul className="acts" aria-label={a.origin === "demo" ? "Simulated transactions" : "Live transaction activity"}>
          {a.status === "ready" &&
            rows.map((r) => (
              <li key={r.id}>
                <button type="button" className="act" aria-pressed={r.id === selected?.id} onClick={() => setSelectedId(r.id)}>
                  <span className="as">{r.sentence}</span>
                  <Chip tone={r.tone} material={r.material}>
                    {r.stateLabel}
                  </Chip>
                  <span className="am">{r.exampleTag ? <SimTag /> : null} {r.exampleTag ? "" : [r.hash, r.time].filter(Boolean).join(" · ")}</span>
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
          <aside className="actd ac-detail" key={selected.id} aria-labelledby="act-detail-h">
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

/** Activity: what has happened. Research runs and blockchain transactions are kept apart on purpose. Simulated records are always marked. */
export function ActivityView() {
  const [view, setView] = useState<View>("runs");
  return (
    <section className="route ac" aria-labelledby="h-act">
      <PageHead id="h-act" kicker="Activity · history" title="Activity" lede="Research runs the Swarm made, and transactions made from a wallet. They are different things, so they are shown apart." />
      <ToggleGroup
        label="Choose what to see"
        value={view}
        onChange={setView}
        options={[
          { value: "runs", label: "Research runs" },
          { value: "transactions", label: "Transactions" },
        ]}
      />
      <div className="ac-view" key={view}>
        {view === "runs" ? <Runs /> : <Transactions />}
      </div>
    </section>
  );
}
