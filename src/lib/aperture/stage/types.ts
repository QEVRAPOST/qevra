import type { Cam, Queue, V3 } from "./gfx";

/** A part of a scene the visitor can point at: a circle in canvas pixels, and where the part is in the scene. */
export interface Hotspot {
  id: string;
  x: number;
  y: number;
  r: number;
  /** the part's place in the scene (world units), so the camera can fly to it */
  wx: number;
  wy: number;
  wz: number;
  /** how far the camera zooms in on it when it is clicked */
  zoom: number;
}

/** Everything a hero scene needs to draw itself. */
export interface SceneArgs {
  ctx: CanvasRenderingContext2D;
  cam: Cam;
  q: Queue;
  font: string;
  w: number;
  h: number;
  /** how built the scene is, 0..1 */
  form: number;
  /** scroll progress inside the scene, 0..1 */
  u: number;
  /** Intent Lock: the amount detail changed, 0..1 */
  mis: number;
  /** a phone-sized stage: fewer and shorter labels */
  compact: boolean;
  /** scenes push the parts the visitor can point at here, once they are built */
  hot: Hotspot[];
  /** the part being pointed at, if any */
  hover: string | null;
  /** the scene clock in seconds: it advances only while the stage is drawing frames (still under reduced motion) */
  t: number;
  /** how far the camera has flown in on a part, 0..1; callouts fade out as it does */
  zoom: number;
  /** the project name, for the text engraved on the objects */
  name: string;
}

/** A hero scene: where the camera sits, the box that must fit the canvas, and how to draw it. */
export interface SceneDef {
  yaw: number;
  pitch: number;
  /** extra yaw over the scene's scroll progress, radians (the object turns as you scroll) */
  turn: number;
  /** how far the visitor may rotate it either way, radians (past this the painter's ordering would be wrong) */
  limit: number;
  /** corners of the world box that has to fit on screen */
  bounds: V3[];
  /** the box to fit on a phone-sized stage, when the scene leaves its outer parts out there */
  compactBounds?: V3[];
  draw(a: SceneArgs): void;
}

/** The 8 corners of an axis-aligned world box. */
export const box8 = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): V3[] => [
  [x0, y0, z0],
  [x1, y0, z0],
  [x0, y1, z0],
  [x1, y1, z0],
  [x0, y0, z1],
  [x1, y0, z1],
  [x0, y1, z1],
  [x1, y1, z1],
];
