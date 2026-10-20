"use client";

import type { StatusBarItem } from "@/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { StatusMaterial } from "./StatusMaterial";

/**
 * The status bar shown at the top of every page. Items come from the engineering status data, not literals.
 * At 760px and below it is one horizontally scrollable row, so it becomes keyboard-focusable there.
 * `wrap` (the app) keeps every item visible instead: the row wraps, so no disclosure waits off-screen to be scrolled to.
 */
export function StatusBar({ items, wrap = false }: { items: readonly StatusBarItem[]; wrap?: boolean }) {
  const narrow = useMediaQuery("(max-width: 760px)");
  const scrollable = narrow && !wrap;
  return (
    <div className={wrap ? "statusbar wrapped" : "statusbar"}>
      <div className="wrap wide" role="region" aria-label="Current status" tabIndex={scrollable ? 0 : undefined}>
        {items.map((i) => (
          <span key={i.id} className={`it ${i.tone}`}>
            <StatusMaterial material={i.tone === "exp" ? "outline" : "dotted"} />
            <span className="t">{i.text}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
