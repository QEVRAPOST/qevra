/*
 * Aperture: orthographic ring stack drawn in Canvas 2D.
 * Ported from the approved prototype (docs/qevra-aperture-source/src/scene.js). The maths, constants and
 * colours are unchanged. Differences from the prototype are structural only:
 *   - typed state and scene view instead of loose objects
 *   - the engraved-text font stack comes from the scene (resolved from --f-mono), not a hard-coded family
 *   - hover is reported by the scene after drawing, not from inside the draw call
 */
import {
  A_AMOUNT,
  A_BASE_R,
  A_BORE,
  A_CONIC,
  A_H,
  A_R,
  A_RINGS,
  A_SCAT,
  A_TONES,
  RING_NOTES,
  WALLET_R,
  WALLET_X,
} from "./constants";
import { TAU, clamp, lerp, smooth } from "./math";
import type { ApertureState, SceneView } from "./types";

type Vec3 = [number, number, number];
type Pt = [number, number];

/** Camera and projection values shared by the helpers below. */
interface Geo {
  s: number;
  sinT: number;
  cosT: number;
  dpr: number;
  cx: number;
  cy: number;
}

function aNorm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function conicFill(ctx: CanvasRenderingContext2D, angle: number, color: (v: number) => string, flat: string): CanvasGradient | string {
  if (typeof ctx.createConicGradient !== "function") return flat;
  const g = ctx.createConicGradient(angle, 0, 0);
  for (const [o, v] of A_CONIC) g.addColorStop(o, color(v));
  return g;
}

