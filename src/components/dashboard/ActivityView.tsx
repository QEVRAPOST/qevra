"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { SimTag } from "@/components/ui/SimTag";
import { ToggleGroup } from "@/components/ui/ToggleGroup";
import { pipelineFor, runBadge } from "@/lib/swarm-view";
import type { ActivityRow, SwarmRun } from "@/types";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";
import { MiniPipeline } from "./SwarmPipeline";
import { STATUS_TEXT } from "@/lib/swarm-view";
import { useLiveResearchAccess } from "@/features/dashboard/LiveAppProvider";
import type { ResearchGateState } from "@/features/dashboard/live-ui-state";

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

/** One run, written out like a report: what was asked, what each agent did, what it found and what it cannot tell you. */
function RunReport({ run }: { run: SwarmRun }) {
  const model = pipelineFor(run);
  const badge = runBadge(run);
  const s = run.liveDetail ?? run.liveSummary;
  const sim = !!run.exampleTag;
  return (
    <aside className="ac-detail ac-rep" key={run.id} aria-labelledby="ac-detail-h">
      <p className="pg-kick">{sim ? "Run report · simulated" : "Run report"}</p>
      <h2 id="ac-detail-h">{run.goal}</h2>
      <div className="ac-m">
        {sim ? <SimTag /> : null}
        <Chip tone={badge.tone} material={badge.material}>{badge.label}</Chip>
      </div>

      <dl className="ac-facts">
        <div><dt>Started</dt><dd>{s?.createdAt ?? "Simulated, no time"}</dd></div>
        <div><dt>Sources read</dt><dd>{s ? `${s.availableSourceCount} of ${s.sourceCount} available` : "None: nothing ran"}</dd></div>
        <div><dt>Findings</dt><dd>{s ? String(s.findingCount) : "None recorded"}</dd></div>
        <div><dt>Human review</dt><dd>{run.humanReview.recorded ? `Recorded by ${run.humanReview.by}` : "Not recorded"}</dd></div>
      </dl>

      <h3 className="ov-h">What the agents did</h3>
      <ol className="ac-agents">
        {model?.stages.map((st, i) => (
          <li key={st.role} className={`s-${st.status}`}>
            <span className="ac-ag-n" aria-hidden="true">{i + 1}</span>
            <span className="ac-ag-b">
              <b>{st.title}</b>
              <span>{st.does}</span>
            </span>
            <span className="ac-ag-o">
              {STATUS_TEXT[st.status]}
              {st.errorCode ? <code>{st.errorCode}</code> : null}
            </span>
          </li>
        ))}
      </ol>

      <h3 className="ov-h">What this tells you, and what it does not</h3>
      <p className="ac-sum">{run.shows}</p>
      <p className="ac-sum dim">{run.notShown}</p>

      <Link className="ov-l" href={`/app/security?run=${encodeURIComponent(run.id)}`}>
        Open the evidence in Security Swarm<span aria-hidden="true">→</span>
      </Link>
    </aside>
  );
}

