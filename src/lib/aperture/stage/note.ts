/*
 * The note on a zoomed part: a small card with the part's name, its type as a chip, and a few short lines, joined to the part
 * by a hairline leader and a dot. The same mono voice and hairline style as the callouts in the scenes. It is drawn by the
 * stage after the scene, so it can fade in once the camera has settled and out before it leaves.
 */
import { clamp, lerp, TAU } from "../math";

export interface StageNote {
  title: string;
  /** what kind of thing it is: shown in a chip */
  type: string;
  lines: readonly string[];
}

const AMBER = "227,169,59";

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param a      0..1, how much of the note is shown (it fades, and its leader draws out from the card)
 * @param anchor where the part is on the stage, in canvas pixels
 */
export function drawNote(ctx: CanvasRenderingContext2D, w: number, h: number, note: StageNote, a: number, anchor: { x: number; y: number }, font: string, compact: boolean): void {
  if (a < 0.01) return;
  const fT = compact ? 12 : 13.5;
  const fC = compact ? 9.2 : 10.2;
  const fL = compact ? 10 : 11;
  const lh = compact ? 14 : 16;
  const pad = compact ? 11 : 14;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 ${fT}px ${font}`;
  const tw = ctx.measureText(note.title).width;
  ctx.font = `500 ${fC}px ${font}`;
  const cw = ctx.measureText(note.type).width + 14;
  ctx.font = `400 ${fL}px ${font}`;
  /* On a phone the card spans the stage and its text is one paragraph wrapped to fit; on a wide stage the authored lines stand. */
  const bw = compact ? w - 24 : Math.min(w - 24, Math.max(tw + 10 + cw, ...note.lines.map((l) => ctx.measureText(l).width)) + pad * 2);
  const inner = bw - pad * 2;
  const lines: string[] = [];
  if (compact) {
    let line = "";
    for (const word of note.lines.join(" ").split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > inner) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  } else lines.push(...note.lines);
  const bh = pad * 2 + 18 + 6 + lines.length * lh - 2;

  /* on a wide stage the card stands at the upper right, clear of the part and of the buttons; on a phone, above the buttons at the foot */
  const bx = compact ? 12 : w - bw - 22;
  const by = compact ? h - bh - 46 : 62;
  const rise = (1 - a) * 6;
  const sx = compact ? bx + bw / 2 : bx;
  const sy = (compact ? by : by + bh / 2) + rise;

  /* the leader grows from the card toward the part, then the dot lands on it */
  const g = clamp((a - 0.1) / 0.7);
  const ex = lerp(sx, anchor.x, g);
  const ey = lerp(sy, anchor.y, g);
  ctx.globalAlpha = a;
  ctx.strokeStyle = `rgba(${AMBER},0.8)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  if (g > 0.95) {
    ctx.fillStyle = `rgba(${AMBER},0.95)`;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 2.6, 0, TAU);
    ctx.fill();
  }

  /* the card */
  ctx.fillStyle = "rgba(12,13,15,0.84)";
  rr(ctx, bx, by + rise, bw, bh, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(69,74,82,1)";
  rr(ctx, bx, by + rise, bw, bh, 3);
  ctx.stroke();

  const x0 = bx + pad;
  const y0 = by + rise + pad;
  ctx.fillStyle = "rgba(236,232,223,1)";
  ctx.font = `500 ${fT}px ${font}`;
  ctx.fillText(note.title, x0, y0 + 13);
  /* the type, in a chip */
  const cx = x0 + tw + 10;
  ctx.strokeStyle = `rgba(${AMBER},0.7)`;
  rr(ctx, cx, y0 + 1, cw, 17, 8.5);
  ctx.stroke();
  ctx.fillStyle = `rgba(${AMBER},1)`;
  ctx.font = `500 ${fC}px ${font}`;
  ctx.fillText(note.type, cx + 7, y0 + 13);
  ctx.fillStyle = "rgba(139,143,150,1)";
  ctx.font = `400 ${fL}px ${font}`;
  lines.forEach((l, i) => ctx.fillText(l, x0, y0 + 18 + 6 + 11 + i * lh));
  ctx.restore();
}
