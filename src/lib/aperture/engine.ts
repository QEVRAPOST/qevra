/*
 * ApertureScene: owns one <canvas>, the draw function and a small state machine.
 * Ported from the prototype's Scene class (docs/qevra-aperture-source/src/engine.js) with the lifecycle a React
 * app needs:
 *   - draws in CSS pixels (context pre-scaled by devicePixelRatio, capped at 2)
 *   - eases numeric state toward a target and snaps when reduced motion is on
 *   - runs its animation loop only while on screen, with the tab visible, motion allowed and something easing
 *   - dispose() removes every observer, listener and pending frame
 */
import { FALLBACK_FONT_MONO } from "./constants";
import { drawAperture } from "./draw";
import { clamp, lerp } from "./math";
import { onReducedMotionChange, prefersReducedMotion } from "./motion";
import type { ApertureKey, ApertureOptions, ApertureState, SceneView } from "./types";

const STATE_KEYS: readonly ApertureKey[] = ["explode", "scatter", "rev", "mis", "lit", "pq", "swarm", "tilt", "zoom", "fy"];

/** Resolve the monospace stack from the --f-mono CSS variable so next/font's renamed family is used. */
export function resolveMonoFamily(el: Element): string {
  const raw = getComputedStyle(el).getPropertyValue("--f-mono").trim();
  return raw || FALLBACK_FONT_MONO;
}

export class ApertureScene implements SceneView {
  readonly opts: ApertureOptions;
  readonly layout = { hover: -1 };
  readonly pointer = { x: -1e4, y: -1e4, inside: false };
  state: ApertureState;
  target: ApertureState;
  rate: number;
  px = 0;
  py = 0;
  t = 0;
  dpr = 1;
  fontMono: string;

  private readonly cv: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private tpx = 0;
  private tpy = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private visible = false;
  private raf = 0;
  private resizeRaf = 0;
  private disposed = false;
  private hoverReported = -1;
  private ro?: ResizeObserver;
  private io?: IntersectionObserver;
  private unsubMotion?: () => void;
  private pointerEl?: HTMLElement;
  private onMove?: (e: PointerEvent) => void;
  private onLeave?: () => void;
  private readonly onVisibility = () => this.kick();

  constructor(canvas: HTMLCanvasElement, opts: ApertureOptions, initial: ApertureState) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.cv = canvas;
    this.ctx = ctx;
    this.opts = opts;
    this.state = { ...initial };
    this.target = { ...initial };
    this.rate = opts.rate ?? 5;
    this.fontMono = resolveMonoFamily(canvas);
    this.resize();

    if (typeof ResizeObserver !== "undefined") {
      /* Rendering is deferred to a frame so the observer callback never changes layout in the same pass. */
      this.ro = new ResizeObserver(() => {
        if (this.resizeRaf || this.disposed) return;
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

  /** Wait for the engraved-text faces, then redraw. Text is drawn with a fallback until they arrive. */
  private async loadFonts(): Promise<void> {
    if (typeof document === "undefined" || !document.fonts) return;
    try {
      await Promise.all([
        document.fonts.load(`500 11px ${this.fontMono}`),
        document.fonts.load(`400 10px ${this.fontMono}`),
        document.fonts.load(`600 6px ${this.fontMono}`),
      ]);
      await document.fonts.ready;
    } catch {
      /* a failed face keeps the fallback stack */
    }
    if (!this.disposed) this.render();
  }

  /** Re-measure the canvas. Returns false for a hidden or collapsed canvas, which keeps its last good size. */
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

  setRate(rate: number): void {
    this.rate = rate;
  }

  /** Move toward a target, eased, or snap when asked to or when reduced motion is on. */
  set(patch: Partial<ApertureState>, snap = false): void {
    Object.assign(this.target, patch);
    if (snap || prefersReducedMotion()) {
      Object.assign(this.state, patch);
      this.render();
    } else {
      this.kick();
    }
  }

  /** Set both state and target at once and draw immediately (used to start the intro from a known pose). */
  jump(next: ApertureState): void {
    Object.assign(this.state, next);
    Object.assign(this.target, next);
    this.render();
  }

  /** Pointer parallax and ring hover. Touch pointers and reduced motion never drive either. */
  bindPointer(el: HTMLElement): void {
    this.onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || prefersReducedMotion()) return;
      const r = this.cv.getBoundingClientRect();
      this.pointer.x = e.clientX - r.left;
      this.pointer.y = e.clientY - r.top;
      this.pointer.inside = true;
      this.tpx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      this.tpy = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      this.kick();
    };
    this.onLeave = () => {
      this.pointer.inside = false;
      this.pointer.x = this.pointer.y = -1e4;
      this.tpx = 0;
      this.tpy = 0;
      this.kick();
    };
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    this.pointerEl = el;
  }

  private animating(): boolean {
    if (prefersReducedMotion()) return false;
    for (const k of STATE_KEYS) if (Math.abs(this.target[k] - this.state[k]) > 1e-3) return true;
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
    for (const key of STATE_KEYS) {
      const d = this.target[key] - this.state[key];
      this.state[key] = Math.abs(d) < 1e-3 ? this.target[key] : this.state[key] + d * k;
    }
    const kp = 1 - Math.exp(-4 * dt);
    this.px = lerp(this.px, this.tpx, kp);
    this.py = lerp(this.py, this.tpy, kp);
    this.render();
    if (this.animating()) this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  render(): void {
    if (this.disposed || !this.resize()) return;
    const c = this.ctx;
    const d = this.dpr;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    drawAperture(c, this.w, this.h, this.state, this);
    this.reportHover();
  }

  private reportHover(): void {
    const h = this.layout.hover;
    if (h === this.hoverReported) return;
    this.hoverReported = h;
    this.opts.onHoverChange?.(h);
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
