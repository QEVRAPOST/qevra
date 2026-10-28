"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/Button";
import { CoverageTable } from "@/components/ui/CoverageTable";
import { PqNote } from "@/components/ui/PqNote";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { buildReadiness, type ReadinessRow } from "@/lib/app-readiness";
import { useMediaQuery } from "@/lib/use-media-query";
import type { AppModel } from "@/types";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";

type NodeId = "network" | "wallet" | "swarm" | "pipeline" | "swap" | "pq" | "audit";

/** the research pipeline as a node of its own: provider, worker and database, read from the live capabilities */
function pipelineNode(model: AppModel): ReadinessRow {
  const caps = model.security.capabilities;
  const base = { id: "swarm" as const, group: "now" as const, label: "Research pipeline", href: "/app/security", linkLabel: "Open Security Swarm" };
  if (model.mode !== "live") return { ...base, value: "Simulated", detail: "Research, Analysis and Verification, shown with simulated runs.", tone: "demo", material: "dotted" };
  if (model.security.accessState === "unauthenticated") return { ...base, value: "Sign-in required", detail: "Saved runs require a wallet research session or the separate operator administration session. Public wallet and network reads remain available.", tone: "unk", material: "dotted", linkLabel: "Sign in to Research" };
  if (model.security.accessState === "not_configured") return { ...base, value: "Access not configured", detail: "The server has not configured wallet user sessions or operator administration.", tone: "unk", material: "dotted" };
  if (model.security.accessState === "checking") return { ...base, value: "Checking access", detail: "Checking a research session; public network status remains available.", tone: "unk", material: "dotted" };
  if (model.security.accessState === "service_error" || model.security.accessState === "rate_limited") return { ...base, value: model.security.accessState === "rate_limited" ? "Rate-limited" : "Access unavailable", detail: model.security.unavailableMessage ?? "Research access could not be checked.", tone: "unk", material: "dotted", linkLabel: "Retry access" };
  if (model.security.authenticationMethod === "wallet" && !caps && model.security.unavailableMessage) return { ...base, value: "Availability check unavailable", detail: model.security.unavailableMessage, tone: "unk", material: "dotted", linkLabel: "Open saved reports" };
  if (!caps && model.security.unavailableMessage) return { ...base, value: "Research service unavailable", detail: model.security.unavailableMessage, tone: "unk", material: "dotted", linkLabel: "Retry history" };
  if (!caps) return { ...base, value: "Checking", detail: "Asking the service what it can do.", tone: "unk", material: "dotted" };
  const ok = caps.provider === "available" && caps.worker === "available" && caps.persistence === "available";
  return ok
    ? { ...base, value: "Ready", detail: "Provider, worker and database are all available.", tone: "neutral", material: "outline" }
    : { ...base, value: "Partly unavailable", detail: `Provider ${caps.provider}, worker ${caps.worker}, database ${caps.persistence}.`, tone: "unk", material: "dotted" };
}

/** what it would take for a part that is not available to become available: stated plainly, never as a date */
const NEEDS: Partial<Record<NodeId, string>> = {
  swap: "A live 0x quote, a valid Mainnet chain preflight and sufficient route liquidity. Wallet approval and swap submission require separate explicit confirmations.",
  pq: "Independent review of ML-DSA authorization, and a decision on who controls the account key and how recovery works. Both are still open.",
  audit: "An audit by someone outside the project. None is recorded yet, and research runs are not a substitute for one.",
};

/** each part's mark: small, drawn with the same stroke as the route icons */
const ICONS: Record<NodeId, React.ReactNode> = {
  network: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M16 14.5h2" />
    </>
  ),
  swarm: (
    <>
      <ellipse cx="12" cy="8" rx="7" ry="3" />
      <ellipse cx="12" cy="13" rx="8.5" ry="3.5" />
      <path d="M12 13v7" />
    </>
  ),
  pipeline: (
    <>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="7" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M7 11l3-3M14 8l3 3" />
    </>
  ),
  swap: <path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4" />,
  pq: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H21M17 12v3M20 12v2" />
    </>
  ),
  audit: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.2 3 7.5 7 9 4-1.5 7-4.8 7-9V6z" />
      <path d="M9.5 12l2 2 3.5-4" strokeDasharray="2 2.5" />
    </>
  ),
};

/** the lines between working parts: network feeds the wallet and the Swarm, the Swarm feeds its pipeline */
const EDGES: Array<{ from: NodeId; to: NodeId; d: string }> = [
  { from: "network", to: "wallet", d: "M150 220 C230 220 260 105 330 105" },
  { from: "network", to: "swarm", d: "M150 220 C230 220 260 335 330 335" },
  { from: "swarm", to: "pipeline", d: "M330 335 C440 335 480 335 600 335" },
];

/**
 * Status and limits as a map you can explore: what is connected and working on one side, what is switched off, experimental or not done on
 * the other, with the line between them drawn. Choose a part and its connections light up and it says what it means and what it would take.
 * The full sentences and the coverage table are below, one step away.
 */