function Runs() {
  const { model } = useAppModel();
  const researchAccess = useLiveResearchAccess();
  const sec = model.security;
  const live = sec.origin === "live";
  const [filter, setFilter] = useState<RunFilter>("all");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const runs = useMemo(() => newestFirst(sec.runs), [sec.runs]);
  const count = (g: RunFilter) => (g === "all" ? runs.length : runs.filter((r) => runGroup(r) === g).length);
  const shown = filter === "all" ? runs : runs.filter((r) => runGroup(r) === filter);
  const selected = shown.find((r) => r.id === pickedId) ?? shown[0];
  const stats: Array<{ id: RunFilter; label: string }> = [
    { id: "all", label: live ? "Loaded runs" : "All runs" },
    { id: "progress", label: "In progress" },
    { id: "completed", label: "Completed" },
    { id: "stopped", label: "Stopped" },
  ];

  return (
    <>
      {!live && sec.status === "ready" ? (
        <p className="ac-note">
          <b>These runs are simulated.</b> They show how your history will look. When you start a real run in the <Link href="/app/security">Security Swarm</Link>, it is listed here with what it found and what it could not tell you.
        </p>
      ) : null}
      {live && sec.status === "ready" ? (
        <p className="ac-note">Showing {runs.length} loaded run record{runs.length === 1 ? "" : "s"}, newest first. {researchAccess?.hasMoreRuns ? "More history is available." : "No additional page is currently reported."}</p>
      ) : null}
      {sec.status === "ready" ? (
        <div className="ac-stats" role="group" aria-label="Filter research runs">
          {stats.map((st) => (
            <button key={st.id} type="button" aria-pressed={filter === st.id} disabled={st.id !== "all" && count(st.id) === 0} onClick={() => setFilter(st.id)}>
              <span className="ac-stat-n">{count(st.id)}</span>
              <span className="ac-stat-l">{st.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="ac-body">
        <ol className="ac-time" aria-label={live ? "Live research runs, newest first" : "Simulated research runs"} aria-busy={sec.status === "loading" || undefined}>
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
                      <MiniPipeline model={pipelineFor(r)} />
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
          {sec.status === "ready" && shown.length === 0 ? <EmptyState as="li" title="No runs match this filter.">Choose {live ? "Loaded runs" : "All runs"} to see the available records.</EmptyState> : null}
        </ol>
        {sec.status === "ready" && selected ? <RunReport run={selected} /> : null}
      </div>
      {researchAccess?.historyError ? <p role="status" className="ac-note">{researchAccess.historyError}</p> : null}
      {live && researchAccess?.hasMoreRuns ? (
        <Button variant="ghost" size="small" disabled={researchAccess.isLoadingMore} onClick={() => { void researchAccess.loadMoreRuns(); }}>
          {researchAccess.isLoadingMore ? "Loading more…" : "Load more"}
        </Button>
      ) : null}
      {live && sec.status === "unavailable" && researchAccess && !researchAccess.hasMoreRuns ? (
        <Button variant="ghost" size="small" disabled={sec.isRefreshing} onClick={() => researchAccess.refreshHistory()}>
          {sec.isRefreshing ? "Retrying…" : "Retry run history"}
        </Button>
      ) : null}
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
            <h2 id="act-detail-h">{selected.sentence}</h2>
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

/** Activity points to the shared research sign-in instead of embedding a second authentication form. */
export function ActivityResearchAccess({
  live,
  gate,
  message,
  children,
}: {
  live: boolean;
  gate: ResearchGateState | null;
  message?: string;
  children?: ReactNode;
}) {
  if (!live || gate === null || gate === "authenticated") return children;

  const status = gate === "checking"
    ? "Checking the shared research session."
    : gate === "not_configured"
      ? "Operator authentication is not configured on the server."
      : gate === "service_error"
        ? "The research session could not be checked. Try again from Security Swarm."
        : gate === "rate_limited"
          ? "The research session check is temporarily rate-limited. Try again from Security Swarm later."
          : "Research history uses the same wallet or operator session as Security Swarm. Sign in there to view saved runs and reports.";

  return (
    <aside className="ac-access" aria-labelledby="ac-access-h">
      <p className="pg-kick">Protected research history</p>
      <h2 id="ac-access-h">Operator access required</h2>
      <p>{status}</p>
      {gate === "unauthenticated" && message ? <p role="status">{message}</p> : null}
      <Link className="ov-l" href="/app/security">Research sign-in in Security Swarm<span aria-hidden="true">→</span></Link>
    </aside>
  );
}

/** Activity: what has happened. Research runs and blockchain transactions are kept apart on purpose. Simulated records are always marked. */
export function ActivityView() {
  const { model } = useAppModel();
  const access = useLiveResearchAccess();
  const live = model.mode === "live";
  const [view, setView] = useState<View>("runs");
  return (
    <section className="route ac" aria-labelledby="h-act">
      <PageHead id="h-act" kicker="Activity · history" title="Activity" lede="Research History and Transactions are separate records. Research History contains saved Security Swarm runs; Transactions contains blockchain activity only." />
      <div className="ac-context" aria-label="Activity data sources">
        <section>
          <h2>Research History</h2>
          <p>Persisted Security Swarm runs, ordered newest first. In live mode, viewing protected run history requires a wallet or operator research session.</p>
        </section>
        <section>
          <h2>Transactions</h2>
          <p>{live
            ? "Unavailable until a real transaction-history integration is connected. This dashboard does not create or submit transactions."
            : "Example transaction rows are simulations, not wallet activity. A real transaction-history integration is not connected."}</p>
        </section>
      </div>
      <ToggleGroup
        label="Choose what to see"
        value={view}
        onChange={setView}
        options={[
          { value: "runs", label: "Research history" },
          { value: "transactions", label: live ? "Transactions · unavailable" : "Transactions · examples" },
        ]}
      />
      <div className="ac-view" key={view}>
        {view === "runs" ? (
          <ActivityResearchAccess live={live} gate={access?.gate ?? null} message={access?.message}>
            <Runs />
          </ActivityResearchAccess>
        ) : <Transactions />}
      </div>
    </section>
  );
}
