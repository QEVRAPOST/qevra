"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip, DemoChip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import {
  CORE_SENTENCE,
  PASSED_LEGEND_BODY,
  PASSED_LEGEND_COMPLETED,
  PASSED_LEGEND_COMPLETED_BODY,
  PASSED_LEGEND_PASSED,
  SWARM_PARAGRAPH,
} from "@/lib/content/copy-lock";
import type { ResearchTopicId, SwarmRun } from "@/types";
import { useAppModel } from "./DemoAppProvider";

function RunDrawer({ run }: { run: SwarmRun }) {
  const review = run.humanReview;
  const detail = run.liveDetail;
  return (
    <aside className="drawer" aria-live="polite">
      <h3>{run.goal}</h3>
      <div className="dm">
        <span>{run.id}</span>
        <span>{run.role}</span>
        {run.exampleTag ? <DemoChip>{run.exampleTag}</DemoChip> : null}
      </div>
      <div className="tr">
        <b>What this shows</b>
        <span>{run.shows}</span>
      </div>
      <div className="tr">
        <b>How it was measured</b>
        <span>{run.how}</span>
      </div>
      <div className="tr">
        <b>What it does not show</b>
        <span>{run.notShown}</span>
      </div>
      <div className="tr">
        <b>Limitation</b>
        <span>{run.limitation}</span>
      </div>
      <div className="tr">
        <b>Evidence</b>
        <span>
          {run.unavailableSource ? <StatusMaterial material="dotted" /> : null}
          {run.unavailableSource ? " " : null}
          {run.evidence}
        </span>
      </div>
      {run.zeroFindings ? (
        <EmptyState title="No findings recorded.">This is not a statement that none exist. It only says no finding has been recorded.</EmptyState>
      ) : null}
      {run.withheld ? (
        <div className="withheld">Detail withheld. A real finding links to its responsible disclosure path here, not a blank.</div>
      ) : null}
      <div className="dock">
        <i className={review.recorded ? "lit" : undefined} aria-hidden="true" />
        <span>
          {review.recorded
            ? `Human review recorded by ${review.by}, ${review.at}.`
            : "Human review dock: unlit. No human review has been recorded."}
        </span>
      </div>
      {run.origin === "live" && run.detailUnavailable ? (
        <div className="tr" role="status">
          <b>Run detail</b>
          <span>{run.detailUnavailable}</span>
        </div>
      ) : null}
      {run.origin === "live" && detail ? (
        <>
          <div className="tr">
            <b>Agent progress</b>
            <span>
              {detail.agents.map((agent) => (
                <span key={agent.role}>
                  {agent.role}: {agent.status}{agent.errorCode ? ` (${agent.errorCode})` : ""}
                  {agent.providerReportedUsage?.totalTokens !== undefined ? ` · ${agent.providerReportedUsage.totalTokens} provider-reported tokens` : ""}
                  <br />
                </span>
              ))}
            </span>
          </div>
          {detail.events.length > 0 ? (
            <div className="tr">
              <b>Recorded events</b>
              <span>
                {detail.events.map((event, index) => (
                  <span key={`${event.at}-${index}`}>{event.at} · {event.stage} · {event.message}<br /></span>
                ))}
              </span>
            </div>
          ) : null}
          {detail.sources.length > 0 ? (
            <div className="tr">
              <b>Sources</b>
              <span>
                {detail.sources.map((source) => (
                  <span key={source.id}>
                    {source.status === "available" ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}
                    {` · ${source.status} · retrieved ${source.retrievedAt}`}
                    {source.sha256 ? ` · SHA-256 ${source.sha256}` : ""}
                    {source.errorCode ? ` · ${source.errorCode}` : ""}
                    <br />
                  </span>
                ))}
              </span>
            </div>
          ) : null}
          {detail.findings.length > 0 ? (
            <div className="tr">
              <b>Findings and evidence</b>
              <span>
                {detail.findings.map((finding) => (
                  <span key={finding.id}>
                    <b>{finding.modelAssessment} · {finding.evidenceStatus}</b>: {finding.claim}
                    {finding.rationale ? ` — ${finding.rationale}` : ""}
                    {finding.evidence.map((quote, index) => (
                      <span key={`${quote.sourceId}-${index}`}><br />{quote.exactQuoteMatched ? "Quote matched" : "Quote not verified"} ({quote.sourceId}): “{quote.quote}”</span>
                    ))}
                    <br />
                  </span>
                ))}
              </span>
            </div>
          ) : null}
          {detail.deterministicTests.length > 0 ? (
            <div className="tr">
              <b>Deterministic tests</b>
              <span>
                {detail.deterministicTests.map((test) => (
                  <span key={test.id}>{test.name}: {test.status}{test.exitCode !== undefined ? ` · exit ${test.exitCode}` : ""}{test.artifactSha256 ? ` · SHA-256 ${test.artifactSha256}` : ""}<br /></span>
                ))}
              </span>
            </div>
          ) : null}
          {detail.recommendations.length > 0 ? <div className="tr"><b>Recommendations</b><span>{detail.recommendations.join(" · ")}</span></div> : null}
        </>
      ) : null}
      <p className="wrapnote">By design, a run has no access to keys, signing or funds.</p>
    </aside>
  );
}

