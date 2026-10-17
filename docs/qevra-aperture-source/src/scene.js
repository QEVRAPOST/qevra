/* ---------- Aperture: orthographic ring stack drawn in Canvas 2D ----------
   State (all numbers, eased by Scene):
   explode 0..1   gap between rings
   scatter 0..1   how far unlocked rings are turned away from their reviewed angle
   rev     0..1   review progress: rings lock one by one, top ring first, then down the stack
   mis     0..1   the amount ring turned out of line (a detail changed after review)
   lit     0..1   the light source (it only passes through slots that line up)
   pq      0..1   outlined post-quantum ring
   swarm   0..1   separate Security Swarm ring, dock and air gap
   tilt    -.2..+.3 camera elevation offset (radians)
   zoom    1..1.6 magnification about the focal height fy (0 base .. 1 top of the stack)
*/
const A_RINGS = [
  ['RECIPIENT', 'EXAMPLE ADDR'],
  ['CHAIN ID', '46630'],
  ['TOKEN IN → OUT', 'TKN-A → TKN-B'],
  ['AMOUNT', 'EXAMPLE'],
  ['ROUTER · ALLOWANCE', 'NOT CONFIGURED'],
  ['SLIPPAGE · MIN OUT', 'EXAMPLE'],
  ['NONCE', 'EXAMPLE'],
  ['DEADLINE', 'EXAMPLE']
];
const A_R = [158, 148, 138, 129, 121, 113, 106, 99];
const A_BORE = 54, A_H = 18, A_BASE_R = 182, A_AMOUNT = 3;
const A_TONES = [[96, 101, 110], [132, 121, 104]];
const A_CONIC = [[0, .34], [.07, .62], [.11, .30], [.2, .2], [.29, .5], [.35, .22], [.47, .38], [.56, .7], [.6, .28], [.72, .18], [.81, .46], [.9, .26], [1, .34]];
/* turn applied to each ring while it is not yet locked (radians), ring 0 at the base */
const A_SCAT = [1.25, -1.35, 0.8, -0.95, 1.3, -0.55, 1.05, -1.25];
/* plain-language line per ring, shown when a ring is hovered. These describe the design, not a working check. */
const A_DESC = [
  'Recipient: who receives the swapped tokens. A different address is a different swap.',
  'Chain ID: which network the swap is for. 46630 is Robinhood Testnet.',
  'Token in and out: the two tokens. The design allows only tokens from a reviewed list.',
  'Amount: how much you pay. If this changes after you review, the ring turns out of line.',
  'Router and allowance: which swap router, and how much it may pull. Not configured yet.',
  'Slippage and minimum out: the worst price you accept.',
  'Nonce: a one-time number, so an approval cannot be used twice.',
  'Deadline: when the approval runs out.'
];
const A_FONT_MONO = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

function aNorm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

