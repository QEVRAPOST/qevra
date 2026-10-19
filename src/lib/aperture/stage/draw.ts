/*
 * drawStage: fits each hero scene to the canvas and draws it. Every scene has its own camera, so a scene that is
 * leaving and one that is arriving can be on screen together while they build and un-build.
 */
import { clamp } from "../math";
import { makeCam, P, Queue } from "./gfx";
import type { StageState, StageView } from "./engine";
import { LATTICE } from "./lattice";
import { TUMBLER } from "./tumbler";
import type { Hotspot, SceneDef } from "./types";
import { VAULT } from "./vault";

export const SCENES: readonly SceneDef[] = [VAULT, TUMBLER, LATTICE];

/** Fit the scene's world box into the canvas (leaving room for callouts), at the scene's own view. */
function fit(def: SceneDef, w: number, h: number) {
  const base = makeCam({ yaw: def.yaw, pitch: def.pitch, s: 1, ox: 0, oy: 0, dpr: 1, px: 0 });
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const b of def.bounds) {
    const p = P(base, b[0], b[1], b[2]);
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  const mx = w < 520 ? 14 : 28;
  const top = h * 0.08;
  const bottom = h * 0.11;
  const aw = Math.max(40, w - mx * 2);
  const ah = Math.max(40, h - top - bottom);
  const s = Math.min(aw / (x1 - x0), ah / (y1 - y0));
  return {
    s,
    ox: mx + (aw - (x1 - x0) * s) / 2 - x0 * s,
    oy: top + (ah - (y1 - y0) * s) / 2 - y0 * s,
  };
}

export function drawStage(ctx: CanvasRenderingContext2D, w: number, h: number, st: StageState, view: StageView): Hotspot[] {
  const forms = [st.f0, st.f1, st.f2];
  const compact = w < 560 || h < 360;
  const hot: Hotspot[] = [];
  SCENES.forEach((def, i) => {
    const form = forms[i];
    if (form < 0.002) return;
    const f = fit(def, w, h);
    const cam = makeCam({
      yaw: def.yaw + (st.u - 0.5) * def.turn + view.px * 0.12 + st.ry,
      pitch: clamp(def.pitch + view.py * 0.04 + st.rp, 0.28, 1.05),
      s: f.s,
      ox: f.ox,
      oy: f.oy,
      dpr: view.dpr,
      px: view.px,
    });
    /* only the object that is (nearly) whole can be pointed at */
    const own: Hotspot[] = [];
    def.draw({ ctx, cam, q: new Queue(), font: view.fontMono, w, h, form: clamp(form), u: st.u, mis: st.mis, compact, hot: own, hover: view.hover });
    if (form > 0.85) hot.push(...own);
  });
  return hot;
}
