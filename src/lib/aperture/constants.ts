/*
 * Scene constants, copied from the approved prototype (scene.js).
 * Do not tune these by eye: they match docs/QEVRA_DESIGN_DIRECTION.md Appendix B.
 */

/** Engraved label and value per ring, ring 0 at the base and ring 7 at the top. */
export const A_RINGS: ReadonlyArray<readonly [label: string, value: string]> = [
  ["RECIPIENT", "EXAMPLE ADDR"],
  ["CHAIN ID", "46630"],
  ["TOKEN IN → OUT", "TKN-A → TKN-B"],
  ["AMOUNT", "EXAMPLE"],
  ["ROUTER · ALLOWANCE", "NOT CONFIGURED"],
  ["SLIPPAGE · MIN OUT", "EXAMPLE"],
  ["NONCE", "EXAMPLE"],
  ["DEADLINE", "EXAMPLE"],
];

/** Outer radius per ring, ring 0 (base) to ring 7 (top). */
export const A_R: readonly number[] = [158, 148, 138, 129, 121, 113, 106, 99];

export const A_BORE = 54;
export const A_H = 18;
export const A_BASE_R = 182;
/** Index of the amount ring: the one that turns out of line when `mis` is 1. */
export const A_AMOUNT = 3;

/** Alternating ring tones: cool for even rings, warm for odd rings. */
export const A_TONES: ReadonlyArray<readonly [number, number, number]> = [
  [96, 101, 110],
  [132, 121, 104],
];

/** Brushed-metal conic gradient stops: [offset, value]. */
export const A_CONIC: ReadonlyArray<readonly [number, number]> = [
  [0, 0.34],
  [0.07, 0.62],
  [0.11, 0.3],
  [0.2, 0.2],
  [0.29, 0.5],
  [0.35, 0.22],
  [0.47, 0.38],
  [0.56, 0.7],
  [0.6, 0.28],
  [0.72, 0.18],
  [0.81, 0.46],
  [0.9, 0.26],
  [1, 0.34],
];

/** Turn applied to each ring while it is not yet locked, in radians, ring 0 at the base. */
export const A_SCAT: readonly number[] = [1.25, -1.35, 0.8, -0.95, 1.3, -0.55, 1.05, -1.25];

/** Fallback only. The real stack is resolved at runtime from the --f-mono CSS variable. */
export const FALLBACK_FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
