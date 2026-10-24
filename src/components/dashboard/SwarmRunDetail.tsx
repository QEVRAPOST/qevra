"use client";

import { useState, type FormEvent } from "react";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimTag } from "@/components/ui/SimTag";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { pipelineFor, shortWalletIdentity, STATUS_TEXT } from "@/lib/swarm-view";
import type { DeterministicTestSummary, ResearchFinding, SwarmRun } from "@/types";
import type { ResearchAgentStatus, ResearchAnalysisDetail, ResearchEvidenceSource, ResearchHumanReviewDecision, ResearchHumanReviewSubmission } from "@/types/integrations";
import { saveSecurityRunReview, SecurityApiClientError } from "@/features/security/client";

const ASSESSMENT: Record<ResearchFinding["modelAssessment"], { label: string; tone: "neutral" | "exp" | "unk"; material: "outline" | "dotted" }> = {
  supported: { label: "Verification: supported", tone: "neutral", material: "outline" },
  contradicted: { label: "Verification: contradicted", tone: "exp", material: "outline" },
  unclear: { label: "Verification: unclear", tone: "unk", material: "dotted" },
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
  analysis,
  sources = [],
}: {
  limitations: string[];
  assumptions: string[];
  recommendations: string[];
  analysis?: ResearchAnalysisDetail;
  sources?: ResearchEvidenceSource[];
}) {
  const unknowns = analysis?.unknowns ?? [];
  const limitationEntries = limitations.filter((entry) => !unknowns.includes(entry));
  const groups = [
    { title: "Remaining unknowns", entries: unknowns },
    { title: "Limitations", entries: limitationEntries },
    { title: "Assumptions", entries: analysis?.assumptions ?? assumptions },
    { title: "Recommended next steps", entries: recommendations },
  ].filter((group) => group.entries.length > 0);
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  return (
    <section className="dsec" aria-label="Risk assessments, limitations, assumptions, and recommended next steps">
      <section className="limit-group" aria-label="Risk assessments">
        <h4>Risk assessments</h4>
        {analysis ? (
          analysis.risks.length > 0 ? (
            <ul className="analysis-risks">
              {analysis.risks.map((risk) => (
                <li key={risk.id}>
                  <div className="analysis-risk-heading">
                    <strong>{risk.title}</strong>
                    <Chip tone={risk.severity === "critical" || risk.severity === "high" ? "exp" : "unk"} material="outline">
                      {risk.severity} severity
                    </Chip>
                  </div>
                  <p>{risk.analysis}</p>
                  <p className="risk-sources">
                    Evidence sources: {risk.sourceIds.map((sourceId, index) => {
                      const source = sourceById.get(sourceId);
                      const sourceTitle = source?.title ?? sourceId;
                      const href = source && source.status === "available" ? safeHref(source.url) : undefined;
                      return (
                        <span key={`${sourceId}-${index}`}>
                          {index > 0 ? ", " : null}
                          {href ? <a href={href} target="_blank" rel="noopener noreferrer">{sourceTitle}</a> : sourceTitle}
                        </span>
                      );
                    })}
                  </p>
                </li>
              ))}
            </ul>
          ) : <p className="dnote">The Analysis stage recorded no risk assessments for this report.</p>
        ) : (
          <p className="dnote">Risk assessments are not available in the report data returned by the service. Older reports may not include the Analysis fields.</p>
        )}
        <p className="dnote">Analysis risks are model-generated research signals, not independent security validation.</p>
      </section>
      {groups.length === 0 ? (
        <p className="dnote">No limitations, assumptions, or recommendations were recorded in this report.</p>
      ) : (
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
      )}
    </section>
  );
}

function reviewDecisionLabel(decision: ResearchHumanReviewDecision | undefined, fallback?: string): string {
  if (decision === "evidence_supported") return "Evidence supported";
  if (decision === "needs_investigation") return "Needs investigation";
  if (decision === "insufficient_evidence") return "Insufficient evidence";
  return fallback ?? "No decision was recorded.";
}

