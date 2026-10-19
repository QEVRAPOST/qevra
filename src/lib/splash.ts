/*
 * The splash screen (the ring sculpture assembling, as in the Launch App transition) plays once per tab session, before the
 * landing hero builds. This module is the only thing the hero and the splash share:
 *   - `splashExpected()` says whether a splash is about to play (the splash element is server-rendered as `data-state="run"`;
 *     an inline script right after it turns that to `off` before first paint when it should not play: reduced motion,
 *     already seen this session, a deep link, or a page that opened scrolled)
 *   - `whenSplashDone(cb)` runs `cb` when it has finished, or at once if there is none
 * `sessionStorage` is only a convenience (a visitor who blocks it sees the splash once per page load); every access is guarded.
 */
export const SPLASH_SEEN_KEY = "splash-seen";

let done = false;
const waiting = new Set<() => void>();

export function splashExpected(): boolean {
  if (typeof document === "undefined" || done) return false;
  return document.querySelector(".splash")?.getAttribute("data-state") === "run";
}

export function splashSeen(): boolean {
  try {
    return window.sessionStorage.getItem(SPLASH_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSplashSeen(): void {
  try {
    window.sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
  } catch {
    /* storage is blocked: the splash simply plays again on the next full page load */
  }
}

export function whenSplashDone(cb: () => void): () => void {
  if (!splashExpected()) {
    cb();
    return () => {};
  }
  waiting.add(cb);
  return () => {
    waiting.delete(cb);
  };
}

/*
 * React's development mode mounts, unmounts and mounts a component again to check its cleanup. The splash counts its mounts so
 * that an unmount which is followed at once by a mount (that check) does not end it; a real unmount ends it a tick later.
 */
let mounted = 0;
export function splashMounted(): void {
  mounted++;
}
export function splashUnmounted(): void {
  mounted--;
  setTimeout(() => {
    if (mounted === 0) finishSplash();
  }, 0);
}

/** The splash has finished (or was skipped, or failed): release everything that waited for it. Later renders never show it. */
export function finishSplash(): void {
  done = true;
  const run = [...waiting];
  waiting.clear();
  run.forEach((cb) => cb());
}

/**
 * The inline script that runs right after the splash element, before first paint: when no splash should play it switches the
 * element off, so the page is never covered. It must come directly after the element it switches.
 */
export const SPLASH_GATE_SCRIPT = `(function(){var s=document.currentScript&&document.currentScript.previousElementSibling;if(!s)return;try{if(sessionStorage.getItem("${SPLASH_SEEN_KEY}")==="1"||matchMedia("(prefers-reduced-motion: reduce)").matches||location.hash||window.scrollY>40){s.setAttribute("data-state","off")}}catch(e){s.setAttribute("data-state","off")}})();`;
