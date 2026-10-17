/**
 * Numeric state of the Aperture ring stack. Every value is eased toward its target by the scene.
 * See docs/QEVRA_DESIGN_DIRECTION.md section 6.10 for what each key does.
 */
export interface ApertureState {
  /** gap between rings, 0..1 */
  explode: number;
  /** how far unlocked rings are turned away from their reviewed angle, 0..1 */
  scatter: number;
  /** review progress: rings lock one by one, top ring first, 0..1 */
  rev: number;
  /** the amount ring turned out of line (a detail changed after review), 0..1 */
  mis: number;
  /** the light source; it only passes through slots that line up, 0..1 */
  lit: number;
  /** outlined post-quantum ring (experimental), 0..1 */
  pq: number;
  /** separate Security Swarm ring, review dock and air gap, 0..1 */
  swarm: number;
  /** camera elevation offset in radians, about -0.1..0.3 */
  tilt: number;
  /** magnification about the focal height, 1..1.6 */
  zoom: number;
  /** focal height as a fraction of the figure, 0 = base, 1 = top of the PQ ring */
  fy: number;
}

export type ApertureKey = keyof ApertureState;

export type ApertureMode = "hero" | "glyph";

export interface ApertureOptions {
  mode: ApertureMode;
  /** easing rate per second (exponential). Defaults to 5. */
  rate?: number;
  /** Fit the figure as if it had this explode value. The glyph uses 0 so it does not breathe. */
  fitExplode?: number;
  /** Show callouts and engraved labels. Defaults to true. */
  labels?: boolean;
  /** Called with the hovered ring index (0..7), or -1 when none. Never called inside the draw function. */
  onHoverChange?: (ringIndex: number) => void;
}

/** What the draw function reads from the scene. Kept narrow so the renderer can be driven by tests. */
export interface SceneView {
  readonly opts: ApertureOptions;
  readonly dpr: number;
  /** pointer parallax in [-1, 1], already eased */
  readonly px: number;
  readonly py: number;
  readonly pointer: { x: number; y: number; inside: boolean };
  /** scene clock in seconds. Only advances while frames render. */
  readonly t: number;
  /** CSS font stack for engraved text (resolved from --f-mono at runtime, never a hard-coded family name) */
  readonly fontMono: string;
  readonly layout: { hover: number };
}