export function humanReviewErrorMessage(error: unknown): string {
  if (!(error instanceof SecurityApiClientError)) return "The evidence assessment could not be saved. Try again when the service is available.";
  if (error.status === 401) return "Your wallet research session has expired. Sign in again with the wallet that owns this report.";
  if (error.status === 403 && error.code === "wallet_user_authentication_required") return "Only a verified wallet-user session can save this owner self-review. Operator sessions are read-only.";
  if (error.status === 404) return "This report is not available to the currently authenticated wallet.";
  if (error.status === 409 && error.code === "research_run_not_completed") return "This report must finish all three stages before it can be reviewed.";
  if (error.status === 409) return "The review could not be updated. Reload this report and try again.";
  if (error.status === 429) return error.retryAfterMs
    ? `The review service is rate limited. Try again in ${Math.ceil(error.retryAfterMs / 1_000)} seconds.`
    : "The review service is rate limited. Wait before trying again.";
  if (error.status === 503) return "The review could not be saved because research persistence is unavailable.";
  return error.message;
}

const REVIEW_OPTIONS: Array<{ value: ResearchHumanReviewDecision; label: string; description: string }> = [
  { value: "evidence_supported", label: "Evidence supported", description: "The saved evidence supports the report's central claim." },
  { value: "needs_investigation", label: "Needs investigation", description: "More evidence or follow-up is needed." },
  { value: "insufficient_evidence", label: "Insufficient evidence", description: "The saved sources do not support a clear conclusion." },
];

export interface HumanReviewEvidenceContext {
  question: string;
  findingsCount: number | null;
  sourcesCount: number | null;
  availableSourcesCount: number | null;
  verificationStatus: ResearchAgentStatus | null;
  limitations: string[] | null;
  reportHref: string;
  onViewResearchReport?: () => void;
}

