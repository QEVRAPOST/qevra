/*
 * Scene 1: the QEVRA smart account, as a physical object.
 *
 * A separate open vault (base, walls, dividers) and, apart from it, a flat plate for the connected wallet. What the
 * vault is meant to hold is drawn as dashed outlines, the same "not evidenced" treatment the ring sculpture gives
 * the post-quantum ring: nothing is drawn solid without evidence, and no assets exist. The only thing between the
 * plate and the vault is a dotted line with a cross: "no deposit path yet".
 */
import { clamp } from "../math";
import { BRIGHT, COOL, DARK, drawBox, drawCyl, drawFloor, drawLabel, drawLine, drawShadow, ease, P, piece, WARM } from "./gfx";
import type { BoxOpts, V3 } from "./gfx";
import { box8 } from "./types";
import type { SceneArgs, SceneDef } from "./types";

const AMBER = "rgba(227,169,59,0.95)";
const GRAY = "rgba(139,143,150,0.95)";
const RED = "rgba(229,96,77,0.98)";
const TOP = 12;
const WALL = 30;
const RIGHT = 16;

function draw(a: SceneArgs): void {
  const { ctx, cam, q, font, form, compact } = a;

  const pBase = ease.out(piece(form, 0, 0.22));
  const pBack = ease.out(piece(form, 0.12, 0.24));
  const pLeft = ease.out(piece(form, 0.18, 0.24));
  const pRight = ease.out(piece(form, 0.24, 0.24));
  const pDivA = ease.out(piece(form, 0.4, 0.18));
  const pDivB = ease.out(piece(form, 0.45, 0.18));
  const pWallet = ease.out(piece(form, 0.4, 0.3));
  const pText = piece(form, 0.84, 0.16);

  drawFloor(ctx, cam, 150, pBase, pBase);
  q.add(-2e6, () => drawShadow(ctx, cam, [0, 0, 6], 100, 76, 0.9 * pBase));

  /* base slab slides in from the front and carries the engraved name */
  q.add(-1e6, () =>
    drawBox(ctx, cam, font, {
      c: [0, 6, 40 * (1 - pBase)],
      size: [170, TOP, 120],
      tone: COOL,
      alpha: pBase,
      text: [{ face: "front", text: "QEVRA SMART ACCOUNT · EXAMPLE ADDRESS", size: 5.6, color: `rgba(227,169,59,${0.95 * pText})` }],
    }),
  );

  /* walls rise from the slab; the right wall is low and the front is open, so the inside can be seen */
  const rise = (p: number, h: number) => ({ h: Math.max(0.01, h * p), cy: TOP + (h * p) / 2 });
  const back = rise(pBack, WALL);
  const left = rise(pLeft, WALL);
  const right = rise(pRight, RIGHT);
  q.add(-9e5, () =>
    drawBox(ctx, cam, font, {
      c: [0, back.cy, -56],
      size: [170, back.h, 8],
      tone: COOL,
      alpha: pBack,
      text: [{ face: "front", text: "QEVRA", size: 13, color: `rgba(236,232,223,${0.78 * pText})`, dy: 0 }],
    }),
  );
  q.add(-8.9e5, () => drawBox(ctx, cam, font, { c: [-81, left.cy, 0], size: [8, left.h, 104], tone: COOL, alpha: pLeft }));

  /* dividers drop in from above and make three compartments */
  for (const [x, p] of [
    [-28, pDivA],
    [28, pDivB],
  ] as const) {
    const o: BoxOpts = { c: [x, TOP + 7 + 46 * (1 - p), 0], size: [3, 14, 104], tone: DARK, alpha: p };
    q.add(P(cam, x, TOP + 7, 0)[2], () => drawBox(ctx, cam, font, o));
  }

  /* example assets: dashed outlines that drop in and settle. Outlines, because nothing is held. */
  const stacks = [
    { x: -54, n: 5, empty: false },
    { x: 0, n: 3, empty: false },
    { x: 54, n: 1, empty: true },
  ];
  stacks.forEach((s, si) => {
    for (let j = 0; j < s.n; j++) {
      const p = ease.back(piece(form, 0.56 + si * 0.05 + j * 0.03, 0.2));
      const c: V3 = [s.x, TOP + j * 5 + 50 * (1 - p), 0];
      q.add(P(cam, c[0], c[1], c[2])[2], () =>
        drawCyl(ctx, cam, font, { c, r: 16, h: 4, tone: WARM, alpha: clamp(p) * (s.empty ? 0.55 : 1), ghost: s.empty ? GRAY : AMBER }),
      );
    }
  });

  q.add(1e6, () => drawBox(ctx, cam, font, { c: [81, right.cy, 0], size: [8, right.h, 104], tone: COOL, alpha: pRight }));

  /* the connected wallet: a flat plate in front, apart from the vault */
  const plate: BoxOpts = {
    c: [-58, 2, 112 + 44 * (1 - pWallet)],
    size: [64, 4, 40],
    tone: BRIGHT,
    alpha: pWallet,
    text: [{ face: "top", text: "YOUR WALLET", size: 6.8, color: `rgba(12,13,15,${0.74 * pWallet})` }],
  };
  q.add(1.2e6, () => drawBox(ctx, cam, font, plate));

  q.flush();

  /* the one line between them: dotted means not built */
  const lk = pWallet * pText;
  drawLine(ctx, cam, [-58, 4, 92], [-58, 6, 61], GRAY, 1.3, [2, 3], lk);
  const mid = P(cam, -58, 5, 76);
  if (lk > 0.05) {
    ctx.save();
    ctx.globalAlpha = lk;
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(mid[0] - 5, mid[1] - 5);
    ctx.lineTo(mid[0] + 5, mid[1] + 5);
    ctx.moveTo(mid[0] + 5, mid[1] - 5);
    ctx.lineTo(mid[0] - 5, mid[1] + 5);
    ctx.stroke();
    ctx.restore();
  }

  /* labels */
  const f1 = compact ? 10 : 11.5;
  const f2 = compact ? 9 : 10;
  const wal = P(cam, -58, 4, 112);
  const acc = P(cam, 46, 6, 60);
  const ast = P(cam, 0, TOP + 14, 0);
  drawLabel(ctx, font, {
    ax: wal[0],
    ay: wal[1] + 4,
    x: wal[0] - (compact ? 0 : 20),
    y: wal[1] + (compact ? 32 : 38),
    side: "center",
    lines: compact ? ["Your wallet", "no deposit path yet"] : ["Your connected wallet", "an external account", "no deposit path to QEVRA yet"],
    color: "rgba(236,232,223,1)",
    alpha: pText,
    w: a.w,
    f1,
    f2,
  });
  drawLabel(ctx, font, {
    ax: acc[0],
    ay: acc[1],
    x: acc[0] + 26,
    y: acc[1] + (compact ? 38 : 44),
    side: "right",
    lines: compact ? ["QEVRA account"] : ["QEVRA smart account", "a separate address", "experimental, not live"],
    color: AMBER,
    alpha: pText,
    w: a.w,
    f1,
    f2,
  });
  drawLabel(ctx, font, {
    ax: ast[0],
    ay: ast[1],
    x: ast[0] + (compact ? 20 : 34),
    y: ast[1] - (compact ? 74 : 92),
    side: "right",
    lines: compact ? ["Example assets"] : ["Example assets", "outlined: none are held"],
    color: GRAY,
    alpha: pText,
    w: a.w,
    f1,
    f2,
  });
}

export const VAULT: SceneDef = {
  yaw: -0.58,
  pitch: 0.6,
  turn: 0.5,
  bounds: box8(-96, 90, 0, 42, -60, 134),
  draw,
};
