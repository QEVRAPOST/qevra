/*
 * Landing scroll controller, ported from the prototype's applyScroll (docs/QEVRA_DESIGN_DIRECTION.md section 5.4).
 *
 * The scene holds the first keyframe for the first 28% of the distance between two frame centres, blends
 * through the middle 44%, and holds the next keyframe for the last 28%. The scene then eases toward that
 * target, so fast scrolling never makes it jump. Keep this algorithm: it is what locks the object to the text.
 */
import { APERTURE_KEYS } from "./keyframes";
import { clamp, lerp, smooth } from "./math";
import type { ApertureState } from "./types";

export interface StoryTargetInput {
  /** vertical centre of each frame, in viewport pixels (hero first) */
  centers: readonly number[];
  /** top of the reading area: the sticky header on desktop, the bottom of the pinned figure on compact layouts */
  readTop: number;
  viewportHeight: number;
  reduced: boolean;
  /** Try it toggle value; only applied while the hero frame is the lower keyframe */
  heroMis: number;
  keyframes: readonly ApertureState[];
}

export interface StoryTarget {
  /** index of the frame at or above the reading line */
  index: number;
  /** 0..1 progress from this frame toward the next */
  progress: number;
  /** eased blend between the two keyframes (quantised to 0 or 1 under reduced motion) */
  blend: number;
  /** frame that drives the .on class, the caption and the Try it toggle */
  active: number;
  target: ApertureState;
}

export function computeStoryTarget(input: StoryTargetInput): StoryTarget {
  const { centers: c, keyframes: K, readTop, viewportHeight, reduced, heroMis } = input;
  const n = c.length;
  const vc = (readTop + viewportHeight) / 2;
  let i = 0;
  for (let k = 0; k < n; k++) if (c[k] <= vc) i = k;
  let f = 0;
  if (i < n - 1 && vc > c[i]) {
    const span = c[i + 1] - c[i];
    f = span > 0 ? clamp((vc - c[i]) / span) : 0;
  }
  const t = reduced ? (f < 0.5 ? 0 : 1) : smooth(0.28, 0.72, f);
  const active = Math.min(n - 1, f < 0.5 ? i : i + 1);
  const A = { ...K[Math.min(i, K.length - 1)] };
  const B = K[Math.min(i + 1, K.length - 1)];
  if (i === 0) A.mis = heroMis;
  const target = { ...A };
  for (const key of APERTURE_KEYS) target[key] = lerp(A[key], B[key], t);
  return { index: i, progress: f, blend: t, active, target };
}

/* ---- DOM helpers (browser only; call from effects and event handlers) ---- */

/** Height of everything pinned above the page content: the sticky nav plus its top offset. */
export function stickyHeight(): number {
  const nav = document.querySelector<HTMLElement>("[data-sticky-nav]");
  if (!nav) return 0;
  return (parseFloat(getComputedStyle(nav).top) || 0) + nav.offsetHeight;
}

/** The pinned figure. On compact layouts it sits on top and the story reads below it. */
export const PIN_ID = "story-pin";

export function readingTop(): number {
  const pin = document.getElementById(PIN_ID);
  return window.innerWidth <= 1024 && pin ? pin.getBoundingClientRect().bottom : stickyHeight();
}

export function frameCenters(frames: readonly Element[]): number[] {
  return frames.map((e) => {
    const r = e.getBoundingClientRect();
    return r.top + r.height / 2;
  });
}

export function scrollBehavior(reduced: boolean): ScrollBehavior {
  return reduced ? "auto" : "smooth";
}

/** Scroll so frame k is centred in the reading area. */
export function scrollToFrame(k: number, reduced: boolean): void {
  const frames = document.querySelectorAll<HTMLElement>("[data-story-frame]");
  const el = frames[k];
  if (!el) return;
  const r = el.getBoundingClientRect();
  const y = window.scrollY + r.top + r.height / 2 - (readingTop() + window.innerHeight) / 2;
  window.scrollTo({ top: Math.max(0, y), behavior: scrollBehavior(reduced) });
}

/** Scroll to the top of an element, below the sticky nav. */
export function scrollToId(id: string, reduced: boolean): void {
  const el = document.getElementById(id);
  if (!el) return;
  window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - stickyHeight() - 4, behavior: scrollBehavior(reduced) });
}
