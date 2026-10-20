"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimTag } from "@/components/ui/SimTag";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { pipelineFor, STATUS_TEXT } from "@/lib/swarm-view";
import type { DeterministicTestSummary, ResearchFinding, SwarmRun } from "@/types";

const ASSESSMENT: Record<ResearchFinding["modelAssessment"], { label: string; tone: "neutral" | "exp" | "unk"; material: "outline" | "dotted" }> = {
  supported: { label: "Model: supported", tone: "neutral", material: "outline" },
  contradicted: { label: "Model: contradicted", tone: "exp", material: "outline" },
  unclear: { label: "Model: unclear", tone: "unk", material: "dotted" },
};

/** Only a deterministic test that really passed is lime ("ok"); every other state is plainly not that. */
const TEST: Record<DeterministicTestSummary["status"], { label: string; tone: "ok" | "bad" | "exp" | "unk"; material: "solid" | "outline" | "dotted" }> = {
  passed: { label: "Passed", tone: "ok", material: "solid" },
  failed: { label: "Failed", tone: "bad", material: "solid" },
  running: { label: "Running", tone: "exp", material: "outline" },
  queued: { label: "Queued", tone: "unk", material: "dotted" },
  blocked: { label: "Blocked", tone: "unk", material: "dotted" },
  not_requested: { label: "Not requested", tone: "unk", material: "dotted" },
};

/** What a stopped run means for the visitor, by the service's own error code. The code itself is always shown too. */
const ERROR_HELP: Readonly<Record<string, string>> = {
  provider_rate_limited: "The model provider limited how many requests it would take. Wait a while, then start a new run.",
  prior_stage_failed: "An earlier agent stopped, so this one never started.",
};
const ERROR_HELP_DEFAULT = "You can start a new run on the same topic. Nothing from this one is kept as a result.";

const short = (hash: string): string => `${hash.slice(0, 12)}…`;

