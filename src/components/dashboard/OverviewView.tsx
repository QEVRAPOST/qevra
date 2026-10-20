"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { Chip, DemoChip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { buildReadiness } from "@/lib/app-readiness";
import { brandizeProjectName, PROJECT_NAME } from "@/lib/project-brand";
import { pipelineFor, runBadge } from "@/lib/swarm-view";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";
import { MiniPipeline, SwarmPipeline } from "./SwarmPipeline";

/**
 * The first screen of the app. It answers four questions in order: what is this, what can I do today, where do I start,
 * and what is not real yet. Everything it shows comes from the app model, so example and live data are never mixed.
 */
export function OverviewView() {
  const { model } = useAppModel();
  const live = model.mode === "live";
  const rows = buildReadiness(model);
  const swarm = rows.find((r) => r.id === "swarm")!;
  const wallet = rows.find((r) => r.id === "wallet")!;
  const sec = model.security;
  const latest = sec.runs.slice(0, 3);

  const journey = [
    {
      n: 1,
      title: "Look, if you want to",
      body: live
        ? "Connect a wallet to see its public balance. It is optional, and nothing is requested until you press the button."
        : "In example mode the wallet is a pretend one. It shows what a read-only connection will look like.",
      href: "/app/wallet",
      link: wallet.linkLabel,
      state: live ? (model.wallet.connection?.address ? "Connected" : "Optional") : "Example",
    },
    {
      n: 2,
      title: "Run research",
      body: "Choose an approved topic. Three agents read its public sources in turn: Research, Analysis, then Verification.",
      href: "/app/security",
      link: swarm.linkLabel,
      state: swarm.value,
    },
    {
      n: 3,
      title: "Read the evidence and the limits",
      body: "Open a run to see its findings, quotes, sources and what it does not show. A person still has to review it.",
      href: "/app/activity",
      link: "Open research history",
      state: sec.runs.length > 0 ? `${sec.runs.length} ${live ? "saved" : "example"} ${sec.runs.length === 1 ? "run" : "runs"}` : "No runs yet",
    },
  ];

  return (
    <section className="route ov" aria-labelledby="h-ov">
      <PageHead
        id="h-ov"
        kicker="Overview"
        title="What you can do today"
        lede={brandizeProjectName(
          live
            ? "QEVRA is an experimental post-quantum wallet project for Robinhood Chain. Today you can read a wallet and run public-source research in the Security Swarm. Swaps, accounts and signing are not built."
            : "QEVRA is an experimental post-quantum wallet project for Robinhood Chain. This is a design preview: every wallet, run and number you see is an example. Nothing here can move funds.",
          PROJECT_NAME,
        )}
        extra={
          <div className="ov-cta">
            <Link className={buttonVariants({ variant: "primary" })} href="/app/security">
              {live && swarm.value === "Ready to research" ? "Start a research run" : live ? "Open the Security Swarm" : "See how a run works"}
            </Link>
            <Link className={buttonVariants({ variant: "ghost" })} href="/app/wallet">
              {live ? "Connect a wallet, read-only" : "Open the example wallet"}
            </Link>
          </div>
        }
      />

      <section className="ov-ready" aria-labelledby="h-ov-ready">
        <h2 id="h-ov-ready" className="ov-h">Where things stand</h2>
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
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
          ))}
        </ul>
      </section>

      <section className="ov-journey" aria-labelledby="h-ov-start">
        <h2 id="h-ov-start" className="ov-h">Start here</h2>
        <ol>
          {journey.map((s) => (
            <li key={s.n}>
              <span className="ov-n" aria-hidden="true">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <span className="ov-st">{s.state}</span>
              <Link className="ov-l" href={s.href}>
                {s.link}
                <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <SwarmPipeline model={null} />

      <section className="ov-latest" aria-labelledby="h-ov-latest">
        <div className="ov-lh">
          <h2 id="h-ov-latest" className="ov-h">Latest research</h2>
          {live ? <Chip tone="neutral" material="outline">LIVE RUNS</Chip> : <DemoChip>EXAMPLE RUNS</DemoChip>}
        </div>
        {sec.status === "loading" ? <EmptyState title="Loading live run history.">Checking the authenticated Security Research API. No example runs are substituted.</EmptyState> : null}
        {sec.status === "unavailable" ? <EmptyState title="Run history unavailable.">{sec.unavailableMessage ?? "The run feed is not connected. This is not a statement that there are no runs, or that the system is safe."}</EmptyState> : null}
        {sec.status === "empty" ? <EmptyState title="No runs recorded yet.">{live ? "Start the first run in the Security Swarm. It will appear here with its evidence and its limits." : "When a run is recorded it appears here with its evidence and its limits."}</EmptyState> : null}
        {sec.status === "ready" ? (
          <ul className="ov-runs">
            {latest.map((r) => {
              const badge = runBadge(r);
              return (
                <li key={r.id}>
                  <Link href={`/app/security?run=${encodeURIComponent(r.id)}`}>
                    <span className="ov-rg">{r.goal}</span>
                    <span className="ov-rm">
                      {r.exampleTag ? <DemoChip>{r.exampleTag}</DemoChip> : null}
                      <Chip tone={badge.tone} material={badge.material}>{badge.label}</Chip>
                      <MiniPipeline model={pipelineFor(r)} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
        <p className="ov-note">
          A finished run is research output. It is not an audit, a passed test or an approval, and nothing on this page can move funds.
        </p>
      </section>
    </section>
  );
}
