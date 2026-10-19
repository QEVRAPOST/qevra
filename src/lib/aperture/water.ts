/*
 * Water: the closing section's ground. It lays a calm pool under the ring sculpture, drawn in Canvas 2D:
 *   - a reflection of the sculpture, mirrored about the front edge of its base plate, fading with depth and wobbling more
 *     the farther down it goes (each 2 pixel strip of the picture is shifted sideways by two slow sine waves)
 *   - ring ripples spreading from the base plate, uneven in outline, lit on the far side and shaded on the near side
 *   - small drops landing at random places, each making two rings; farther drops are smaller (perspective)
 *   - a field of glints that twinkle, and a brighter, widening glitter path under the sculpture's line of light
 *   - a thin waterline where the plate meets the water
 * Lifecycle rules match the other canvases: it draws only while it is told it is on screen (`setActive`), the tab is visible
 * and motion is allowed; with reduced motion it draws one still frame; `dispose()` removes everything. DPR is capped at 1.5.
 */
import { clamp, lerp, smooth, TAU } from "./math";
import { onReducedMotionChange, prefersReducedMotion } from "./motion";

/** The picture to reflect, and where the sculpture stands in it. Distances are CSS pixels. */
export interface WaterSource {
  canvas: HTMLCanvasElement;
  /** where that picture sits inside the water canvas, and how big it is */
  ox: number;
  oy: number;
  w: number;
  h: number;
  /** in the picture: where the sculpture's axis meets the water, the front edge of its plate (the mirror line), and the plate's radius */
  cx: number;
  yc: number;
  yf: number;
  plate: number;
  /** how flat a circle on the water looks: the sine of the camera's elevation */
  sinT: number;
}

const STEP = 2;
const DROP_EVERY = 1.35;
const DROP_LIFE = 4.4;
const WAVE_EVERY = 3.6;
const WAVE_LIFE = 11;

/** A repeatable pseudo-random number in [0, 1) from an integer. */
const rnd = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

interface Glint {
  u: number;
  v: number;
  ph: number;
  sp: number;
  len: number;
  /** -1..1 across the glitter path (only used by path glints) */
  du: number;
}

export class WaterScene {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private t = 5;
  private last = 0;
  private raf = 0;
  private active = false;
  private disposed = false;
  private reveal = 0;
  private revealTo = 0;
  private readonly glints: Glint[] = [];
  private readonly pathGlints: Glint[] = [];
  private ro?: ResizeObserver;
  private unsubMotion?: () => void;
  private readonly onVis = () => this.kick();

