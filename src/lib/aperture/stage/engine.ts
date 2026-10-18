/*
 * StageScene: owns one <canvas> and the hero scenes' state. It mirrors ApertureScene's lifecycle rules:
 *   - draws in CSS pixels (context pre-scaled by devicePixelRatio, capped at 2)
 *   - runs its frame loop only while on screen, the tab is visible, motion is allowed and something is moving
 *   - snaps instead of animating under reduced motion
 *   - dispose() removes every observer, listener and pending frame
 *
 * Two kinds of state:
 *   - formation (f0, f1, f2): how built each scene is. Driven by linear time tweens, because each piece of a
 *     scene starts and ends at its own moment inside that 0..1 and applies its own easing.
 *   - eased (u, mis): scroll-driven sub-progress and the Intent Lock mismatch, eased like the ring scene.
 */
import { clamp, lerp } from "../math";
import { onReducedMotionChange, prefersReducedMotion } from "../motion";
import { FALLBACK_FONT_MONO } from "../constants";
import { resolveMonoFamily } from "../engine";
import { drawStage } from "./draw";

export interface StageState {
  f0: number;
  f1: number;
  f2: number;
  /** progress inside the active scene, 0..1, from the scroll position */
  u: number;
  /** Intent Lock: the amount detail changed, 0..1 */
  mis: number;
}

export type StageKey = keyof StageState;
const FORM_KEYS = ["f0", "f1", "f2"] as const;
const EASED_KEYS = ["u", "mis"] as const;

export interface StageView {
  readonly dpr: number;
  readonly px: number;
  readonly py: number;
  /** scene clock in seconds; only advances while frames render */
  readonly t: number;
  readonly fontMono: string;
}

interface Tween {
  from: number;
  to: number;
  t0: number;
  dur: number;
  delay: number;
}

export class StageScene implements StageView {
  state: StageState;
  target: StageState;
  rate = 3.2;
  px = 0;
  py = 0;
  t = 0;
  dpr = 1;
  fontMono: string;

  private readonly cv: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private tweens = new Map<StageKey, Tween>();
  private tpx = 0;
  private tpy = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private visible = false;
  private raf = 0;
  private resizeRaf = 0;
  private disposed = false;
  private ro?: ResizeObserver;
  private io?: IntersectionObserver;
  private unsubMotion?: () => void;
  private pointerEl?: HTMLElement;
  private onMove?: (e: PointerEvent) => void;
  private onLeave?: () => void;
  private readonly onVisibility = () => this.kick();

  constructor(canvas: HTMLCanvasElement, initial: StageState) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.cv = canvas;
    this.ctx = ctx;
    this.state = { ...initial };
    this.target = { ...initial };
    this.fontMono = resolveMonoFamily(canvas) || FALLBACK_FONT_MONO;
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => {
        if (this.resizeRaf || this.raf || this.disposed) return;
        this.resizeRaf = requestAnimationFrame(() => {
          this.resizeRaf = 0;
          this.render();
        });
      });
      this.ro.observe(canvas);
    }
    if (typeof IntersectionObserver !== "undefined") {
      this.io = new IntersectionObserver(
        (entries) => {
          this.visible = entries[entries.length - 1].isIntersecting;
          this.kick();
        },
        { rootMargin: "80px" },
      );
      this.io.observe(canvas);
    } else {
      this.visible = true;
    }
    document.addEventListener("visibilitychange", this.onVisibility);
    this.unsubMotion = onReducedMotionChange(() => {
      this.kick();
      this.render();
    });
    void this.loadFonts();
  }

  private async loadFonts(): Promise<void> {
    if (!document.fonts) return;
    try {
      await Promise.all([document.fonts.load(`500 11px ${this.fontMono}`), document.fonts.load(`400 10px ${this.fontMono}`)]);
      await document.fonts.ready;
    } catch {
      /* a failed face keeps the fallback stack */
    }
    if (!this.disposed) this.render();
  }

  get width(): number {
    return this.w;
  }

  private resize(): boolean {
    const r = this.cv.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.cv.width = Math.round(w * dpr);
      this.cv.height = Math.round(h * dpr);
    }
    return true;
  }

  /** Move the eased values toward a target, or snap. */
  set(patch: Partial<Pick<StageState, "u" | "mis">>, snap = false): void {
    Object.assign(this.target, patch);
    if (snap || prefersReducedMotion()) {
      Object.assign(this.state, patch);
      this.render();
    } else {
      this.kick();
    }
  }

  /** Build or take apart a scene over `ms`, after `delay`. Linear in time; the scene applies its own easing per piece. */
  form(scene: 0 | 1 | 2, to: number, ms: number, delay = 0): void {
    const key = FORM_KEYS[scene];
    if (prefersReducedMotion()) {
      this.tweens.delete(key);
      this.state[key] = this.target[key] = to;
      this.render();
      return;
    }
    this.tweens.set(key, { from: this.state[key], to, t0: performance.now(), dur: Math.max(1, ms), delay });
    this.target[key] = to;
    this.kick();
  }

  /** Put everything at a state at once. */
  jump(next: StageState): void {
    this.tweens.clear();
    Object.assign(this.state, next);
    Object.assign(this.target, next);
    this.render();
  }

  bindPointer(el: HTMLElement): void {
    this.pointerEl = el;
    this.onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || prefersReducedMotion()) return;
      const r = this.cv.getBoundingClientRect();
      this.tpx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      this.tpy = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      this.kick();
    };
    this.onLeave = () => {
      this.tpx = 0;
      this.tpy = 0;
      this.kick();
    };
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
  }

  private moving(): boolean {
    if (prefersReducedMotion()) return false;
    if (this.tweens.size > 0) return true;
    for (const k of EASED_KEYS) if (Math.abs(this.target[k] - this.state[k]) > 1e-3) return true;
    return Math.abs(this.tpx - this.px) > 1e-3 || Math.abs(this.tpy - this.py) > 1e-3;
  }

  private kick(): void {
    if (this.disposed || this.raf || !this.visible || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  private frame(now: number): void {
    this.raf = 0;
    if (this.disposed || !this.visible || document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const k = 1 - Math.exp(-this.rate * dt);
    for (const key of EASED_KEYS) {
      const d = this.target[key] - this.state[key];
      this.state[key] = Math.abs(d) < 1e-3 ? this.target[key] : this.state[key] + d * k;
    }
    for (const [key, tw] of this.tweens) {
      const el = now - tw.t0 - tw.delay;
      const p = clamp(el / tw.dur);
      this.state[key as "f0" | "f1" | "f2"] = el <= 0 ? tw.from : lerp(tw.from, tw.to, p);
      if (p >= 1) this.tweens.delete(key);
    }
    const kp = 1 - Math.exp(-4 * dt);
    this.px = lerp(this.px, this.tpx, kp);
    this.py = lerp(this.py, this.tpy, kp);
    this.render();
    if (this.moving()) this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  render(): void {
    if (this.disposed || !this.resize()) return;
    const c = this.ctx;
    const d = this.dpr;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    drawStage(c, this.w, this.h, this.state, this);
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
    this.raf = this.resizeRaf = 0;
    this.ro?.disconnect();
    this.io?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.unsubMotion?.();
    if (this.pointerEl) {
      if (this.onMove) this.pointerEl.removeEventListener("pointermove", this.onMove);
      if (this.onLeave) this.pointerEl.removeEventListener("pointerleave", this.onLeave);
    }
  }
}
