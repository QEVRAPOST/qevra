/*
 * The splash screen (the ring sculpture assembling, as in the Launch App transition) plays on every full load of the landing
 * page, before the hero builds. It does not play again when you come back to the landing from the app by a link (the page
 * is not reloaded then), and not for reduced motion or for a link to a section (`/#status`).
 *   - `splashExpected()` says whether a splash is waiting to play (the element is server-rendered as `data-state="run"`)
 *   - `whenSplashDone(cb)` runs `cb` when it has finished, or at once if there is none
 * The page needs no script to decide before first paint: the server-rendered splash covers it, and CSS removes the cover for
 * reduced motion and for a link to a section.
 *
 * SPLASH_ONCE_PER_SESSION: set it to true to play it only on the first load of a tab session. Whatever its value, a tab whose
 * `sessionStorage` has "splash-seen" set skips it (the test harness uses that; a visitor never sets it).
 */
export const SPLASH_SEEN_KEY = "splash-seen";
export const SPLASH_ONCE_PER_SESSION = false;

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
  if (!SPLASH_ONCE_PER_SESSION) return;
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
