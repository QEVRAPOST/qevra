"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { brandizeProjectName, PROJECT_NAME } from "@/lib/project-brand";
import {
  PASSED_LEGEND_BODY,
  PASSED_LEGEND_COMPLETED,
  PASSED_LEGEND_COMPLETED_BODY,
  PASSED_LEGEND_PASSED,
  SWARM_PARAGRAPH,
} from "@/lib/content/copy-lock";
import { useIllustration } from "@/lib/use-illustration";
import { illustrationModel, JOURNEY, journeyPhase, pipelineFor } from "@/lib/swarm-view";
import { DEFAULT_RESEARCH_TOPIC_ID } from "@/features/security/topics";
import type { ResearchTopicId } from "@/types";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";
import { startBlocker, SwarmLaunch } from "./SwarmLaunch";
import { SwarmPipeline } from "./SwarmPipeline";
import { SwarmRunDetail } from "./SwarmRunDetail";
import { RunHistoryItem } from "./RunHistoryItem";
import { LiveAccessGate, useLiveResearchAccess } from "@/features/dashboard/LiveAppProvider";
import { AUTH_ENTRY_OPEN_EVENT } from "@/components/auth/AuthEntryControl";
import type { ResearchGateState } from "@/features/dashboard/live-ui-state";

/** The four phases of one run, as a trail. The current phase is marked; earlier ones are done. */
function Trail({ phase }: { phase: number }) {
  return (
    <ol className="sw-trail" aria-label="The steps of a research run">
      {JOURNEY.map((name, i) => (
        <li key={name} className={i < phase ? "done" : i === phase ? "cur" : ""} aria-current={i === phase ? "step" : undefined}>
          <span className="sw-tn" aria-hidden="true">{i + 1}</span>
          {name}
        </li>
      ))}
    </ol>
  );
}

export function researchSessionBlocker(gate: ResearchGateState | undefined): string | null {
  switch (gate) {
    case "authenticated": return null;
    case "checking": return "Checking for a server-verified research session. Run creation and saved reports stay protected until the check completes.";
    case "unauthenticated": return "Email/password sign-in opens your VEYRA Account but does not grant wallet research access. Wallet-owned saved reports and creating a research run require a wallet research session. This does not sign out your VEYRA Account; it remains a separate session. Explicitly approve an EIP-191 wallet sign-in only when you want those protected research functions.";
    case "not_configured": return "Wallet-owned research history remains protected because wallet research authorization is not configured on this server. New runs are unavailable.";
    case "rate_limited": return "The research session check is rate-limited. Wait before retrying; saved reports and new runs remain protected.";
    case "service_error": return "The research session check failed. Retry the check before opening protected reports or creating a run.";
    default: return "Research authorization could not be confirmed. Protected reports and new runs remain unavailable.";
  }
}

export function researchCreationBlockerFromAction(actionMessage: string | undefined): string | null {
  const message = actionMessage?.toLowerCase() ?? "";
  if (message.includes("research_run_owner_allowlist_not_configured")) {
    return "Run creation is disabled because the server-side wallet owner allowlist is not configured. Existing authorized reports remain available.";
  }
  if (message.includes("research_run_wallet_not_allowed")) {
    return "This wallet is not on the server-side research owner allowlist. Run creation stays disabled; existing reports remain subject to their owner access rules.";
  }
  if (message.includes("research_run_access_mode_not_configured")) {
    return "Run creation is disabled because the server-side research access mode is not configured.";
  }
  if (message.includes("research_run_access_mode_invalid")) {
    return "Run creation is disabled because the server-side research access mode is invalid. An operator must choose owner_only or public_limited.";
  }
  if (message.includes("research_run_limits_not_configured")) {
    return "Run creation is disabled until the server-side wallet cooldown and global quota limits are configured.";
  }
  if (message.includes("research_run_limits_invalid")) {
    return "Run creation is disabled because a configured quota is invalid or exceeds its hard safety cap.";
  }
  if (message.includes("research_run_wallet_cooldown")) {
    return "This wallet is still within its research run cooldown period.";
  }
  if (message.includes("research_run_global_hourly_quota")) {
    return "The global hourly research quota is reached. Try again after the rolling hour.";
  }
  if (message.includes("research_run_global_daily_quota")) {
    return "The global daily research quota is reached. Try again after the rolling 24-hour window.";
  }
  if (message.includes("research_run_max_active_runs")) {
    return "The maximum number of active research runs is reached. Wait for one to finish.";
  }
  return null;
}

/**
 * Security Swarm: the centre of the app. Choose a topic, start a run, watch the three agents, then read the evidence and its
 * limits. Saved runs are the history. A finished run is never called safe, audited or approved.
 */
