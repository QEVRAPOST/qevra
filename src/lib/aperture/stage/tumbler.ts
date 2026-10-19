/*
 * Scene 2: Intent Lock, as a row of pins and a beam of light.
 *
 * Five upright pins stand on a rail, one per swap detail. Each pin has a slot. A lamp on the left sends a line of
 * light along the row; it reaches the receiver only when every slot is at the same height. Change one detail
 * (`mis` > 0) and that pin's slot moves, the light stops at its face, and the pins after it stay dark.
 * It is a design demonstration of the comparison QEVRA is designed to make: nothing here checks a real swap.
 */
import { clamp, lerp, smooth } from "../math";
import { BRIGHT, COOL, DARK, WARM, drawBox, drawCyl, drawFloor, drawLabel, drawShadow, drawSphere, ease, P, piece } from "./gfx";
import type { BoxOpts, V3 } from "./gfx";
import type { HeroPartId } from "@/types";
import { box8 } from "./types";
import type { SceneArgs, SceneDef } from "./types";

const AMBER = "rgba(227,169,59,0.95)";
const RED = "rgba(229,96,77,0.98)";
const GRAY = "rgba(139,143,150,0.95)";

const DETAILS = ["Recipient", "Chain", "Token", "Amount", "Deadline"] as const;
/** the same five, shorter, for a phone-sized stage */
const DETAILS_SHORT = ["To", "Chain", "Token", "Amount", "Deadline"] as const;
const PIN_X = [-64, -32, 0, 32, 64];
const BAD = 3;
const R = 11;
const BASE = 8;
/** each pin stands on its own block, a tier above the rail, and on a round plate on that block: three tiers under the pipe */
const PED = 4;
const PB = BASE + PED;
const FLANGE = 2.6;
/** where the pipe itself starts: on top of the plate */
const PF = PB + FLANGE;
const H = 38;
const SLOT_Y = 21;
const SLOT_H = 8;
const LAMP_X = -98;
const RECV_X = 98;
/** the height of the line of light: through the middle of the slots */
const BEAM_Y = PF + SLOT_Y + SLOT_H / 2;

