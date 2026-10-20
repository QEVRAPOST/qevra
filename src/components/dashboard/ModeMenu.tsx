"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { ToggleGroup } from "@/components/ui/ToggleGroup";
import { PROJECT_NAME } from "@/lib/project-brand";
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

/**
 * The one place that says what kind of data the app is showing. A single quiet indicator sits in the header; the long
 * explanation, the standing facts (audit, router, ML-DSA) and the preview controls live in the panel it opens.
 * Anything simulated is still marked wherever it appears on its own, in a list or a detail view.
 */
export function ModeMenu() {
  const { model, actions } = useAppModel();
  const preview = usePreviewControls();
  const live = model.mode === "live";
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
              ? `This app reads public chain data and your saved research. There is no ${PROJECT_NAME} account here, swaps are off and nothing is signed.`
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
              <Button variant="ghost" size="small" onClick={actions.logout}>
                Sign out
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