export function StatusView() {
  const { model } = useAppModel();
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const rows = buildReadiness(model);
  const by = (id: ReadinessRow["id"]) => rows.find((r) => r.id === id)!;
  const rpc = model.network.rpc;
  const pipeline = pipelineNode(model);
  const nodes: Array<{ id: NodeId; row: ReadinessRow; cls: string }> = [
    { id: "network", row: by("network"), cls: "sm-network" },
    { id: "wallet", row: by("wallet"), cls: "sm-wallet" },
    { id: "swarm", row: by("swarm"), cls: "sm-swarm" },
    { id: "pipeline", row: pipeline, cls: "sm-pipe" },
    { id: "swap", row: by("swap"), cls: "sm-swap" },
    { id: "pq", row: by("pq"), cls: "sm-pq" },
    { id: "audit", row: by("audit"), cls: "sm-audit" },
  ];
  const [sel, setSel] = useState<NodeId>("swarm");
  const [pings, setPings] = useState(0);
  const cur = nodes.find((n) => n.id === sel)!;
  const hot = EDGES.filter((e) => e.from === sel || e.to === sel);
  const choose = (id: NodeId) => {
    setSel(id);
    setPings((n) => n + 1);
  };

  return (
    <section className="route stp" aria-labelledby="h-stat">
      <PageHead
        id="h-stat"
        kicker="Status · what works today"
        title="Status and limits"
        lede={
          model.mode === "live"
            ? "Public wallet reads and saved research are available. Mainnet swaps require a valid quote, chain checks, and explicit wallet confirmation."
            : "A preview with simulated data. Explore each part’s current availability and limits."
        }
      />
      <p className="st-network-link">
        <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/app/networks">
          Open Network &amp; Contracts Explorer
        </Link>
      </p>

      <div className="sm-wrap">
        <div className="sm" role="group" aria-label="Readiness map. Choose a part to see what it means.">
          <svg className="sm-svg" viewBox="0 0 1200 440" aria-hidden="true" focusable="false">
            <rect className="sm-za" x="10" y="14" width="800" height="412" rx="6" />
            <rect className="sm-zb" x="850" y="14" width="340" height="412" rx="6" />
            {EDGES.map((e) => (
              <path key={e.d} className={`sm-l${hot.includes(e) ? " hot" : ""}`} d={e.d} />
            ))}
            {!reduce
              ? hot.map((e) => (
                  <circle key={`${e.d}-${pings}`} className="sm-spark" r="4.5">
                    <animateMotion dur="0.9s" fill="freeze" path={e.d} calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1" />
                    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="0.95s" fill="freeze" />
                  </circle>
                ))
              : null}
          </svg>
          <p className="sm-zl a">Working today</p>
          <p className="sm-zl b">Not available</p>
          {nodes.map((n) => (
            <button key={n.id} type="button" className={`sm-n ${n.cls} tone-${n.row.tone}${sel === n.id ? " on" : ""}`} aria-pressed={sel === n.id} onClick={() => choose(n.id)}>
              <span className={`sm-ring m-${n.row.material}`} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[n.id]}
                </svg>
              </span>
              <b>{n.row.label}</b>
              <span className="sm-v">{n.row.value}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sm-ins" key={sel}>
        <div className="sm-ins-h">
          <h2>{cur.row.label}</h2>
          <span className={`st-v tone-${cur.row.tone}`}>
            <StatusMaterial material={cur.row.material} />
            {cur.row.value}
          </span>
        </div>
        <p>
          {cur.row.detail}
          {cur.id === "network" && model.mode === "live" && rpc.status === "available" ? ` Chain ID ${rpc.chainId ?? "unknown"}${rpc.observedAt ? `, observed ${rpc.observedAt}` : ""}.` : ""}
        </p>
        {NEEDS[cur.id] ? (
          <p className="sm-needs">
            <b>What it would take.</b> {NEEDS[cur.id]}
          </p>
        ) : null}
        {cur.row.href !== "/app/protocol" ? (
          <Link className={buttonVariants({ variant: "ghost", size: "small" })} href={cur.row.href}>
            {cur.row.linkLabel}
          </Link>
        ) : null}
      </div>

      <ul className="st-list" aria-label="What each part means">
        {[...rows.slice(0, 3), pipeline, ...rows.slice(3)].map((r) => (
          <li key={r.label}>
            <span className="st-k">{r.label}</span>
            <b className={`st-v tone-${r.tone}`}>
              <StatusMaterial material={r.material} />
              {r.value}
            </b>
            <span className="st-d">{r.detail}</span>
          </li>
        ))}
      </ul>

      <details className="sw-about st-cov">
        <summary>Detailed coverage</summary>
        <CoverageTable rows={model.coverage} caption="Status of each property" />
        <PqNote variant="app" flush />
      </details>
    </section>
  );
}
