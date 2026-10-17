import type { ApertureKey, ApertureState } from "./types";

/**
 * The seven scroll keyframes (docs/QEVRA_DESIGN_DIRECTION.md section 6.11).
 * Frame 0 is the hero; frames 1 to 6 are the story steps.
 */
export const APERTURE_KEYFRAMES: readonly ApertureState[] = [
  /* 0 hero    */ { explode: 0.26, scatter: 0, rev: 1, mis: 0, lit: 1, pq: 1, swarm: 1, tilt: 0, zoom: 1, fy: 0.5 },
  /* 1 rings   */ { explode: 1, scatter: 1, rev: 0, mis: 0, lit: 1, pq: 0, swarm: 0, tilt: 0.1, zoom: 1, fy: 0.5 },
  /* 2 lock    */ { explode: 0.62, scatter: 1, rev: 1, mis: 0, lit: 1, pq: 0, swarm: 0, tilt: 0.04, zoom: 1, fy: 0.5 },
  /* 3 break   */ { explode: 0.62, scatter: 1, rev: 1, mis: 1, lit: 1, pq: 0, swarm: 0, tilt: 0.04, zoom: 1, fy: 0.5 },
  /* 4 outline */ { explode: 0.5, scatter: 1, rev: 1, mis: 0, lit: 1, pq: 1, swarm: 0, tilt: 0.12, zoom: 1.55, fy: 1 },
  /* 5 swarm   */ { explode: 0.4, scatter: 1, rev: 1, mis: 0, lit: 1, pq: 1, swarm: 1, tilt: 0.02, zoom: 1, fy: 0.5 },
  /* 6 closing */ { explode: 0.26, scatter: 1, rev: 1, mis: 0, lit: 1, pq: 1, swarm: 1, tilt: 0.02, zoom: 1, fy: 0.5 },
];

export const APERTURE_KEYS = Object.keys(APERTURE_KEYFRAMES[0]) as ApertureKey[];

/** Start state of the one-time assembly intro on the landing. */
export const INTRO_FROM: ApertureState = {
  explode: 1,
  scatter: 1,
  rev: 0,
  mis: 0,
  lit: 1,
  pq: 0,
  swarm: 0,
  tilt: 0.1,
  zoom: 1,
  fy: 0.5,
};

/** Initial state of the small Intent Lock figure in the app (glyph mode). */
export const GLYPH_INITIAL: ApertureState = {
  explode: 0,
  scatter: 0,
  rev: 1,
  mis: 0,
  lit: 0,
  pq: 1,
  swarm: 0,
  tilt: 0,
  zoom: 1,
  fy: 0.5,
};

/** Easing rates per second. */
export const SCENE_RATE = 3.4;
export const INTRO_RATE = 1.7;
