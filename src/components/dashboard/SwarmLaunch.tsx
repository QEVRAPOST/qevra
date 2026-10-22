"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { RESEARCH_TOPICS } from "@/lib/swarm-topics";
import { ILLUSTRATION_LAST } from "@/lib/swarm-view";
import type { ResearchTopicId, SecurityResearchCapabilities } from "@/types";

/** Why a new run cannot start right now, in a sentence. Null when it can. */
export function startBlocker(capabilities: SecurityResearchCapabilities | undefined): string | null {
  if (!capabilities) return "Checking what the research service can do. Saved runs can still be opened.";
  const blockers: string[] = [];
  if (capabilities.billing !== "available" || capabilities.unavailableReason === "ai_billing_not_approved") {
    blockers.push("AI billing has not been approved. After reviewing provider terms and cost, the project owner must explicitly authorize it; only then may an operator set QEVRA_AI_BILLING_APPROVED=true. VEYRA will not enable this or send a model request automatically.");
  }

  if (capabilities.provider !== "available") {
    switch (capabilities.unavailableReason) {
      case "ai_billing_not_approved":
        break;
      case "model_provider_credentials_missing":
        blockers.push("Model credentials are missing. An operator must configure QEVRA_AI_API_KEY and QEVRA_AI_MODEL in the private server and worker environment.");
        break;
      case "provider_configuration_invalid":
        blockers.push("Model provider configuration is invalid. An operator must correct the private provider settings and restart the server and worker.");
        break;
      case "model_provider_base_url_invalid":
      case "model_provider_requires_https":
        blockers.push("The provider URL is invalid or not HTTPS. An operator must correct QEVRA_AI_BASE_URL to a supported HTTPS endpoint (loopback HTTP is allowed for local development).");
        break;
      case "groq_gpt_oss_endpoint_invalid":
        blockers.push("The configured model and endpoint do not match the supported Groq profile. An operator must correct QEVRA_AI_MODEL and QEVRA_AI_BASE_URL together.");
        break;
      case "model_output_limit_invalid":
      case "free_plan_output_limit_invalid":
      case "model_request_limit_invalid":
      case "free_plan_request_limit_invalid":
      case "model_request_interval_invalid":
      case "free_plan_request_interval_invalid":
      case "model_source_limit_invalid":
      case "free_plan_source_limit_invalid":
      case "model_timeout_invalid":
        blockers.push("A model request limit is invalid. An operator must correct the QEVRA_AI_* limits to the supported ranges and restart the server and worker.");
        break;
      default:
        blockers.push(`The model provider is not ready${capabilities.providerName ? ` (${capabilities.providerName})` : ""}. An operator must review the provider configuration before new runs can start.`);
    }
  }

  if (capabilities.persistence !== "available") {
    blockers.push(capabilities.persistence === "not_configured"
      ? "Research persistence is not configured. An operator must set DATABASE_URL for the server and worker."
      : "Research persistence is unavailable. An operator must restore PostgreSQL connectivity and verify DATABASE_URL.");
  }

  if (capabilities.worker !== "available") {
    blockers.push(capabilities.persistence === "available"
      ? "No live research worker is registered. Start it from the repository root with bun run security:worker using the same private environment as the server."
      : "The research worker cannot be ready until PostgreSQL is available; then start it with bun run security:worker using the same private environment as the server.");
  }

  if (capabilities.sourceCount <= 0) {
    blockers.push("No approved research sources are configured. An operator must restore an allowlisted source for the selected topic.");
  }

  return blockers.length > 0
    ? `New research runs cannot start. ${blockers.join(" ")} Saved reports remain available.`
    : null;
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
  capabilityMessage?: string;
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
export function SwarmLaunch({ live, capabilities, topicId, onTopic, onStart, canStart, isCreating, blocker, capabilityMessage, step, onIllustrate, onNext, onStop }: LaunchProps) {
  const uid = useId();
  const uncheckedStatus = capabilityMessage ? "Could not be checked" : "Checking";
  const providerStatus = !capabilities
    ? uncheckedStatus
    : capabilities.unavailableReason === "ai_billing_not_approved"
      ? "Billing approval required"
      : capabilities.providerName ?? (capabilities.provider === "available" ? "Available" : "Unavailable");
  const billingStatus = !capabilities
    ? uncheckedStatus
    : capabilities.billing === "available"
      ? "Owner approval recorded"
      : capabilities.billing === "not_configured"
        ? "Owner approval required"
        : capabilities.billing;
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
          <div><dt>AI billing approval</dt><dd>{billingStatus}</dd></div>
          <div><dt>Worker</dt><dd>{capabilities?.worker ?? uncheckedStatus}</dd></div>
          <div><dt>Persistence</dt><dd>{capabilities?.persistence ?? uncheckedStatus}</dd></div>
          <div><dt>Approved sources</dt><dd>{capabilities?.sourceCount ?? uncheckedStatus}</dd></div>
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
