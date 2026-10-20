"use client";

import { Chip, DemoChip } from "@/components/ui/Chip";
import { useAppModel } from "./DemoAppProvider";

/**
 * The head of every /app route: what kind of page it is, its name, one plain sentence, and whether the data on it is
 * an example or live. The mode mark is here so no route can forget it.
 */
export function PageHead({ id, kicker, title, lede, extra }: { id: string; kicker: string; title: string; lede: React.ReactNode; extra?: React.ReactNode }) {
  const { model } = useAppModel();
  return (
    <header className="rhead pghead">
      <div className="pg-kick">
        <span>{kicker}</span>
        {model.mode === "live" ? <Chip tone="neutral" material="outline">LIVE · READ-ONLY</Chip> : <DemoChip>EXAMPLE DATA</DemoChip>}
      </div>
      <h1 id={id}>{title}</h1>
      <p>{lede}</p>
      {extra}
    </header>
  );
}