function draw(a: SceneArgs): void {
  const { ctx, cam, q, font, form, mis, compact, hot, zoom } = a;
  /* callouts fade out as the camera flies in on a part */
  const lab = Math.max(0, 1 - 1.15 * zoom);

  const pRail = ease.out(piece(form, 0, 0.22));
  const pLamp = ease.back(piece(form, 0.5, 0.16));
  const pRecv = ease.back(piece(form, 0.56, 0.16));
  const sweep = ease.inOut(piece(form, 0.66, 0.26));
  const pText = piece(form, 0.86, 0.14);

  drawFloor(ctx, cam, 150, pRail, pRail);
  q.add(-2e6, () => drawShadow(ctx, cam, [0, 0, 4], 124, 36, 0.9 * pRail));

  const rail: BoxOpts = {
    c: [-70 * (1 - pRail), 4, 0],
    size: [236, 8, 44],
    tone: COOL,
    alpha: pRail,
    text: [{ face: "front", text: "INTENT LOCK · DESIGN DEMONSTRATION", size: 5.4, color: `rgba(227,169,59,${0.95 * pText})` }],
  };
  /* a plinth wider than the rail, so the rail sits on something */
  const plinth: BoxOpts = { c: [-70 * (1 - pRail), 1.5, 0], size: [248, 3, 56], tone: DARK, alpha: pRail };
  q.add(-1.1e6, () => drawBox(ctx, cam, font, plinth));
  q.add(-1e6, () => drawBox(ctx, cam, font, rail));

  /* where the light is, and where it stops */
  const stopX = lerp(RECV_X, PIN_X[BAD] - R - 1, smooth(0.12, 0.6, mis));
  const head = lerp(LAMP_X, stopX, sweep);
  const blocked = smooth(0.12, 0.6, mis);

  PIN_X.forEach((x, i) => {
    const p = ease.out(piece(form, 0.12 + i * 0.07, 0.22));
    const shifted = i === BAD ? 9 * smooth(0, 0.7, mis) : 0;
    const reached = head > x + R ? 1 : 0;
    const lit = reached * (i >= BAD ? 1 - blocked : 1) * (i === BAD ? 1 - smooth(0, 0.5, mis) : 1);
    const c: V3 = [x, PF, 0];
    const body = Math.max(0.5, H * p);
    const moved = i === BAD && mis > 0.3;
    /* the pedestal block on the rail, and the shadow the pin throws on it */
    const ped: BoxOpts = { c: [x, BASE + PED / 2, 0], size: [32, PED * Math.max(0.05, ease.out(p * 1.6)), 32], tone: [104, 96, 84], alpha: clamp(p * 4) };
    q.add(P(cam, x, BASE + PED / 2, 0)[2] - 2, () => {
      drawBox(ctx, cam, font, { ...ped, c: [x, BASE + (PED * Math.max(0.05, ease.out(p * 1.6))) / 2, 0] });
      drawShadow(ctx, cam, [x, PB + 0.2, 0], R * 1.45, R * 1.45, 0.45 * clamp(p * 3));
    });
    /* the pin: a round plate on the block, the pipe standing ON the plate (not in it), and a head carrying the detail's initial.
       The plate is drawn first and the pipe starts at its top face; the head sits on top of the pipe, so it comes after it. */
    const dz = P(cam, x, PF + H / 2, 0)[2];
    q.add(dz - 0.4, () => drawCyl(ctx, cam, font, { c: [x, PB, 0], r: R + 3.4, h: FLANGE, tone: WARM, alpha: clamp(p * 4) }));
    q.add(dz, () =>
      drawCyl(ctx, cam, font, {
        c,
        r: R,
        h: body,
        tone: moved ? WARM : COOL,
        alpha: clamp(p * 4),
        window: p > 0.85 ? { y: SLOT_Y + shifted, h: SLOT_H, w: 9, lit, bad: i === BAD && mis > 0.5 } : undefined,
      }),
    );
    if (p > 0.5) {
      const pa = clamp((p - 0.5) / 0.4);
      q.add(dz + 0.5, () =>
        drawCyl(ctx, cam, font, {
          c: [x, PF + H, 0],
          r: R + 1.8,
          h: 2.6,
          tone: moved ? BRIGHT : WARM,
          alpha: pa,
          topText: { text: DETAILS[i][0], size: 9, color: moved && i === BAD ? "rgba(229,96,77,0.95)" : "rgba(12,13,15,0.78)" },
        }),
      );
    }
  });

  /* lamp and receiver: each is a small housing with a lens; the lamp glows once the light is sent, the receiver when it arrives */
  const lampLit = clamp(sweep * 3);
  const reach = head >= RECV_X - 1 && blocked < 0.05 ? 1 : 0;
  const HOUSE = BEAM_Y - BASE + 9;
  const housing = (x: number, side: -1 | 1, grow: number): BoxOpts => ({ c: [x + side * 10, BASE + (HOUSE * Math.max(0.05, grow)) / 2, 0], size: [14, HOUSE * Math.max(0.05, grow), 24], tone: COOL, alpha: clamp(grow * 3) });
  q.add(P(cam, LAMP_X - 10, BASE + HOUSE / 2, 0)[2], () => drawBox(ctx, cam, font, housing(LAMP_X, -1, pLamp)));
  q.add(P(cam, RECV_X + 10, BASE + HOUSE / 2, 0)[2] - 6, () => drawBox(ctx, cam, font, housing(RECV_X, 1, pRecv)));
  const glow = (x: number, k: number, r: number) => {
    const l = P(cam, x, BEAM_Y, 0);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(l[0], l[1], 1, l[0], l[1], r);
    g.addColorStop(0, `rgba(255,214,150,${0.5 * k})`);
    g.addColorStop(1, "rgba(255,214,150,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l[0], l[1], r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  q.add(P(cam, LAMP_X, BEAM_Y, 0)[2], () => {
    drawSphere(ctx, cam, [LAMP_X, BEAM_Y, 0], 6 * Math.max(0.01, pLamp), WARM, clamp(pLamp));
    if (lampLit > 0.02) glow(LAMP_X, lampLit, 26);
  });
  q.add(P(cam, RECV_X, BEAM_Y, 0)[2], () => {
    drawSphere(ctx, cam, [RECV_X, BEAM_Y, 0], 6 * Math.max(0.01, pRecv), reach ? BRIGHT : COOL, clamp(pRecv));
    if (reach) glow(RECV_X, 0.9, 24);
  });

  /* the parts that can be pointed at: each pin, the lamp, the receiver */
  const reg = (id: HeroPartId, x: number, y: number, z: number, r: number, zk = 2.6) => {
    const p = P(cam, x, y, z);
    const rr = Math.max(15, r * cam.s);
    hot.push({ id, x: p[0], y: p[1], r: rr, wx: x, wy: y, wz: z, zoom: zk });
  };
  const IDS: HeroPartId[] = ["t-recipient", "t-chain", "t-token", "t-amount", "t-deadline"];
  PIN_X.forEach((x, i) => reg(IDS[i], x, PF + H * 0.55, 0, 13));
  reg("t-lamp", LAMP_X, BEAM_Y, 0, 9, 3.2);
  reg("t-receiver", RECV_X, BEAM_Y, 0, 9, 3.2);

  q.flush();

  /* the beam, in the gaps between pins and at the window height, on top of the rail */
  if (sweep > 0.01) {
    const y = BEAM_Y;
    const z = R;
    const segs: Array<[number, number]> = [];
    let from = LAMP_X + 4;
    for (let i = 0; i < PIN_X.length; i++) {
      const left = PIN_X[i] - R;
      if (head > from) segs.push([from, Math.min(head, left)]);
      from = PIN_X[i] + R;
    }
    if (head > from) segs.push([from, head]);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [x0, x1] of segs) {
      if (x1 - x0 < 0.5) continue;
      const pa = P(cam, x0, y, z);
      const pb = P(cam, x1, y, z);
      ctx.strokeStyle = "rgba(255,214,150,0.22)";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,238,205,0.95)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
    /* where it stops: a short bar across the beam at the face of the moved pin */
    if (blocked > 0.5) {
      const e = P(cam, stopX, y, z);
      ctx.save();
      ctx.globalAlpha = smooth(0.5, 0.9, mis);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e[0], e[1] - 9);
      ctx.lineTo(e[0], e[1] + 9);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* detail tags over the pins */
  const f1 = compact ? 10 : 11.5;
  const f2 = compact ? 9 : 10;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  PIN_X.forEach((x, i) => {
    const t = clamp(piece(form, 0.8 + i * 0.03, 0.14));
    if (t < 0.03) return;
    const top = P(cam, x, PF + H + 3.2, 0);
    const bad = i === BAD && mis > 0.5;
    ctx.globalAlpha = t * lab;
    ctx.strokeStyle = bad ? RED : GRAY;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(top[0], top[1] - 6);
    ctx.lineTo(top[0], top[1] - 16);
    ctx.stroke();
    ctx.fillStyle = bad ? RED : "rgba(236,232,223,0.92)";
    ctx.font = `500 ${compact ? 8.5 : 10}px ${font}`;
    ctx.fillText(compact ? DETAILS_SHORT[i] : DETAILS[i], top[0], top[1] - 21);
  });
  ctx.restore();

  /* the labels sit just under the rail, below each end, so nothing crosses the pins or their tags */
  const lamp = P(cam, LAMP_X, BEAM_Y, 0);
  const recv = P(cam, RECV_X, BEAM_Y, 0);
  const lampFoot = P(cam, LAMP_X, 0, 24);
  const recvFoot = P(cam, RECV_X, 0, 24);
  drawLabel(ctx, font, {
    ax: lamp[0],
    ay: lamp[1] + 6,
    x: lampFoot[0] - 10,
    y: lampFoot[1] + (compact ? 24 : 30),
    side: "right",
    lines: compact ? ["Reviewed"] : ["The details you reviewed", "five of eight, as an example"],
    color: AMBER,
    alpha: pText * lab,
    w: a.w,
    f1,
    f2,
  });
  const ok = reach > 0;
  drawLabel(ctx, font, {
    ax: recv[0],
    ay: recv[1] + 6,
    x: recvFoot[0] + 10,
    y: recvFoot[1] + (compact ? 24 : 30),
    side: "left",
    lines: ok ? (compact ? ["All match"] : ["All details match", "the light gets through"]) : compact ? ["Stopped"] : ["One detail changed", "the light stops there"],
    color: ok ? "rgba(236,232,223,1)" : RED,
    alpha: pText * lab,
    w: a.w,
    f1,
    f2,
  });
}

export const TUMBLER: SceneDef = {
  yaw: -0.34,
  pitch: 0.5,
  turn: 0.3,
  limit: 0.6,
  bounds: box8(-122, 122, 0, 62, -22, 22),
  draw,
};