/** Security Swarm: runs with their evidence and limits. A finished run is never called safe. */
export function SecurityView() {
  const { model, actions } = useAppModel();
  const sec = model.security;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<ResearchTopicId>("security-evidence");
  const selected = sec.runs.find((r) => r.id === selectedId) ?? sec.runs[0];
  const canStartRun = sec.origin === "live"
    && sec.capabilities?.provider === "available"
    && sec.capabilities.worker === "available"
    && sec.capabilities.persistence === "available";
  return (
    <section className="route" aria-labelledby="h-sec">
      <div className="rhead">
        <h1 id="h-sec">Security Swarm</h1>
        <p>What the Swarm is working on, with its evidence and its limits.</p>
      </div>
      <Panel title="Research and tests" aside={sec.origin === "live" ? <Chip tone="neutral" material={sec.status === "ready" ? "solid" : "dotted"}>LIVE MODE</Chip> : sec.sourceTag ? <DemoChip>{sec.sourceTag}</DemoChip> : undefined}>
        <p className="core2">{CORE_SENTENCE}</p>
        <p className="corep2">{SWARM_PARAGRAPH}</p>
        {sec.origin === "live" && sec.capabilities ? (
          <dl className="kv" aria-label="Live service status">
            <div><dt>Provider</dt><dd>{sec.capabilities.provider}{sec.capabilities.providerName ? ` · ${sec.capabilities.providerName}` : ""}</dd></div>
            <div><dt>Worker</dt><dd>{sec.capabilities.worker}</dd></div>
            <div><dt>Persistence</dt><dd>{sec.capabilities.persistence}</dd></div>
            <div><dt>Approved sources</dt><dd>{sec.capabilities.sourceCount}</dd></div>
          </dl>
        ) : null}
        {sec.origin === "live" ? (
          <div className="acts-row" aria-label="Start live research">
            <label className="sr" htmlFor="live-research-topic">Research topic</label>
            <select id="live-research-topic" value={topicId} onChange={(event) => setTopicId(event.target.value as ResearchTopicId)}>
              <option value="mldsa-key-registration">ML-DSA key registration</option>
              <option value="robinhood-readonly-wallet">Robinhood read-only wallet</option>
              <option value="security-evidence">Security evidence</option>
            </select>
            <Button variant="primary" size="small" type="button" disabled={!canStartRun || sec.isCreating} onClick={() => actions.createSecurityRun(topicId)}>
              {sec.isCreating ? "Queueing…" : "Start research run"}
            </Button>
          </div>
        ) : null}
        {sec.origin === "live" && sec.capabilities && sec.capabilities.provider !== "available" ? (
          <p role="status">Live research execution is unavailable until a server-side model provider is configured and billing is approved. Existing run history remains live and inspectable.</p>
        ) : null}
        {sec.origin === "live" && sec.capabilities?.provider === "available" && !canStartRun ? (
          <p role="status">Research cannot be queued while the worker or database is unavailable. Existing history remains live and inspectable.</p>
        ) : null}
        {sec.origin === "live" && !sec.capabilities ? <p role="status">Checking provider availability. Existing live history remains separate from demo data.</p> : null}
        {sec.unavailableMessage ? <p role="status">{sec.unavailableMessage}</p> : null}
        {sec.actionMessage ? <p role="status">{sec.actionMessage}</p> : null}
        <div className="swarm-body">
          <ul className="runs" aria-label={sec.origin === "demo" ? "Example runs" : "Live research runs"}>
            {sec.status === "ready" &&
              sec.runs.map((r) => (
                <li key={r.id}>
                  <button type="button" className="run" aria-pressed={r.id === selected?.id} onClick={() => setSelectedId(r.id)}>
                    <span className="rt">
                      <span title={r.id}>{r.origin === "live" ? `${r.id.slice(0, 8)}…${r.id.slice(-4)}` : r.id}</span>
                      <span>{r.role}</span>
                    </span>
                    <span className="rg">{r.goal}</span>
                    <span>
                      <Chip tone={r.status.tone} material={r.status.material}>
                        {r.status.label}
                      </Chip>
                    </span>
                  </button>
                </li>
              ))}
            {sec.status === "loading" && (
              <EmptyState as="li" title="Loading live run history.">Checking the authenticated Security Research API. No example runs are substituted.</EmptyState>
            )}
            {sec.status === "empty" && (
              <EmptyState as="li" title="No runs recorded yet.">
                {sec.origin === "demo"
                  ? "This is not a statement that the system is safe. When a run is recorded, it appears here with its evidence and its limits."
                  : "The authenticated API returned no live runs. This is not a statement that the system is safe."}
              </EmptyState>
            )}
            {sec.status === "unavailable" && (
              <EmptyState as="li" title="Run feed unavailable.">
                {sec.unavailableMessage ?? "The live run feed is unavailable. No example data is substituted."}
              </EmptyState>
            )}
          </ul>
          {sec.status === "ready" && selected ? <RunDrawer run={selected} /> : null}
        </div>
        <p className="legend">
          <StatusMaterial material="outline" />
          <span>
            <b>{PASSED_LEGEND_PASSED}</b> {PASSED_LEGEND_BODY} <b>{PASSED_LEGEND_COMPLETED}</b> {PASSED_LEGEND_COMPLETED_BODY}
          </span>
        </p>
      </Panel>
    </section>
  );
}
