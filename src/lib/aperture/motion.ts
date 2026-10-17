/*
 * Reduced-motion helpers. Everything here is safe to import on the server:
 * the media query is only read when a function runs in the browser.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

let mq: MediaQueryList | null | undefined;

function query(): MediaQueryList | null {
  if (mq !== undefined) return mq;
  mq = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
  return mq;
}

export function prefersReducedMotion(): boolean {
  return !!query()?.matches;
}

/** Subscribe to preference changes. Returns an unsubscribe function. */
export function onReducedMotionChange(cb: () => void): () => void {
  const q = query();
  if (!q || typeof q.addEventListener !== "function") return () => {};
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
}

/** True on devices whose primary pointer can hover. Used only for the figure caption hint. */
export function canHover(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(hover: hover)").matches;
}