export function HumanReviewStatus({
  review,
  runId,
  live = false,
  completed = false,
  failed = false,
  reviewLoaded = true,
  canSubmit = false,
  sessionRole,
  evidenceContext,
  onReviewSaved,
}: {
  review: SwarmRun["humanReview"];
  runId?: string;
  live?: boolean;
  completed?: boolean;
  failed?: boolean;
  /** A run summary omits owner review data; only mark it loaded when the detail response is present. */
  reviewLoaded?: boolean;
  canSubmit?: boolean;
  sessionRole?: "wallet" | "operator";
  evidenceContext?: HumanReviewEvidenceContext;
  onReviewSaved?: (review: ResearchHumanReviewSubmission) => void;
}) {
  const [savedReview, setSavedReview] = useState(review);
  const [decision, setDecision] = useState<ResearchHumanReviewDecision | "">(review.recorded ? review.decision ?? "" : "");
  const [notes, setNotes] = useState(review.recorded ? review.notes ?? "" : "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string }>();

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!runId || !decision || !canSubmit || !completed || saving) return;
    setSaving(true);
    setFeedback(undefined);
    try {
      const response = await saveSecurityRunReview(runId, {
        decision,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      const persisted = response.review;
      setSavedReview({
        recorded: true,
        by: persisted.reviewerId,
        at: persisted.reviewedAt,
        decision: persisted.decision,
        ...(persisted.notes ? { notes: persisted.notes } : {}),
        reviewKind: persisted.reviewKind,
        disclaimer: persisted.disclaimer,
      });
      setDecision(persisted.decision);
      setNotes(persisted.notes ?? "");
      onReviewSaved?.(persisted);
      setFeedback({ kind: "success", message: "Human Review saved to this report." });
    } catch (error) {
      setFeedback({ kind: "error", message: humanReviewErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  const statusKnown = !live || (sessionRole === "wallet" && reviewLoaded);
  const statusLabel = live && sessionRole === "wallet" && !reviewLoaded
    ? "Review unavailable"
    : !statusKnown ? "Owner review not shown" : !live ? "Illustration only" : savedReview.recorded ? "Review recorded" : "Not reviewed";
  const reviewForm = live && reviewLoaded && completed && canSubmit && runId ? (
    <form className="review-form" onSubmit={submitReview} aria-busy={saving}>
      <fieldset disabled={saving}>
        <legend>{savedReview.recorded ? "Update your assessment" : "Assess the saved evidence"}</legend>
        <div className="review-options">
          {REVIEW_OPTIONS.map((option) => {
            const id = `review-${runId}-${option.value}`;
            return (
              <label className="review-option" htmlFor={id} key={option.value}>
                <input
                  id={id}
                  type="radio"
                  name={`review-${runId}`}
                  value={option.value}
                  checked={decision === option.value}
                  onChange={() => setDecision(option.value)}
                />
                <span><b>{option.label}</b><small>{option.description}</small></span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <label className="review-notes-label" htmlFor={`review-notes-${runId}`}>Your reasoning</label>
      <p className="review-reasoning-help" id={`review-reasoning-help-${runId}`}>Explain what in the saved evidence led to this decision.</p>
      <textarea
        id={`review-notes-${runId}`}
        value={notes}
        onChange={(event) => setNotes(event.currentTarget.value)}
        maxLength={1_000}
        rows={3}
        placeholder="Record what evidence you considered or what needs follow-up."
        disabled={saving}
        aria-describedby={`review-reasoning-help-${runId}`}
      />
      <div className="review-form-footer">
        <span>{notes.length}/1,000</span>
        <Button type="submit" variant="primary" disabled={!decision || saving}>
          {saving ? "Saving review…" : savedReview.recorded ? "Save updated review" : "Save Human Review"}
        </Button>
      </div>
      {feedback?.kind === "error" ? <p className="review-feedback is-error" role="alert">{feedback.message}</p> : null}
      <p className="dnote">Only the verified report owner can save this self-review. It records your evidence assessment; it does not create an independent audit or certification.</p>
    </form>
  ) : null;

  return (
    <section id={`human-review-${runId ?? "report"}`} className="dock review-status" aria-labelledby={`human-review-heading-${runId ?? "report"}`}>
      <i className={statusKnown && savedReview.recorded ? "lit" : undefined} aria-hidden="true" />
      <div className="review-status-copy">
        <div className="review-status-title">
          <h4 id={`human-review-heading-${runId ?? "report"}`}>Human Review</h4>
          <Chip tone={statusKnown && savedReview.recorded ? "neutral" : "unk"} material={statusKnown && savedReview.recorded ? "outline" : "dotted"}>
            {statusLabel}
          </Chip>
        </div>
        <p className="review-intro">Review the saved evidence and record your own assessment.</p>
        {live && evidenceContext ? (
          <section className="review-evidence" aria-label="Research evidence being assessed">
            <div className="review-evidence-heading">
              <div>
                <p className="review-saved-label">Evidence being assessed</p>
                <p className="review-evidence-question">{evidenceContext.question || "Research question unavailable in this report."}</p>
              </div>
              <a className="review-report-link" href={evidenceContext.reportHref} onClick={evidenceContext.onViewResearchReport}>View research report</a>
            </div>
            <dl className="review-evidence-facts">
              <div><dt>Findings</dt><dd>{evidenceContext.findingsCount === null ? "Unavailable" : `${evidenceContext.findingsCount} recorded`}</dd></div>
              <div><dt>Sources</dt><dd>{evidenceContext.sourcesCount === null
                ? "Unavailable"
                : `${evidenceContext.sourcesCount} saved${evidenceContext.availableSourcesCount === null ? "" : ` · ${evidenceContext.availableSourcesCount} available`}`}</dd></div>
              <div><dt>Verification status</dt><dd>{evidenceContext.verificationStatus ? STATUS_TEXT[evidenceContext.verificationStatus] : "Unavailable in this report"}</dd></div>
            </dl>
            {evidenceContext.findingsCount === 0 ? (
              <p className="review-evidence-empty">No substantiated findings were recorded. This does not establish that the subject is secure.</p>
            ) : null}
            <div className="review-evidence-limitations">
              <p className="review-saved-label">Relevant limitations</p>
              {evidenceContext.limitations === null ? (
                <p>Limitations are unavailable until report details load.</p>
              ) : evidenceContext.limitations.length > 0 ? (
                <ul>{evidenceContext.limitations.map((limitation, index) => <li key={`${index}-${limitation}`}>{limitation}</li>)}</ul>
              ) : (
                <p>No limitations were recorded for this report.</p>
              )}
            </div>
          </section>
        ) : null}
        {live && sessionRole === "wallet" && !reviewLoaded ? (
          <p className="dnote">Saved Human Review status is not available until report details load.</p>
        ) : statusKnown && savedReview.recorded ? (
          <>
            <div className="review-saved">
              <p className="review-saved-label">Your assessment</p>
              <strong>{reviewDecisionLabel(savedReview.decision, savedReview.disposition)}</strong>
              <dl className="review-status-meta">
                <div>
                  <dt>Reviewer wallet</dt>
                  <dd>
                    {savedReview.by ? (
                      <code title={savedReview.by}>
                        <span aria-hidden="true">{shortWalletIdentity(savedReview.by)}</span>
                        <span className="sr">Full reviewer wallet {savedReview.by}</span>
                      </code>
                    ) : "Not reported"}
                  </dd>
                </div>
                <div><dt>Saved</dt><dd><time dateTime={savedReview.at}>{formatRecordedEventTime(savedReview.at)}</time></dd></div>
              </dl>
              {savedReview.notes ? <p className="review-saved-note"><b>Your reasoning.</b> {savedReview.notes}</p> : <p className="review-saved-note">No reasoning was recorded.</p>}
            </div>
            <p className="dnote">{savedReview.disclaimer ?? "This is a personal evidence assessment, not an independent audit, security review, or certification."}</p>
          </>
        ) : !statusKnown ? (
          <p className="dnote">Owner self-review data is available only in a verified wallet-owner session. Operator sessions are read-only.</p>
        ) : savedReview.recorded ? null : live && sessionRole === "wallet" ? (
          <p className="dnote">No Human Review has been recorded for this report.</p>
        ) : live && sessionRole === "operator" ? (
          <p className="dnote">Operator sessions cannot view or submit a wallet owner&apos;s personal assessment.</p>
        ) : live ? (
          <p className="dnote">A verified wallet-owner session is required to view or submit a personal assessment.</p>
        ) : (
          <p className="dnote">Illustrative reports do not contain live personal evidence assessments.</p>
        )}
        {live && reviewLoaded && !completed ? <p className="dnote">{failed ? "This run did not complete, so Human Review is unavailable." : "Human Review becomes available after all three AI stages complete."}</p> : null}
        {live && reviewLoaded && completed && !canSubmit && sessionRole === "wallet" ? (
          <p className="dnote">This report is read-only in the current session. Only its verified owner can save an assessment.</p>
        ) : null}
        {feedback?.kind === "success" ? <p className="review-feedback is-success" role="status">{feedback.message}</p> : null}
        {savedReview.recorded && reviewForm ? (
          <details className="review-edit">
            <summary>Edit assessment</summary>
            {reviewForm}
          </details>
        ) : reviewForm}
      </div>
    </section>
  );
}

export function RecordedEventTimeline({ events }: { events: Array<{ at: string; stage: string; message: string }> }) {
  return (
    <section className="dsec" aria-label="Recorded agent execution timeline">
      {events.length === 0 ? (
        <p className="dnote">No run events were recorded for this report.</p>
      ) : (
        <>
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
        </>
      )}
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
export function SwarmRunDetail({
  run,
  headingId,
  canSubmitReview = false,
  reviewSessionRole,
  onReviewSaved,
}: {
  run: SwarmRun;
  headingId: string;
  canSubmitReview?: boolean;
  reviewSessionRole?: "wallet" | "operator";
  onReviewSaved?: (review: ResearchHumanReviewSubmission) => void;
}) {
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
  if (withDetail) {
    tabs.push({ id: "findings", label: `Findings (${detail.findings.length})` });
    tabs.push({ id: "sources", label: `Sources (${detail.sources.length})` });
    tabs.push({ id: "limits", label: "Limits" });
    tabs.push({ id: "events", label: `Events (${detail.events.length})` });
    if (detail.deterministicTests.length > 0) tabs.push({ id: "tests", label: `Tests (${detail.deterministicTests.length})` });
  }
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
        <p className="report-question-label">Research question</p>
        <h3 id={headingId}>{run.goal}</h3>
        <div className="dm">
          <Chip tone={run.status.tone} material={run.status.material}>{run.status.label}</Chip>
          <span>{run.id}</span>
          <span>{run.role}</span>
          {live && run.liveSummary?.createdAt ? <span>Started {run.liveSummary.createdAt}</span> : null}
          {example ? <SimTag /> : null}
        </div>
      </header>

      <section className="report-outcome" aria-label="Research outcome">
        <div>
          <p className="report-question-label">Outcome</p>
          <p className="report-outcome-copy">
            {detail?.summary ?? detail?.analysis?.summary ?? (live
              ? detail
                ? "No summary was included in the report data returned by the service. Review the recorded findings, sources, and limitations."
                : "The report outcome is not available while saved report details load."
              : run.shows)}
          </p>
        </div>
        {live && detail?.status === "completed" ? (
          <p className="report-next-step">
            <b>Next step.</b> {detail.findings.length > 0
              ? "Compare each finding with its saved quotation and source, then review the limitations and recommended next steps."
              : "Review source availability and limitations. A completed report with no substantiated findings is not evidence of safety."}
          </p>
        ) : null}
      </section>

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

      {live ? (
        <section className="report-review-handoff" aria-label="Research workflow and Human Review">
          <p><b>Research, Analysis, and Verification are the three AI stages.</b> Human Review is a separate personal assessment, not an AI agent.</p>
          {detail?.status === "completed" ? (
            <a href={`#human-review-${run.id}`}>Open Human Review</a>
          ) : detail?.status === "failed" || run.liveSummary?.status === "failed" ? (
            <span>Human Review is unavailable because this run did not complete.</span>
          ) : run.liveSummary?.status === "completed" ? (
            <span>The run completed, but its saved report details have not loaded yet.</span>
          ) : (
            <span>Human Review is available after all three AI stages complete.</span>
          )}
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

        <div className={`ev-panel${tab === "events" ? " events-reveal" : ""}`} id={`${headingId}-p`} tabIndex={-1} role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `${headingId}-t-${tab}` : undefined} key={tab}>
        {tab === "summary" ? (
          <>
            <dl className="dfacts">
              {!withDetail ? <div><dt>What this shows</dt><dd>{run.shows}</dd></div> : null}
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
            {run.zeroFindings ? <EmptyState title="Completed with no substantiated findings.">This run completed without recording substantiated findings. It does not establish that the subject is secure or that no issues exist. Review the available sources and limitations before relying on this report.</EmptyState> : null}
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
            {detail.verification?.summary ? (
              <div className="verification-summary">
                <h4>Verification stage</h4>
                <p>{detail.verification.summary}</p>
              </div>
            ) : null}
            <p className="dnote">The Verification stage checks source quotations against fetched text. Quote matching is not independent security validation, an audit, or proof that a claim is true.</p>
            <ul className="finds">
              {detail.findings.length === 0 ? (
                <EmptyState as="li" title="No findings were recorded.">
                  This report does not establish that the subject is secure or that no issues exist.
                </EmptyState>
              ) : null}
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
          </section>
        ) : null}

        {tab === "sources" && withDetail ? (
          <section className="dsec" aria-label="Sources and provenance">
            <ul className="srcs">
              {detail.sources.length === 0 ? <EmptyState as="li" title="No sources were recorded.">This report contains no source records.</EmptyState> : null}
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
            analysis={detail.analysis}
            sources={detail.sources}
          />
        ) : null}

        {tab === "events" && withDetail ? (
          <RecordedEventTimeline events={detail.events} />
        ) : null}
      </div>

      <HumanReviewStatus
        key={`${run.id}-${review.recorded ? review.at : "not-reviewed"}`}
        review={review}
        runId={run.id}
        live={live}
        completed={detail?.status === "completed"}
        failed={detail?.status === "failed" || run.liveSummary?.status === "failed"}
        reviewLoaded={!!detail}
        canSubmit={canSubmitReview}
        sessionRole={reviewSessionRole}
        evidenceContext={live ? {
          question: run.goal,
          findingsCount: detail?.findings.length ?? run.liveSummary?.findingCount ?? null,
          sourcesCount: detail?.sources.length ?? run.liveSummary?.sourceCount ?? null,
          availableSourcesCount: detail
            ? detail.sources.filter((source) => source.status === "available").length
            : run.liveSummary?.availableSourceCount ?? null,
          verificationStatus: agents.find((agent) => agent.role === "verification")?.status ?? null,
          limitations: detail
            ? [...new Set([...detail.limitations, ...(detail.analysis?.unknowns ?? []), ...(detail.verification?.limitations ?? [])])]
            : null,
          reportHref: `#${headingId}-p`,
          onViewResearchReport: () => setPicked(withDetail ? "findings" : "summary"),
        } : undefined}
        onReviewSaved={onReviewSaved}
      />
      <p className="wrapnote">By design, a run has no access to keys, signing or funds.</p>
    </aside>
  );
}
