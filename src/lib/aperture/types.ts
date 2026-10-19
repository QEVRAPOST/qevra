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
  /** camera pan along x, in scene units. Negative looks left of the stack axis. 0 = centred on the stack. */
  fx: number;
  /** highlighted ring as a continuous position, 0 (recipient) to 7 (deadline). Only visible while hlA > 0. */
  hl: number;
  /** how strongly the highlighted ring and its annotation show, 0..1 */
  hlA: number;
  /** chapter 1: the connected-wallet plate, the link marker and their labels, 0..1 */
  acct: number;
  /** chapter 3: labels and emphasis for the air gap and the human review dock, 0..1 */
  air: number;
  /** chapter 3: restrained tungsten light on the experimental ring, 0..1 */
  pqGlow: number;
  /** dims the stack so a focused part reads first, 0..1 */
  dim: number;
  /** multiplier on the standard callouts, 1 = shown as in the hero */
  lbl: number;
  /** travelling pulse of light down the notches, 0 (top) to 1 (base). Anything outside 0..1 hides it. */
  beam: number;
}

export type ApertureKey = keyof ApertureState;

export type ApertureMode = "hero" | "glyph";

export interface RingsInfo {
  /** selected ring index, or -1 */
  selected: number;
  /** which rings the user has turned out of line */
  turned: boolean[];
}

export interface ApertureOptions {
  mode: ApertureMode;
  /** Glyph only: rings can be hovered, selected, dragged and turned by the user. */
  interactive?: boolean;
  /** Called when the selected ring or the set of turned rings changes. */
  onRingsChange?: (info: RingsInfo) => void;
  /** easing rate per second (exponential). Defaults to 5. */
  rate?: number;
  /** Fit the figure as if it had this explode value. The glyph uses 0 so it does not breathe. */
  fitExplode?: number;
  /** Show callouts and engraved labels. Defaults to true. */
  labels?: boolean;
  /** Draw the floor (the pool of light and the engraved rings) under the stack. Defaults to true. The closing section turns it off and lays water there instead. */
  floor?: boolean;
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
  readonly layout: {
    hover: number;
    /** last drawn on-screen scale and stack centre, used for hit-testing and drag sensitivity */
    s: number;
    cx: number;
    /** where the stack axis sits before zoom and pan: used to centre the sculpture in the launch transition */
    cx0: number;
    /** y of the base plate's top centre, and the camera's sine and cosine of its elevation (the closing section reads them to lay water at the base) */
    cy: number;
    sinT: number;
    cosT: number;
    /** front-wall band of each ring in canvas pixels, ring 0 at the base */
    bands: Array<{ y0: number; y1: number; half: number }>;
  };
  /** extra turn the user has given each ring, in radians (interactive scenes) */
  readonly ringRot: readonly number[];
  /** selected ring index, or -1 */
  readonly selected: number;
}
