"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
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
import type { ResearchTopicId } from "@/types";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";
import { startBlocker, SwarmLaunch } from "./SwarmLaunch";
import { SwarmPipeline } from "./SwarmPipeline";
import { SwarmRunDetail } from "./SwarmRunDetail";
import { RunHistoryItem } from "./RunHistoryItem";
import { LiveAccessGate, useLiveResearchAccess } from "@/features/dashboard/LiveAppProvider";
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

/**
 * Security Swarm: the centre of the app. Choose a topic, start a run, watch the three agents, then read the evidence and its
 * limits. Saved runs are the history. A finished run is never called safe, audited or approved.
 */
function SecurityResearchView() {
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
  const [topicId, setTopicId] = useState<ResearchTopicId>("security-evidence");
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
  const capabilitiesUnavailable = live && researchAccess?.authenticationMethod === "wallet" && !sec.capabilities;
  const blocker = live
    ? capabilitiesUnavailable
      ? "New runs are disabled because wallet sessions cannot read provider, worker, and billing availability. Saved reports remain available."
      : startBlocker(sec.capabilities)
    : null;
  const canStart = live && blocker === null;
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
            capabilitiesUnavailable={capabilitiesUnavailable}
            step={step}
            onIllustrate={ill.start}
            onNext={ill.next}
            onStop={ill.stop}
          />
          {sec.unavailableMessage ? <p role="status" className="sw-hint">{sec.unavailableMessage}</p> : null}
          {sec.actionMessage ? <p role="status" className="sw-hint">{sec.actionMessage}</p> : null}
          <div className="sb-hist">
            <h2 className="ov-h">Recent saved runs</h2>
            <ul className="runs" aria-label={live ? "Live research runs" : "Simulated research runs"} aria-busy={sec.status === "loading" || undefined}>
              {sec.status === "ready" &&
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
              {sec.status === "loading" && (
                <EmptyState as="li" title="Loading live run history.">Checking the authenticated Security Research API. No simulated runs are substituted.</EmptyState>
              )}
              {sec.status === "empty" && (
                <EmptyState as="li" title="No runs recorded yet.">
                  {live && capabilitiesUnavailable
                    ? "No wallet-owned runs are recorded yet. The service has not exposed its provider, worker, and billing availability to wallet sessions, so new runs remain disabled."
                    : live
                      ? "Choose a topic and start the first run. It appears here with its evidence and its limits. This is not a statement that the system is safe."
                    : "This is not a statement that the system is safe. When a run is recorded, it appears here with its evidence and its limits."}
                </EmptyState>
              )}
              {sec.status === "unavailable" && (
                <EmptyState as="li" title="Run feed unavailable.">
                  {sec.unavailableMessage ?? "The live run feed is unavailable. No simulated data is substituted."}
                </EmptyState>
              )}
              {sec.status === "ready" && live && wanted && !sec.runs.some((run) => run.id === wanted) ? (
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

export function SecurityPublicEntry({ children }: { children: ReactNode }) {
  return (
    <section className="route sw sw-entry" aria-labelledby="h-sec-public">
      <PageHead
        id="h-sec-public"
        kicker="Security Swarm · research workspace"
        title="Security Swarm"
        lede="Review public-source research, saved evidence, and stated limitations. Wallet-owned history and new runs require a research sign-in."
      />
      <section className="sw-access" aria-labelledby="sw-access-h">
        <div className="sw-access-heading">
          <p className="sw-access-kicker">Protected research functions</p>
          <h2 id="sw-access-h">Research Access</h2>
          <p>Wallet-owned saved reports and permitted research actions require a server-verified sign-in. Public wallet and network features stay available without it.</p>
        </div>
        {children}
      </section>
    </section>
  );
}

export function SecurityResearchAccess({
  gate,
  message,
  onLogin,
  onRetry,
  children,
}: {
  gate: ResearchGateState;
  message?: string;
  onLogin: (token: string) => Promise<void>;
  onRetry: () => void;
  children?: ReactNode;
}) {
  const liveAccess = useLiveResearchAccess();
  if (gate === "authenticated") return children;

  return (
    <SecurityPublicEntry>
      <LiveAccessGate
        gate={gate}
        message={message}
        wallet={liveAccess?.wallet}
        selectedNetwork={liveAccess?.selectedNetwork}
        walletAuthConfigured={liveAccess?.walletAuthConfigured}
        operatorAuthConfigured={liveAccess?.operatorAuthConfigured}
        signInChallenge={liveAccess?.signInChallenge}
        signInBusy={liveAccess?.signInBusy}
        signInError={liveAccess?.signInError}
        onRequestWalletSignIn={liveAccess?.requestWalletSignIn}
        onApproveWalletSignIn={liveAccess?.approveWalletSignIn}
        onCancelWalletSignIn={liveAccess?.cancelWalletSignIn}
        onConnectWallet={liveAccess?.connectWallet}
        onLogin={onLogin}
        onRetry={onRetry}
      />
    </SecurityPublicEntry>
  );
}

export function SecurityView() {
  const access = useLiveResearchAccess();
  if (!access) return <SecurityResearchView />;

  return (
    <SecurityResearchAccess gate={access.gate} message={access.message} onLogin={access.login} onRetry={access.retry}>
      <SecurityResearchView />
    </SecurityResearchAccess>
  );
}