  constructor(
    private readonly cv: HTMLCanvasElement,
    private readonly source: () => WaterSource | null,
  ) {
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    for (let i = 0; i < 150; i++) this.glints.push({ u: rnd(i + 1), v: rnd(i + 401), ph: rnd(i + 801) * TAU, sp: 0.5 + rnd(i + 1201) * 1.6, len: 0.5 + rnd(i + 1601), du: 0 });
    for (let i = 0; i < 70; i++) this.pathGlints.push({ u: 0, v: rnd(i + 2001), ph: rnd(i + 2401) * TAU, sp: 0.7 + rnd(i + 2801) * 1.8, len: 0.6 + rnd(i + 3201), du: rnd(i + 3601) * 2 - 1 });
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => {
        this.resize();
        if (!this.raf) this.render();
      });
      this.ro.observe(cv);
    }
    document.addEventListener("visibilitychange", this.onVis);
    this.unsubMotion = onReducedMotionChange(() => {
      this.kick();
      this.render();
    });
  }

  private resize(): void {
    const r = this.cv.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.cv.width = Math.round(w * dpr);
      this.cv.height = Math.round(h * dpr);
    }
  }

  /** Tell it whether it is on screen. It only runs while it is. */
  setActive(on: boolean): void {
    if (this.active === on || this.disposed) return;
    this.active = on;
    if (on) this.kick();
    this.render();
  }

  /** How much of the reflection shows, 0..1: it follows the sculpture being put together. `snap` skips the easing. */
  setReveal(v: number, snap = false): void {
    this.revealTo = v;
    if (snap || prefersReducedMotion()) {
      this.reveal = v;
      this.render();
    } else this.kick();
  }

  private running(): boolean {
    return this.active && !document.hidden && !prefersReducedMotion() && !this.disposed;
  }

  private kick(): void {
    if (this.raf || !this.running()) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  private frame(now: number): void {
    this.raf = 0;
    if (!this.running()) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.reveal += (this.revealTo - this.reveal) * (1 - Math.exp(-3.2 * dt));
    this.render();
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  render(): void {
    if (this.disposed || this.w < 2) return;
    const c = this.ctx;
    const { w, h, t } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    if (!this.active && !prefersReducedMotion()) return;

    const src = this.source();
    const ax = src ? src.ox + src.cx : w * 0.74;
    const yc = src ? src.oy + src.yc : h * 0.6;
    const yf = src ? src.oy + src.yf : h * 0.68;
    const plate = src ? src.plate : 120;
    const sin = src ? src.sinT : 0.48;
    const reach = Math.max(w * 0.95, 900);

    /* the pool: warm where the sculpture's light falls on it, cool graphite out to the edges, darker toward the viewer */
    c.save();
    c.translate(ax, yc);
    c.scale(1, sin);
    const pool = c.createRadialGradient(0, 0, plate * 0.8, 0, 0, reach);
    pool.addColorStop(0, "rgba(255,226,170,0.2)");
    pool.addColorStop(0.16, "rgba(224,186,126,0.1)");
    pool.addColorStop(0.5, "rgba(44,58,74,0.2)");
    pool.addColorStop(1, "rgba(10,14,20,0)");
    c.fillStyle = pool;
    c.beginPath();
    c.arc(0, 0, reach, 0, TAU);
    c.fill();
    c.restore();
    const dark = c.createLinearGradient(0, yf - 30, 0, h);
    dark.addColorStop(0, "rgba(5,8,12,0)");
    dark.addColorStop(1, "rgba(5,8,12,0.5)");
    c.fillStyle = dark;
    c.fillRect(0, yf - 30, w, h - yf + 30);

    /* the reflection */
    if (src && src.canvas.width > 0 && this.reveal > 0.01) {
      const k = src.canvas.width / src.w;
      const dMax = Math.min(h - yf, src.yf, 470);
      for (let d = 0; d < dMax; d += STEP) {
        const sy = src.yf - d - STEP;
        if (sy < 0) break;
        const a = 0.56 * Math.pow(1 - d / dMax, 1.45) * this.reveal;
        if (a < 0.012) continue;
        const wob = (0.4 + d * 0.011) * (Math.sin(d * 0.105 + t * 1.35) + 0.55 * Math.sin(d * 0.27 - t * 0.9 + 1.7));
        c.globalAlpha = a;
        c.drawImage(src.canvas, 0, sy * k, src.canvas.width, STEP * k, src.ox + wob, yf + d, src.w, STEP);
      }
      c.globalAlpha = 1;
    }

    /* glints: twinkling bits of reflected light, longer and brighter nearer the viewer, richer under the sculpture's line of light */
    const yTop = Math.max(0, yc - h * 0.3);
    c.lineCap = "round";
    const glint = (g: Glint, path: boolean) => {
      const v = g.v;
      const y = yTop + (h - yTop) * Math.pow(v, 1.7);
      const pw = 24 + 170 * v;
      const x = path ? ax + g.du * pw * 0.5 * (0.4 + 0.6 * Math.abs(g.du)) : g.u * w;
      const tw = Math.pow(0.5 + 0.5 * Math.sin(t * g.sp + g.ph), 5);
      const into = path ? 1 : clamp(1 - Math.abs(x - ax) / pw);
      let a = tw * (0.05 + 0.3 * v) * (path ? 2 : 1 + 2.6 * into);
      if (x < w * 0.5) a *= 0.15 + 0.85 * smooth(0, 0.5, x / w);
      if (a < 0.012) return;
      const len = (3 + 46 * v) * g.len;
      const warm = clamp(into * 1.2);
      const rgb = `${Math.round(lerp(160, 255, warm))},${Math.round(lerp(184, 226, warm))},${Math.round(lerp(212, 170, warm))}`;
      /* a soft, wide stroke under a thin bright one, so a glint has a glow and not a hard edge */
      c.strokeStyle = `rgba(${rgb},${Math.min(0.3, a * 0.35)})`;
      c.lineWidth = 2.4 + 2.2 * v;
      c.beginPath();
      c.moveTo(x - len / 2, y);
      c.lineTo(x + len / 2, y);
      c.stroke();
      c.strokeStyle = `rgba(${rgb},${Math.min(0.7, a)})`;
      c.lineWidth = 0.7 + 1.1 * v;
      c.beginPath();
      c.moveTo(x - len * 0.35, y);
      c.lineTo(x + len * 0.35, y);
      c.stroke();
    };
    for (const g of this.glints) glint(g, false);
    for (const g of this.pathGlints) glint(g, true);

    /* ripples from the base plate */
    const ring = (cx: number, cy: number, r: number, alpha: number, lw: number, seed: number) => {
      if (alpha < 0.008 || r < 2) return;
      const N = 96;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * TAU;
        const rr = r * (1 + 0.011 * Math.sin(3 * th + t * 0.5 + seed) + 0.007 * Math.sin(5 * th - t * 0.35 + seed * 2.3));
        pts.push([cx + rr * Math.cos(th), cy + rr * sin * Math.sin(th)]);
      }
      const trace = (dy: number) => {
        c.beginPath();
        pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1] + dy) : c.moveTo(p[0], p[1] + dy)));
      };
      /* the shaded side of the wave, a little below the crest; then the crest, bright on the far side and dim on the near one */
      c.strokeStyle = `rgba(0,0,0,${alpha * 0.8})`;
      c.lineWidth = lw * 1.5;
      trace(lw * 1.4);
      c.stroke();
      const g = c.createLinearGradient(0, cy - r * sin, 0, cy + r * sin);
      g.addColorStop(0, `rgba(255,238,206,${alpha})`);
      g.addColorStop(0.55, `rgba(214,206,190,${alpha * 0.55})`);
      g.addColorStop(1, `rgba(150,170,196,${alpha * 0.28})`);
      c.strokeStyle = g;
      c.lineWidth = lw;
      trace(0);
      c.stroke();
    };
    const waves = Math.ceil(WAVE_LIFE / WAVE_EVERY) + 1;
    const r0 = plate * 1.05;
    for (let k = 0; k < waves; k++) {
      const birth = Math.floor(t / WAVE_EVERY) * WAVE_EVERY - k * WAVE_EVERY;
      const age = t - birth;
      if (age < 0 || age > WAVE_LIFE) continue;
      const p = age / WAVE_LIFE;
      const r = r0 + (reach * 0.92 - r0) * (1 - Math.pow(1 - p, 1.7));
      ring(ax, yc, r, 0.34 * Math.min(1, age / 0.9) * Math.pow(1 - p, 1.6), 1.7 * (1 - p) + 0.7, birth);
    }

    /* drops landing here and there: two rings each, smaller far away */
    const jn = Math.floor(t / DROP_EVERY);
    for (let j = jn - Math.ceil(DROP_LIFE / DROP_EVERY); j <= jn; j++) {
      const ts = j * DROP_EVERY;
      const x = w * (0.1 + 0.88 * rnd(j * 3 + 1));
      const v = Math.pow(rnd(j * 3 + 2), 1.1);
      const y = yTop + (h - yTop) * (0.18 + 0.82 * v);
      const near = clamp((y - yTop) / (h - yTop));
      const size = 14 + 96 * (0.3 + 0.9 * near);
      const fade = x < w * 0.5 ? 0.35 + 0.65 * smooth(0, 0.5, x / w) : 1;
      for (let rr = 0; rr < 2; rr++) {
        const age = t - ts - rr * 0.3;
        if (age < 0 || age > DROP_LIFE) continue;
        const p = age / DROP_LIFE;
        ring(x, y, size * (1 - Math.pow(1 - p, 1.8)) * (rr ? 0.7 : 1), 0.26 * fade * Math.min(1, age * 3) * Math.pow(1 - p, 1.8), 1.1 * (1 - p) + 0.5, j + rr);
      }
    }

    /* the waterline: where the plate meets the water */
    c.save();
    c.translate(ax, yc);
    c.scale(1, sin);
    c.lineWidth = 1;
    c.strokeStyle = `rgba(255,226,170,${0.14 + 0.05 * Math.sin(t * 0.8)})`;
    c.beginPath();
    c.arc(0, 0, plate * 1.012, 0, TAU);
    c.stroke();
    c.strokeStyle = "rgba(0,0,0,0.35)";
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 2, plate * 1.03, 0, TAU);
    c.stroke();
    c.restore();

    /* let the water fade out toward the left (where the words are) and toward the top (the far shore) */
    c.globalCompositeOperation = "destination-out";
    const fl = c.createLinearGradient(0, 0, w * 0.46, 0);
    fl.addColorStop(0, "rgba(0,0,0,0.92)");
    fl.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = fl;
    c.fillRect(0, 0, w * 0.46, h);
    const ft = c.createLinearGradient(0, 0, 0, h * 0.34);
    ft.addColorStop(0, "rgba(0,0,0,1)");
    ft.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = ft;
    c.fillRect(0, 0, w, h * 0.34);
    c.globalCompositeOperation = "source-over";
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro?.disconnect();
    document.removeEventListener("visibilitychange", this.onVis);
    this.unsubMotion?.();
  }
}
