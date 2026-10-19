/*
 * Scene 3: post-quantum research and the Security Swarm.
 *
 * In the middle, a small lattice floats over a plate: the post-quantum research. It is drawn as dashed amber lines
 * because it is experimental, the same outline the ring sculpture uses. Around it, agents orbit: the Security
 * Swarm. They carry no keys. On the right stands a review dock, unlit, and a report packet can go from the
 * Swarm to it. On the left a glass wall (the air gap) stands in front of the connected wallet, and the line to it
 * is dotted and crossed. Reports are the only thing that moves, and they go to a person, not to the wallet.
 */
import { clamp, lerp, TAU } from "../math";
import { BRIGHT, COOL, DARK, WARM, drawBox, drawFloor, drawLabel, drawLine, drawShadow, drawSphere, ease, P, piece } from "./gfx";
import type { BoxOpts, V3 } from "./gfx";
import { box8 } from "./types";
import type { SceneArgs, SceneDef } from "./types";

const AMBER = "rgba(227,169,59,0.95)";
const RED = "rgba(229,96,77,0.98)";
const GRAY = "rgba(139,143,150,0.95)";
const ORB_Y = 38;
const ORB_R = 66;
const WALL_X = -78;
const DOCK: V3 = [96, 0, 34];

/* a fixed pseudo-random spread for the nodes' start positions */
const seed = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function draw(a: SceneArgs): void {
  const { ctx, cam, q, font, form, u, compact, hot, zoom } = a;
  /* callouts fade out as the camera flies in on a part */
  const lab = 1 - 0.95 * zoom;

  const pPlate = ease.out(piece(form, 0, 0.2));
  const pEdges = piece(form, 0.34, 0.2);
  const pOrbit = piece(form, 0.4, 0.24);
  const pWall = ease.out(piece(form, 0.5, 0.2));
  const pDock = ease.out(piece(form, 0.54, 0.2));
  const pWallet = ease.out(piece(form, 0.58, 0.2));
  const pText = piece(form, 0.86, 0.14);

  drawFloor(ctx, cam, 150, pPlate, pPlate);
  q.add(-2e6, () => drawShadow(ctx, cam, [0, 0, 0], 74, 74, 0.8 * pPlate));

  /* the plate under the lattice */
  const plate: BoxOpts = { c: [0, 14 - 20 * (1 - pPlate), 0], size: [84, 4, 84], tone: COOL, alpha: pPlate };
  q.add(-1e6, () => drawBox(ctx, cam, font, plate));

  /* lattice nodes: a 3 by 3 grid; they gather from a spread-out start */
  const nodes: V3[] = [];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      const n = j * 3 + i;
      const p = ease.out(piece(form, 0.08 + n * 0.022, 0.26));
      const gx = (i - 1) * 26;
      const gz = (j - 1) * 26;
      const k = 1 - p;
      const pt: V3 = [gx + (seed(n) - 0.5) * 200 * k, ORB_Y + (seed(n + 9) - 0.5) * 120 * k, gz + (seed(n + 19) - 0.5) * 200 * k];
      nodes.push(pt);
      q.add(P(cam, pt[0], pt[1], pt[2])[2], () => drawSphere(ctx, cam, pt, 3.6, WARM, clamp(p * 3), "rgba(227,169,59,0.7)"));
    }
  /* lattice edges, amber and dashed: experimental */
  const edge = (i: number, k: number) => {
    const A = nodes[i];
    const B = nodes[k];
    q.add((P(cam, A[0], A[1], A[2])[2] + P(cam, B[0], B[1], B[2])[2]) / 2 - 1, () => drawLine(ctx, cam, A, B, AMBER, 1, [4, 3], 0.85 * pEdges));
  };
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      if (i < 2) edge(j * 3 + i, j * 3 + i + 1);
      if (j < 2) edge(j * 3 + i, (j + 1) * 3 + i);
    }

  /* the glass wall: the air gap */
  q.add(P(cam, WALL_X, 28, 0)[2], () => {
    const c1 = P(cam, WALL_X, 0, -62);
    const c2 = P(cam, WALL_X, 0, 62);
    const c3 = P(cam, WALL_X, 56 * pWall, 62);
    const c4 = P(cam, WALL_X, 56 * pWall, -62);
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

  /* the connected wallet, behind the wall; the review dock, unlit */
  const wallet: BoxOpts = {
    c: [-124 - 30 * (1 - pWallet), 2, 34],
    size: [46, 4, 34],
    tone: BRIGHT,
    alpha: pWallet,
    text: [{ face: "top", text: "YOUR WALLET", size: 5.6, color: `rgba(12,13,15,${0.72 * pWallet})` }],
  };
  q.add(P(cam, -124, 2, 34)[2], () => drawBox(ctx, cam, font, wallet));
  const dock: BoxOpts = {
    c: [DOCK[0] + 30 * (1 - pDock), 3, DOCK[2]],
    size: [44, 6, 32],
    tone: DARK,
    alpha: pDock,
    text: [{ face: "top", text: "HUMAN REVIEW", size: 5.4, color: `rgba(139,143,150,${0.95 * pDock})` }],
  };
  q.add(P(cam, DOCK[0], 3, DOCK[2])[2], () => drawBox(ctx, cam, font, dock));

  /* the orbit and the agents */
  const spin = u * TAU * 0.7;
  const agents: V3[] = [];
  for (let i = 0; i < 4; i++) {
    const p = ease.out(piece(form, 0.42 + i * 0.06, 0.26));
    const ang = (i / 4) * TAU + spin + (1 - p) * 2.6;
    const r = lerp(150, ORB_R, p);
    const pt: V3 = [Math.cos(ang) * r, ORB_Y, Math.sin(ang) * r];
    agents.push(pt);
    q.add(P(cam, pt[0], pt[1], pt[2])[2] + 2, () => drawSphere(ctx, cam, pt, 5, COOL, clamp(p * 3), "rgba(236,232,223,0.55)"));
  }

  /* a report packet from the nearest agent toward the dock, once the scene is built */
  if (form > 0.92) {
    const e = (u * 2.2) % 1;
    const s = agents[1];
    const pt: V3 = [lerp(s[0], DOCK[0], e), lerp(s[1], 9, e), lerp(s[2], DOCK[2], e)];
    q.add(P(cam, pt[0], pt[1], pt[2])[2] + 3, () =>
      drawBox(ctx, cam, font, { c: pt, size: [9, 6, 9], tone: [214, 208, 194], edge: "rgba(227,169,59,0.9)", alpha: Math.sin(e * Math.PI) * 0.95 + 0.05 }),
    );
  }

  /* the parts that can be pointed at */
  const reg = (id: string, x: number, y: number, z: number, r: number, zk = 2.4) => {
    const p = P(cam, x, y, z);
    const rr = Math.max(15, r * cam.s);
    hot.push({ id, x: p[0], y: p[1], r: rr, wx: x, wy: y, wz: z, zoom: zk });
  };
  reg("l-lattice", 0, ORB_Y, 0, 30, 2.4);
  agents.forEach((g) => reg("l-agents", g[0], g[1], g[2], 9, 3.4));
  reg("l-dock", DOCK[0], 4, DOCK[2], 24, 2.9);
  reg("l-gap", WALL_X, 28, 0, 26, 2.1);
  reg("l-wallet", -124, 4, 34, 24, 2.9);

  q.flush();

  /* the orbit ring, as a dashed ellipse, drawn up to how formed it is */
  if (pOrbit > 0.01) {
    ctx.save();
    ctx.strokeStyle = "rgba(139,143,150,0.55)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    const n = 72;
    for (let k = 0; k <= n * pOrbit; k++) {
      const ang = (k / n) * TAU;
      const p = P(cam, Math.cos(ang) * ORB_R, ORB_Y, Math.sin(ang) * ORB_R);
      if (k === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* no route from the Swarm side to the wallet: a dotted line, crossed at the wall */
  drawLine(ctx, cam, [-30, ORB_Y, 0], [-112, 8, 34], GRAY, 1, [2, 4], 0.7 * pWall * pText);
  const x = P(cam, WALL_X, 24, 17);
  if (pText > 0.05) {
    ctx.save();
    ctx.globalAlpha = pText;
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

  /* labels */
  const f1 = compact ? 10 : 11.5;
  const f2 = compact ? 9 : 10;
  const top = P(cam, 0, ORB_Y + 4, -26);
  drawLabel(ctx, font, {
    ax: top[0],
    ay: top[1],
    x: top[0] + 8,
    y: top[1] - (compact ? 62 : 84),
    side: "center",
    lines: compact ? ["Post-quantum research"] : ["Post-quantum research", "ML-DSA, under evaluation", "dashed: not audited"],
    color: AMBER,
    alpha: pText * lab,
    w: a.w,
    f1,
    f2,
  });
  /* the Swarm label points at its orbit, not at one agent, so it stays still while the agents move */
  const ob = P(cam, Math.cos(-0.5) * ORB_R, ORB_Y, Math.sin(-0.5) * ORB_R);
  drawLabel(ctx, font, {
    ax: ob[0],
    ay: ob[1],
    x: ob[0] + 26,
    y: ob[1] - (compact ? 20 : 26),
    side: "right",
    lines: compact ? ["Security Swarm"] : ["Security Swarm", "researches, tests, reports", "holds no keys"],
    color: "rgba(236,232,223,1)",
    alpha: pText * lab,
    w: a.w,
    f1,
    f2,
  });
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
  const gp = P(cam, WALL_X, 56, -30);
  drawLabel(ctx, font, {
    ax: gp[0],
    ay: gp[1],
    x: gp[0] - 18,
    y: gp[1] - (compact ? 14 : 18),
    side: "left",
    lines: compact ? ["Air gap"] : ["Air gap", "no signing path"],
    color: "rgba(236,232,223,1)",
    alpha: pText * lab,
    w: a.w,
    f1,
    f2,
  });
}

export const LATTICE: SceneDef = {
  yaw: -0.42,
  pitch: 0.62,
  turn: 0.4,
  limit: 1.2,
  bounds: box8(-150, 125, 0, 66, -70, 72),
  draw,
};
