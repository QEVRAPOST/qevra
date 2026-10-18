/*
 * Small orthographic 3D toolkit for the hero scenes, drawn in Canvas 2D.
 *
 * It uses the same material language as the ring renderer (graphite and warm silver metal, a tungsten key
 * light from the upper left, hairline edges, engraved mono text) so the hero objects read as family of the
 * Aperture sculpture, but it is deliberately separate from draw.ts so the approved ring renderer is untouched.
 *
 * World: x right, y up, z toward the viewer. The camera yaws about y, then pitches (looks down) about x.
 */
import { TAU, clamp } from "../math";

export type V3 = readonly [number, number, number];
export type Tone = readonly [number, number, number];

/** Materials, matching the ring tones. */
export const COOL: Tone = [96, 101, 110];
export const WARM: Tone = [132, 121, 104];
export const DARK: Tone = [52, 56, 63];
export const BRIGHT: Tone = [168, 164, 154];

export interface Cam {
  /** pixels per world unit */
  s: number;
  /** where the world origin lands on screen */
  ox: number;
  oy: number;
  cyw: number;
  syw: number;
  cp: number;
  sp: number;
  dpr: number;
  /** key light in view space, normalised */
  L: V3;
  pitch: number;
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

export function makeCam(opts: { yaw: number; pitch: number; s: number; ox: number; oy: number; dpr: number; px: number }): Cam {
  return {
    s: opts.s,
    ox: opts.ox,
    oy: opts.oy,
    cyw: Math.cos(opts.yaw),
    syw: Math.sin(opts.yaw),
    cp: Math.cos(opts.pitch),
    sp: Math.sin(opts.pitch),
    dpr: opts.dpr,
    pitch: opts.pitch,
    L: norm([-0.5 + opts.px * 0.55, 0.6, 0.68]),
  };
}

/** Project a world point: [screen x, screen y, depth] (larger depth is nearer the viewer). */
export function P(cam: Cam, x: number, y: number, z: number): [number, number, number] {
  const x1 = x * cam.cyw + z * cam.syw;
  const z1 = -x * cam.syw + z * cam.cyw;
  const y2 = y * cam.cp - z1 * cam.sp;
  const z2 = y * cam.sp + z1 * cam.cp;
  return [cam.ox + x1 * cam.s, cam.oy - y2 * cam.s, z2];
}

/** Rotate a world direction into view space. */
export function viewDir(cam: Cam, n: V3): V3 {
  const x1 = n[0] * cam.cyw + n[2] * cam.syw;
  const z1 = -n[0] * cam.syw + n[2] * cam.cyw;
  return [x1, n[1] * cam.cp - z1 * cam.sp, n[1] * cam.sp + z1 * cam.cp];
}

/** Draw queue: primitives are sorted far to near by depth, then drawn. */
export class Queue {
  private items: Array<{ d: number; fn: () => void }> = [];
  add(depth: number, fn: () => void): void {
    this.items.push({ d: depth, fn });
  }
  flush(): void {
    this.items.sort((a, b) => a.d - b.d);
    for (const it of this.items) it.fn();
    this.items.length = 0;
  }
}

export const ease = {
  out: (x: number) => 1 - Math.pow(1 - clamp(x), 3),
  inOut: (x: number) => {
    const t = clamp(x);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },
  back: (x: number) => {
    const t = clamp(x);
    const c1 = 1.4;
    return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

/** Progress of one piece inside a staggered build: `form` 0..1 overall, piece starts at `delay`, takes `dur`. */
export const piece = (form: number, delay: number, dur: number): number => clamp((form - delay) / dur);

const rgb = (t: Tone, k: number, add = 0): string =>
  `rgb(${Math.min(255, t[0] * k + add) | 0},${Math.min(255, t[1] * k + add * 0.92) | 0},${Math.min(255, t[2] * k + add * 0.78) | 0})`;

/* ---------------------------------------------------------------- boxes */

interface Face {
  n: V3;
  v: [number, number, number, number];
  /** text frame: origin vertex index, u vertex index, v vertex index */
  frame: [number, number, number];
}

/* vertex order: 0 (-,-,-) 1 (+,-,-) 2 (+,+,-) 3 (-,+,-) 4 (-,-,+) 5 (+,-,+) 6 (+,+,+) 7 (-,+,+) */
const FACES: Record<"front" | "back" | "left" | "right" | "top" | "bottom", Face> = {
  front: { n: [0, 0, 1], v: [4, 5, 6, 7], frame: [7, 6, 4] },
  back: { n: [0, 0, -1], v: [1, 0, 3, 2], frame: [2, 3, 1] },
  left: { n: [-1, 0, 0], v: [0, 4, 7, 3], frame: [3, 7, 0] },
  right: { n: [1, 0, 0], v: [5, 1, 2, 6], frame: [6, 2, 5] },
  top: { n: [0, 1, 0], v: [7, 6, 2, 3], frame: [3, 2, 7] },
  bottom: { n: [0, -1, 0], v: [0, 1, 5, 4], frame: [0, 1, 4] },
};

export interface BoxText {
  face: keyof typeof FACES;
  text: string;
  size: number;
  color: string;
  /** shift along the text direction in world units, 0 = centred */
  dx?: number;
  dy?: number;
}

export interface BoxOpts {
  c: V3;
  size: V3;
  tone: Tone;
  alpha?: number;
  /** rotate about the x axis through `pivot` (default: the box centre), radians */
  rotX?: number;
  pivot?: V3;
  text?: BoxText[];
  /** hairline edge colour on the lit top edges */
  edge?: string;
  /** faces to skip (for open cutaways) */
  skip?: Array<keyof typeof FACES>;
}

function boxVerts(o: BoxOpts): V3[] {
  const [w, h, d] = o.size;
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  const local: V3[] = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [hx, hy, -hz],
    [-hx, hy, -hz],
    [-hx, -hy, hz],
    [hx, -hy, hz],
    [hx, hy, hz],
    [-hx, hy, hz],
  ];
  const a = o.rotX || 0;
  const piv = o.pivot ?? o.c;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return local.map((p) => {
    const wx = p[0] + o.c[0];
    const wy = p[1] + o.c[1];
    const wz = p[2] + o.c[2];
    if (!a) return [wx, wy, wz] as V3;
    const dy = wy - piv[1];
    const dz = wz - piv[2];
    return [wx, piv[1] + dy * ca - dz * sa, piv[2] + dy * sa + dz * ca] as V3;
  });
}

/** Depth of a box centre, used for ordering. */
export function boxDepth(cam: Cam, o: BoxOpts): number {
  const vs = boxVerts(o);
  let d = 0;
  for (const v of vs) d += P(cam, v[0], v[1], v[2])[2];
  return d / vs.length;
}

export function drawBox(ctx: CanvasRenderingContext2D, cam: Cam, font: string, o: BoxOpts): void {
  const vs = boxVerts(o).map((v) => P(cam, v[0], v[1], v[2]));
  const a = o.rotX || 0;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.lineJoin = "round";
  for (const name of Object.keys(FACES) as Array<keyof typeof FACES>) {
    if (o.skip?.includes(name)) continue;
    const f = FACES[name];
    const nw: V3 = a ? [f.n[0], f.n[1] * ca - f.n[2] * sa, f.n[1] * sa + f.n[2] * ca] : f.n;
    const nv = viewDir(cam, nw);
    if (nv[2] <= 0.015) continue;
    const d1 = Math.max(0, nv[0] * cam.L[0] + nv[1] * cam.L[1] + nv[2] * cam.L[2]);
    const d2 = Math.max(0, nv[0] * 0.9 + nv[2] * 0.1);
    const k = 0.2 + 0.78 * d1 + 0.18 * d2;
    const q = f.v.map((i) => vs[i]);
    const g = ctx.createLinearGradient(q[0][0], q[0][1], q[2][0], q[2][1]);
    g.addColorStop(0, rgb(o.tone, k * 1.16));
    g.addColorStop(1, rgb(o.tone, k * 0.86));
    ctx.beginPath();
    ctx.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    const lit = nw[1] > 0.5;
    ctx.strokeStyle = lit ? (o.edge ?? "rgba(255,248,232,0.42)") : "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (o.text) {
      for (const t of o.text) {
        if (t.face !== name) continue;
        const [oi, ui, vi] = f.frame;
        const O = vs[oi];
        const U = [vs[ui][0] - O[0], vs[ui][1] - O[1]];
        const V = [vs[vi][0] - O[0], vs[vi][1] - O[1]];
        const [w, h, d] = o.size;
        const lenU = name === "front" || name === "back" || name === "top" || name === "bottom" ? w : d;
        const lenV = name === "top" || name === "bottom" ? d : h;
        const sz = t.size;
        ctx.save();
        ctx.font = `500 ${sz}px ${font}`;
        const tw = ctx.measureText(t.text).width;
        ctx.restore();
        /* a text unit is one world unit, so map the face's own axes onto the screen */
        ctx.save();
        ctx.setTransform(
          (cam.dpr * U[0]) / lenU,
          (cam.dpr * U[1]) / lenU,
          (cam.dpr * V[0]) / lenV,
          (cam.dpr * V[1]) / lenV,
          cam.dpr * O[0],
          cam.dpr * O[1],
        );
        ctx.font = `500 ${sz}px ${font}`;
        ctx.fillStyle = t.color;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(t.text, lenU / 2 - tw / 2 + (t.dx ?? 0), lenV / 2 + (t.dy ?? 0));
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------ cylinders */

export interface CylOpts {
  /** centre of the bottom disc */
  c: V3;
  r: number;
  h: number;
  tone: Tone;
  alpha?: number;
  /** outline only, dashed (experimental) */
  ghost?: string;
  /** engraved text on the top face */
  topText?: { text: string; size: number; color: string };
  /** a lit or dark window on the front of the wall: height above the bottom, and its state */
  window?: { y: number; h: number; w: number; lit: number; bad?: boolean };
  bright?: number;
}

export function drawCyl(ctx: CanvasRenderingContext2D, cam: Cam, font: string, o: CylOpts): void {
  const B = P(cam, o.c[0], o.c[1], o.c[2]);
  const T = P(cam, o.c[0], o.c[1] + o.h, o.c[2]);
  const rp = o.r * cam.s;
  const ry = rp * cam.sp;
  const bright = o.bright ?? 1;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.ghost) {
    /* outline only: top ellipse, front half of the bottom ellipse, two side lines */
    ctx.strokeStyle = o.ghost;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.ellipse(T[0], T[1], rp, ry, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(B[0], B[1], rp, ry, 0, 0, Math.PI, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(T[0] - rp, T[1]);
    ctx.lineTo(B[0] - rp, B[1]);
    ctx.moveTo(T[0] + rp, T[1]);
    ctx.lineTo(B[0] + rp, B[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }
  /* wall: the band between the front halves of the top and bottom ellipses */
  ctx.beginPath();
  ctx.ellipse(T[0], T[1], rp, ry, 0, 0, Math.PI, false);
  ctx.ellipse(B[0], B[1], rp, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  const gr = ctx.createLinearGradient(B[0] - rp, 0, B[0] + rp, 0);
  const L = cam.L;
  const H = norm([L[0], L[1], L[2] + 1]);
  for (let k = 0; k <= 16; k++) {
    const u = k / 16;
    const sx = u * 2 - 1;
    const c = Math.sqrt(Math.max(0, 1 - sx * sx));
    const d1 = Math.max(0, sx * L[0] + c * L[2]);
    const d2 = Math.max(0, sx * 0.9 + c * 0.1);
    const sp = Math.pow(Math.max(0, sx * H[0] + c * H[2]), 44);
    const kk = (0.13 + 0.92 * d1 + 0.2 * d2) * bright;
    gr.addColorStop(u, rgb(o.tone, kk, sp * 150));
  }
  ctx.fillStyle = gr;
  ctx.fill();
  /* the slot: a window through the wall, lit when the light passes (same idea as the ring notches) */
  if (o.window) {
    const w = o.window;
    const y0 = P(cam, o.c[0], o.c[1] + w.y, o.c[2] + o.r);
    const hw = (w.w / 2) * cam.s;
    const hh = w.h * cam.cp * cam.s;
    ctx.fillStyle = "#050607";
    ctx.fillRect(y0[0] - hw, y0[1] - hh, hw * 2, hh);
    if (w.lit > 0.01) {
      ctx.fillStyle = `rgba(255,236,196,${0.95 * w.lit})`;
      ctx.fillRect(y0[0] - hw, y0[1] - hh, hw * 2, hh);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gl = ctx.createRadialGradient(y0[0], y0[1] - hh / 2, 1, y0[0], y0[1] - hh / 2, 20 * cam.s * 0.5 + 8);
      gl.addColorStop(0, `rgba(255,214,150,${0.5 * w.lit})`);
      gl.addColorStop(1, "rgba(255,214,150,0)");
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(y0[0], y0[1] - hh / 2, 20 * cam.s * 0.5 + 8, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (w.bad) {
      ctx.strokeStyle = "rgba(229,96,77,0.95)";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(y0[0] - hw, y0[1] - hh, hw * 2, hh);
    }
  }
  /* top cap: brushed metal */
  ctx.beginPath();
  ctx.ellipse(T[0], T[1], rp, ry, 0, 0, TAU);
  const cap = ctx.createRadialGradient(T[0] - rp * 0.3, T[1] - ry * 0.3, 1, T[0], T[1], rp);
  cap.addColorStop(0, rgb(o.tone, 0.95 * bright));
  cap.addColorStop(1, rgb(o.tone, 0.5 * bright));
  ctx.fillStyle = cap;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,248,232,0.46)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.ellipse(B[0], B[1], rp, ry, 0, 0, Math.PI, false);
  ctx.stroke();
  if (o.topText) {
    ctx.save();
    /* the cap lies flat: world x and z map onto the screen through the camera, one world unit per text unit */
    const k = cam.dpr * cam.s;
    ctx.setTransform(k * cam.cyw, -k * cam.syw * cam.sp, k * cam.syw, k * cam.cyw * cam.sp, cam.dpr * T[0], cam.dpr * T[1]);
    ctx.font = `600 ${o.topText.size}px ${font}`;
    ctx.fillStyle = o.topText.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(o.topText.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/* -------------------------------------------------------------- spheres */

export function drawSphere(ctx: CanvasRenderingContext2D, cam: Cam, c: V3, r: number, tone: Tone, alpha = 1, rim?: string): void {
  const p = P(cam, c[0], c[1], c[2]);
  const rp = r * cam.s;
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(p[0] - rp * 0.38, p[1] - rp * 0.42, rp * 0.1, p[0], p[1], rp);
  g.addColorStop(0, rgb(tone, 1.5, 40));
  g.addColorStop(0.6, rgb(tone, 0.8));
  g.addColorStop(1, rgb(tone, 0.28));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p[0], p[1], rp, 0, TAU);
  ctx.fill();
  if (rim) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- lines */

export function drawLine(ctx: CanvasRenderingContext2D, cam: Cam, a: V3, b: V3, color: string, width = 1, dash: number[] = [], alpha = 1): void {
  const pa = P(cam, a[0], a[1], a[2]);
  const pb = P(cam, b[0], b[1], b[2]);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(pa[0], pa[1]);
  ctx.lineTo(pb[0], pb[1]);
  ctx.stroke();
  ctx.restore();
}

/** Soft contact shadow and light pool on the floor. */
export function drawFloor(ctx: CanvasRenderingContext2D, cam: Cam, radius: number, lit: number, alpha: number): void {
  const c = P(cam, 0, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  const R = radius * cam.s;
  ctx.translate(c[0], c[1]);
  ctx.scale(1, cam.sp);
  const g = ctx.createRadialGradient(0, 0, 6, 0, 0, R * 1.2);
  g.addColorStop(0, `rgba(255,233,184,${0.17 * lit + 0.05})`);
  g.addColorStop(0.5, `rgba(255,233,184,${0.045 * lit + 0.012})`);
  g.addColorStop(1, "rgba(255,233,184,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.2, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 1 / Math.max(0.3, cam.sp);
  for (let k = 1; k <= 3; k++) {
    ctx.strokeStyle = `rgba(139,143,150,${0.15 - k * 0.035})`;
    ctx.beginPath();
    ctx.arc(0, 0, R * (0.62 + k * 0.2), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/** Contact shadow under an object. */
export function drawShadow(ctx: CanvasRenderingContext2D, cam: Cam, c: V3, rx: number, rz: number, a: number): void {
  const p = P(cam, c[0], c[1], c[2]);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(p[0], p[1], rx * cam.s, rz * cam.s * cam.sp, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* --------------------------------------------------------------- labels */

export interface LabelOpts {
  /** the point on the object */
  ax: number;
  ay: number;
  /** where the text starts (left), ends (right) or is centred, and its first baseline */
  x: number;
  y: number;
  side: "right" | "left" | "center";
  lines: string[];
  color: string;
  alpha: number;
  w: number;
  f1: number;
  f2: number;
}

/** Callout in the same style as the ring scene: dot on the object, hairline leader, mono text. */
export function drawLabel(ctx: CanvasRenderingContext2D, font: string, o: LabelOpts): void {
  if (o.alpha < 0.03) return;
  ctx.save();
  ctx.globalAlpha = clamp(o.alpha);
  let tw = 0;
  o.lines.forEach((t, k) => {
    ctx.font = `${k === 0 ? 500 : 400} ${k === 0 ? o.f1 : o.f2}px ${font}`;
    tw = Math.max(tw, ctx.measureText(t).width);
  });
  let tx = o.side === "left" ? o.x - tw : o.side === "center" ? o.x - tw / 2 : o.x;
  tx = clamp(tx, 8, Math.max(8, o.w - tw - 8));
  ctx.strokeStyle = o.color;
  ctx.fillStyle = o.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(o.ax, o.ay);
  if (o.side === "center") ctx.lineTo(clamp(o.ax, tx + 4, tx + tw - 4), o.y - o.f1 - 3);
  else ctx.lineTo(o.side === "right" ? tx - 6 : tx + tw + 6, o.y - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(o.ax, o.ay, 2.2, 0, TAU);
  ctx.fill();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  o.lines.forEach((t, k) => {
    ctx.font = `${k === 0 ? 500 : 400} ${k === 0 ? o.f1 : o.f2}px ${font}`;
    ctx.fillStyle = k === 0 ? o.color : "rgba(139,143,150,1)";
    ctx.fillText(t, tx, o.y + (k === 0 ? 0 : 12 + (k - 1) * 12));
  });
  ctx.restore();
}
