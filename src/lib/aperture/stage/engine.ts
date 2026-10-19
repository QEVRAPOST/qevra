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
 *   - eased (u, mis, ry, rp): scroll-driven sub-progress, the Intent Lock mismatch, and the visitor's rotation
 *     (yaw and pitch offsets), eased like the ring scene.
 *
 * The visitor can drag to rotate (mouse, pen, or a horizontal touch drag; vertical touch drags still scroll the page),
 * point at a part (hover, or tap) and reset the view (double click or `resetView`). Rotation is limited per scene,
 * and starts again from the authored angle when the object changes.
 */
import { clamp, lerp } from "../math";
import { onReducedMotionChange, prefersReducedMotion } from "../motion";
import { FALLBACK_FONT_MONO } from "../constants";
import { resolveMonoFamily } from "../engine";
import { drawStage, SCENES } from "./draw";
import type { Hotspot } from "./types";

export interface StageState {
  f0: number;
  f1: number;
  f2: number;
  /** progress inside the active scene, 0..1, from the scroll position */
  u: number;
  /** Intent Lock: the amount detail changed, 0..1 */
  mis: number;
  /** the visitor's rotation: yaw and pitch offsets from the authored view, radians */
  ry: number;
  rp: number;
}

export type StageKey = keyof StageState;
const FORM_KEYS = ["f0", "f1", "f2"] as const;
const EASED_KEYS = ["u", "mis", "ry", "rp"] as const;
const PITCH_LIMIT = 0.3;

export interface StageView {
  readonly dpr: number;
  readonly px: number;
  readonly py: number;
  /** scene clock in seconds; only advances while frames render */
  readonly t: number;
  readonly fontMono: string;
  /** the part being pointed at, or null */
  readonly hover: string | null;
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
  hover: string | null = null;
  /** called when the part being pointed at changes (a hover, or a tap on touch) */
  onHover?: (id: string | null) => void;
  /** called when the object is turned away from, or back to, its authored view by the visitor */
  onView?: (turned: boolean) => void;
  /** the parts of the object on show, in canvas pixels, from the last frame */
  hot: Hotspot[] = [];

  private scene: 0 | 1 | 2 = 0;
  private limit = 1;
  private rotated = false;
  private drag: { x: number; y: number; ry: number; rp: number; moved: boolean; id: number; vx: number; t: number; touch: boolean } | null = null;
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
  private teardownInput?: () => void;
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
  set(patch: Partial<Pick<StageState, "u" | "mis" | "ry" | "rp">>, snap = false): void {
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

  /** Tell the stage which object is on show: it sets the rotation limit and starts again from the authored angle. */
  setScene(scene: 0 | 1 | 2): void {
    this.scene = scene;
    this.limit = SCENES[scene].limit;
    this.setHover(null);
    this.resetView();
  }

  /** Turn the object by an amount (radians), within the limit. `byUser` false is a hint the page gives (it does not count). */
  rotateBy(dyaw: number, dpitch = 0, byUser = true): void {
    this.target.ry = clamp(this.target.ry + dyaw, -this.limit, this.limit);
    this.target.rp = clamp(this.target.rp + dpitch, -PITCH_LIMIT, PITCH_LIMIT);
    if (byUser) this.noteRotated();
    if (prefersReducedMotion()) {
      Object.assign(this.state, { ry: this.target.ry, rp: this.target.rp });
      this.render();
    } else this.kick();
  }

  /** True once the visitor has turned it themselves. */
  get userRotated(): boolean {
    return this.rotated;
  }

  resetView(): void {
    this.target.ry = 0;
    this.target.rp = 0;
    this.onView?.(false);
    if (prefersReducedMotion()) {
      this.state.ry = 0;
      this.state.rp = 0;
      this.render();
    } else this.kick();
  }

  get isRotated(): boolean {
    return Math.abs(this.target.ry) > 0.01 || Math.abs(this.target.rp) > 0.01;
  }

  private noteRotated(): void {
    this.rotated = true;
    this.onView?.(true);
  }

  private setHover(id: string | null): void {
    if (this.hover === id) return;
    this.hover = id;
    this.onHover?.(id);
    this.kick();
    if (prefersReducedMotion()) this.render();
  }

  private hitTest(x: number, y: number): string | null {
    let best: string | null = null;
    let bd = Infinity;
    for (const h of this.hot) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d <= h.r && d < bd) {
        best = h.id;
        bd = d;
      }
    }
    return best;
  }

  /**
   * Drag to rotate, hover or tap to point at a part, double click to reset. Vertical touch drags are left to the page
   * (the canvas has `touch-action: pan-y`), so only a horizontal drag turns it on a phone.
   */
  bindInteraction(el: HTMLElement): void {
    const local = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const p = local(e);
      this.drag = { x: p.x, y: p.y, ry: this.target.ry, rp: this.target.rp, moved: false, id: e.pointerId, vx: 0, t: performance.now(), touch: e.pointerType === "touch" };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic pointer cannot be captured; dragging still works while it stays over the canvas */
      }
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      const d = this.drag;
      if (d && d.id === e.pointerId) {
        const dx = p.x - d.x;
        const dy = p.y - d.y;
        if (!d.moved && Math.hypot(dx, dy) > 5) {
          d.moved = true;
          el.dataset.dragging = "1";
          this.setHover(null);
        }
        if (d.moved) {
          const now = performance.now();
          const ry = clamp(d.ry + dx * 0.009, -this.limit, this.limit);
          d.vx = ((ry - this.target.ry) / Math.max(8, now - d.t)) * 16;
          d.t = now;
          this.target.ry = ry;
          this.state.ry = ry;
          if (!d.touch) {
            this.target.rp = clamp(d.rp + dy * 0.004, -PITCH_LIMIT, PITCH_LIMIT);
            this.state.rp = this.target.rp;
          }
          this.noteRotated();
          this.render();
        }
        return;
      }
      if (e.pointerType === "touch") return;
      this.setHover(this.hitTest(p.x, p.y));
    };
    const up = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      delete el.dataset.dragging;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (d.moved) {
        /* a flick coasts a little way */
        if (!prefersReducedMotion() && Math.abs(d.vx) > 0.004) this.target.ry = clamp(this.target.ry + d.vx * 14, -this.limit, this.limit);
        this.kick();
        return;
      }
      /* a tap or click: point at the part under it (the same as hovering, for touch) */
      const p = local(e);
      this.setHover(this.hitTest(p.x, p.y));
    };
    const cancel = () => {
      this.drag = null;
      delete el.dataset.dragging;
    };
    const leave = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && !this.drag) this.setHover(null);
    };
    const dbl = () => this.resetView();
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("dblclick", dbl);
    this.teardownInput = () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("dblclick", dbl);
    };
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
    this.hot = drawStage(c, this.w, this.h, this.state, this);
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
    this.teardownInput?.();
    if (this.pointerEl) {
      if (this.onMove) this.pointerEl.removeEventListener("pointermove", this.onMove);
      if (this.onLeave) this.pointerEl.removeEventListener("pointerleave", this.onLeave);
    }
  }
}