/** A hash shown short. Press it (or tap, where there is no hover) to see all of it, wrapped. */
function Hash({ value }: { value: string }) {
  const [full, setFull] = useState(false);
  return (
    <button type="button" className="hash" aria-expanded={full} title={full ? "Show less" : "Show the whole value"} onClick={() => setFull((f) => !f)}>
      <code>{full ? value : short(value)}</code>
    </button>
  );
}
/** A source link is followed only if it is a plain web address. */
const safeHref = (url: string): string | undefined => (/^https?:\/\//i.test(url) ? url : undefined);

/** Identify the known Robinhood explorer ambiguity from the saved claim itself, never from a fixed run identifier. */
export function hasRobinhoodExplorerMismatch(finding: Pick<ResearchFinding, "claim" | "modelAssessment" | "evidence">): boolean {
  const text = [finding.claim, ...finding.evidence.map((item) => item.quote)].join(" ");
  return finding.modelAssessment === "unclear"
    && /\btestnet\b|\b46630\b/i.test(text)
    && /robinhoodchain\.blockscout\.com/i.test(text);
}

export function formatRecordedEventTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function recordedEventLabel(stage: string): string {
  const labels: Record<string, string> = {
    queued: "Run queued",
    worker_claimed: "Worker claimed",
    source_retrieval: "Source retrieval",
    research: "Research",
    analysis: "Analysis",
    verification: "Verification",
    completed: "Run completed",
    failed: "Run failed",
  };
  return labels[stage] ?? stage.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ReportLimitSections({
  limitations,
  assumptions,
  recommendations,
}: {
  limitations: string[];
  assumptions: string[];
  recommendations: string[];
}) {
  const groups = [
    { title: "Limitations", entries: limitations },
    { title: "Assumptions", entries: assumptions },
    { title: "Recommendations", entries: recommendations },
  ].filter((group) => group.entries.length > 0);

  return (
    <section className="dsec" aria-label="Limitations, assumptions and recommendations">
      <div className="limit-groups">
        {groups.map((group) => (
          <section className="limit-group" key={group.title} aria-label={group.title}>
            <h4>{group.title}</h4>
            <ul>
              {group.entries.map((entry, index) => <li key={`${group.title}-${index}`}>{entry}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

export function RecordedEventTimeline({ events }: { events: Array<{ at: string; stage: string; message: string }> }) {
  return (
    <section className="dsec" aria-label="Recorded agent execution timeline">
      <p className="dnote">Recorded run events · historical sequence. No agents are running.</p>
      <ol className="events-timeline">
        {events.map((event, index) => (
          <li key={`${event.at}-${index}`}>
            <span className="event-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div className="event-content">
              <div className="event-meta">
                <time dateTime={event.at}>{formatRecordedEventTime(event.at)}</time>
                <span className="event-label">{recordedEventLabel(event.stage)}</span>
                <code>{event.stage}</code>
              </div>
              <p>{event.message}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

type TabId = "summary" | "findings" | "sources" | "tests" | "limits" | "events";

/**
 * The evidence explorer for one run. The summary is always there (what it shows, how, what it does not show); for a live run
 * the rest sits one tab away so the screen is never a wall: findings with their quoted citations, sources with provenance,
 * deterministic tests, limits and recorded events, as real lists. Nothing here is a live region: the short status sentence in
 * the pipeline is the only thing a screen reader is told about as the run changes.
 */
export function SwarmRunDetail({ run, headingId }: { run: SwarmRun; headingId: string }) {
  const review = run.humanReview;
  const detail = run.liveDetail;
  const live = run.origin === "live";
  const example = !!run.exampleTag;
  const sourceById = new Map((detail?.sources ?? []).map((s) => [s.id, s]));
  const pipeline = pipelineFor(run);
  const agents = (detail ?? run.liveSummary)?.agents ?? [];
  const problem = agents.filter((a) => a.status === "failed" || a.status === "blocked");
  const errorCode = (detail ?? run.liveSummary)?.errorCode;
  const hasError = live && (problem.length > 0 || !!errorCode || !!detail?.errorMessage);
  const withDetail = live && !!detail;

  const tabs: Array<{ id: TabId; label: string }> = [{ id: "summary", label: "Summary" }];
  if (withDetail && detail.findings.length > 0) tabs.push({ id: "findings", label: `Findings (${detail.findings.length})` });
  if (withDetail && detail.sources.length > 0) tabs.push({ id: "sources", label: `Sources (${detail.sources.length})` });
  if (withDetail && detail.deterministicTests.length > 0) tabs.push({ id: "tests", label: `Tests (${detail.deterministicTests.length})` });
  if (withDetail && (detail.limitations.length > 0 || detail.assumptions.length > 0 || detail.recommendations.length > 0)) tabs.push({ id: "limits", label: "Limits" });
  if (withDetail && detail.events.length > 0) tabs.push({ id: "events", label: `Events (${detail.events.length})` });
  const [picked, setPicked] = useState<TabId>(withDetail && detail.findings.length > 0 ? "findings" : "summary");
  const tab = tabs.some((t) => t.id === picked) ? picked : "summary";
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length]!;
    setPicked(next.id);
    document.getElementById(`${headingId}-t-${next.id}`)?.focus();
  };

  return (
    <aside className={`drawer${example ? " is-example" : ""}`} aria-labelledby={headingId}>
      <header className="report-heading">
        <h3 id={headingId}>{run.goal}</h3>
        <div className="dm">
          <Chip tone={run.status.tone} material={run.status.material}>{run.status.label}</Chip>
          <span>{run.id}</span>
          <span>{run.role}</span>
          {live && run.liveSummary?.createdAt ? <span>Started {run.liveSummary.createdAt}</span> : null}
          {example ? <SimTag /> : null}
        </div>
      </header>

      {pipeline ? (
        <section className="report-stage-overview" aria-label={pipeline.example ? "Illustration stage order" : "Recorded stage status"}>
          <div className="report-stage-heading">
            <h4>{pipeline.example ? "Stage order" : "Recorded stage status"}</h4>
            {pipeline.example ? <span>Simulated · no agent ran</span> : null}
          </div>
          <ol>
            {pipeline.stages.map((stage) => (
              <li key={stage.role} className={`s-${stage.status}`}>
                <span>{stage.title}</span>
                <span>{STATUS_TEXT[stage.status]}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {hasError ? (
        <div className="derr">
          <b>
            <StatusMaterial material="solid" /> This run stopped with an error
          </b>
          {detail?.errorMessage ? <p>{detail.errorMessage}</p> : null}
          <ul>
            {errorCode ? <li>Run error code: <code>{errorCode}</code></li> : null}
            {problem.map((a) => (
              <li key={a.role}>
                {a.role[0]!.toUpperCase() + a.role.slice(1)} {a.status === "failed" ? "failed" : "was blocked"}
                {a.errorCode ? <>: <code>{a.errorCode}</code></> : null}
              </li>
            ))}
          </ul>
          <p>{ERROR_HELP[errorCode ?? ""] ?? ERROR_HELP_DEFAULT}</p>
          <p>Nothing from a stopped run is shown as a result or as verified.</p>
        </div>
      ) : null}

      {tabs.length > 1 ? (
        <div className="ev-tabs" role="tablist" aria-label="Evidence">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${headingId}-t-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`${headingId}-p`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setPicked(t.id)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

        <div className={`ev-panel${tab === "events" ? " events-reveal" : ""}`} id={`${headingId}-p`} role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `${headingId}-t-${tab}` : undefined} key={tab}>
        {tab === "summary" ? (
          <>
            <dl className="dfacts">
              <div>
                <dt>What this shows</dt>
                <dd>{run.shows}</dd>
              </div>
              <div>
                <dt>How it was measured</dt>
                <dd>{run.how}</dd>
              </div>
              <div>
                <dt>What it does not show</dt>
                <dd>{run.notShown}</dd>
              </div>
              {!(withDetail && detail.limitations.length > 0) ? (
                <div>
                  <dt>Limitation</dt>
                  <dd>{run.limitation}</dd>
                </div>
              ) : null}
              {!withDetail ? (
                <div>
                  <dt>Evidence</dt>
                  <dd>
                    {run.unavailableSource ? <StatusMaterial material="dotted" /> : null}
                    {run.unavailableSource ? " " : null}
                    {run.evidence}
                  </dd>
                </div>
              ) : null}
            </dl>
            {run.zeroFindings ? <EmptyState title="No findings recorded.">This is not a statement that none exist. It only says no finding has been recorded.</EmptyState> : null}
            {run.withheld ? <div className="withheld">Detail withheld. A real finding links to its responsible disclosure path here, not a blank.</div> : null}
            {live && run.detailUnavailable ? (
              <p className="dnote" role="status">
                <b>Run detail.</b> {run.detailUnavailable}
              </p>
            ) : null}
          </>
        ) : null}

        {tab === "findings" && withDetail ? (
          <section className="dsec" aria-label="Findings and citations">
            <ul className="finds">
              {detail.findings.map((f) => {
                const a = ASSESSMENT[f.modelAssessment];
                return (
                  <li key={f.id}>
                    <div className="fchips">
                      <Chip tone={a.tone} material={a.material}>{a.label}</Chip>
                      <Chip tone={f.evidenceStatus === "quote_matched" ? "neutral" : "unk"} material={f.evidenceStatus === "quote_matched" ? "outline" : "dotted"}>
                        {f.evidenceStatus === "quote_matched" ? "Quote matched" : "Quote not verified"}
                      </Chip>
                    </div>
                    <p className="claim">{f.claim}</p>
                    {f.rationale ? <p className="why">{f.rationale}</p> : null}
                      {hasRobinhoodExplorerMismatch(f) ? (
                        <p className="claim-caveat" role="note">
                          <b>Network association to verify.</b> This Testnet claim cites <code>robinhoodchain.blockscout.com</code>, the Robinhood Mainnet explorer. The saved claim and source quote are preserved; verify the network association before relying on it.
                        </p>
                      ) : null}
                      {f.evidence.length > 0 ? (
                      <ul className="quotes" aria-label="Quotes">
                        {f.evidence.map((q, i) => {
                          const src = sourceById.get(q.sourceId);
                          return (
                            <li key={`${q.sourceId}-${i}`}>
                              <q>{q.quote}</q>
                              <span className="qsrc">
                                {q.exactQuoteMatched ? "Quote matched" : "Quote not verified"} in{" "}
                                {src && src.status === "available" && safeHref(src.url) ? (
                                  <a href={safeHref(src.url)} target="_blank" rel="noopener noreferrer">{src.title}</a>
                                ) : (
                                  src?.title ?? q.sourceId
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="dnote">Quote matched means the quoted words appear in the fetched source. It does not show the claim is true.</p>
          </section>
        ) : null}

        {tab === "sources" && withDetail ? (
          <section className="dsec" aria-label="Sources and provenance">
            <ul className="srcs">
              {detail.sources.map((s) => (
                <li key={s.id}>
                  <Chip tone={s.status === "available" ? "neutral" : "unk"} material={s.status === "available" ? "outline" : "dotted"}>
                    {s.status === "available" ? "Available" : "Unavailable"}
                  </Chip>
                  <span className="st">
                    {s.status === "available" && safeHref(s.url) ? <a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title}
                    <span className="sm url">{s.url}</span>
                    <span className="sm">
                      retrieved {s.retrievedAt}
                      {s.sha256 ? <> · SHA-256 <Hash value={s.sha256} /></> : null}
                      {s.errorCode ? <> · <code>{s.errorCode}</code></> : null}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tab === "tests" && withDetail ? (
          <section className="dsec" aria-label="Deterministic tests">
            <ul className="tests">
              {detail.deterministicTests.map((t) => {
                const c = TEST[t.status];
                return (
                  <li key={t.id}>
                    <Chip tone={c.tone} material={c.material}>{c.label}</Chip>
                    <span className="st">
                      {t.name}
                      <span className="sm">
                        {t.exitCode !== undefined ? <>exit {t.exitCode}</> : null}
                        {t.artifactSha256 ? <>{t.exitCode !== undefined ? " · " : ""}SHA-256 <Hash value={t.artifactSha256} /></> : null}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {tab === "limits" && withDetail ? (
          <ReportLimitSections
            limitations={detail.limitations}
            assumptions={detail.assumptions}
            recommendations={detail.recommendations}
          />
        ) : null}

        {tab === "events" && withDetail ? (
          <RecordedEventTimeline events={detail.events} />
        ) : null}
      </div>

      <div className="dock">
        <i className={review.recorded ? "lit" : undefined} aria-hidden="true" />
        <span>
          {review.recorded
            ? `Human review recorded by ${review.by}, ${review.at}.`
            : "Human review dock: unlit. No human review has been recorded."}
        </span>
      </div>
      <p className="wrapnote">By design, a run has no access to keys, signing or funds.</p>
    </aside>
  );
}
