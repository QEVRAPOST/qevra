"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { ToggleGroup } from "@/components/ui/ToggleGroup";
import { useLiveResearchAccess } from "@/features/dashboard/LiveAppProvider";
import { NETWORKS } from "@/lib/config/networks";
import type { ActsMode, RunsMode, SetupStage } from "@/types";
import { useAppModel, usePreviewControls } from "./DemoAppProvider";

const STAGE_OPTIONS: ReadonlyArray<{ value: SetupStage; label: string }> = [
  { value: 0, label: "Not connected" },
  { value: 1, label: "Connected" },
];
const RUNS_OPTIONS: ReadonlyArray<{ value: RunsMode; label: string }> = [
  { value: "examples", label: "Runs" },
  { value: "more", label: "More states" },
  { value: "empty", label: "Empty" },
  { value: "unavailable", label: "Unavailable" },
];
const ACTS_OPTIONS: ReadonlyArray<{ value: ActsMode; label: string }> = [
  { value: "examples", label: "Rows" },
  { value: "empty", label: "Empty" },
  { value: "unavailable", label: "Unavailable" },
];

type ResearchGate = "checking" | "unauthenticated" | "authenticated" | "not_configured" | "service_error" | "rate_limited";
type ResearchAuthenticationMethod = "wallet" | "operator";

export interface ModeMenuResearchSessionProps {
  gate: ResearchGate;
  authenticationMethod?: ResearchAuthenticationMethod;
  walletConnected: boolean;
  walletNetworkMismatch: boolean;
  message?: string;
  onSignOut: () => void;
}

/** Keep wallet presence separate from the server-authenticated Security Swarm session. */
export function ModeMenuResearchSession({
  gate,
  authenticationMethod,
  walletConnected,
  walletNetworkMismatch,
  message,
  onSignOut,
}: ModeMenuResearchSessionProps) {
  const hasResearchSession = gate === "authenticated"
    && (authenticationMethod === "wallet" || authenticationMethod === "operator");

  let status: string;
  if (hasResearchSession && authenticationMethod === "wallet") {
    status = "Wallet research session active.";
  } else if (hasResearchSession && authenticationMethod === "operator") {
    status = "Operator research session active.";
  } else if (gate === "checking") {
    status = "Checking the Security Swarm session…";
  } else if (gate === "authenticated") {
    status = "The research session is being verified. Sign out is unavailable until its type is confirmed.";
  } else if (gate === "unauthenticated" && walletConnected && walletNetworkMismatch) {
    status = "Your wallet is connected, but its network does not match VEYRA’s selected network. Match the network, then sign in to Security Swarm. Wallet connection alone is not research sign-in.";
  } else if (gate === "unauthenticated" && walletConnected) {
    status = "Your wallet is connected. Wallet connection is separate from Security Swarm sign-in; sign in there to access saved research.";
  } else if (gate === "unauthenticated") {
    status = "No active research session. Sign in to Security Swarm to access saved research.";
  } else if (gate === "not_configured") {
    status = "Research sign-in is not configured on this server.";
  } else if (gate === "rate_limited") {
    status = message ?? "Research session checks are temporarily rate-limited. Try again from Security Swarm later.";
  } else {
    status = message ?? "The Security Swarm session could not be checked. Try again from Security Swarm.";
  }

  return (
    <div className="mm-session" aria-live="polite">
      <p role="status">{status}</p>
      {hasResearchSession ? (
        <Button variant="ghost" size="small" onClick={onSignOut}>Sign out</Button>
      ) : gate === "unauthenticated" ? (
        <Link href="/app/security" className="ov-l">Sign in to Security Swarm<span aria-hidden="true">→</span></Link>
      ) : null}
    </div>
  );
}

/**
 * The one place that says what kind of data the app is showing. A single quiet indicator sits in the header; the long
 * explanation, the standing facts (audit, router, ML-DSA) and the preview controls live in the panel it opens.
 * Anything simulated is still marked wherever it appears on its own, in a list or a detail view.
 */
export function ModeMenu() {
  const { model, actions } = useAppModel();
  const preview = usePreviewControls();
  const researchAccess = useLiveResearchAccess();
  const live = model.mode === "live";
  const researchAuthenticationMethod = researchAccess?.authenticationMethod;
  const canSignOutResearch = researchAccess?.gate === "authenticated"
    && (researchAuthenticationMethod === "wallet" || researchAuthenticationMethod === "operator");
  const selectedNetwork = NETWORKS.find((network) => network.id === researchAccess?.selectedNetwork);
  const walletConnected = Boolean(researchAccess?.wallet.address);
  const walletNetworkMismatch = walletConnected && researchAccess?.wallet.chainId !== selectedNetwork?.chainId;
  const signOutResearch = () => {
    if (canSignOutResearch) actions.logout();
  };
  const [open, setOpen] = useState(false);
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="mm" ref={root}>
      <button
        ref={button}
        type="button"
        className={`mm-btn ${live ? "live" : "sim"}`}
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mm-dot" aria-hidden="true" />
        <span className="mm-long">{live ? "Live · read-only" : "Interactive preview · simulated data"}</span>
        <span className="mm-short">{live ? "Live" : "Preview"}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" />
        </svg>
        <span className="sr">{live ? "About live mode" : "About this preview"}</span>
      </button>
      {open ? (
        <div className="mm-panel" id={`${uid}-panel`} role="region" aria-label={live ? "About live mode" : "About this preview"}>
          <h2>{live ? "Live, read-only" : "About this preview"}</h2>
          <p>
            {live
              ? "Public reads do not change chain state. Wallet connection is separate from Security Swarm access. Mainnet swaps require a live quote and chain checks; wallet approvals are explicit. The wallet is never switched automatically."
              : "Everything here is simulated, so you can see how the product will work. No wallet is connected, no chain is read and nothing can move funds."}
          </p>
          <ul className="mm-facts" aria-label="What is true today">
            {model.statusBar.map((i) => (
              <li key={i.id}>
                <StatusMaterial material={i.tone === "exp" ? "outline" : "dotted"} />
                {i.text}
              </li>
            ))}
          </ul>
          {preview ? (
            <div className="mm-ctl">
              <h3>Preview controls</h3>
              <div className="mm-row">
                <span id={`${uid}-w`}>Wallet</span>
                <ToggleGroup labelledBy={`${uid}-w`} options={STAGE_OPTIONS} value={preview.stage > 1 ? 1 : preview.stage} onChange={preview.setStage} />
              </div>
              <div className="mm-row">
                <span id={`${uid}-r`}>Research runs</span>
                <ToggleGroup labelledBy={`${uid}-r`} options={RUNS_OPTIONS} value={preview.runsMode} onChange={preview.setRunsMode} />
              </div>
              <div className="mm-row">
                <span id={`${uid}-a`}>Transactions</span>
                <ToggleGroup labelledBy={`${uid}-a`} options={ACTS_OPTIONS} value={preview.actsMode} onChange={preview.setActsMode} />
              </div>
              <Button variant="ghost" size="small" onClick={preview.reset}>
                Reset the preview
              </Button>
            </div>
          ) : null}
          <div className="mm-foot">
            <Link href="/" className="ov-l">
              Back to the landing page
            </Link>
            {live ? (
              <ModeMenuResearchSession
                gate={researchAccess?.gate ?? "checking"}
                authenticationMethod={researchAuthenticationMethod}
                walletConnected={walletConnected}
                walletNetworkMismatch={walletNetworkMismatch}
                message={researchAccess?.message}
                onSignOut={signOutResearch}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
