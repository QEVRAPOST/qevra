"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoverageTable } from "@/components/ui/CoverageTable";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { ToggleGroup } from "@/components/ui/ToggleGroup";
import { cn } from "@/lib/utils";
import type { CoverageRow, Material, Tone } from "@/types";

type Filter = "all" | Material;

/** What each status circle stands for (docs/QEVRA_DESIGN_DIRECTION.md section 2.3). */
const BUCKETS: ReadonlyArray<{ id: Material; label: string; means: string }> = [
  { id: "solid", label: "Evidenced", means: "a recorded fact" },
  { id: "outline", label: "Experimental", means: "under evaluation, or examples only" },
  { id: "dotted", label: "Not built", means: "unknown, not configured or not decided" },
];

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg-2",
  exp: "text-exp",
  unk: "text-muted-foreground",
  ok: "text-pass",
  bad: "text-fail",
  demo: "text-foreground",
};

/**
 * "What is real today": a summary of the whole status table (how many parts are evidenced, experimental or not built),
 * then the table itself, which can be narrowed to one kind. Both are computed from the same rows, so neither can say
 * more than the table does. Built on the shadcn Card, Table and ToggleGroup.
 */
export function StatusLedger({ rows, caption }: { rows: readonly CoverageRow[]; caption: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const count = (m: Material) => rows.filter((r) => r.material === m).length;
  const shown = filter === "all" ? rows : rows.filter((r) => r.material === filter);
  const evidenced = count("solid");
  const headline = evidenced === 0 ? "Nothing here is evidenced yet." : `${evidenced} of ${rows.length} parts are evidenced.`;

  return (
    <div className="grid min-w-0 gap-6 *:min-w-0">
      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-xs font-normal text-muted-foreground">Evidence so far</CardTitle>
          <span className="font-mono text-xs text-muted-foreground">
            {rows.length} parts
          </span>
        </CardHeader>
        <CardContent className="grid items-center gap-x-10 gap-y-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="grid gap-4">
            <p className="font-display text-[clamp(26px,2.6vw,34px)] leading-[1.1] text-foreground">{headline}</p>
            {/* one circle per part, in table order: the shape is the status */}
            <div className="flex flex-wrap items-center gap-2.5" aria-hidden="true">
              {rows.map((r) => (
                <StatusMaterial key={r.id} material={r.material} className={TONE_TEXT[r.tone]} />
              ))}
            </div>
          </div>
          <ul className="grid gap-0 divide-y divide-line">
            {BUCKETS.map((b) => (
              <li key={b.id} className="flex items-baseline gap-3 py-2.5 first:pt-0 last:pb-0">
                <StatusMaterial material={b.id} className="translate-y-0.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{b.label}</span>
                <span className="min-w-0 flex-1 font-mono text-xs text-muted-foreground">{b.means}</span>
                <span className={cn("font-mono text-sm tabular-nums", count(b.id) === 0 ? "text-muted-foreground" : "text-foreground")}>{count(b.id)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-wrap">
          <CardTitle>Each part, and how much is known</CardTitle>
          <ToggleGroup
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All ${rows.length}` },
              ...BUCKETS.map((b) => ({ value: b.id, label: `${b.label} ${count(b.id)}`, disabled: count(b.id) === 0 })),
            ]}
          />
        </CardHeader>
        <CardContent className="px-0 py-0">
          <CoverageTable rows={shown} caption={`${caption}. Showing ${shown.length} of ${rows.length} parts.`} ledger />
        </CardContent>
      </Card>
    </div>
  );
}
