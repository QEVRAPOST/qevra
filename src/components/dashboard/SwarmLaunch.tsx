"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { RESEARCH_TOPICS } from "@/lib/swarm-topics";
import { ILLUSTRATION_LAST } from "@/lib/swarm-view";
import type { ResearchTopicId, SecurityResearchCapabilities } from "@/types";

/** Why a new run cannot start right now, in a sentence. Null when it can. */
export function startBlocker(capabilities: SecurityResearchCapabilities | undefined): string | null {
  if (!capabilities) return "Checking what the research service can do. Saved runs can still be opened.";
  if (capabilities.unavailableReason === "ai_billing_not_approved") {
    return "New runs are unavailable because model billing has not been approved. Saved reports remain available.";
  }
  if (capabilities.provider !== "available") return "New runs cannot start: no model provider is available. Saved runs can still be opened.";
  if (capabilities.worker !== "available") return "New runs cannot start: the worker is unavailable. Saved runs can still be opened.";
  if (capabilities.persistence !== "available") return "New runs cannot start: the database is unavailable. Saved runs can still be opened.";
  return null;
}

interface LaunchProps {
  live: boolean;
  capabilities?: SecurityResearchCapabilities;
  topicId: ResearchTopicId;
  onTopic: (id: ResearchTopicId) => void;
  /** live: queue a real run */
  onStart: () => void;
  canStart: boolean;
  isCreating: boolean;
  blocker: string | null;
  capabilitiesUnavailable?: boolean;
  /** example mode: the illustrative walkthrough. `step` is null when it is not running. */
  step: number | null;
  onIllustrate: () => void;
  onNext: () => void;
  onStop: () => void;
}

/**
 * Step one and two of a run: choose a topic, then start it. In live mode the button queues a real run, and only when the
 * service says it can. In example mode there is no run to start; the visitor can instead watch an illustration of one.
 */
export function SwarmLaunch({ live, capabilities, topicId, onTopic, onStart, canStart, isCreating, blocker, capabilitiesUnavailable = false, step, onIllustrate, onNext, onStop }: LaunchProps) {
  const uid = useId();
  const providerStatus = capabilitiesUnavailable
    ? "Not exposed to wallet sessions"
    : !capabilities
    ? "Checking"
    : capabilities.unavailableReason === "ai_billing_not_approved"
      ? "Billing approval required"
      : capabilities.providerName ?? (capabilities.provider === "available" ? "Available" : "Unavailable");
  return (
    <section className="sw-launch" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className="ov-h">1 · Choose a topic</h2>
      <div className="sw-topics" role="radiogroup" aria-labelledby={`${uid}-h`}>
        {RESEARCH_TOPICS.map((t) => (
          <label key={t.id} className={`sw-topic${topicId === t.id ? " on" : ""}`}>
            <input type="radio" name={`${uid}-topic`} value={t.id} checked={topicId === t.id} onChange={() => onTopic(t.id)} />
            <span className="sw-t">{t.label}</span>
            <span className="sw-a">{t.about}</span>
          </label>
        ))}
      </div>
      {live ? (
        <dl className="kv sw-launch-availability" aria-label="Research service availability">
          <div><dt>Provider</dt><dd>{providerStatus}</dd></div>
          <div><dt>Worker</dt><dd>{capabilitiesUnavailable ? "Not exposed to wallet sessions" : capabilities?.worker ?? "Checking"}</dd></div>
          <div><dt>Persistence</dt><dd>{capabilitiesUnavailable ? "Saved report API available" : capabilities?.persistence ?? "Checking"}</dd></div>
          <div><dt>Approved sources</dt><dd>{capabilitiesUnavailable ? "Not exposed to wallet sessions" : capabilities?.sourceCount ?? "Checking"}</dd></div>
        </dl>
      ) : null}
      <div className="sw-go">
        <h2 className="ov-h">2 · Start</h2>
        {live ? (
          <>
            <Button variant="primary" type="button" disabled={!canStart || isCreating} onClick={onStart}>
              {isCreating ? "Queueing…" : "Create research run"}
            </Button>
            <p className="sw-hint" id={`${uid}-hint`}>
              {blocker ?? "A run asks the configured model provider to read this topic’s approved public sources, in three stages. It cannot reach keys, sign, or move funds, and what it returns is model output, not an audit."}
            </p>
          </>
        ) : (
          <>
            {step === null ? (
              <Button variant="primary" type="button" onClick={onIllustrate}>
                Watch an illustration
              </Button>
            ) : (
              <div className="sw-ill">
                <Button variant="ghost" type="button" onClick={onNext} disabled={step >= ILLUSTRATION_LAST}>
                  Next step
                </Button>
                <Button variant="ghost" type="button" onClick={onStop}>
                  Stop
                </Button>
              </div>
            )}
            <p className="sw-hint">
              Example mode cannot start a real run, and no agent runs here. The illustration replays the order of a run so you can see how it looks. It is not a result.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