function SecurityResearchView({ accessNotice }: { accessNotice?: ReactNode } = {}) {
  const { model, actions } = useAppModel();
  const researchAccess = useLiveResearchAccess();
  const sec = model.security;
  const live = sec.origin === "live";
  const detailId = useId();
  const pipeRef = useRef<HTMLDivElement>(null);
  const wanted = useSearchParams().get("run");
  const [selectedId, setSelectedId] = useState<string | null>(wanted);
  const [seenWanted, setSeenWanted] = useState<string | null>(wanted);
  const requestedRunId = useRef<string | null>(null);
  /* a run the service has just persisted is shown at once: adjusted during render, once per new id */
  const [seenPreferred, setSeenPreferred] = useState<string | undefined>(undefined);
  const [topicId, setTopicId] = useState<ResearchTopicId>(DEFAULT_RESEARCH_TOPIC_ID);
  const loadResearchRun = researchAccess?.loadResearchRun;
  if (wanted !== seenWanted) {
    setSeenWanted(wanted);
    setSelectedId(wanted);
  }
  useEffect(() => {
    if (!wanted) requestedRunId.current = null;
  }, [wanted]);
  useEffect(() => {
    if (live && wanted && requestedRunId.current !== wanted && !sec.runs.some((run) => run.id === wanted)) {
      requestedRunId.current = wanted;
      void loadResearchRun?.(wanted);
    }
  }, [live, wanted, sec.runs, loadResearchRun]);
  if (sec.preferredRunId && sec.preferredRunId !== seenPreferred) {
    setSeenPreferred(sec.preferredRunId);
    setSelectedId(sec.preferredRunId);
  }
  /* the example-mode walkthrough: step is null when it is not playing */
  const ill = useIllustration();
  const step = ill.step;
  const selected = sec.runs.find((r) => r.id === selectedId) ?? (live && wanted ? undefined : sec.runs[0]);
  const illustrating = step !== null;
  const pipeline = illustrating ? illustrationModel(step) : selected ? pipelineFor(selected) : null;
  const capabilityMessage = live ? researchAccess?.capabilityMessage : undefined;
  const sessionBlocker = live ? researchSessionBlocker(researchAccess?.gate) : null;
  const runCreationBlocker = live ? researchCreationBlockerFromAction(sec.actionMessage) : null;
  const blocker = live ? sessionBlocker ?? runCreationBlocker ?? capabilityMessage ?? startBlocker(sec.capabilities) : null;
  const availabilityMessage = live ? sessionBlocker ?? capabilityMessage : undefined;
  const canStart = live && researchAccess?.gate === "authenticated" && blocker === null;
  const phase = journeyPhase(pipeline, illustrating ? undefined : selected, canStart);

  /* On a phone the history is below the pipeline: choosing a run brings its pipeline and detail into view. */
  const choose = (id: string) => {
    ill.stop();
    setSelectedId(id);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches) {
      requestAnimationFrame(() => pipeRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }));
    }
  };

  return (
    <section className="route sw" aria-labelledby="h-sec">
      <PageHead id="h-sec" kicker="Security Swarm · research workspace" title="Security Swarm" lede="Choose a topic, start a run when the service is available, and review saved findings and evidence." />
      {accessNotice}
      {live && researchAccess?.gate === "authenticated" ? (
        <p className="sw-access-identity" role="status">
          {researchAccess.authenticationMethod === "wallet" ? "Wallet research session" : "Operator administration session"}
          {researchAccess.authenticatedAddress ? <> · <code>{researchAccess.authenticatedAddress}</code></> : null}
        </p>
      ) : null}
      <div className="sw-ws">
        <aside className="sw-side" aria-label="Research setup and saved runs">
          <SwarmLaunch
            live={live}
            capabilities={live ? sec.capabilities : undefined}
            topicId={topicId}
            onTopic={setTopicId}
            onStart={() => actions.createSecurityRun(topicId)}
            canStart={canStart}
            isCreating={!!sec.isCreating}
            blocker={blocker}
            capabilityMessage={availabilityMessage}
            step={step}
            onIllustrate={ill.start}
            onNext={ill.next}
            onStop={ill.stop}
          />
          {sec.unavailableMessage && (!live || researchAccess?.gate === "authenticated") ? <p role="status" className="sw-hint">{sec.unavailableMessage}</p> : null}
          {sec.actionMessage ? <p role="status" className="sw-hint">{sec.actionMessage}</p> : null}
          <div className="sb-hist">
            <h2 className="ov-h">Recent saved runs</h2>
            <ul className="runs" aria-label={live ? "Live research runs" : "Simulated research runs"} aria-busy={sec.status === "loading" || undefined}>
              {live && researchAccess?.gate !== "authenticated" ? (
                <EmptyState as="li" title={researchAccess?.gate === "checking" ? "Checking research access." : "Wallet-owned reports remain protected."}>
                  {researchAccess?.gate === "unauthenticated"
                    ? "No saved report is shown without a verified research session. Wallet-owned reports appear only after explicit EIP-191 wallet verification; no report is substituted here."
                    : researchSessionBlocker(researchAccess?.gate)}
                </EmptyState>
              ) : sec.status === "ready" &&
                sec.runs.map((r) => {
                  return (
                    <RunHistoryItem
                      key={r.id}
                      run={r}
                      selected={r.id === selected?.id}
                      illustrating={illustrating}
                      detailId={detailId}
                      onSelect={choose}
                    />
                  );
                })}
              {(!live || researchAccess?.gate === "authenticated") && sec.status === "loading" && (
                <EmptyState as="li" title="Loading live run history.">Checking the authenticated Security Research API. No simulated runs are substituted.</EmptyState>
              )}
              {(!live || researchAccess?.gate === "authenticated") && sec.status === "empty" && (
                <EmptyState as="li" title="No runs recorded yet.">
                  {live
                    ? "Choose a topic and start the first run when service availability permits. It appears here with its evidence and its limits. This is not a statement that the system is safe."
                    : "This is not a statement that the system is safe. When a run is recorded, it appears here with its evidence and its limits."}
                </EmptyState>
              )}
              {(!live || researchAccess?.gate === "authenticated") && sec.status === "unavailable" && (
                <EmptyState as="li" title="Run feed unavailable.">
                  {sec.unavailableMessage ?? "The live run feed is unavailable. No simulated data is substituted."}
                </EmptyState>
              )}
              {(!live || researchAccess?.gate === "authenticated") && sec.status === "ready" && live && wanted && !sec.runs.some((run) => run.id === wanted) ? (
                <EmptyState as="li" title="Loading the requested run.">Looking up this saved run directly from the authenticated Security Research API.</EmptyState>
              ) : null}
            </ul>
          </div>
          <details className="sw-about">
            <summary>What the Swarm does, and what it cannot do</summary>
            <p>{brandizeProjectName(SWARM_PARAGRAPH, PROJECT_NAME)}</p>
          </details>
        </aside>

        <div className="sw-main" ref={pipeRef}>
          <Trail phase={phase} />
          <div className="sw-stage">
            <SwarmPipeline key={illustrating ? "illustration" : (selected?.id ?? "guide")} model={pipeline} />
          </div>
          <div id={detailId} className="sb-detail">
            <h2 className="ov-h">Evidence</h2>
            {illustrating ? (
              <aside className="drawer is-example">
                <h3>This is an illustration, not a run</h3>
                <p className="dnote">
                  Nothing is running and nothing was read. It shows the order of a real run. When a run is recorded, its findings, quotes, sources, limits and recorded events appear here.
                </p>
              </aside>
            ) : sec.status === "ready" && selected ? (
              <SwarmRunDetail key={selected.id} run={selected} headingId={`${detailId}-h`} />
            ) : live && researchAccess?.gate !== "authenticated" ? (
              <p className="dnote">Authorized saved reports display their actual sources, findings, limitations, stage events, and human-review status here. No historical report or agent activity is substituted.</p>
            ) : (
              <p className="dnote">Choose a run to read its evidence.</p>
            )}
          </div>
        </div>
      </div>
      <p className="legend">
        <StatusMaterial material="outline" />
        <span>
          <b>{PASSED_LEGEND_PASSED}</b> {PASSED_LEGEND_BODY} <b>{PASSED_LEGEND_COMPLETED}</b> {PASSED_LEGEND_COMPLETED_BODY}
        </span>
      </p>
    </section>
  );
}

