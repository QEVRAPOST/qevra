/*
 * drawStage: fits each hero scene to the canvas and draws it. Every scene has its own camera, so a scene that is
 * leaving and one that is arriving can be on screen together while they build and un-build.
 */
import { clamp, lerp } from "../math";
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
    const yaw = def.yaw + (st.u - 0.5) * def.turn + view.px * 0.12 + st.ry;
    const pitch = clamp(def.pitch + view.py * 0.04 + st.rp, 0.28, 1.05);
    /* Zoom: the scale grows and the clicked part glides from where it stands to the middle of the canvas, so it is the
       point the camera flies in on. The unit projection tells where that part is at this view, at scale 1. */
    let s = f.s;
    let ox = f.ox;
    let oy = f.oy;
    if (st.zm > 0.0005) {
      const unit = makeCam({ yaw, pitch, s: 1, ox: 0, oy: 0, dpr: 1, px: 0 });
      const u = P(unit, st.cx, st.cy, st.cz);
      const hx = f.ox + u[0] * f.s;
      const hy = f.oy + u[1] * f.s;
      s = f.s * (1 + st.zm * (st.zk - 1));
      ox = lerp(hx, w / 2, st.zm) - u[0] * s;
      oy = lerp(hy, h * 0.46, st.zm) - u[1] * s;
    }
    const cam = makeCam({ yaw, pitch, s, ox, oy, dpr: view.dpr, px: view.px });
    /* only the object that is (nearly) whole can be pointed at */
    const own: Hotspot[] = [];
    def.draw({ ctx, cam, q: new Queue(), font: view.fontMono, w, h, form: clamp(form), u: st.u, mis: st.mis, compact, hot: own, hover: view.hover, zoom: st.zm, name: view.projectName });
    if (form > 0.85) hot.push(...own);
  });
  return hot;
}
