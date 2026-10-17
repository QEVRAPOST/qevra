"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A horizontally scrollable wrapper for a wide table. It joins the tab order only while it actually overflows,
 * so keyboard users can scroll it, and desktop layouts get no extra tab stop.
 */
export function ScrollRegion({ className, label, children }: { className: string; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} role="region" aria-label={label} tabIndex={overflows ? 0 : undefined}>
      {children}
    </div>
  );
}
