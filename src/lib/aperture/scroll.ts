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

/** A frame's vertical extent in viewport pixels. */
export interface FrameBounds {
  top: number;
  bottom: number;
}

/** While the reading line is inside this frame, `hl` follows the line's position through the frame. */
export interface Sweep {
  from: number;
  to: number;
}

export interface StoryTargetInput {
  /** vertical centre of each frame, in viewport pixels (hero first) */
  centers: readonly number[];
  /** top and bottom of each frame; only needed when `sweeps` is used */
  bounds?: readonly FrameBounds[];
  /** per frame: drive the highlight position through the frame, or null */
  sweeps?: ReadonlyArray<Sweep | null>;
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
  const { centers: c, keyframes: K, readTop, viewportHeight, reduced, heroMis, bounds, sweeps } = input;
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
  /* the highlight sweep: inside a frame that has one, the highlighted ring follows the reading line through it */
  if (sweeps && bounds) {
    for (let j = 0; j < sweeps.length; j++) {
      const sw = sweeps[j];
      const b = bounds[j];
      if (!sw || !b || vc < b.top || vc > b.bottom) continue;
      const u = b.bottom > b.top ? (vc - b.top) / (b.bottom - b.top) : 0;
      target.hl = lerp(sw.from, sw.to, smooth(0.12, 0.88, u));
      break;
    }
  }
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

export function frameBounds(frames: readonly Element[]): FrameBounds[] {
  return frames.map((e) => {
    const r = e.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
}

/**
 * The point of each frame that has to reach the middle of the reading area for the frame to count as reached.
 * That is its centre, unless the frame is taller than the reading area (phones): then its top is aligned to the
 * top of the reading area, so the start of the text is never cut off.
 */
export function frameCenters(bounds: readonly FrameBounds[], area: number): number[] {
  return bounds.map((b) => b.top + Math.min(b.bottom - b.top, area) / 2);
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
  const rt = readingTop();
  const area = window.innerHeight - rt;
  const y = window.scrollY + r.top + Math.min(r.height, area) / 2 - (rt + window.innerHeight) / 2;
  window.scrollTo({ top: Math.max(0, y), behavior: scrollBehavior(reduced) });
}

/** Scroll to the top of an element, below the sticky nav. */
export function scrollToId(id: string, reduced: boolean): void {
  const el = document.getElementById(id);
  if (!el) return;
  window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - stickyHeight() - 4, behavior: scrollBehavior(reduced) });
}
