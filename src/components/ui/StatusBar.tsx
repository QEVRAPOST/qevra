"use client";

import type { StatusBarItem } from "@/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { StatusMaterial } from "./StatusMaterial";

/**
 * The status bar shown at the top of every page. Items come from the engineering status data, not literals.
 * At 760px and below it is one horizontally scrollable row, so it becomes keyboard-focusable there.
 */
export function StatusBar({ items }: { items: readonly StatusBarItem[] }) {
  const scrollable = useMediaQuery("(max-width: 760px)");
  return (
    <div className="statusbar">
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
