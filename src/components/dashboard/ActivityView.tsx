"use client";

import { useState } from "react";
import { Chip, DemoChip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { useAppModel } from "./DemoAppProvider";

/** Transaction activity: one plain sentence per swap, with its real state. Example rows are always labelled. */
export function ActivityView() {
  const { model } = useAppModel();
  const a = model.activity;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = a.rows.find((r) => r.id === selectedId) ?? a.rows[0];
  return (
    <section className="route" aria-labelledby="h-act">
      <div className="rhead">
        <h1 id="h-act">Transaction activity</h1>
        <p>Each swap in one plain sentence, with its real state.</p>
      </div>
      <Panel title="Swaps" aside={a.sourceTag ? <DemoChip>{a.sourceTag}</DemoChip> : undefined}>
        <div className="act-body">
          <ul className="acts" aria-label="Example transactions">
            {a.status === "ready" &&
              a.rows.map((r) => (
                <li key={r.id}>
                  <button type="button" className="act" aria-pressed={r.id === selected?.id} onClick={() => setSelectedId(r.id)}>
                    <span className="as">{r.sentence}</span>
                    <Chip tone={r.tone} material={r.material}>
                      {r.stateLabel}
                    </Chip>
                    <span className="am">{r.exampleTag ?? [r.hash, r.time].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            {a.status === "empty" && (
              <EmptyState as="li" title="No transactions yet.">
                Your swaps appear here once you make one, each with a plain sentence and a link to the block explorer.
              </EmptyState>
            )}
            {a.status === "unavailable" && (
              <EmptyState as="li" title="Activity unavailable.">
                The transaction feed is not connected, so no transactions can be shown. This is not a statement that there are none.
              </EmptyState>
            )}
          </ul>
          {a.status === "ready" && selected ? (
            <aside className="actd" aria-live="polite">
              <h3>{selected.sentence}</h3>
              <p className="note">{selected.note}</p>
              <dl className="kv">
                {selected.detail.map((d) => (
                  <div key={d.label}>
                    <dt>{d.label}</dt>
                    <dd>
                      {d.href ? (
                        <a href={d.href} target="_blank" rel="noopener noreferrer">
                          {d.value}
                        </a>
                      ) : (
                        d.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </aside>
          ) : null}
        </div>
      </Panel>
    </section>
  );
}
