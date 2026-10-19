/*
 * Scene 3: the Security Swarm, with the post-quantum research it studies.
 *
 * A coordinator stands in the middle of a trust boundary (a low glass fence on the floor with one gate). Around it, on a
 * hexagon, six specialist agents: Research, Analysis, Verification, Risk, Policy and Report. Thin spokes join each to the
 * coordinator and dashed chords join neighbours: that is the cross-checking. Small lights travel along them in a slow loop:
 * findings in to the coordinator, cross-checks between neighbours, the verified set to the Report agent, and one report out
 * through the gate to a Human review dock that stays unlit. A small dashed lattice floats over the coordinator: the
 * post-quantum research (ML-DSA), experimental, so it is outlined and not solid. Outside the fence, a glass wall (the air
 * gap) stands in front of the connected wallet, and the line to it is dotted and crossed.
 *
 * It is an illustration of the design. Nothing here runs, holds a key or checks anything real.
 */
import { clamp, lerp, TAU } from "../math";
import { BRIGHT, COOL, DARK, WARM, drawBox, drawCyl, drawFloor, drawLabel, drawLine, drawShadow, drawSphere, ease, P, piece } from "./gfx";
import type { BoxOpts, V3 } from "./gfx";
import type { HeroPartId } from "@/types";
import { box8 } from "./types";
import type { SceneArgs, SceneDef } from "./types";

const AMBER = "rgba(227,169,59,0.95)";
const RED = "rgba(229,96,77,0.98)";
const GRAY = "rgba(139,143,150,0.95)";
const SILVER = "rgba(236,232,223,1)";

const RING_R = 74;
const FENCE_H = 30;
const AG_Y = 30;
const AG_R = 51;
const HUB: V3 = [0, AG_Y, 0];
const LAT_Y = 100;
/** the lattice floats lower on a phone-sized stage, where the stage is short */
const LAT_Y_COMPACT = 84;
const WALL_X = -92;
const WALLET_X = -132;
const DOCK: V3 = [114, 0, 38];
/** the gate in the fence faces the dock */
const GATE = Math.atan2(DOCK[2], DOCK[0]);
const GATE_HALF = 0.3;
const PERIOD = 10.4;

interface AgentDef {
  id: HeroPartId;
  tag: string;
}
/** in order around the hexagon, starting at the gate and going round */
const AGENTS: readonly AgentDef[] = [
  { id: "l-a-report", tag: "Report" },
  { id: "l-a-research", tag: "Research" },
  { id: "l-a-analysis", tag: "Analysis" },
  { id: "l-a-verify", tag: "Verification" },
  { id: "l-a-risk", tag: "Risk" },
  { id: "l-a-policy", tag: "Policy" },
];
const agentPos = (i: number, r = AG_R): V3 => {
  const th = GATE + (i * TAU) / 6;
  return [Math.cos(th) * r, AG_Y, Math.sin(th) * r];
};
const A_REPORT = 0;
const A_VERIFY = 3;

/* a fixed pseudo-random spread for the lattice nodes' start positions */
const seed = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** progress 0..1 of a pulse that starts at `start` (seconds into the loop) and lasts `dur`, or -1 when it is not travelling */
const pulse = (t: number, start: number, dur: number): number => {
  const x = (((t - start) % PERIOD) + PERIOD) % PERIOD;
  return x < dur ? x / dur : -1;
};
/** how lit something is, `dt` seconds after the loop's moment `at` */
const glowAfter = (t: number, at: number): number => {
  const x = (((t - at) % PERIOD) + PERIOD) % PERIOD;
  return x < 2.6 ? Math.exp(-x / 0.62) : 0;
};
const inOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

interface Route {
  from: V3;
  to: V3;
  start: number;
  dur: number;
  warm: boolean;
  /** which node it lights on leaving and on arriving: an agent index, "hub", or "dock" */
  a: number | "hub" | "dock";
  b: number | "hub" | "dock";
}

