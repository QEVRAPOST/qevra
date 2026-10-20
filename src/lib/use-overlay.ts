"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What every overlay on a phone needs while it is open, in one place: the page behind it cannot scroll or be reached with the keyboard,
 * Tab stays inside it, Escape closes it, and focus goes in on open and back to what opened it on close. `inertSelector` names the page
 * content to make inert (the overlay itself must not be inside it).
 */
export function useOverlay(open: boolean, onClose: () => void, panel: RefObject<HTMLElement | null>, opts: { inertSelector?: string; returnFocus?: RefObject<HTMLElement | null>; initialFocus?: string } = {}): void {
  const { inertSelector, returnFocus, initialFocus } = opts;
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.classList.add("overlay-open");
    const inert = inertSelector ? Array.from(document.querySelectorAll<HTMLElement>(inertSelector)) : [];
    inert.forEach((el) => el.setAttribute("inert", ""));
    const opener = returnFocus?.current ?? (document.activeElement as HTMLElement | null);
    const raf = requestAnimationFrame(() => {
      const first = initialFocus ? panel.current?.querySelector<HTMLElement>(initialFocus) : panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      inert.forEach((el) => el.removeAttribute("inert"));
      root.classList.remove("overlay-open");
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, onClose, panel, inertSelector, returnFocus, initialFocus]);
}
