"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimTag } from "@/components/ui/SimTag";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { buildReadiness, type ReadinessRow } from "@/lib/app-readiness";
import { brandizeProjectName, PROJECT_NAME } from "@/lib/project-brand";
import { illustrationModel, pipelineFor, runBadge } from "@/lib/swarm-view";
import { useIllustration } from "@/lib/use-illustration";
import { useAppModel } from "./DemoAppProvider";
import { MiniPipeline, SwarmPipeline } from "./SwarmPipeline";

function Row({ r }: { r: ReadinessRow }) {
  return (
    <li>
      <span className="ov-k">{r.label}</span>
      <b className={`ov-v tone-${r.tone}`}>
        <StatusMaterial material={r.material} />
        {r.value}
      </b>
      <span className="ov-d">{r.detail}</span>
      <Link className="ov-l" href={r.href}>
        {r.linkLabel}
        <span aria-hidden="true">→</span>
      </Link>
    </li>
  );
}

/**
 * The first screen of the app. A large canvas shows the real shape of the product (the three agents and the separate human
 * review); beneath it, plainly, what can be done today and what is switched off. In live mode the canvas shows the latest run
 * exactly as recorded; in the preview it is a reference the visitor can play an illustration on. Nothing moves on its own.
 */
export function OverviewView() {
  const { model } = useAppModel();
  const live = model.mode === "live";
  const rows = buildReadiness(model);
  const sec = model.security;
  const latest = sec.runs.slice(0, 3);
  const ill = useIllustration();
  const lastRun = live && sec.status === "ready" ? sec.runs[0] : undefined;
  const canvas = ill.step !== null ? illustrationModel(ill.step) : lastRun ? pipelineFor(lastRun) : null;

  return (
    <section className="route ov" aria-labelledby="h-ov">
      <header className="ov-hero">
        <p className="pg-kick">Overview</p>
        <h1 id="h-ov">
          Research first. <em>You approve every transaction.</em>
        </h1>
        <p className="pg-lede">
          {brandizeProjectName(
            live
              ? "VEYRA provides read-only EVM wallet access and wallet-authenticated Security Swarm research. Robinhood Mainnet swaps use an external wallet and require a live quote, chain preflight, and explicit wallet confirmation. Reports are research, not audits. PQ smart-account custody is unavailable; off-chain ML-DSA attestations do not protect EVM execution."
              : "This demo uses simulated workspace data. Configured live builds support read-only EVM wallet access, wallet-authenticated Security Swarm research, and a quote-gated Robinhood Mainnet swap flow through an external wallet. PQ smart-account custody is unavailable.",
            PROJECT_NAME,
          )}
        </p>
        <div className="ov-cta">
          <Link className={buttonVariants({ variant: "primary" })} href="/app/security">
            Explore Security Swarm
          </Link>
          <Link className="ov-l" href="/app/activity">
            View research activity<span aria-hidden="true">→</span>
          </Link>
        </div>
      </header>

      <div className="ov-stage sw-stage">
        <SwarmPipeline
          model={canvas}
          compact
          title={lastRun && ill.step === null ? "Latest run" : "How a run works"}
          actions={
            ill.step !== null ? (
              <>
                <Button variant="ghost" size="small" onClick={ill.next} disabled={ill.step >= 4}>
                  Next step
                </Button>
                <Button variant="ghost" size="small" onClick={ill.stop}>
                  Stop
                </Button>
              </>
            ) : lastRun ? (
              <Link className="ov-l" href={`/app/security?run=${encodeURIComponent(lastRun.id)}`}>
                Open this run<span aria-hidden="true">→</span>
              </Link>
            ) : !live ? (
              <Button variant="ghost" size="small" onClick={ill.start}>
                Trace a run
              </Button>
            ) : null
          }
        />
      </div>

      <div className="ov-cols">
        <section aria-labelledby="h-ov-now">
          <h2 id="h-ov-now" className="ov-h">Available now</h2>
          <ul className="ov-list">
            {rows.filter((r) => r.group === "now").map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        </section>
        <section aria-labelledby="h-ov-off">
          <h2 id="h-ov-off" className="ov-h">Not available</h2>
          <ul className="ov-list">
            {rows.filter((r) => r.group === "off").map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        </section>
        <section aria-labelledby="h-ov-latest" className="ov-latest">
          <h2 id="h-ov-latest" className="ov-h">Latest research</h2>
          {live && sec.accessState === "checking" ? <EmptyState title="Checking Security Swarm access.">Public wallet and network information remain available while the research session is checked.</EmptyState> : null}
          {live && sec.accessState === "unauthenticated" ? <EmptyState title="Sign in to view research history.">Saved research and new runs require a wallet research sign-in or separate operator administration session. Public wallet and network information remain available. <Link href="/app/security">Sign in to Security Swarm</Link>.</EmptyState> : null}
          {live && sec.accessState === "not_configured" ? <EmptyState title="Research sign-in is not configured.">The server has not configured wallet user sessions or operator administration. Public wallet and network information remain available.</EmptyState> : null}
          {live && (sec.accessState === "service_error" || sec.accessState === "rate_limited") ? <EmptyState title={sec.accessState === "rate_limited" ? "Security Swarm access is rate-limited." : "Security Swarm access is unavailable."}>{sec.unavailableMessage ?? "Research access could not be checked. Public wallet and network information remain available."} <Link href="/app/security">Open Security Swarm</Link>.</EmptyState> : null}
          {(!live || sec.accessState === "authenticated") && sec.status === "loading" ? <EmptyState title="Loading live run history.">Checking the authenticated Security Research API. No simulated runs are substituted.</EmptyState> : null}
          {(!live || sec.accessState === "authenticated") && sec.status === "unavailable" ? <EmptyState title="Run history unavailable.">{sec.unavailableMessage ?? "The run feed is not connected. This is not a statement that there are no runs, or that the system is safe."}</EmptyState> : null}
          {(!live || sec.accessState === "authenticated") && sec.status === "empty" ? <EmptyState title="No runs recorded yet.">{live ? sec.unavailableMessage ?? "Start the first run in the Security Swarm. It will appear here." : "When a run is recorded it appears here with its evidence and its limits."}</EmptyState> : null}
          {(!live || sec.accessState === "authenticated") && sec.status === "ready" ? (
            <ul className="ov-runs">
              {latest.map((r) => {
                const badge = runBadge(r);
                return (
                  <li key={r.id}>
                    <Link href={`/app/security?run=${encodeURIComponent(r.id)}`}>
                      <span className="ov-rg">{r.goal}</span>
                      <span className="ov-rm">
                        {r.exampleTag ? <SimTag /> : null}
                        <Chip tone={badge.tone} material={badge.material}>{badge.label}</Chip>
                        <MiniPipeline model={pipelineFor(r)} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p className="ov-note">A finished run is research output, not an audit, a passed test or an approval.</p>
        </section>
      </div>
    </section>
  );
}
