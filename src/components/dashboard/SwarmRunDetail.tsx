"use client";

import { Chip, DemoChip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
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

const short = (hash: string): string => `${hash.slice(0, 12)}…`;
/** A source link is followed only if it is a plain web address. */
const safeHref = (url: string): string | undefined => (/^https?:\/\//i.test(url) ? url : undefined);

/**
 * The detail of one run: what it shows and does not show, then (for a live run) its errors, findings with their citations,
 * sources with their provenance, deterministic tests, limits and recorded events, as real lists. Nothing here is a live
 * region: the short status sentence in the pipeline is the only thing a screen reader is told about as the run changes.
 */
export function SwarmRunDetail({ run, headingId }: { run: SwarmRun; headingId: string }) {
  const review = run.humanReview;
  const detail = run.liveDetail;
  const live = run.origin === "live";
  const example = !!run.exampleTag;
  const sourceById = new Map((detail?.sources ?? []).map((s) => [s.id, s]));
  const agents = (detail ?? run.liveSummary)?.agents ?? [];
  const problem = agents.filter((a) => a.status === "failed" || a.status === "blocked");
  const errorCode = (detail ?? run.liveSummary)?.errorCode;
  const hasError = live && (problem.length > 0 || !!errorCode || !!detail?.errorMessage);

  return (
    <aside className={`drawer${example ? " is-example" : ""}`} aria-labelledby={headingId}>
      <h3 id={headingId}>{run.goal}</h3>
      <div className="dm">
        <span>{run.id}</span>
        <span>{run.role}</span>
        {example ? <DemoChip>{run.exampleTag}</DemoChip> : null}
      </div>

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
          <p>Nothing from a stopped run is shown as a result or as verified.</p>
        </div>
      ) : null}

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
        {!(live && detail && detail.limitations.length > 0) ? (
          <div>
            <dt>Limitation</dt>
            <dd>{run.limitation}</dd>
          </div>
        ) : null}
        {!(live && detail) ? (
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

      {run.zeroFindings ? (
        <EmptyState title="No findings recorded.">This is not a statement that none exist. It only says no finding has been recorded.</EmptyState>
      ) : null}
      {run.withheld ? <div className="withheld">Detail withheld. A real finding links to its responsible disclosure path here, not a blank.</div> : null}

      {live && run.detailUnavailable ? (
        <p className="dnote" role="status">
          <b>Run detail.</b> {run.detailUnavailable}
        </p>
      ) : null}

      {live && detail ? (
        <>
          {detail.findings.length > 0 ? (
            <section className="dsec" aria-label="Findings and citations">
              <h4>Findings and citations</h4>
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

          {detail.sources.length > 0 ? (
            <section className="dsec" aria-label="Sources and provenance">
              <h4>Sources and provenance</h4>
              <ul className="srcs">
                {detail.sources.map((s) => (
                  <li key={s.id}>
                    <Chip tone={s.status === "available" ? "neutral" : "unk"} material={s.status === "available" ? "outline" : "dotted"}>
                      {s.status === "available" ? "Available" : "Unavailable"}
                    </Chip>
                    <span className="st">
                      {s.status === "available" && safeHref(s.url) ? <a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title}
                      <span className="sm">
                        retrieved {s.retrievedAt}
                        {s.sha256 ? <> · SHA-256 <code title={s.sha256}>{short(s.sha256)}</code></> : null}
                        {s.errorCode ? <> · <code>{s.errorCode}</code></> : null}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {detail.deterministicTests.length > 0 ? (
            <section className="dsec" aria-label="Deterministic tests">
              <h4>Deterministic tests</h4>
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
                          {t.artifactSha256 ? <>{t.exitCode !== undefined ? " · " : ""}SHA-256 <code title={t.artifactSha256}>{short(t.artifactSha256)}</code></> : null}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {detail.limitations.length > 0 || detail.assumptions.length > 0 ? (
            <section className="dsec" aria-label="Limits and assumptions">
              <h4>Limits and assumptions</h4>
              <ul className="plain">
                {detail.limitations.map((l, i) => (
                  <li key={`l${i}`}><b>Limit.</b> {l}</li>
                ))}
                {detail.assumptions.map((l, i) => (
                  <li key={`a${i}`}><b>Assumption.</b> {l}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {detail.recommendations.length > 0 ? (
            <section className="dsec" aria-label="Recommendations">
              <h4>Recommendations</h4>
              <ul className="plain">
                {detail.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {detail.events.length > 0 ? (
            <section className="dsec" aria-label="Recorded events">
              <h4>Recorded events</h4>
              <ol className="events">
                {detail.events.map((e, i) => (
                  <li key={`${e.at}-${i}`}>
                    <time>{e.at}</time>
                    <code>{e.stage}</code>
                    <span>{e.message}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </>
      ) : null}

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
