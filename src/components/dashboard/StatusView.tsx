"use client";

import Link from "next/link";
import { CoverageTable } from "@/components/ui/CoverageTable";
import { PqNote } from "@/components/ui/PqNote";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { buildReadiness, type ReadinessRow } from "@/lib/app-readiness";
import type { AppModel } from "@/types";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";

/** The research pipeline as a node of its own: provider, worker and database, read from the live capabilities. */
function pipelineNode(model: AppModel): ReadinessRow {
  const caps = model.security.capabilities;
  const base = { id: "swarm" as const, group: "now" as const, label: "Research pipeline", href: "/app/security", linkLabel: "Open Security Swarm" };
  if (model.mode !== "live") return { ...base, value: "Simulated", detail: "Research, Analysis and Verification, shown with simulated runs.", tone: "demo", material: "dotted" };
  if (!caps) return { ...base, value: "Checking", detail: "Asking the service what it can do.", tone: "unk", material: "dotted" };
  const ok = caps.provider === "available" && caps.worker === "available" && caps.persistence === "available";
  return ok
    ? { ...base, value: "Ready", detail: "Provider, worker and database are all available.", tone: "neutral", material: "outline" }
    : { ...base, value: "Partly unavailable", detail: `Provider ${caps.provider}, worker ${caps.worker}, database ${caps.persistence}.`, tone: "unk", material: "dotted" };
}

function Node({ r, cls }: { r: ReadinessRow; cls: string }) {
  return (
    <Link href={r.href} className={`sm-n ${cls} tone-${r.tone}`}>
      <span className={`sm-ring m-${r.material}`} aria-hidden="true">
        <i />
      </span>
      <b>{r.label}</b>
      <span className="sm-v">{r.value}</span>
    </Link>
  );
}

/**
 * Status and limits as a map: what is connected and working on one side, what is switched off, experimental or not done on the
 * other, with the line between them drawn. The full sentences and the coverage table are below, one step away.
 */
export function StatusView() {
  const { model } = useAppModel();
  const rows = buildReadiness(model);
  const by = (id: ReadinessRow["id"]) => rows.find((r) => r.id === id)!;
  const rpc = model.network.rpc;
  const pipeline = pipelineNode(model);
  return (
    <section className="route st" aria-labelledby="h-stat">
      <PageHead
        id="h-stat"
        kicker="Status · what works today"
        title="Status and limits"
        lede={
          model.mode === "live"
            ? "Reading a wallet and saving research are live and read-only. The account, swaps and signing are not built."
            : "A preview with simulated data. This is what each part is meant to become, and what is known about it now."
        }
      />

      <div className="sm-wrap">
      <div className="sm" role="group" aria-label="Readiness map">
        <svg className="sm-svg" viewBox="0 0 1200 440" aria-hidden="true" focusable="false">
          <rect className="sm-za" x="10" y="14" width="800" height="412" rx="6" />
          <rect className="sm-zb" x="850" y="14" width="340" height="412" rx="6" />
          <path className="sm-l" d="M150 220 C230 220 260 105 330 105" />
          <path className="sm-l" d="M150 220 C230 220 260 335 330 335" />
          <path className="sm-l" d="M330 335 C440 335 480 335 600 335" />
        </svg>
        <p className="sm-zl a">Working today</p>
        <p className="sm-zl b">Not available</p>
        <Node r={by("network")} cls="sm-network" />
        <Node r={by("wallet")} cls="sm-wallet" />
        <Node r={by("swarm")} cls="sm-swarm" />
        <Node r={pipeline} cls="sm-pipe" />
        <Node r={by("swap")} cls="sm-swap" />
        <Node r={by("pq")} cls="sm-pq" />
        <Node r={by("audit")} cls="sm-audit" />
      </div>
      </div>

      <ul className="st-list" aria-label="What each part means">
        {[...rows.slice(0, 3), pipeline, ...rows.slice(3)].map((r) => (
          <li key={r.label}>
            <span className="st-k">{r.label}</span>
            <b className={`st-v tone-${r.tone}`}>
              <StatusMaterial material={r.material} />
              {r.value}
            </b>
            <span className="st-d">
              {r.detail}
              {r.id === "network" && model.mode === "live" && rpc.status === "available" ? ` Chain ID ${rpc.chainId ?? "unknown"}${rpc.observedAt ? `, observed ${rpc.observedAt}` : ""}.` : ""}
            </span>
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
