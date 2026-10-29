"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/Button";
import { brandizeProjectName, PROJECT_NAME } from "@/lib/project-brand";
import { illustrationModel, pipelineFor } from "@/lib/swarm-view";
import { useIllustration } from "@/lib/use-illustration";
import { useAppModel } from "./DemoAppProvider";
import { SwarmPipeline } from "./SwarmPipeline";

/**
 * The first screen of the app. A large canvas shows the real shape of the product (the three agents and the separate human
 * review); beneath it, three direct paths into the product. In live mode the canvas shows the latest run exactly as recorded;
 * in the preview it is a reference the visitor can play an illustration on. Nothing moves on its own.
 */
export function OverviewView() {
  const { model } = useAppModel();
  const live = model.mode === "live";
  const sec = model.security;
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
              ? "Review source-backed research, inspect public wallet data, and prepare Mainnet swaps for explicit approval."
              : "Preview VEYRA’s research, wallet, and Mainnet swap workflows with simulated workspace data.",
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

      <section className="ov-workspace" aria-labelledby="h-ov-workspace">
        <h2 id="h-ov-workspace">Your VEYRA Workspace</h2>
        <div className="ov-workspace-grid">
          <article className="ov-workspace-item">
            <h3>Your wallet, your control.</h3>
            <p>Connect your wallet, inspect on-chain balances, and manage your VEYRA account experience.</p>
            <Link className="ov-workspace-action" href="/app/wallet">
              Open Wallet
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 15 15 5M6 5h9v9" /></svg>
            </Link>
          </article>
          <article className="ov-workspace-item">
            <h3>Review before you execute.</h3>
            <p>Explore live Robinhood Mainnet quotes, compare transaction details, and approve swaps directly in your wallet.</p>
            <Link className="ov-workspace-action" href="/app/swap">
              Explore Swap
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 15 15 5M6 5h9v9" /></svg>
            </Link>
          </article>
          <article className="ov-workspace-item">
            <h3>Research beyond the surface.</h3>
            <p>Explore AI-assisted research, review supporting evidence, and examine recorded findings.</p>
            <Link className="ov-workspace-action" href="/app/security">
              Explore Security Swarm
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 15 15 5M6 5h9v9" /></svg>
            </Link>
          </article>
        </div>
      </section>
    </section>
  );
}