export function SecurityResearchAccess({
  gate,
  message,
  walletAuthConfigured,
  onRetry,
}: {
  gate: ResearchGateState;
  message?: string;
  walletAuthConfigured: boolean;
  onRetry: () => void;
}) {
  const liveAccess = useLiveResearchAccess();
  if (gate === "authenticated") return null;
  const detail = message ?? researchSessionBlocker(gate);
  return (
    <>
      <aside className="sw-session-note" aria-label="Research session access" role={gate === "service_error" ? "alert" : "status"}>
        <div>
          <p className="sw-access-kicker">Protected research access</p>
          <p>{detail}</p>
        </div>
        {gate === "unauthenticated" && walletAuthConfigured ? (
          <Button variant="ghost" onClick={() => window.dispatchEvent(new CustomEvent(AUTH_ENTRY_OPEN_EVENT, { detail: { step: "wallet" } }))}>
            Verify wallet for research
          </Button>
        ) : null}
        {gate === "service_error" || gate === "rate_limited" ? (
          <Button variant="ghost" onClick={onRetry}>Retry access check</Button>
        ) : null}
      </aside>
      {liveAccess?.operatorAuthConfigured ? (
        <LiveAccessGate
          gate={gate}
          message={message}
          wallet={liveAccess.wallet}
          selectedNetwork={liveAccess.selectedNetwork}
          walletAuthConfigured={liveAccess.walletAuthConfigured}
          operatorAuthConfigured={liveAccess.operatorAuthConfigured}
          onLogin={liveAccess.login}
          onRetry={onRetry}
          walletLoginEnabled={false}
        />
      ) : null}
    </>
  );
}

export function SecurityView() {
  const access = useLiveResearchAccess();
  return <SecurityResearchView accessNotice={access ? <SecurityResearchAccess gate={access.gate} message={access.message} walletAuthConfigured={access.walletAuthConfigured} onRetry={access.retry} /> : undefined} />;
}