function drawAperture(ctx, w, h, st, sc) {
  const mode = sc.opts.mode || 'hero';
  const glyph = mode === 'glyph';
  const tilt = st.tilt || 0, zoom = st.zoom == null ? 1 : st.zoom, fy = st.fy == null ? 0.5 : st.fy;
  const scatter = st.scatter || 0, rev = st.rev == null ? 1 : st.rev;
  const T = clamp(0.5 + tilt + sc.py * 0.07, 0.3, 1.15), sinT = Math.sin(T), cosT = Math.cos(T);
  const e = st.explode, gap = lerp(3, 40, e);
  const labelsOn = !glyph && w >= 520 && sc.opts.labels !== false;
  const rightPad = labelsOn ? 206 : 0;
  const swarm = glyph ? 0 : st.swarm;
  const stackTop = 4 + 7 * (A_H + gap) + A_H;
  const pqY = stackTop + lerp(10, 40, e);
  const pqH = 12, pqR = 92;
  const fitE = sc.opts.fitExplode != null ? sc.opts.fitExplode : e;
  const gapF = lerp(3, 40, fitE);
  const topF = 4 + 7 * (A_H + gapF) + A_H + lerp(10, 40, fitE) + pqH;
  /* on a narrow canvas the space kept for the Swarm ring is only reserved while the Swarm is on show */
  const xmin = glyph ? -A_BASE_R : (w < 520 ? lerp(-(A_BASE_R + 6), -(A_R[0] + 168), smooth(0, 1, st.swarm)) : -(A_R[0] + 168)), xmax = A_BASE_R;
  const sx = (w - rightPad - 28) / (xmax - xmin);
  const yUnitsPx = (topF * cosT + pqR * sinT) + (10 * cosT + A_BASE_R * sinT);
  const sy = (h - (glyph ? 6 : 64)) / yUnitsPx;
  const s0 = Math.min(sx, sy);
  const totalH = yUnitsPx * s0;
  const left = (w - rightPad - (xmax - xmin) * s0) / 2;
  const cx0 = left + (-xmin) * s0, cy0 = (h - totalH) / 2 + (topF * cosT + pqR * sinT) * s0;
  /* zoom about a focal height: the focal point glides to the middle of the canvas as the magnification grows */
  const s = s0 * zoom, cb = smooth(1, 1.35, zoom), yf = fy * topF;
  const pv = lerp(cy0 - yf * cosT * s0, h * 0.5, cb);
  const g = { s, sinT, cosT, dpr: sc.dpr, cx: lerp(cx0, w * 0.5, cb), cy: pv + yf * cosT * s };
  const lblA = 1 - smooth(1.03, 1.2, zoom);
  const P = (x, y, z) => [g.cx + x * s, g.cy - y * cosT * s + z * sinT * s];
  const wallPt = (R, th, yw) => [g.cx + R * Math.sin(th) * s, g.cy - yw * cosT * s + R * Math.cos(th) * sinT * s];

  /* light */
  const L = aNorm([-0.5 + sc.px * 0.55, 0.6, 0.68]);
  const Hh = aNorm([L[0], L[1], L[2] + 1]);

  /* alignment & seam */
  const mis = st.mis;
  const lockI = (i) => smooth((7 - i) / 9, (7 - i + 1.4) / 9, rev);
  const ang = (i) => A_SCAT[i] * scatter * (1 - lockI(i)) + (i === A_AMOUNT ? mis * 0.78 : 0);
  const aligned = (i) => Math.exp(-Math.pow(ang(i) / 0.11, 2));
  const litFrom = new Array(8);
  let acc = st.lit;
  for (let i = 7; i >= 0; i--) { acc *= aligned(i); litFrom[i] = acc; }
  const allLit = litFrom[0];

  /* ---- background pool of light on the floor ---- */
  ctx.save();
  const floorY = g.cy + 4 * sinT * s;
  const floor = ctx.createRadialGradient(g.cx, floorY + 12 * s, 6, g.cx, floorY + 12 * s, A_BASE_R * s * 1.5);
  floor.addColorStop(0, `rgba(255,233,184,${0.20 * allLit + 0.05})`);
  floor.addColorStop(0.5, `rgba(255,233,184,${0.05 * allLit + 0.012})`);
  floor.addColorStop(1, 'rgba(255,233,184,0)');
  ctx.translate(g.cx, floorY + 12 * s); ctx.scale(1, sinT); ctx.translate(-g.cx, -(floorY + 12 * s));
  ctx.fillStyle = floor; ctx.beginPath(); ctx.arc(g.cx, floorY + 12 * s, A_BASE_R * s * 1.5, 0, TAU); ctx.fill();
  ctx.restore();

  /* floor engraving: concentric ellipses */
  if (!glyph) {
    ctx.save(); ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) {
      const R = (A_BASE_R + k * 34) * s;
      ctx.strokeStyle = `rgba(139,143,150,${0.16 - k * 0.035})`;
      ctx.beginPath(); ctx.ellipse(g.cx, g.cy + 4 * sinT * s + 10 * cosT * s, R, R * sinT, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---- base plate ---- */
  const baseTop = g.cy;
  ctx.save();
  const bw = ctx.createLinearGradient(g.cx - A_BASE_R * s, 0, g.cx + A_BASE_R * s, 0);
  bw.addColorStop(0, '#0f1114'); bw.addColorStop(0.22, '#20242a'); bw.addColorStop(0.4, '#2f343b'); bw.addColorStop(0.7, '#17191d'); bw.addColorStop(1, '#0b0c0e');
  ctx.fillStyle = bw;
  ctx.beginPath();
  ctx.ellipse(g.cx, baseTop, A_BASE_R * s, A_BASE_R * s * sinT, 0, 0, Math.PI, false);
  ctx.ellipse(g.cx, baseTop + 10 * cosT * s, A_BASE_R * s, A_BASE_R * s * sinT, 0, Math.PI, 0, true);
  ctx.closePath(); ctx.fill();
  const bt = ctx.createRadialGradient(g.cx - 40 * s, baseTop - 30 * s, 10, g.cx, baseTop, A_BASE_R * s);
  bt.addColorStop(0, '#2b3037'); bt.addColorStop(1, '#14161a');
  ctx.fillStyle = bt;
  ctx.beginPath(); ctx.ellipse(g.cx, baseTop, A_BASE_R * s, A_BASE_R * s * sinT, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(236,232,223,0.22)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(g.cx, baseTop, A_BASE_R * s, A_BASE_R * s * sinT, 0, 0, TAU); ctx.stroke();
  if (!glyph) {
    ctx.strokeStyle = 'rgba(236,232,223,0.08)';
    for (const R of [150, 128]) { ctx.beginPath(); ctx.ellipse(g.cx, baseTop, R * s, R * s * sinT, 0, 0, TAU); ctx.stroke(); }
  }
  ctx.restore();
  if (!glyph) aWallText(ctx, g, A_BASE_R, -5, 'QEVRA SMART ACCOUNT · ROBINHOOD TESTNET 46630', 0, 0, Math.max(7.5, 8 * s), 'rgba(236,232,223,0.42)', 'center', true);

  /* ---- rings ---- */
  const hoverI = (() => {
    if (!sc.pointer.inside || glyph) return -1;
    let hit = -1;
    for (let i = 0; i < 8; i++) {
      const yTop = 4 + i * (A_H + gap) + A_H;
      const y0 = g.cy - yTop * cosT * s + A_R[i] * sinT * s, y1 = y0 + A_H * cosT * s;
      if (Math.abs(sc.pointer.x - g.cx) < A_R[i] * s && sc.pointer.y >= y0 && sc.pointer.y <= y1) hit = i;
    }
    return hit;
  })();
  sc.layout.hover = hoverI;

  const ringGeo = [];
  for (let i = 0; i < 8; i++) {
    const R = A_R[i], r = A_BORE;
    const y0 = 4 + i * (A_H + gap), y1 = y0 + A_H;
    const tone = A_TONES[i % 2];
    const hov = hoverI === i ? 1.22 : 1;
    const Rp = R * s, rp = r * s, Yt = g.cy - y1 * cosT * s, hp = A_H * cosT * s;
    ringGeo.push({ R, Yt, hp, y0, y1 });

    /* shadow of this ring on the one below (only readable when exploded) */
    if (i > 0 && e > 0.04 && !glyph) {
      const R2 = A_R[i - 1], Yp = g.cy - (4 + (i - 1) * (A_H + gap) + A_H) * cosT * s;
      ctx.save();
      ctx.translate(g.cx, Yp); ctx.scale(1, sinT);
      ctx.beginPath(); ctx.arc(0, 0, R2 * s, 0, TAU); ctx.arc(0, 0, r * s, 0, TAU, true); ctx.clip('evenodd');
      const sh = ctx.createRadialGradient(10 * s, -6 * s, R * s * 0.4, 10 * s, -6 * s, R * s * 1.05);
      sh.addColorStop(0, `rgba(0,0,0,${0.5 * Math.min(1, e * 2)})`); sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(10 * s, -6 * s, R * s * 1.05, 0, TAU); ctx.fill();
      ctx.restore();
    }

    /* inner back wall (seen through the bore) */
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(g.cx, Yt, rp, rp * sinT, 0, Math.PI, TAU, false);
    ctx.ellipse(g.cx, Yt + hp, rp, rp * sinT, 0, TAU, Math.PI, true);
    ctx.closePath();
    const iw = ctx.createLinearGradient(0, Yt - rp * sinT, 0, Yt + hp);
    iw.addColorStop(0, '#07080a'); iw.addColorStop(1, '#17191d');
    ctx.fillStyle = iw; ctx.fill();
    ctx.restore();

    /* top face: brushed conic gradient on the annulus */
    ctx.save();
    ctx.translate(g.cx, Yt); ctx.scale(s, s * sinT);
    let fill;
    const a0 = -0.9 + sc.px * 0.35 + (i % 2) * 0.5;
    if (ctx.createConicGradient) {
      fill = ctx.createConicGradient(a0, 0, 0);
      for (const [o, v] of A_CONIC) fill.addColorStop(o, `rgb(${Math.min(255, tone[0] * v * 1.55 * hov) | 0},${Math.min(255, tone[1] * v * 1.55 * hov) | 0},${Math.min(255, tone[2] * v * 1.55 * hov) | 0})`);
    } else {
      fill = `rgb(${tone[0] * 0.7 | 0},${tone[1] * 0.7 | 0},${tone[2] * 0.7 | 0})`;
    }
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.arc(0, 0, r, 0, TAU, true);
    ctx.fillStyle = fill; ctx.fill('evenodd');
    ctx.restore();

    /* engraved ticks on the top face */
    if (!glyph && s > 0.55) {
      ctx.save();
      ctx.translate(g.cx, Yt); ctx.scale(s, s * sinT);
      ctx.lineWidth = 1 / s;
      const rot = ang(i);
      ctx.strokeStyle = 'rgba(10,11,13,0.55)';
      ctx.beginPath();
      for (let k = 0; k < 72; k++) {
        const a = rot + (k / 72) * TAU, major = k % 6 === 0;
        const r1 = R - 3, r2 = R - (major ? 11 : 6.5);
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
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
      const u = k / N, sx2 = u * 2 - 1, c = Math.sqrt(Math.max(0, 1 - sx2 * sx2));
      const d1 = Math.max(0, sx2 * L[0] + c * L[2]), d2 = Math.max(0, sx2 * 0.9 + c * 0.1);
      const sp = Math.pow(Math.max(0, sx2 * Hh[0] + c * Hh[2]), 44);
      const kk = (0.13 + 0.92 * d1 + 0.2 * d2) * hov;
      gr.addColorStop(u, `rgb(${Math.min(255, tone[0] * kk + sp * 190) | 0},${Math.min(255, tone[1] * kk + sp * 176) | 0},${Math.min(255, tone[2] * kk + sp * 150) | 0})`);
    }
    ctx.fillStyle = gr; ctx.fill();
    /* lower shading band */
    const vg = ctx.createLinearGradient(0, Yt, 0, Yt + hp + Rp * sinT);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.0)');
    ctx.restore();
    /* top chamfer highlight + bottom shadow line */
    ctx.save();
    ctx.lineWidth = 1;
    const act = scatter > 0.02 ? 4 * lockI(i) * (1 - lockI(i)) : 0;
    ctx.strokeStyle = act > 0.05 ? `rgba(255,226,176,${Math.min(1, 0.46 + 0.5 * act)})` : 'rgba(255,248,232,0.46)';
    ctx.lineWidth = act > 0.05 ? 1 + act : 1;
    ctx.beginPath(); ctx.ellipse(g.cx, Yt, Rp, Rp * sinT, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(g.cx, Yt + hp, Rp, Rp * sinT, 0, 0, Math.PI, false); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(g.cx, Yt, rp, rp * sinT, 0, 0, TAU); ctx.stroke();
    ctx.restore();

    /* engraved text on the wall */
    if (!glyph) {
      const fs = clamp(A_H * s * 0.5, 7.5, 11.5);
      const rot = ang(i);
      const yMid = y0 + A_H * 0.5;
      const lab = (i === A_AMOUNT && mis > 0.5) ? 'AMOUNT' : A_RINGS[i][0];
      const val = (i === A_AMOUNT && mis > 0.5) ? 'CHANGED' : A_RINGS[i][1];
      const col = hoverI === i ? 'rgba(255,248,232,0.95)' : 'rgba(255,248,232,0.62)';
      aWallText(ctx, g, R, yMid, lab, rot - 0.17, -1, fs, col, 'edge');
      aWallText(ctx, g, R, yMid, val, rot + 0.17, 1, fs, i === A_AMOUNT && mis > 0.5 ? 'rgba(229,96,77,0.95)' : (hoverI === i ? 'rgba(255,248,232,0.95)' : 'rgba(255,248,232,0.46)'), 'edge');
    }

    /* the notch (the slot the light travels through) */
    const th = ang(i), dth = (glyph ? 8 : 5) / R;
    if (Math.cos(th) > 0.1) {
      const lit = litFrom[i];
      const pts = [wallPt(R, th - dth, y1), wallPt(R, th + dth, y1), wallPt(R, th + dth, y0), wallPt(R, th - dth, y0)];
      ctx.save();
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath();
      ctx.fillStyle = '#050607'; ctx.fill();
      if (lit > 0.01) {
        ctx.fillStyle = `rgba(255,236,196,${0.95 * lit})`; ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        const cxn = (pts[0][0] + pts[1][0]) / 2, cyn = (pts[0][1] + pts[3][1]) / 2;
        const gl = ctx.createRadialGradient(cxn, cyn, 1, cxn, cyn, 26 * s + 8);
        gl.addColorStop(0, `rgba(255,214,150,${0.5 * lit})`); gl.addColorStop(1, 'rgba(255,214,150,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cxn, cyn, 26 * s + 8, 0, TAU); ctx.fill();
      } else if (i === A_AMOUNT && mis > 0.2) {
        ctx.strokeStyle = 'rgba(229,96,77,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* light line through the gaps between lit rings */
  if (e > 0.02) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const lit = Math.min(litFrom[i], litFrom[i + 1]);
      if (lit < 0.02) continue;
      const a = wallPt(A_R[i], 0, 4 + i * (A_H + gap) + A_H), b = wallPt(A_R[i + 1], 0, 4 + (i + 1) * (A_H + gap));
      ctx.fillStyle = `rgba(255,224,170,${0.85 * lit})`;
      ctx.fillRect(a[0] - 1.5, b[1], 3, a[1] - b[1]);
      const gl = ctx.createLinearGradient(a[0] - 10, 0, a[0] + 10, 0);
      gl.addColorStop(0, 'rgba(255,214,150,0)'); gl.addColorStop(0.5, `rgba(255,214,150,${0.22 * lit})`); gl.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = gl; ctx.fillRect(a[0] - 10, b[1], 20, a[1] - b[1]);
    }
    ctx.restore();
  }

  /* base notch pool when fully aligned */
  if (allLit > 0.02) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const p0 = wallPt(A_R[0], 0, 4);
    const gl = ctx.createRadialGradient(p0[0], p0[1] + 8, 1, p0[0], p0[1] + 8, 60 * s);
    gl.addColorStop(0, `rgba(255,226,170,${0.38 * allLit})`); gl.addColorStop(1, 'rgba(255,226,170,0)');
    ctx.translate(p0[0], p0[1] + 8); ctx.scale(1, 0.38); ctx.translate(-p0[0], -(p0[1] + 8));
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p0[0], p0[1] + 8, 60 * s, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---- PQ authorization ring: outline only (experimental) ---- */
  if (st.pq > 0.01) {
    const R = pqR, Rp = R * s, Yt = g.cy - (pqY + pqH) * cosT * s, hp = pqH * cosT * s;
    ctx.save();
    ctx.globalAlpha = st.pq;
    ctx.strokeStyle = glyph ? 'rgba(227,169,59,0.95)' : 'rgba(227,169,59,0.9)';
    ctx.lineWidth = glyph ? 1.2 : 1.3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.ellipse(g.cx, Yt, Rp, Rp * sinT, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(g.cx, Yt, (R - 14) * s, (R - 14) * s * sinT, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(g.cx, Yt + hp, Rp, Rp * sinT, 0, 0, Math.PI, false); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(g.cx - Rp, Yt); ctx.lineTo(g.cx - Rp, Yt + hp); ctx.moveTo(g.cx + Rp, Yt); ctx.lineTo(g.cx + Rp, Yt + hp); ctx.stroke();
    /* faint hatch on the top face */
    ctx.save();
    ctx.beginPath(); ctx.ellipse(g.cx, Yt, Rp, Rp * sinT, 0, 0, TAU); ctx.ellipse(g.cx, Yt, (R - 14) * s, (R - 14) * s * sinT, 0, 0, TAU, true); ctx.clip('evenodd');
    ctx.strokeStyle = 'rgba(227,169,59,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -Rp - 20; x < Rp + 20; x += 6) { ctx.moveTo(g.cx + x, Yt - Rp * sinT); ctx.lineTo(g.cx + x + 10, Yt + Rp * sinT); }
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    if (!glyph) aWallText(ctx, g, R, pqY + pqH * 0.5, 'ML-DSA · UNDER EVALUATION', 0, 0, clamp(pqH * s * 0.55, 7, 10.5), 'rgba(227,169,59,0.95)', 'center', false, st.pq);
    /* dotted continuation of the light line: unknown, not lit */
    if (!glyph) {
      const a = wallPt(A_R[7], 0, stackTop), b = wallPt(pqR, 0, pqY);
      ctx.save(); ctx.strokeStyle = 'rgba(139,143,150,0.7)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.restore();
    }
  }

  /* ---- Security Swarm: separate research ring, review dock, air gap ---- */
  if (swarm > 0.01) {
    const X = -(A_R[0] + 96), Y = stackTop + 18 + (1 - swarm) * 30, Z = -6, R = 64, Hs = 8;
    const rot = sc.t * 0.12;
    const Yt = g.cy - (Y + Hs) * cosT * s + Z * sinT * s, cxr = g.cx + X * s, Rp = R * s, hp = Hs * cosT * s;
    ctx.save(); ctx.globalAlpha = swarm;
    /* wall */
    const wg = ctx.createLinearGradient(cxr - Rp, 0, cxr + Rp, 0);
    wg.addColorStop(0, '#23262b'); wg.addColorStop(0.35, '#767b82'); wg.addColorStop(0.5, '#a9aeb3'); wg.addColorStop(0.8, '#34383e'); wg.addColorStop(1, '#17191c');
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.ellipse(cxr, Yt, Rp, Rp * sinT, 0, 0, Math.PI, false); ctx.ellipse(cxr, Yt + hp, Rp, Rp * sinT, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    ctx.save();
    ctx.translate(cxr, Yt); ctx.scale(s, s * sinT);
    const tg = ctx.createConicGradient ? ctx.createConicGradient(rot, 0, 0) : '#8d9298';
    if (ctx.createConicGradient) { for (const [o, v] of A_CONIC) tg.addColorStop(o, `rgb(${Math.min(255, 150 * v * 1.5) | 0},${Math.min(255, 156 * v * 1.5) | 0},${Math.min(255, 162 * v * 1.5) | 0})`); }
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.arc(0, 0, R - 9, 0, TAU, true); ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,248,232,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cxr, Yt, Rp, Rp * sinT, 0, 0, TAU); ctx.stroke();
    /* the three lanes, as three small engraved tabs */
    const names = ['R', 'T', 'S'];
    for (let k = 0; k < 3; k++) {
      const a = rot + k * (TAU / 3) + 0.4;
      const tx = cxr + Math.cos(a) * (R - 4.5) * s, ty = Yt + Math.sin(a) * (R - 4.5) * s * sinT;
      ctx.fillStyle = 'rgba(12,13,15,0.9)'; ctx.fillRect(tx - 4, ty - 2.5, 8, 5);
      ctx.fillStyle = 'rgba(236,232,223,0.9)'; ctx.font = `600 6px ${A_FONT_MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(names[k], tx, ty + 0.5);
    }
    ctx.restore();
    if (!glyph) {
      ctx.save(); ctx.globalAlpha = swarm;
      aWallTextAt(ctx, g, cxr, Yt, Hs, R, 'SWARM · NO SPEND AUTHORITY', rot * 0 + 0.3, 6.8, 'rgba(12,13,15,0.78)');
      ctx.restore();
    }

    /* review dock: a small slab between the ring and the stack */
    const dx = X - 28, dy = Y - 96, dz = 6, dw = 56, dd = 30, dh = 12;
    const p00 = P(dx, dy + dh, dz - dd / 2), p10 = P(dx + dw, dy + dh, dz - dd / 2), p11 = P(dx + dw, dy + dh, dz + dd / 2), p01 = P(dx, dy + dh, dz + dd / 2);
    const q01 = P(dx, dy, dz + dd / 2), q11 = P(dx + dw, dy, dz + dd / 2);
    ctx.save(); ctx.globalAlpha = swarm;
    ctx.fillStyle = '#2a2e34'; ctx.beginPath(); ctx.moveTo(p01[0], p01[1]); ctx.lineTo(p11[0], p11[1]); ctx.lineTo(q11[0], q11[1]); ctx.lineTo(q01[0], q01[1]); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3d4249'; ctx.beginPath(); ctx.moveTo(p00[0], p00[1]); ctx.lineTo(p10[0], p10[1]); ctx.lineTo(p11[0], p11[1]); ctx.lineTo(p01[0], p01[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(236,232,223,0.35)'; ctx.stroke();
    /* the dock stays dark: it lights only from a recorded human review */
    ctx.strokeStyle = 'rgba(139,143,150,0.8)'; ctx.setLineDash([2, 2]);
    const c0 = P(dx + 8, dy + dh, dz), c1 = P(dx + dw - 8, dy + dh, dz); ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.stroke(); ctx.setLineDash([]);
    /* tether from ring to dock: dotted, reports only */
    const t0 = [cxr - Rp * 0.02, Yt + hp + Rp * sinT + 1], t1 = [(p01[0] + p11[0]) / 2, p00[1] - 1];
    ctx.strokeStyle = 'rgba(236,232,223,0.55)'; ctx.setLineDash([1.5, 3]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(t0[0], t0[1]); ctx.lineTo(t1[0], t1[1]); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();

    /* air gap dimension line between the dock and the stack */
    if (!glyph && labelsOn && s >= 0.7) {
      const gy = (q11[1] + p11[1]) / 2, gx0 = q11[0] + 8, gx1 = g.cx - (A_R[6] + 4) * s;
      if (gx1 - gx0 > 24) {
        ctx.save(); ctx.globalAlpha = swarm; ctx.strokeStyle = 'rgba(236,232,223,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.moveTo(gx0, gy - 4); ctx.lineTo(gx0, gy + 4); ctx.moveTo(gx1, gy - 4); ctx.lineTo(gx1, gy + 4); ctx.stroke();
        ctx.fillStyle = 'rgba(236,232,223,0.78)'; ctx.font = `500 10px ${A_FONT_MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('air gap', (gx0 + gx1) / 2, gy + 7); ctx.restore();
      }
      ctx.save(); ctx.globalAlpha = swarm; ctx.fillStyle = 'rgba(139,143,150,1)'; ctx.font = `500 10px ${A_FONT_MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const mid = P(dx + dw / 2, dy, dz + dd / 2);
      ctx.fillText('human review', mid[0], mid[1] + 5);
      ctx.restore();
    }
  }

  /* ---- callouts ---- */
  if (labelsOn && lblA > 0.02) {
    const lx = Math.max(g.cx + A_BASE_R * s + 18, w - rightPad + 14);
    const callouts = [];
    const pqEdge = wallPt(pqR, 1.15, pqY + pqH * 0.5);
    callouts.push([pqEdge, 'Post-quantum authorization', 'ML-DSA · under evaluation', 'rgba(227,169,59,1)', st.pq]);
    const midRing = wallPt(A_R[4], 1.12, 4 + 4 * (A_H + gap) + A_H * 0.5);
    callouts.push([midRing, 'Intent Lock', '8 rings, one per detail', 'rgba(236,232,223,1)', 1]);
    const baseEdge = wallPt(A_BASE_R, 1.0, 0);
    callouts.push([baseEdge, 'QEVRA smart account', 'design preview, not deployed', 'rgba(139,143,150,1)', 1]);
    for (const [pt, t1, t2, col, a] of callouts) {
      if (a * lblA < 0.05) continue;
      const ty = pt[1];
      ctx.save(); ctx.globalAlpha = a * lblA; ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pt[0] + 3, pt[1]); ctx.lineTo(lx - 6, ty); ctx.stroke();
      ctx.beginPath(); ctx.arc(pt[0], pt[1], 2.2, 0, TAU); ctx.fillStyle = col; ctx.fill();
      ctx.font = `500 11px ${A_FONT_MONO}`; ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(t1, lx, ty - 1);
      ctx.font = `400 10px ${A_FONT_MONO}`; ctx.fillStyle = 'rgba(139,143,150,1)';
      ctx.fillText(t2, lx, ty + 12);
      ctx.restore();
    }
    if (swarm > 0.05) {
      const rp = [g.cx - (A_R[0] + 96) * s, g.cy - (stackTop + 18 + (1 - swarm) * 30 + 8) * cosT * s - 64 * sinT * s - 10 - 6 * s];
      ctx.save(); ctx.globalAlpha = swarm * lblA; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = `400 10px ${A_FONT_MONO}`; const tw = ctx.measureText('researches, tests, reports').width;
      const rx = clamp(rp[0], tw / 2 + 8, Math.max(tw / 2 + 8, w - tw / 2 - 8));   /* keep the label on the canvas when the stage is narrow */
      ctx.font = `500 11px ${A_FONT_MONO}`; ctx.fillStyle = 'rgba(236,232,223,1)';
      ctx.fillText('Security Swarm', rx, rp[1] - 14);
      ctx.font = `400 10px ${A_FONT_MONO}`; ctx.fillStyle = 'rgba(139,143,150,1)';
      ctx.fillText('researches, tests, reports', rx, rp[1]);
      ctx.restore();
    }
  }
}

/* text engraved on a cylinder wall. align: 'edge' keeps the text ending/starting at theta0, 'center' centres it there */
function aWallText(ctx, g, R, yMid, text, theta0, dir, fs, color, align, base, alpha) {
  ctx.save();
  ctx.font = `500 ${fs}px ${A_FONT_MONO}`;
  const adv = ctx.measureText('M').width + 0.9;
  const Rp = R * g.s, dth = adv / Rp, total = dth * text.length;
  let th = align === 'center' ? theta0 - total / 2 : (dir > 0 ? theta0 : theta0 - total);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let k = 0; k < text.length; k++) {
    const c = th + dth / 2; th += dth;
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

/* same idea for a ring that is not centred on the stack axis */
function aWallTextAt(ctx, g, cxr, Yt, Hs, R, text, theta0, fs, color) {
  ctx.save();
  ctx.font = `600 ${fs}px ${A_FONT_MONO}`;
  const adv = ctx.measureText('M').width + 0.8, Rp = R * g.s, dth = adv / Rp, total = dth * text.length;
  let th = -total / 2 + theta0 * 0;
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const hp = Hs * g.cosT * g.s;
  for (let k = 0; k < text.length; k++) {
    const c = th + dth / 2; th += dth;
    const cs = Math.cos(c);
    if (cs < 0.2) continue;
    const x = cxr + R * Math.sin(c) * g.s, y = Yt + hp * 0.5 + R * cs * g.sinT * g.s;
    ctx.setTransform(g.dpr * cs, g.dpr * (-Math.sin(c) * g.sinT), 0, g.dpr * g.cosT, g.dpr * x, g.dpr * y);
    ctx.fillText(text[k], 0, 0);
  }
  ctx.restore();
}