export function drawAperture(ctx: CanvasRenderingContext2D, w: number, h: number, st: ApertureState, sc: SceneView): void {
  const font = sc.fontMono;
  const glyph = sc.opts.mode === "glyph";
  const tilt = st.tilt || 0;
  const zoom = st.zoom == null ? 1 : st.zoom;
  const fy = st.fy == null ? 0.5 : st.fy;
  const scatter = st.scatter || 0;
  const rev = st.rev == null ? 1 : st.rev;
  const fx = st.fx || 0;
  const dim = st.dim || 0;
  const lblMul = st.lbl == null ? 1 : st.lbl;
  const compact = w < 520;
  const ringRot = sc.ringRot;
  const selI = sc.selected;
  const T = clamp(0.5 + tilt + sc.py * 0.07, 0.3, 1.15);
  const sinT = Math.sin(T);
  const cosT = Math.cos(T);
  const e = st.explode;
  const gap = lerp(3, 40, e);
  const labelsOn = !glyph && w >= 520 && sc.opts.labels !== false;
  const rightPad = labelsOn ? 206 : 0;
  const swarm = glyph ? 0 : st.swarm;
  const stackTop = 4 + 7 * (A_H + gap) + A_H;
  const pqY = stackTop + lerp(10, 40, e);
  const pqH = 12;
  const pqR = 92;
  const fitE = sc.opts.fitExplode != null ? sc.opts.fitExplode : e;
  const gapF = lerp(3, 40, fitE);
  const topF = 4 + 7 * (A_H + gapF) + A_H + lerp(10, 40, fitE) + pqH;
  /* on a narrow canvas the space kept for the Swarm ring is only reserved while the Swarm is on show */
  const xmin = glyph
    ? -A_BASE_R
    : w < 520
      ? lerp(-(A_BASE_R + 6), -(A_R[0] + 168), smooth(0, 1, st.swarm))
      : -(A_R[0] + 168);
  const xmax = A_BASE_R;
  const sx = (w - rightPad - 28) / (xmax - xmin);
  const yUnitsPx = topF * cosT + pqR * sinT + (10 * cosT + A_BASE_R * sinT);
  const sy = (h - (glyph ? 6 : 64)) / yUnitsPx;
  const s0 = Math.min(sx, sy);
  const totalH = yUnitsPx * s0;
  const left = (w - rightPad - (xmax - xmin) * s0) / 2;
  const cx0 = left + -xmin * s0;
  const cy0 = (h - totalH) / 2 + (topF * cosT + pqR * sinT) * s0;
  /* zoom about a focal height: the focal point glides to the middle of the canvas as the magnification grows */
  const s = s0 * zoom;
  const cb = smooth(1, 1.35, zoom);
  const yf = fy * topF;
  const pv = lerp(cy0 - yf * cosT * s0, h * 0.5, cb);
  const g: Geo = { s, sinT, cosT, dpr: sc.dpr, cx: lerp(cx0, w * 0.5, cb) - fx * s, cy: pv + yf * cosT * s };
  const lblZoom = 1 - smooth(1.03, 1.2, zoom);
  const lblA = lblZoom * lblMul;
  const P = (x: number, y: number, z: number): Pt => [g.cx + x * s, g.cy - y * cosT * s + z * sinT * s];
  const wallPt = (R: number, th: number, yw: number): Pt => [
    g.cx + R * Math.sin(th) * s,
    g.cy - yw * cosT * s + R * Math.cos(th) * sinT * s,
  ];

  /* light */
  const L = aNorm([-0.5 + sc.px * 0.55, 0.6, 0.68]);
  const Hh = aNorm([L[0], L[1], L[2] + 1]);

  /* alignment and seam */
  const mis = st.mis;
  const lockI = (i: number) => smooth((7 - i) / 9, (7 - i + 1.4) / 9, rev);
  const ang = (i: number) => A_SCAT[i] * scatter * (1 - lockI(i)) + (i === A_AMOUNT ? mis * 0.78 : 0) + (ringRot[i] || 0);
  /* a ring is emphasised while the highlight sweep is on it or while the user has selected it */
  const hlW = (i: number) => (st.hlA > 0.001 ? st.hlA * Math.max(0, 1 - Math.abs(st.hl - i)) : 0);
  const emph = (i: number) => Math.max(hlW(i), i === selI ? 1 : 0);
  const aligned = (i: number) => Math.exp(-Math.pow(ang(i) / 0.11, 2));
  const litFrom = new Array<number>(8);
  let acc = st.lit;
  for (let i = 7; i >= 0; i--) {
    acc *= aligned(i);
    litFrom[i] = acc;
  }
  const allLit = litFrom[0];

  /* ---- background pool of light on the floor ---- */
  const drawFloor = sc.opts.floor !== false;
  if (drawFloor) {
    ctx.save();
    const floorY = g.cy + 4 * sinT * s;
    const floor = ctx.createRadialGradient(g.cx, floorY + 12 * s, 6, g.cx, floorY + 12 * s, A_BASE_R * s * 1.5);
    floor.addColorStop(0, `rgba(255,233,184,${0.2 * allLit + 0.05})`);
    floor.addColorStop(0.5, `rgba(255,233,184,${0.05 * allLit + 0.012})`);
    floor.addColorStop(1, "rgba(255,233,184,0)");
    ctx.translate(g.cx, floorY + 12 * s);
    ctx.scale(1, sinT);
    ctx.translate(-g.cx, -(floorY + 12 * s));
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.arc(g.cx, floorY + 12 * s, A_BASE_R * s * 1.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* floor engraving: concentric ellipses */
  if (!glyph && drawFloor) {
    ctx.save();
    ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) {
      const R = (A_BASE_R + k * 34) * s;
      ctx.strokeStyle = `rgba(139,143,150,${0.16 - k * 0.035})`;
      ctx.beginPath();
      ctx.ellipse(g.cx, g.cy + 4 * sinT * s + 10 * cosT * s, R, R * sinT, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---- base plate ---- */
  const baseTop = g.cy;
  ctx.save();
  const bw = ctx.createLinearGradient(g.cx - A_BASE_R * s, 0, g.cx + A_BASE_R * s, 0);
  bw.addColorStop(0, "#0f1114");
  bw.addColorStop(0.22, "#20242a");
  bw.addColorStop(0.4, "#2f343b");
  bw.addColorStop(0.7, "#17191d");
  bw.addColorStop(1, "#0b0c0e");
  ctx.fillStyle = bw;
  ctx.beginPath();
  ctx.ellipse(g.cx, baseTop, A_BASE_R * s, A_BASE_R * s * sinT, 0, 0, Math.PI, false);
  ctx.ellipse(g.cx, baseTop + 10 * cosT * s, A_BASE_R * s, A_BASE_R * s * sinT, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  const bt = ctx.createRadialGradient(g.cx - 40 * s, baseTop - 30 * s, 10, g.cx, baseTop, A_BASE_R * s);
  bt.addColorStop(0, "#2b3037");
  bt.addColorStop(1, "#14161a");
  ctx.fillStyle = bt;
  ctx.beginPath();
  ctx.ellipse(g.cx, baseTop, A_BASE_R * s, A_BASE_R * s * sinT, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(236,232,223,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(g.cx, baseTop, A_BASE_R * s, A_BASE_R * s * sinT, 0, 0, TAU);
  ctx.stroke();
  if (!glyph) {
    ctx.strokeStyle = "rgba(236,232,223,0.08)";
    for (const R of [150, 128]) {
      ctx.beginPath();
      ctx.ellipse(g.cx, baseTop, R * s, R * s * sinT, 0, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
  if (!glyph) {
    wallText(ctx, g, font, A_BASE_R, -5, "QEVRA SMART ACCOUNT · ROBINHOOD TESTNET 46630", 0, 0, Math.max(7.5, 8 * s), "rgba(236,232,223,0.42)", "center");
  }

  /* ---- chapter 1: the external wallet is a separate plate beside the QEVRA base, with no path between them ---- */
  const wallet = P(WALLET_X, 0, 0);
  const walletThick = 6 * cosT * s;
  if (!glyph && st.acct > 0.01) {
    const A = st.acct;
    const Rw = WALLET_R * s;
    ctx.save();
    ctx.globalAlpha = A;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(wallet[0] + 4 * s, wallet[1] + walletThick + 3 * s * sinT, Rw * 1.08, Rw * 1.08 * sinT, 0, 0, TAU);
    ctx.fill();
    const ww = ctx.createLinearGradient(wallet[0] - Rw, 0, wallet[0] + Rw, 0);
    ww.addColorStop(0, "#14161a");
    ww.addColorStop(0.4, "#4a4f56");
    ww.addColorStop(0.72, "#23262b");
    ww.addColorStop(1, "#0f1114");
    ctx.fillStyle = ww;
    ctx.beginPath();
    ctx.ellipse(wallet[0], wallet[1], Rw, Rw * sinT, 0, 0, Math.PI, false);
    ctx.ellipse(wallet[0], wallet[1] + walletThick, Rw, Rw * sinT, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    const wt = ctx.createRadialGradient(wallet[0] - Rw * 0.3, wallet[1] - Rw * sinT * 0.3, 2, wallet[0], wallet[1], Rw);
    wt.addColorStop(0, "#3a3f46");
    wt.addColorStop(1, "#1c1f23");
    ctx.fillStyle = wt;
    ctx.beginPath();
    ctx.ellipse(wallet[0], wallet[1], Rw, Rw * sinT, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(236,232,223,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = "rgba(236,232,223,0.16)";
    ctx.beginPath();
    ctx.ellipse(wallet[0], wallet[1], Rw * 0.7, Rw * 0.7 * sinT, 0, 0, TAU);
    ctx.stroke();
    /* no path between the wallet plate and the QEVRA base: dotted means not built */
    const l0 = P(WALLET_X + WALLET_R + 3, 0, 0);
    const l1 = P(-A_BASE_R - 3, 0, 0);
    ctx.strokeStyle = "rgba(139,143,150,0.9)";
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(l0[0], l0[1]);
    ctx.lineTo(l1[0], l1[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    /* what the base is meant to hold, said as intent: engraved flat on its rim */
    planeText(ctx, g, font, (A_R[0] + A_BASE_R) / 2 + 1, "ASSETS WOULD LIVE HERE · NONE YET", 0, Math.max(7, 7.4 * s), "rgba(227,169,59,0.92)", A);
  }

  /* ---- rings ---- */
  /* front-wall band of every ring in canvas pixels: used for hover here and for pointer hits in the engine */
  sc.layout.s = s;
  sc.layout.cx = g.cx;
  sc.layout.cx0 = cx0;
  sc.layout.cy = g.cy;
  sc.layout.sinT = sinT;
  sc.layout.cosT = cosT;
  sc.layout.bands.length = 0;
  for (let i = 0; i < 8; i++) {
    const yTop = 4 + i * (A_H + gap) + A_H;
    const y0 = g.cy - yTop * cosT * s + A_R[i] * sinT * s;
    sc.layout.bands.push({ y0, y1: y0 + A_H * cosT * s, half: A_R[i] * s });
  }
  const hoverI = (() => {
    if (!sc.pointer.inside || (glyph && !sc.opts.interactive)) return -1;
    let hit = -1;
    sc.layout.bands.forEach((b, i) => {
      if (Math.abs(sc.pointer.x - g.cx) < b.half && sc.pointer.y >= b.y0 && sc.pointer.y <= b.y1) hit = i;
    });
    return hit;
  })();
  sc.layout.hover = hoverI;

  for (let i = 0; i < 8; i++) {
    const R = A_R[i];
    const r = A_BORE;
    const y0 = 4 + i * (A_H + gap);
    const y1 = y0 + A_H;
    const tone = A_TONES[i % 2];
    const hov = hoverI === i ? 1.22 : 1;
    const em = Math.max(emph(i), st.acct * clamp(1 - i / 3.5, 0, 1));
    const bright = hov * (1 + 0.3 * em) * (1 - 0.55 * dim * (1 - em));
    const dimK = 1 - 0.5 * dim * (1 - em);
    const Rp = R * s;
    const rp = r * s;
    const Yt = g.cy - y1 * cosT * s;
    const hp = A_H * cosT * s;

    /* shadow of this ring on the one below (only readable when exploded) */
    if (i > 0 && e > 0.04 && !glyph) {
      const R2 = A_R[i - 1];
      const Yp = g.cy - (4 + (i - 1) * (A_H + gap) + A_H) * cosT * s;
      ctx.save();
      ctx.translate(g.cx, Yp);
      ctx.scale(1, sinT);
      ctx.beginPath();
      ctx.arc(0, 0, R2 * s, 0, TAU);
      ctx.arc(0, 0, r * s, 0, TAU, true);
      ctx.clip("evenodd");
      const sh = ctx.createRadialGradient(10 * s, -6 * s, R * s * 0.4, 10 * s, -6 * s, R * s * 1.05);
      sh.addColorStop(0, `rgba(0,0,0,${0.5 * Math.min(1, e * 2)})`);
      sh.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.arc(10 * s, -6 * s, R * s * 1.05, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    /* inner back wall (seen through the bore) */
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(g.cx, Yt, rp, rp * sinT, 0, Math.PI, TAU, false);
    ctx.ellipse(g.cx, Yt + hp, rp, rp * sinT, 0, TAU, Math.PI, true);
    ctx.closePath();
    const iw = ctx.createLinearGradient(0, Yt - rp * sinT, 0, Yt + hp);
    iw.addColorStop(0, "#07080a");
    iw.addColorStop(1, "#17191d");
    ctx.fillStyle = iw;
    ctx.fill();
    ctx.restore();

    /* top face: brushed conic gradient on the annulus */
    ctx.save();
    ctx.translate(g.cx, Yt);
    ctx.scale(s, s * sinT);
    const a0 = -0.9 + sc.px * 0.35 + (i % 2) * 0.5;
    const fill = conicFill(
      ctx,
      a0,
      (v) =>
        `rgb(${Math.min(255, tone[0] * v * 1.55 * bright) | 0},${Math.min(255, tone[1] * v * 1.55 * bright) | 0},${Math.min(255, tone[2] * v * 1.55 * bright) | 0})`,
      `rgb(${(tone[0] * 0.7) | 0},${(tone[1] * 0.7) | 0},${(tone[2] * 0.7) | 0})`,
    );
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.arc(0, 0, r, 0, TAU, true);
    ctx.fillStyle = fill;
    ctx.fill("evenodd");
    ctx.restore();

    /* engraved ticks on the top face */
    if (!glyph && s > 0.55) {
      ctx.save();
      ctx.translate(g.cx, Yt);
      ctx.scale(s, s * sinT);
      ctx.lineWidth = 1 / s;
      const rot = ang(i);
      ctx.strokeStyle = "rgba(10,11,13,0.55)";
      ctx.beginPath();
      for (let k = 0; k < 72; k++) {
        const a = rot + (k / 72) * TAU;
        const major = k % 6 === 0;
        const r1 = R - 3;
        const r2 = R - (major ? 11 : 6.5);
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      }
      ctx.stroke();
      ctx.restore();
    }

    /* outer wall */
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(g.cx, Yt, Rp, Rp * sinT, 0, 0, Math.PI, false);
    ctx.ellipse(g.cx, Yt + hp, Rp, Rp * sinT, 0, Math.PI, 0, true);
    ctx.closePath();
    const gr = ctx.createLinearGradient(g.cx - Rp, 0, g.cx + Rp, 0);
    const N = 20;
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      const sx2 = u * 2 - 1;
      const c = Math.sqrt(Math.max(0, 1 - sx2 * sx2));
      const d1 = Math.max(0, sx2 * L[0] + c * L[2]);
      const d2 = Math.max(0, sx2 * 0.9 + c * 0.1);
      const sp = Math.pow(Math.max(0, sx2 * Hh[0] + c * Hh[2]), 44);
      const kk = (0.13 + 0.92 * d1 + 0.2 * d2) * bright;
      gr.addColorStop(
        u,
        `rgb(${Math.min(255, tone[0] * kk + sp * 190 * dimK) | 0},${Math.min(255, tone[1] * kk + sp * 176 * dimK) | 0},${Math.min(255, tone[2] * kk + sp * 150 * dimK) | 0})`,
      );
    }
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.restore();

    /* top chamfer highlight and bottom shadow line */
    ctx.save();
    ctx.lineWidth = 1;
    const act = Math.max(scatter > 0.02 ? 4 * lockI(i) * (1 - lockI(i)) : 0, em);
    ctx.strokeStyle = act > 0.05 ? `rgba(255,226,176,${Math.min(1, 0.46 + 0.5 * act)})` : `rgba(255,248,232,${0.46 * dimK})`;
    ctx.lineWidth = act > 0.05 ? 1 + act : 1;
    ctx.beginPath();
    ctx.ellipse(g.cx, Yt, Rp, Rp * sinT, 0, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.ellipse(g.cx, Yt + hp, Rp, Rp * sinT, 0, 0, Math.PI, false);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(g.cx, Yt, rp, rp * sinT, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();

    /* engraved text on the wall */
    if (!glyph) {
      const fs = clamp(A_H * s * 0.5, 7.5, 11.5);
      const rot = ang(i);
      const yMid = y0 + A_H * 0.5;
      const changed = i === A_AMOUNT && mis > 0.5;
      const lab = changed ? "AMOUNT" : A_RINGS[i][0];
      const val = changed ? "CHANGED" : A_RINGS[i][1];
      const col = hoverI === i ? "rgba(255,248,232,0.95)" : `rgba(255,248,232,${Math.min(0.97, (0.62 + 0.33 * em) * dimK)})`;
      wallText(ctx, g, font, R, yMid, lab, rot - 0.17, -1, fs, col, "edge");
      wallText(
        ctx,
        g,
        font,
        R,
        yMid,
        val,
        rot + 0.17,
        1,
        fs,
        changed ? "rgba(229,96,77,0.95)" : hoverI === i ? "rgba(255,248,232,0.95)" : `rgba(255,248,232,${Math.min(0.95, (0.46 + 0.45 * em) * dimK)})`,
        "edge",
      );
    }

    /* the notch (the slot the light travels through) */
    const th = ang(i);
    const dth = (glyph ? 8 : 5) / R;
    if (Math.cos(th) > 0.1) {
      const lit = litFrom[i];
      const pts = [wallPt(R, th - dth, y1), wallPt(R, th + dth, y1), wallPt(R, th + dth, y0), wallPt(R, th - dth, y0)];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < 4; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.closePath();
      ctx.fillStyle = "#050607";
      ctx.fill();
      if (lit > 0.01) {
        ctx.fillStyle = `rgba(255,236,196,${0.95 * lit})`;
        ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        const cxn = (pts[0][0] + pts[1][0]) / 2;
        const cyn = (pts[0][1] + pts[3][1]) / 2;
        const gl = ctx.createRadialGradient(cxn, cyn, 1, cxn, cyn, 26 * s + 8);
        gl.addColorStop(0, `rgba(255,214,150,${0.5 * lit})`);
        gl.addColorStop(1, "rgba(255,214,150,0)");
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(cxn, cyn, 26 * s + 8, 0, TAU);
        ctx.fill();
      } else if (i === A_AMOUNT && mis > 0.2) {
        ctx.strokeStyle = "rgba(229,96,77,0.9)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* light line through the gaps between lit rings */
  if (e > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 7; i++) {
      const lit = Math.min(litFrom[i], litFrom[i + 1]);
      if (lit < 0.02) continue;
      const a = wallPt(A_R[i], 0, 4 + i * (A_H + gap) + A_H);
      const b = wallPt(A_R[i + 1], 0, 4 + (i + 1) * (A_H + gap));
      ctx.fillStyle = `rgba(255,224,170,${0.85 * lit})`;
      ctx.fillRect(a[0] - 1.5, b[1], 3, a[1] - b[1]);
      const gl = ctx.createLinearGradient(a[0] - 10, 0, a[0] + 10, 0);
      gl.addColorStop(0, "rgba(255,214,150,0)");
      gl.addColorStop(0.5, `rgba(255,214,150,${0.22 * lit})`);
      gl.addColorStop(1, "rgba(255,214,150,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(a[0] - 10, b[1], 20, a[1] - b[1]);
    }
    ctx.restore();
  }

  /* base notch pool when fully aligned */
  if (allLit > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const p0 = wallPt(A_R[0], 0, 4);
    const gl = ctx.createRadialGradient(p0[0], p0[1] + 8, 1, p0[0], p0[1] + 8, 60 * s);
    gl.addColorStop(0, `rgba(255,226,170,${0.38 * allLit})`);
    gl.addColorStop(1, "rgba(255,226,170,0)");
    ctx.translate(p0[0], p0[1] + 8);
    ctx.scale(1, 0.38);
    ctx.translate(-p0[0], -(p0[1] + 8));
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(p0[0], p0[1] + 8, 60 * s, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ---- launch: a pulse of light travelling down the aligned notches, top ring to base ---- */
  if (!glyph && st.beam >= 0 && st.beam <= 1.2) {
    const topY = pqY + pqH;
    const yb = lerp(topY, 0, clamp(st.beam, 0, 1));
    const frontR = (y: number) => A_R[clamp(Math.floor((y - 4) / (A_H + gap)), 0, 7)];
    const head = wallPt(frontR(yb), 0, yb);
    const tail = wallPt(frontR(Math.min(topY, yb + 150)), 0, Math.min(topY, yb + 150));
    const fade = 1 - smooth(1, 1.2, st.beam);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const trail = ctx.createLinearGradient(0, tail[1], 0, head[1]);
    trail.addColorStop(0, "rgba(255,226,176,0)");
    trail.addColorStop(1, `rgba(255,236,196,${0.9 * fade})`);
    ctx.fillStyle = trail;
    ctx.fillRect(head[0] - 2.5, tail[1], 5, head[1] - tail[1]);
    const halo = ctx.createRadialGradient(head[0], head[1], 1, head[0], head[1], 46 * s + 10);
    halo.addColorStop(0, `rgba(255,236,196,${0.85 * fade})`);
    halo.addColorStop(0.4, `rgba(255,214,150,${0.35 * fade})`);
    halo.addColorStop(1, "rgba(255,214,150,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(head[0], head[1], 46 * s + 10, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ---- PQ authorization ring: outline only (experimental) ---- */
  if (st.pq > 0.01) {
    const R = pqR;
    const Rp = R * s;
    const Yt = g.cy - (pqY + pqH) * cosT * s;
    const hp = pqH * cosT * s;
    /* chapter 3: restrained tungsten light on the experimental ring. It marks the state; it does not mean "verified". */
    if (!glyph && st.pqGlow > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const pg = ctx.createRadialGradient(g.cx, Yt, 4, g.cx, Yt, 160 * s);
      pg.addColorStop(0, `rgba(227,169,59,${0.2 * st.pqGlow * st.pq})`);
      pg.addColorStop(0.55, `rgba(227,169,59,${0.06 * st.pqGlow * st.pq})`);
      pg.addColorStop(1, "rgba(227,169,59,0)");
      ctx.translate(g.cx, Yt);
      ctx.scale(1, Math.max(0.45, sinT * 1.5));
      ctx.translate(-g.cx, -Yt);
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(g.cx, Yt, 160 * s, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = st.pq;
    ctx.strokeStyle = glyph ? "rgba(227,169,59,0.95)" : "rgba(227,169,59,0.9)";
    ctx.lineWidth = glyph ? 1.2 : 1.3 + 0.5 * st.pqGlow;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(g.cx, Yt, Rp, Rp * sinT, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(g.cx, Yt, (R - 14) * s, (R - 14) * s * sinT, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(g.cx, Yt + hp, Rp, Rp * sinT, 0, 0, Math.PI, false);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(g.cx - Rp, Yt);
    ctx.lineTo(g.cx - Rp, Yt + hp);
    ctx.moveTo(g.cx + Rp, Yt);
    ctx.lineTo(g.cx + Rp, Yt + hp);
    ctx.stroke();
    /* faint hatch on the top face */
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(g.cx, Yt, Rp, Rp * sinT, 0, 0, TAU);
    ctx.ellipse(g.cx, Yt, (R - 14) * s, (R - 14) * s * sinT, 0, 0, TAU, true);
    ctx.clip("evenodd");
    ctx.strokeStyle = "rgba(227,169,59,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -Rp - 20; x < Rp + 20; x += 6) {
      ctx.moveTo(g.cx + x, Yt - Rp * sinT);
      ctx.lineTo(g.cx + x + 10, Yt + Rp * sinT);
    }
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    if (!glyph) {
      wallText(ctx, g, font, R, pqY + pqH * 0.5, "ML-DSA · UNDER EVALUATION", 0, 0, clamp(pqH * s * 0.55, 7, 10.5), "rgba(227,169,59,0.95)", "center", st.pq);
    }
    /* dotted continuation of the light line: unknown, not lit */
    if (!glyph) {
      const a = wallPt(A_R[7], 0, stackTop);
      const b = wallPt(pqR, 0, pqY);
      ctx.save();
      ctx.strokeStyle = "rgba(139,143,150,0.7)";
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ---- Security Swarm: separate research ring, review dock, air gap ---- */
  let airGeo: { gx0: number; gx1: number; gy: number; dockX: number; dockY: number; ringX: number; ringTop: number } | null = null;
  if (swarm > 0.01) {
    const X = -(A_R[0] + 96);
    const Y = stackTop + 18 + (1 - swarm) * 30;
    const Z = -6;
    const R = 64;
    const Hs = 8;
    const rot = sc.t * 0.12;
    const Yt = g.cy - (Y + Hs) * cosT * s + Z * sinT * s;
    const cxr = g.cx + X * s;
    const Rp = R * s;
    const hp = Hs * cosT * s;
    ctx.save();
    ctx.globalAlpha = swarm;
    /* wall */
    const wg = ctx.createLinearGradient(cxr - Rp, 0, cxr + Rp, 0);
    wg.addColorStop(0, "#23262b");
    wg.addColorStop(0.35, "#767b82");
    wg.addColorStop(0.5, "#a9aeb3");
    wg.addColorStop(0.8, "#34383e");
    wg.addColorStop(1, "#17191c");
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.ellipse(cxr, Yt, Rp, Rp * sinT, 0, 0, Math.PI, false);
    ctx.ellipse(cxr, Yt + hp, Rp, Rp * sinT, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(cxr, Yt);
    ctx.scale(s, s * sinT);
    const tg = conicFill(
      ctx,
      rot,
      (v) => `rgb(${Math.min(255, 150 * v * 1.5) | 0},${Math.min(255, 156 * v * 1.5) | 0},${Math.min(255, 162 * v * 1.5) | 0})`,
      "#8d9298",
    );
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.arc(0, 0, R - 9, 0, TAU, true);
    ctx.fill("evenodd");
    ctx.restore();
    ctx.strokeStyle = "rgba(255,248,232,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cxr, Yt, Rp, Rp * sinT, 0, 0, TAU);
    ctx.stroke();
    /* the three lanes, as three small engraved tabs */
    const names = ["R", "T", "S"];
    for (let k = 0; k < 3; k++) {
      const a = rot + k * (TAU / 3) + 0.4;
      const tx = cxr + Math.cos(a) * (R - 4.5) * s;
      const ty = Yt + Math.sin(a) * (R - 4.5) * s * sinT;
      ctx.fillStyle = "rgba(12,13,15,0.9)";
      ctx.fillRect(tx - 4, ty - 2.5, 8, 5);
      ctx.fillStyle = "rgba(236,232,223,0.9)";
      ctx.font = `600 6px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(names[k], tx, ty + 0.5);
    }
    ctx.restore();
    if (!glyph) {
      ctx.save();
      ctx.globalAlpha = swarm;
      wallTextAt(ctx, g, font, cxr, Yt, Hs, R, "SWARM · NO SPEND AUTHORITY", 6.8, "rgba(12,13,15,0.78)");
      ctx.restore();
    }

    /* review dock: a small slab between the ring and the stack */
    const dx = X - 28;
    const dy = Y - 96;
    const dz = 6;
    const dw = 56;
    const dd = 30;
    const dh = 12;
    const p00 = P(dx, dy + dh, dz - dd / 2);
    const p10 = P(dx + dw, dy + dh, dz - dd / 2);
    const p11 = P(dx + dw, dy + dh, dz + dd / 2);
    const p01 = P(dx, dy + dh, dz + dd / 2);
    const q01 = P(dx, dy, dz + dd / 2);
    const q11 = P(dx + dw, dy, dz + dd / 2);
    ctx.save();
    ctx.globalAlpha = swarm;
    ctx.fillStyle = "#2a2e34";
    ctx.beginPath();
    ctx.moveTo(p01[0], p01[1]);
    ctx.lineTo(p11[0], p11[1]);
    ctx.lineTo(q11[0], q11[1]);
    ctx.lineTo(q01[0], q01[1]);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#3d4249";
    ctx.beginPath();
    ctx.moveTo(p00[0], p00[1]);
    ctx.lineTo(p10[0], p10[1]);
    ctx.lineTo(p11[0], p11[1]);
    ctx.lineTo(p01[0], p01[1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(236,232,223,0.35)";
    ctx.stroke();
    /* the dock stays dark: it lights only from a recorded human review */
    ctx.strokeStyle = "rgba(139,143,150,0.8)";
    ctx.setLineDash([2, 2]);
    const c0 = P(dx + 8, dy + dh, dz);
    const c1 = P(dx + dw - 8, dy + dh, dz);
    ctx.beginPath();
    ctx.moveTo(c0[0], c0[1]);
    ctx.lineTo(c1[0], c1[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    /* tether from ring to dock: dotted, reports only */
    const t0: Pt = [cxr - Rp * 0.02, Yt + hp + Rp * sinT + 1];
    const t1: Pt = [(p01[0] + p11[0]) / 2, p00[1] - 1];
    ctx.strokeStyle = "rgba(236,232,223,0.55)";
    ctx.setLineDash([1.5, 3]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(t0[0], t0[1]);
    ctx.lineTo(t1[0], t1[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    /* air gap dimension line between the dock and the stack */
    if (!glyph && ((labelsOn && s >= 0.7) || (st.air > 0.05 && s >= 0.4))) {
      const gy = (q11[1] + p11[1]) / 2;
      const gx0 = q11[0] + 8;
      const gx1 = g.cx - (A_R[6] + 4) * s;
      const dm = P(dx + dw / 2, dy, dz + dd / 2);
      airGeo = { gx0, gx1, gy, dockX: dm[0], dockY: dm[1], ringX: cxr, ringTop: Yt - Rp * sinT };
      if (gx1 - gx0 > 24) {
        ctx.save();
        ctx.globalAlpha = swarm;
        ctx.strokeStyle = "rgba(236,232,223,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gx0, gy);
        ctx.lineTo(gx1, gy);
        ctx.moveTo(gx0, gy - 4);
        ctx.lineTo(gx0, gy + 4);
        ctx.moveTo(gx1, gy - 4);
        ctx.lineTo(gx1, gy + 4);
        ctx.stroke();
        ctx.fillStyle = "rgba(236,232,223,0.78)";
        ctx.font = `500 10px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("air gap", (gx0 + gx1) / 2, gy + (compact ? 31 : 7));
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = swarm;
      ctx.fillStyle = "rgba(139,143,150,1)";
      ctx.font = `500 10px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const mid = P(dx + dw / 2, dy, dz + dd / 2);
      ctx.fillText("human review", mid[0], mid[1] + 5);
      ctx.restore();
    }
  }

  /* ---- callouts ---- */
  if (labelsOn && (lblA > 0.02 || st.pqGlow > 0.02 || st.air > 0.02)) {
    const lx0 = Math.max(g.cx + A_BASE_R * s + 18, w - rightPad + 14);
    /* [anchor, line 1, line 2, colour, final alpha, text x] */
    const callouts: Array<[Pt, string, string, string, number, number]> = [];
    const pqEdge = wallPt(pqR, 1.15, pqY + pqH * 0.5);
    const pqAlpha = st.pq * Math.max(lblA, st.pqGlow);
    /* up close the callout sits beside the ring instead of in the far-right column, and stays on the canvas */
    const pqLx = lerp(lx0, Math.min(g.cx + pqR * s + 24, w - 190), st.pqGlow);
    callouts.push([pqEdge, "Post-quantum authorization", "ML-DSA · under evaluation", "rgba(227,169,59,1)", pqAlpha, pqLx]);
    const midRing = wallPt(A_R[4], 1.12, 4 + 4 * (A_H + gap) + A_H * 0.5);
    callouts.push([midRing, "Intent Lock", "8 rings, one per detail", "rgba(236,232,223,1)", lblA, lx0]);
    const baseEdge = wallPt(A_BASE_R, 1.0, 0);
    callouts.push([baseEdge, "QEVRA smart account", "design preview, not deployed", "rgba(139,143,150,1)", lblA, lx0]);
    for (const [pt, t1, t2, col, a, lx] of callouts) {
      if (a < 0.05) continue;
      const ty = pt[1];
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pt[0] + 3, pt[1]);
      ctx.lineTo(lx - 6, ty);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 2.2, 0, TAU);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.font = `500 11px ${font}`;
      ctx.fillStyle = col;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(t1, lx, ty - 1);
      ctx.font = `400 10px ${font}`;
      ctx.fillStyle = "rgba(139,143,150,1)";
      ctx.fillText(t2, lx, ty + 12);
      ctx.restore();
    }
    if (swarm > 0.05) {
      const rp: Pt = [
        g.cx - (A_R[0] + 96) * s,
        g.cy - (stackTop + 18 + (1 - swarm) * 30 + 8) * cosT * s - 64 * sinT * s - 10 - 6 * s,
      ];
      ctx.save();
      ctx.globalAlpha = swarm * Math.max(lblA, st.air);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = `400 10px ${font}`;
      const tw = ctx.measureText("researches, tests, reports").width;
      /* keep the label on the canvas when the stage is narrow */
      const rx = clamp(rp[0], tw / 2 + 8, Math.max(tw / 2 + 8, w - tw / 2 - 8));
      ctx.font = `500 11px ${font}`;
      ctx.fillStyle = "rgba(236,232,223,1)";
      ctx.fillText("Security Swarm", rx, rp[1] - 14);
      ctx.font = `400 10px ${font}`;
      ctx.fillStyle = "rgba(139,143,150,1)";
      ctx.fillText("researches, tests, reports", rx, rp[1]);
      ctx.restore();
    }
  }

  /* ---- chapter annotations: separate passes, so a phone gets shorter wording than a desktop ---- */
  if (!glyph) {
    const f1 = compact ? 10 : 11;
    const f2 = compact ? 9 : 10;
    const ink = "rgba(236,232,223,1)";
    const muted = "rgba(139,143,150,1)";

    /* chapter 2: the ring under the highlight sweep names itself and says what it stands for */
    if (st.hlA > 0.02) {
      const lo = Math.floor(st.hl);
      const hi = Math.ceil(st.hl);
      /* on a phone the note sits at a fixed spot, so only the nearest ring speaks at a time */
      const nearest = Math.round(st.hl);
      for (const i of compact ? [nearest] : lo === hi ? [lo] : [lo, hi]) {
        if (i < 0 || i > 7) continue;
        const a = compact ? st.hlA * clamp(1 - Math.abs(st.hl - i) * 1.6) : hlW(i);
        if (a < 0.05) continue;
        const head = `${String(i + 1).padStart(2, "0")}  ${A_RINGS[i][0]}`;
        const yMid = 4 + i * (A_H + gap) + A_H * 0.5;
        if (compact) {
          noteBlock(ctx, font, { ax: 0, ay: 0, x: 10, y: 22, lines: [head, RING_NOTES[i]], color: ink, alpha: a, side: "none", f1, f2, w });
        } else {
          const right = wallPt(A_R[i], 1.1, yMid);
          const rightRoom = w - (g.cx + A_R[i] * s + 26);
          const leftRoom = g.cx - A_R[i] * s - 26;
          const useRight = rightRoom >= leftRoom;
          const anchor = useRight ? right : wallPt(A_R[i], -1.1, yMid);
          noteBlock(ctx, font, {
            ax: anchor[0],
            ay: anchor[1],
            x: useRight ? g.cx + A_R[i] * s + 26 : g.cx - A_R[i] * s - 26,
            y: anchor[1],
            lines: [head, RING_NOTES[i]],
            color: ink,
            alpha: a,
            side: useRight ? "right" : "left",
            f1,
            f2,
            w,
          });
        }
      }
    }

    /* chapter 3, phones: the callout column does not fit, so the ring names itself at a fixed spot */
    if (compact && st.pqGlow > 0.02) {
      noteBlock(ctx, font, { ax: 0, ay: 0, x: 10, y: 22, lines: ["Post-quantum authorization", "ML-DSA · under evaluation"], color: "rgba(227,169,59,1)", alpha: st.pqGlow * st.pq, side: "none", f1, f2, w });
    }

    /* chapter 1: name the connected wallet and the QEVRA account as two different things */
    if (st.acct > 0.02) {
      const A = st.acct;
      const below = wallet[1] + walletThick + WALLET_R * s * sinT + 24;
      noteBlock(ctx, font, {
        ax: wallet[0],
        ay: wallet[1] + walletThick + WALLET_R * s * sinT + 2,
        x: wallet[0],
        y: below,
        lines: compact ? ["Your wallet"] : ["Your connected wallet", "external account (EOA)", "QEVRA protection: none claimed"],
        color: ink,
        alpha: A,
        side: "center",
        f1,
        f2,
        w,
      });
      const baseBottom = g.cy + (A_BASE_R * sinT + 10 * cosT) * s;
      noteBlock(ctx, font, {
        ax: g.cx,
        ay: baseBottom + 1,
        x: g.cx,
        y: baseBottom + 24,
        lines: compact ? ["QEVRA account"] : ["QEVRA smart account", "separate address · experimental", "design preview, not deployed"],
        color: "rgba(227,169,59,1)",
        alpha: A,
        side: "center",
        f1,
        f2,
        w,
      });
      const m = P((WALLET_X + WALLET_R - A_BASE_R) / 2, 0, 0);
      ctx.save();
      ctx.globalAlpha = A;
      ctx.fillStyle = muted;
      ctx.font = `400 ${f2}px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(compact ? "no link yet" : "no deposit path yet", clamp(m[0], 60, w - 60), m[1] - 38);
      ctx.restore();
    }

    /* chapter 3: the separation of responsibilities, said next to the things it separates */
    if (st.air > 0.02 && airGeo) {
      const A = st.air * swarm;
      const { gx0, gx1, gy, dockX, dockY, ringX, ringTop } = airGeo;
      if (compact) {
        noteBlock(ctx, font, { ax: 0, ay: 0, x: clamp(ringX, 60, w - 60), y: ringTop - 20, lines: ["Security Swarm", "researches, tests, reports"], color: ink, alpha: A, side: "center", leader: false, f1, f2, w });
      }
      ctx.save();
      ctx.globalAlpha = A;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = muted;
      ctx.font = `400 ${f2}px ${font}`;
      ctx.fillText("unlit until recorded", clamp(dockX - 16, 70, w - 70), dockY + 19);
      if (gx1 - gx0 > 24) {
        const cxm = (gx0 + gx1) / 2;
        ctx.fillStyle = "rgba(236,232,223,0.78)";
        if (gx1 - gx0 > 100) ctx.fillText("no keys · no signing", clamp(cxm + 6, 70, w - 70), gy + 21);
        /* no path: a dotted line with a cross over it, as in the diagram below the story */
        ctx.strokeStyle = "rgba(236,232,223,0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(gx0, gy - 12);
        ctx.lineTo(gx1, gy - 12);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(cxm - 5, gy - 17);
        ctx.lineTo(cxm + 5, gy - 7);
        ctx.moveTo(cxm + 5, gy - 17);
        ctx.lineTo(cxm - 5, gy - 7);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

/** Callout-style label: optional dot and leader from an anchor, then up to three lines of text. */
function noteBlock(
  ctx: CanvasRenderingContext2D,
  font: string,
  o: {
    ax: number;
    ay: number;
    x: number;
    y: number;
    lines: string[];
    color: string;
    alpha: number;
    side: "right" | "left" | "center" | "none";
    /** draw a dot and leader from the anchor (default true); false centres the text with no leader */
    leader?: boolean;
    f1: number;
    f2: number;
    w: number;
  },
): void {
  ctx.save();
  ctx.globalAlpha = o.alpha;
  let tw = 0;
  o.lines.forEach((t, k) => {
    ctx.font = `${k === 0 ? 500 : 400} ${k === 0 ? o.f1 : o.f2}px ${font}`;
    tw = Math.max(tw, ctx.measureText(t).width);
  });
  let tx = o.side === "left" ? o.x - tw : o.side === "center" ? o.x - tw / 2 : o.x;
  tx = clamp(tx, 8, Math.max(8, o.w - tw - 8));
  if (o.side !== "none" && o.leader !== false) {
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
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  o.lines.forEach((t, k) => {
    ctx.font = `${k === 0 ? 500 : 400} ${k === 0 ? o.f1 : o.f2}px ${font}`;
    ctx.fillStyle = k === 0 ? o.color : "rgba(139,143,150,1)";
    ctx.fillText(t, tx, o.y + (k === 0 ? 0 : 12 + (k - 1) * 12));
  });
  ctx.restore();
}

/** Text lying flat on a horizontal ring of the stack, centred on the front. Reads upright from the camera. */
function planeText(
  ctx: CanvasRenderingContext2D,
  g: Geo,
  font: string,
  R: number,
  text: string,
  theta0: number,
  fs: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.font = `500 ${fs}px ${font}`;
  const adv = ctx.measureText("M").width + 0.8;
  const dth = adv / (R * g.s);
  let th = theta0 - (dth * text.length) / 2;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let k = 0; k < text.length; k++) {
    const c = th + dth / 2;
    th += dth;
    const cs = Math.cos(c);
    if (cs < 0.2) continue;
    const x = g.cx + R * Math.sin(c) * g.s;
    const y = g.cy + R * cs * g.sinT * g.s;
    ctx.globalAlpha = alpha * clamp((cs - 0.2) / 0.35);
    ctx.setTransform(g.dpr * cs, g.dpr * (-Math.sin(c) * g.sinT), g.dpr * Math.sin(c), g.dpr * cs * g.sinT, g.dpr * x, g.dpr * y);
    ctx.fillText(text[k], 0, 0);
  }
  ctx.restore();
}

/**
 * Text engraved on a cylinder wall, one character at a time with an affine transform.
 * align 'edge' keeps the text ending (dir -1) or starting (dir 1) at theta0; 'center' centres it there.
 */
function wallText(
  ctx: CanvasRenderingContext2D,
  g: Geo,
  font: string,
  R: number,
  yMid: number,
  text: string,
  theta0: number,
  dir: number,
  fs: number,
  color: string,
  align: "edge" | "center",
  alpha?: number,
): void {
  ctx.save();
  ctx.font = `500 ${fs}px ${font}`;
  const adv = ctx.measureText("M").width + 0.9;
  const Rp = R * g.s;
  const dth = adv / Rp;
  const total = dth * text.length;
  let th = align === "center" ? theta0 - total / 2 : dir > 0 ? theta0 : theta0 - total;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let k = 0; k < text.length; k++) {
    const c = th + dth / 2;
    th += dth;
    const cs = Math.cos(c);
    if (cs < 0.2) continue;
    const x = g.cx + R * Math.sin(c) * g.s;
    const y = g.cy - yMid * g.cosT * g.s + R * cs * g.sinT * g.s;
    ctx.globalAlpha = (alpha == null ? 1 : alpha) * clamp((cs - 0.2) / 0.35);
    ctx.setTransform(g.dpr * cs, g.dpr * (-Math.sin(c) * g.sinT), 0, g.dpr * g.cosT, g.dpr * x, g.dpr * y);
    ctx.fillText(text[k], 0, 0);
  }
  ctx.restore();
}

/** Same idea for a ring that is not centred on the stack axis. */
function wallTextAt(
  ctx: CanvasRenderingContext2D,
  g: Geo,
  font: string,
  cxr: number,
  Yt: number,
  Hs: number,
  R: number,
  text: string,
  fs: number,
  color: string,
): void {
  ctx.save();
  ctx.font = `600 ${fs}px ${font}`;
  const adv = ctx.measureText("M").width + 0.8;
  const Rp = R * g.s;
  const dth = adv / Rp;
  const total = dth * text.length;
  let th = -total / 2;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const hp = Hs * g.cosT * g.s;
  for (let k = 0; k < text.length; k++) {
    const c = th + dth / 2;
    th += dth;
    const cs = Math.cos(c);
    if (cs < 0.2) continue;
    const x = cxr + R * Math.sin(c) * g.s;
    const y = Yt + hp * 0.5 + R * cs * g.sinT * g.s;
    ctx.setTransform(g.dpr * cs, g.dpr * (-Math.sin(c) * g.sinT), 0, g.dpr * g.cosT, g.dpr * x, g.dpr * y);
    ctx.fillText(text[k], 0, 0);
  }
  ctx.restore();
}