function draw(a: SceneArgs): void {
  const { ctx, cam, q, font, form, u, compact, hot, zoom, t } = a;
  /* callouts fade out as the camera flies in on a part */
  const lab = Math.max(0, 1 - 1.15 * zoom);

  const pPlate = ease.out(piece(form, 0, 0.18));
  const pRing = piece(form, 0.14, 0.3);
  const pHub = ease.back(piece(form, 0.26, 0.2));
  const pLat = piece(form, 0.34, 0.26);
  const pWall = ease.out(piece(form, 0.58, 0.2));
  const pDock = ease.out(piece(form, 0.62, 0.2));
  const pWallet = ease.out(piece(form, 0.66, 0.2));
  const pText = piece(form, 0.88, 0.12);
  /* once built, the loop of lights runs */
  const live = clamp((form - 0.9) / 0.1);
  const latY = compact ? LAT_Y_COMPACT : LAT_Y;

  drawFloor(ctx, cam, 150, pPlate, pPlate);
  q.add(-2e6, () => drawShadow(ctx, cam, [0, 0, 0], RING_R + 6, RING_R + 6, 0.55 * pPlate));
  const dc = P(cam, 0, AG_Y / 2, 0)[2];

  /* ---- the trust boundary: a low glass fence with a gate, drawn in two halves so it wraps the swarm ---- */
  const N = 96;
  const arc = (k: number) => GATE + GATE_HALF + (k / N) * (TAU - 2 * GATE_HALF);
  type Seg = { a0: [number, number]; a1: [number, number]; b0: [number, number]; b1: [number, number]; k: number };
  const back: Seg[] = [];
  const front: Seg[] = [];
  for (let k = 0; k < N * pRing; k++) {
    const t0 = arc(k);
    const t1 = arc(k + 1);
    const s: Seg = {
      a0: P(cam, Math.cos(t0) * RING_R, 0.4, Math.sin(t0) * RING_R) as unknown as [number, number],
      a1: P(cam, Math.cos(t1) * RING_R, 0.4, Math.sin(t1) * RING_R) as unknown as [number, number],
      b0: P(cam, Math.cos(t0) * RING_R, FENCE_H, Math.sin(t0) * RING_R) as unknown as [number, number],
      b1: P(cam, Math.cos(t1) * RING_R, FENCE_H, Math.sin(t1) * RING_R) as unknown as [number, number],
      k,
    };
    const dmid = (P(cam, Math.cos((t0 + t1) / 2) * RING_R, FENCE_H / 2, Math.sin((t0 + t1) / 2) * RING_R)[2]);
    (dmid >= dc ? front : back).push(s);
  }
  const drawFence = (segs: Seg[], k: number) => {
    if (!segs.length) return;
    ctx.save();
    ctx.globalAlpha = pPlate;
    ctx.fillStyle = `rgba(168,164,154,${0.05 * k})`;
    ctx.beginPath();
    for (const s of segs) {
      ctx.moveTo(s.a0[0], s.a0[1]);
      ctx.lineTo(s.a1[0], s.a1[1]);
      ctx.lineTo(s.b1[0], s.b1[1]);
      ctx.lineTo(s.b0[0], s.b0[1]);
      ctx.closePath();
    }
    ctx.fill();
    /* posts */
    ctx.strokeStyle = `rgba(168,164,154,${0.22 * k})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const s of segs) {
      if (s.k % 6 !== 0) continue;
      ctx.moveTo(s.a0[0], s.a0[1]);
      ctx.lineTo(s.b0[0], s.b0[1]);
    }
    ctx.stroke();
    /* the foot: solid and faint; the top: dashed and amber, because the approval perimeter is a design, not a fact */
    ctx.strokeStyle = `rgba(168,164,154,${0.4 * k})`;
    ctx.beginPath();
    for (const s of segs) {
      ctx.moveTo(s.a0[0], s.a0[1]);
      ctx.lineTo(s.a1[0], s.a1[1]);
    }
    ctx.stroke();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = `rgba(227,169,59,${0.75 * k})`;
    ctx.beginPath();
    for (const s of segs) {
      ctx.moveTo(s.b0[0], s.b0[1]);
      ctx.lineTo(s.b1[0], s.b1[1]);
    }
    ctx.stroke();
    ctx.restore();
  };
  q.add(dc - 100, () => drawFence(back, 0.6));
  q.add(dc + 100, () => {
    drawFence(front, 1);
    /* the gate posts */
    if (pRing > 0.95) {
      for (const sgn of [-1, 1]) {
        const th = GATE + sgn * GATE_HALF;
        const f = P(cam, Math.cos(th) * RING_R, 0.4, Math.sin(th) * RING_R);
        const g = P(cam, Math.cos(th) * RING_R, FENCE_H + 4, Math.sin(th) * RING_R);
        ctx.save();
        ctx.globalAlpha = pPlate;
        ctx.strokeStyle = "rgba(255,226,170,0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(f[0], f[1]);
        ctx.lineTo(g[0], g[1]);
        ctx.stroke();
        ctx.restore();
      }
    }
  });

  /* ---- positions of the agents, and the routes the lights take ---- */
  const nodes: V3[] = [];
  for (let i = 0; i < 6; i++) {
    const p = ease.back(piece(form, 0.3 + i * 0.05, 0.22));
    const pt = agentPos(i);
    nodes.push([pt[0], pt[1] + 44 * (1 - clamp(p)), pt[2]]);
  }
  const hubP: V3 = [HUB[0], HUB[1] + 40 * (1 - clamp(pHub)), HUB[2]];
  /* the report goes to the dock; on a phone-sized stage, which leaves the dock out, it leaves through the gate and fades */
  const dockTop: V3 = compact ? [Math.cos(GATE) * RING_R * 1.18, 6, Math.sin(GATE) * RING_R * 1.18] : [DOCK[0], 8, DOCK[2]];
  const routes: Route[] = [];
  /* findings in: Research, Analysis, Risk, Policy report to the coordinator */
  [1, 2, 4, 5].forEach((i, n) => routes.push({ from: nodes[i], to: hubP, start: n * 0.5, dur: 1.5, warm: true, a: i, b: "hub" }));
  /* cross-checks: neighbours compare, both ways */
  [1, 2, 3, 4].forEach((i, n) => {
    routes.push({ from: nodes[i], to: nodes[i + 1], start: 3 + n * 0.45, dur: 1.2, warm: false, a: i, b: i + 1 });
    routes.push({ from: nodes[i + 1], to: nodes[i], start: 3.2 + n * 0.45, dur: 1.2, warm: false, a: i + 1, b: i });
  });
  /* the coordinator asks Verification to confirm, and it answers */
  routes.push({ from: hubP, to: nodes[A_VERIFY], start: 5.1, dur: 1.1, warm: false, a: "hub", b: A_VERIFY });
  routes.push({ from: nodes[A_VERIFY], to: hubP, start: 6.1, dur: 1.1, warm: true, a: A_VERIFY, b: "hub" });
  /* the cross-checked set goes to the Report agent, and the report leaves through the gate to the dock */
  routes.push({ from: hubP, to: nodes[A_REPORT], start: 7.4, dur: 1.2, warm: true, a: "hub", b: A_REPORT });
  routes.push({ from: nodes[A_REPORT], to: dockTop, start: 8.7, dur: 1.7, warm: true, a: A_REPORT, b: "dock" });

  const glowOf = (node: number | "hub" | "dock"): number => {
    let g = 0;
    for (const r of routes) {
      if (r.a === node) g = Math.max(g, glowAfter(t, r.start));
      if (r.b === node) g = Math.max(g, glowAfter(t, r.start + r.dur));
    }
    return g * live;
  };

  /* ---- spokes and chords: the lines between the nodes ---- */
  const pLink = ease.out(piece(form, 0.4, 0.3));
  for (let i = 0; i < 6; i++) {
    const A = nodes[i];
    q.add(P(cam, (A[0] + hubP[0]) / 2, AG_Y, (A[2] + hubP[2]) / 2)[2] - 1, () => {
      const e: V3 = [lerp(hubP[0], A[0], pLink), lerp(hubP[1], A[1], pLink), lerp(hubP[2], A[2], pLink)];
      drawLine(ctx, cam, hubP, e, "rgba(214,206,190,0.55)", 1.3, [], 0.9);
    });
    const B = nodes[(i + 1) % 6];
    q.add(P(cam, (A[0] + B[0]) / 2, AG_Y, (A[2] + B[2]) / 2)[2] - 1, () => drawLine(ctx, cam, A, B, "rgba(168,172,180,0.7)", 1, [3, 3], 0.55 * pLink));
  }
  /* the way out of the gate: dotted, down to the floor and across to the dock */
  q.add(P(cam, nodes[A_REPORT][0] + 20, 8, nodes[A_REPORT][2] + 6)[2], () => drawLine(ctx, cam, nodes[A_REPORT], dockTop, "rgba(227,169,59,0.6)", 1, [2, 3], compact ? 0.5 * pRing : 0.8 * pDock));

  /* ---- the coordinator: a small pedestal, a stem, a glowing node and a halo ---- */
  const hubGlow = glowOf("hub");
  q.add(P(cam, 0, 4, 0)[2] - 1, () => {
    drawCyl(ctx, cam, font, { c: [0, 0, 0], r: 15, h: 6, tone: DARK, alpha: clamp(pHub * 3) });
    drawLine(ctx, cam, [0, 6, 0], [0, hubP[1] - 7, 0], "rgba(214,206,190,0.55)", 1.4, [], clamp(pHub));
  });
  q.add(P(cam, 0, AG_Y, 0)[2] + 2, () => {
    const c = P(cam, hubP[0], hubP[1], hubP[2]);
    if (hubGlow > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(c[0], c[1], 1, c[0], c[1], 26 * (cam.s / 2.2));
      g.addColorStop(0, `rgba(255,214,150,${0.5 * hubGlow})`);
      g.addColorStop(1, "rgba(255,214,150,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c[0], c[1], 26 * (cam.s / 2.2), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    drawSphere(ctx, cam, hubP, 8.5 * Math.max(0.05, clamp(pHub)), hubGlow > 0.3 ? BRIGHT : WARM, clamp(pHub * 3), "rgba(227,169,59,0.85)");
    /* the halo: a ring round the node that breathes */
    ctx.save();
    ctx.globalAlpha = clamp(pHub) * (0.45 + 0.35 * hubGlow);
    ctx.strokeStyle = "rgba(227,169,59,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k <= 40; k++) {
      const th = (k / 40) * TAU;
      const r = 15 + 1.2 * Math.sin(t * 0.9);
      const p = P(cam, hubP[0] + Math.cos(th) * r, hubP[1], hubP[2] + Math.sin(th) * r);
      if (k === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.restore();
  });

  /* ---- the agents: small chips on stems, each with a foot on the floor ---- */
  for (let i = 0; i < 6; i++) {
    const n = nodes[i];
    const pa = clamp(ease.back(piece(form, 0.3 + i * 0.05, 0.22)) * 2);
    const g = glowOf(i);
    q.add(P(cam, n[0], 14, n[2])[2], () => {
      /* foot and stem */
      const foot = AGENTS[i].id === "l-a-report" ? "rgba(227,169,59,0.7)" : "rgba(168,164,154,0.55)";
      ctx.save();
      ctx.globalAlpha = pa;
      ctx.strokeStyle = foot;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const th = (k / 24) * TAU;
        const p = P(cam, n[0] + Math.cos(th) * 5, 0.5, n[2] + Math.sin(th) * 5);
        if (k === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
      ctx.restore();
      drawLine(ctx, cam, [n[0], 0.5, n[2]], [n[0], n[1] - 3, n[2]], "rgba(168,164,154,0.5)", 1, [], pa);
    });
    q.add(P(cam, n[0], n[1], n[2])[2] + 1, () => {
      const c = P(cam, n[0], n[1] + 2, n[2]);
      if (g > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const r = 20 * (cam.s / 2.2);
        const gr = ctx.createRadialGradient(c[0], c[1], 1, c[0], c[1], r);
        gr.addColorStop(0, `rgba(255,214,150,${0.42 * g})`);
        gr.addColorStop(1, "rgba(255,214,150,0)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(c[0], c[1], r, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      drawCyl(ctx, cam, font, { c: [n[0], n[1] - 2, n[2]], r: 8.5, h: 4.4, tone: g > 0.35 ? WARM : COOL, alpha: pa, bright: 1 + 0.35 * g });
    });
  }

  /* ---- the lights travelling along the lines ---- */
  if (live > 0.01) {
    for (const r of routes) {
      const p = pulse(t, r.start, r.dur);
      if (p < 0) continue;
      const big = r.b === "dock";
      for (let k = 0; k < 5; k++) {
        const pk = p - k * 0.05;
        if (pk < 0) continue;
        const e = inOut(pk);
        const pt: V3 = [lerp(r.from[0], r.to[0], e), lerp(r.from[1], r.to[1], e), lerp(r.from[2], r.to[2], e)];
        const al = (k === 0 ? 1 : 0.5 / k) * live * Math.sin(Math.min(1, pk * 1.0) * Math.PI) ** 0.5;
        q.add(P(cam, pt[0], pt[1], pt[2])[2] + 6, () => {
          const c = P(cam, pt[0], pt[1], pt[2]);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const rad = (big ? 9 : 6.5) * (cam.s / 2.2) * (k === 0 ? 1 : 0.7);
          const gr = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], rad);
          gr.addColorStop(0, r.warm ? `rgba(255,222,160,${0.9 * al})` : `rgba(214,226,244,${0.8 * al})`);
          gr.addColorStop(1, "rgba(255,214,150,0)");
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(c[0], c[1], rad, 0, TAU);
          ctx.fill();
          ctx.restore();
        });
      }
    }
  }

  /* ---- the post-quantum research the swarm studies: a small lattice floating over the coordinator ---- */
  const lat: V3[] = [];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      const n = j * 3 + i;
      const p = ease.out(piece(form, 0.34 + n * 0.02, 0.24));
      const k = 1 - p;
      const pt: V3 = [(i - 1) * 15 + (seed(n) - 0.5) * 160 * k, latY + (seed(n + 9) - 0.5) * 100 * k, (j - 1) * 15 + (seed(n + 19) - 0.5) * 160 * k];
      lat.push(pt);
      q.add(P(cam, pt[0], pt[1], pt[2])[2] + 3, () => drawSphere(ctx, cam, pt, 3, WARM, clamp(p * 3), "rgba(227,169,59,0.7)"));
    }
  const latEdge = (i: number, k: number) => {
    const A = lat[i];
    const B = lat[k];
    q.add((P(cam, A[0], A[1], A[2])[2] + P(cam, B[0], B[1], B[2])[2]) / 2 + 2, () => drawLine(ctx, cam, A, B, AMBER, 1, [3, 3], 0.8 * pLat));
  };
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      if (i < 2) latEdge(j * 3 + i, j * 3 + i + 1);
      if (j < 2) latEdge(j * 3 + i, (j + 1) * 3 + i);
    }
  q.add(P(cam, 0, 60, 0)[2], () => drawLine(ctx, cam, [0, HUB[1] + 10, 0], [0, latY - 7, 0], "rgba(227,169,59,0.5)", 1, [2, 3], 0.7 * pLat));

  /* ---- outside the fence: the air gap in front of the wallet, and the human review dock (left out on a phone-sized stage) ---- */
  if (!compact) {
    q.add(P(cam, WALL_X, 28, 0)[2], () => {
      const c1 = P(cam, WALL_X, 0, -60);
      const c2 = P(cam, WALL_X, 0, 60);
      const c3 = P(cam, WALL_X, 52 * pWall, 60);
      const c4 = P(cam, WALL_X, 52 * pWall, -60);
      ctx.save();
      ctx.globalAlpha = pWall;
      ctx.fillStyle = "rgba(168,164,154,0.07)";
      ctx.beginPath();
      ctx.moveTo(c1[0], c1[1]);
      ctx.lineTo(c2[0], c2[1]);
      ctx.lineTo(c3[0], c3[1]);
      ctx.lineTo(c4[0], c4[1]);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(168,164,154,0.55)";
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    });
    const wallet: BoxOpts = {
      c: [WALLET_X - 28 * (1 - pWallet), 2, 24],
      size: [44, 4, 32],
      tone: BRIGHT,
      alpha: pWallet,
      text: [{ face: "top", text: "YOUR WALLET", size: 5.4, color: `rgba(12,13,15,${0.72 * pWallet})` }],
    };
    q.add(P(cam, WALLET_X, 2, 24)[2], () => drawBox(ctx, cam, font, wallet));
    const dockBox: BoxOpts = {
      c: [DOCK[0] + 30 * (1 - pDock), 3, DOCK[2]],
      size: [44, 6, 32],
      tone: DARK,
      alpha: pDock,
      text: [{ face: "top", text: "HUMAN REVIEW", size: 5.4, color: `rgba(139,143,150,${0.95 * pDock})` }],
    };
    q.add(P(cam, DOCK[0], 3, DOCK[2])[2], () => drawBox(ctx, cam, font, dockBox));
  }

  /* the parts that can be pointed at */
  const reg = (id: HeroPartId, x: number, y: number, z: number, r: number, zk = 3) => {
    const p = P(cam, x, y, z);
    const rr = Math.max(14, r * cam.s);
    hot.push({ id, x: p[0], y: p[1], r: rr, wx: x, wy: y, wz: z, zoom: zk });
  };
  reg("l-coord", HUB[0], HUB[1], HUB[2], 12, 3.2);
  AGENTS.forEach((ag, i) => reg(ag.id, nodes[i][0], nodes[i][1], nodes[i][2], 10, 3.6));
  reg("l-lattice", 0, latY, 0, 18, 3.2);
  const ringFront = GATE + Math.PI * 0.62;
  reg("l-ring", Math.cos(ringFront) * RING_R, 10, Math.sin(ringFront) * RING_R, 14, 2.4);
  if (!compact) {
    reg("l-dock", DOCK[0], 4, DOCK[2], 24, 2.9);
    reg("l-gap", WALL_X, 28, 0, 24, 2.1);
    reg("l-wallet", WALLET_X, 4, 24, 22, 2.9);
  }

  q.flush();

  /* ---- tags and callouts ---- */
  const f1 = compact ? 10 : 11.5;
  const f2 = compact ? 9 : 10;
  const tagSize = compact ? 8.6 : 9.6;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 ${tagSize}px ${font}`;
  AGENTS.forEach((ag, i) => {
    const ta = clamp(piece(form, 0.84 + i * 0.02, 0.12)) * lab;
    if (ta < 0.03) return;
    const p = P(cam, nodes[i][0], nodes[i][1] + 5.5, nodes[i][2]);
    ctx.globalAlpha = ta;
    ctx.fillStyle = i === A_REPORT ? "rgba(255,226,170,1)" : "rgba(236,232,223,0.92)";
    ctx.fillText(ag.tag, p[0], p[1] - 9);
  });
  if (!compact) {
    const hp = P(cam, hubP[0], hubP[1], hubP[2]);
    ctx.globalAlpha = clamp(pText) * lab;
    ctx.fillStyle = AMBER;
    ctx.font = `600 ${tagSize + 0.4}px ${font}`;
    /* a thin dark edge keeps the word legible where the dashed line to the lattice passes behind it */
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(12,13,15,0.85)";
    ctx.lineJoin = "round";
    ctx.strokeText("Coordinator", hp[0], hp[1] - 27);
    ctx.fillText("Coordinator", hp[0], hp[1] - 27);
  }
  ctx.restore();

  const lp = P(cam, 0, latY + 4, 0);
  drawLabel(ctx, font, {
    ax: lp[0],
    ay: lp[1],
    x: lp[0] + 4,
    y: lp[1] - (compact ? 30 : 38),
    side: "center",
    lines: compact ? ["ML-DSA research"] : ["Post-quantum research", "ML-DSA · dashed: not audited"],
    color: AMBER,
    alpha: pText * lab,
    w: a.w,
    f1,
    f2,
  });
  const sw = P(cam, Math.cos(-0.7) * RING_R, FENCE_H, Math.sin(-0.7) * RING_R);
  drawLabel(ctx, font, {
    ax: sw[0],
    ay: sw[1],
    x: sw[0] + 26,
    y: sw[1] - (compact ? 14 : 22),
    side: "right",
    lines: compact ? ["Security Swarm"] : ["Security Swarm", "agents that cross-check", "hold no keys"],
    color: SILVER,
    alpha: pText * lab,
    w: a.w,
    f1,
    f2,
  });
  if (!compact) {
    const bp = P(cam, Math.cos(GATE + Math.PI * 0.62) * RING_R, 0.4, Math.sin(GATE + Math.PI * 0.62) * RING_R);
    drawLabel(ctx, font, {
      ax: bp[0],
      ay: bp[1],
      x: bp[0] - 22,
      y: bp[1] + 34,
      side: "left",
      lines: ["Trust boundary", "isolated sandboxes"],
      color: "rgba(255,226,170,1)",
      alpha: pText * lab,
      w: a.w,
      f1,
      f2,
    });
  }
  if (!compact) {
    const dk = P(cam, DOCK[0], 6, DOCK[2]);
    drawLabel(ctx, font, {
      ax: dk[0],
      ay: dk[1] + 6,
      x: dk[0],
      y: dk[1] + (compact ? 30 : 38),
      side: "center",
      lines: compact ? ["Review"] : ["Human review", "unlit in this preview"],
      color: GRAY,
      alpha: pText * lab,
      w: a.w,
      f1,
      f2,
    });
    const gp = P(cam, WALL_X, 52, -34);
    drawLabel(ctx, font, {
      ax: gp[0],
      ay: gp[1],
      x: gp[0] - 18,
      y: gp[1] - (compact ? 14 : 18),
      side: "left",
      lines: compact ? ["Air gap"] : ["Air gap", "no signing path"],
      color: SILVER,
      alpha: pText * lab,
      w: a.w,
      f1,
      f2,
    });
    /* the dotted line to the wallet, crossed at the wall */
    drawLine(ctx, cam, [-RING_R, 20, 8], [WALLET_X + 10, 6, 24], GRAY, 1, [2, 4], 0.7 * pWall * pText);
    const x = P(cam, WALL_X, 22, 16);
    if (pText > 0.05) {
      ctx.save();
      ctx.globalAlpha = pText * lab;
      ctx.strokeStyle = RED;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x[0] - 5, x[1] - 5);
      ctx.lineTo(x[0] + 5, x[1] + 5);
      ctx.moveTo(x[0] + 5, x[1] - 5);
      ctx.lineTo(x[0] - 5, x[1] + 5);
      ctx.stroke();
      ctx.restore();
    }

  }
  void u;
}

export const LATTICE: SceneDef = {
  yaw: -0.42,
  pitch: 0.62,
  turn: 0.4,
  limit: 1.2,
  bounds: box8(-150, 140, 0, 112, -84, 86),
  compactBounds: box8(-84, 84, 0, 98, -84, 84),
  draw,
};
