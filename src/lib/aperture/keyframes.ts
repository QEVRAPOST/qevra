import type { ApertureKey, ApertureState } from "./types";

/**
 * Poses of the ring stack. The sculpture is always the same object: poses only move the camera (zoom, tilt,
 * focal height and pan), separate or close the rings, and fade annotation layers in and out.
 * docs/QEVRA_DESIGN_DIRECTION.md section 6.10 describes the original ten variables; the rest are the
 * chapter additions documented in docs/QEVRA_UI_IMPLEMENTATION_HANDOFF.md.
 */
const NEUTRAL: ApertureState = {
  explode: 0.26,
  scatter: 1,
  rev: 1,
  mis: 0,
  lit: 1,
  pq: 0,
  swarm: 0,
  tilt: 0,
  zoom: 1,
  fy: 0.5,
  fx: 0,
  hl: 0,
  hlA: 0,
  acct: 0,
  air: 0,
  pqGlow: 0,
  dim: 0,
  lbl: 1,
  beam: -1,
};

export const APERTURE_KEYS = Object.keys(NEUTRAL) as ApertureKey[];

export const pose = (p: Partial<ApertureState>): ApertureState => ({ ...NEUTRAL, ...p });

/**
 * The scroll story, one pose per text frame, in order:
 *   0 hero                         whole object
 *   1 chapter 1  smart account     close on the base, the connected wallet beside it
 *   2 chapter 2  every detail      close on the middle rings, spread out, highlight sweeps through them
 *   3 chapter 2  rings lock        rings turn into place, light passes
 *   4 chapter 2  one detail breaks the amount ring turns out of line, the light stops
 *   5 chapter 3  experimental ring close on the dashed ML-DSA ring, restrained tungsten light
 *   6 chapter 3  Swarm             pan to the separate Swarm ring, the air gap and the review dock
 *   7 closing                      the whole object again, original framing
 */
export const STORY_KEYFRAMES: readonly ApertureState[] = [
  /* 0 */ pose({ explode: 0.26, scatter: 0, pq: 1, swarm: 1 }),
  /* 1 */ pose({ explode: 0.55, pq: 1, tilt: 0.16, zoom: 1.34, fy: 0.1, fx: -98, acct: 1, dim: 0.5, lbl: 0 }),
  /* 2 */ pose({ explode: 0.92, rev: 0, tilt: 0.07, zoom: 1.42, fy: 0.5, hl: 0, hlA: 1, lbl: 0 }),
  /* 3 */ pose({ explode: 0.7, tilt: 0.05, zoom: 1.42, fy: 0.5, hl: 7, lbl: 0 }),
  /* 4 */ pose({ explode: 0.7, mis: 1, tilt: 0.05, zoom: 1.42, fy: 0.5, hl: 7, lbl: 0 }),
  /* 5 */ pose({ explode: 0.5, pq: 1, tilt: 0.12, zoom: 1.55, fy: 1, pqGlow: 1, dim: 0.5, lbl: 0 }),
  /* 6 */ pose({ explode: 0.4, pq: 1, swarm: 1, tilt: 0.04, zoom: 1.2, fy: 0.9, fx: -102, air: 1, dim: 0.35, lbl: 0 }),
  /* 7 */ pose({ explode: 0.26, pq: 1, swarm: 1 }),
];

/** Frames whose highlight follows the reading line through them: from ring, to ring. */
export const STORY_SWEEPS: ReadonlyArray<{ from: number; to: number } | null> = [null, null, { from: 0, to: 7 }, null, null, null, null, null];

/** The hero pose: the whole object, as approved. */
export const HERO_POSE = STORY_KEYFRAMES[0];

/**
 * On a narrow canvas (phones) the close-ups use less magnification and pan less, so the same story frames
 * fit a stage that is roughly 400px wide.
 */
export function compactPose(p: ApertureState): ApertureState {
  const zoom = p.zoom > 1 ? 1 + (p.zoom - 1) * 0.62 : p.zoom;
  return { ...p, zoom, fx: p.fx * 0.78 };
}

export const STORY_KEYFRAMES_COMPACT: readonly ApertureState[] = STORY_KEYFRAMES.map(compactPose);

/** Start state of the one-time assembly intro on the landing. */
export const INTRO_FROM: ApertureState = pose({ explode: 1, rev: 0, tilt: 0.1 });

/** Initial state of the small Intent Lock figure in the app (glyph mode). */
export const GLYPH_INITIAL: ApertureState = pose({ explode: 0, scatter: 0, pq: 1, lit: 0 });

/** Easing rates per second. */
export const SCENE_RATE = 3.4;
export const INTRO_RATE = 1.7;
