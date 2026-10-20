"use client";

import Link from "next/link";
import { CoverageTable } from "@/components/ui/CoverageTable";
import { Panel } from "@/components/ui/Panel";
import { PqNote } from "@/components/ui/PqNote";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { buildReadiness } from "@/lib/app-readiness";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";

/** Status and limits: what works today (the same readiness the overview shows), then the full coverage table and the post-quantum note. */
export function StatusView() {
  const { model } = useAppModel();
  const rows = buildReadiness(model);
  const rpc = model.network.rpc;
  return (
    <section className="route" aria-labelledby="h-stat">
      <PageHead
        id="h-stat"
        kicker="Status · what works today"
        title="Status and limits"
        lede={
          model.mode === "live"
            ? "Reading a connected wallet and the research history is live and read-only. The account, swaps and signing are not built. This is how much is known about each part now."
            : "Nothing in this preview is implemented. This is what each part is meant to become, and how much is known now."
        }
      />
      <Panel title="Operational overview">
        <ul className="st-list">
          {rows.map((r) => (
            <li key={r.id}>
              <span className="st-k">{r.label}</span>
              <b className={`st-v tone-${r.tone}`}>
                <StatusMaterial material={r.material} />
                {r.value}
              </b>
              <span className="st-d">
                {r.detail}
                {r.id === "network" && model.mode === "live" && rpc.status === "available" ? ` Chain ID ${rpc.chainId ?? "unknown"}${rpc.observedAt ? `, observed ${rpc.observedAt}` : ""}.` : ""}
              </span>
              {r.href === "/app/protocol" ? <span /> : (
                <Link className="ov-l" href={r.href}>
                  {r.linkLabel}
                  <span aria-hidden="true">→</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Detailed coverage">
        <CoverageTable rows={model.coverage} caption="Status of each property in this preview" />
        <PqNote variant="app" flush />
      </Panel>
    </section>
  );
}
