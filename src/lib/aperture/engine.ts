/*
 * ApertureScene: owns one <canvas>, the draw function and a small state machine.
 * Ported from the prototype's Scene class (docs/qevra-aperture-source/src/engine.js) with the lifecycle a React
 * app needs:
 *   - draws in CSS pixels (context pre-scaled by devicePixelRatio, capped at 2)
 *   - eases numeric state toward a target and snaps when reduced motion is on
 *   - runs its animation loop only while on screen, with the tab visible, motion allowed and something easing
 *   - dispose() removes every observer, listener and pending frame
 */
import { A_R, FALLBACK_FONT_MONO, SNAP_RAD, TURNED_EPS } from "./constants";
import { drawAperture } from "./draw";
import { clamp, lerp } from "./math";
import { onReducedMotionChange, prefersReducedMotion } from "./motion";
import { APERTURE_KEYS } from "./keyframes";
import type { ApertureOptions, ApertureState, RingsInfo, SceneView } from "./types";

const STATE_KEYS = APERTURE_KEYS;
const RING_COUNT = 8;

/** Bring an angle into (-PI, PI]. */
const wrapAngle = (a: number): number => {
  const t = Math.PI * 2;
  const m = ((a % t) + t) % t;
  return m > Math.PI ? m - t : m;
};

/** Resolve the monospace stack from the --f-mono CSS variable so next/font's renamed family is used. */
export function resolveMonoFamily(el: Element): string {
  const raw = getComputedStyle(el).getPropertyValue("--f-mono").trim();
  return raw || FALLBACK_FONT_MONO;
}

export class ApertureScene implements SceneView {
  readonly opts: ApertureOptions;
  readonly layout = { hover: -1, s: 1, cx: 0, cx0: 0, bands: [] as Array<{ y0: number; y1: number; half: number }> };
  readonly pointer = { x: -1e4, y: -1e4, inside: false };
  /** extra turn the user has given each ring, radians. Interactive scenes only. */
  readonly ringRot: number[] = new Array<number>(RING_COUNT).fill(0);
  selected = -1;
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
  private onDown?: (e: PointerEvent) => void;
  private onUp?: (e: PointerEvent) => void;
  /** per ring: null while coasting after a flick, otherwise the angle it is settling to */
  private ringTarget: Array<number | null> = new Array<number | null>(RING_COUNT).fill(0);
  private ringVel: number[] = new Array<number>(RING_COUNT).fill(0);
  private drag: { id: number; ring: number; x0: number; a0: number; lastX: number; lastT: number; v: number } | null = null;
  private ringsKey = "";
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
        /* a scheduled frame will draw at the new size anyway */
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

  /** Last measured canvas width in CSS pixels. */
  get width(): number {
    return this.w;
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

  /**
   * Pointer input. A hero scene gets parallax and ring hover (touch and reduced motion drive neither).
   * An interactive scene instead lets the user select a ring and drag it around its axis.
   */
  bindPointer(el: HTMLElement): void {
    this.pointerEl = el;
    if (this.opts.interactive) {
      this.bindInteractive(el);
      return;
    }
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
  }

  private bindInteractive(el: HTMLElement): void {
    const local = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.onMove = (e: PointerEvent) => {
      const { x, y } = local(e);
      if (this.drag && e.pointerId === this.drag.id) {
        const d = this.drag;
        const radius = A_R[d.ring] * this.layout.s;
        const now = performance.now();
        const rot = d.a0 + (e.clientX - d.x0) / radius;
        const dt = Math.max(1, now - d.lastT) / 1000;
        d.v = d.v * 0.6 + ((rot - this.ringRot[d.ring]) / dt) * 0.4;
        d.lastX = e.clientX;
        d.lastT = now;
        this.ringRot[d.ring] = rot;
        this.render();
        return;
      }
      if (e.pointerType === "touch") return;
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.inside = true;
      this.render();
    };
    this.onLeave = () => {
      if (this.drag) return;
      this.pointer.inside = false;
      this.pointer.x = this.pointer.y = -1e4;
      this.render();
    };
    this.onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const { x, y } = local(e);
      const hit = this.hitRing(x, y);
      if (hit < 0) {
        this.setSelected(-1);
        return;
      }
      this.setSelected(hit);
      this.ringVel[hit] = 0;
      this.ringTarget[hit] = this.ringRot[hit];
      this.drag = { id: e.pointerId, ring: hit, x0: e.clientX, a0: this.ringRot[hit], lastX: e.clientX, lastT: performance.now(), v: 0 };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic pointer cannot be captured */
      }
      el.style.cursor = "grabbing";
      this.render();
    };
    this.onUp = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      el.style.cursor = this.layout.hover >= 0 ? "grab" : "";
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      const a = wrapAngle(this.ringRot[d.ring]);
      this.ringRot[d.ring] = a;
      if (prefersReducedMotion()) {
        this.ringVel[d.ring] = 0;
        this.ringTarget[d.ring] = Math.abs(a) < SNAP_RAD ? 0 : a;
        if (this.ringTarget[d.ring] === 0) this.ringRot[d.ring] = 0;
      } else if (Math.abs(d.v) > 0.6 && Math.abs(a - d.a0) > 0.25) {
        /* a deliberate flick (a real drag, not a nudge): coast a short way, then settle */
        this.ringVel[d.ring] = clamp(d.v, -3.5, 3.5);
        this.ringTarget[d.ring] = null;
      } else {
        this.ringVel[d.ring] = 0;
        this.ringTarget[d.ring] = Math.abs(a) < SNAP_RAD ? 0 : a;
      }
      this.render();
      this.kick();
      this.reportRings();
    };
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
  }

  private animating(): boolean {
    if (prefersReducedMotion()) return false;
    for (const k of STATE_KEYS) if (Math.abs(this.target[k] - this.state[k]) > 1e-3) return true;
    return Math.abs(this.tpx - this.px) > 1e-3 || Math.abs(this.tpy - this.py) > 1e-3 || this.ringsBusy();
  }

  private ringsBusy(): boolean {
    if (this.drag) return true;
    for (let i = 0; i < RING_COUNT; i++) {
      const t = this.ringTarget[i];
      if (t === null || Math.abs(this.ringVel[i]) > 0.02 || Math.abs(t - this.ringRot[i]) > 1e-3) return true;
    }
    return false;
  }

  /** Coast after a flick, then settle: within SNAP_RAD of aligned it snaps to aligned, otherwise it stays where it was left. */
  private stepRings(dt: number): void {
    for (let i = 0; i < RING_COUNT; i++) {
      if (this.drag?.ring === i) continue;
      const t = this.ringTarget[i];
      if (t === null) {
        this.ringRot[i] += this.ringVel[i] * dt;
        this.ringVel[i] *= Math.exp(-5 * dt);
        if (Math.abs(this.ringVel[i]) < 0.05) {
          this.ringVel[i] = 0;
          const a = wrapAngle(this.ringRot[i]);
          this.ringRot[i] = a;
          this.ringTarget[i] = Math.abs(a) < SNAP_RAD ? 0 : a;
        }
      } else {
        const d = t - this.ringRot[i];
        this.ringRot[i] = Math.abs(d) < 1e-3 ? t : this.ringRot[i] + d * (1 - Math.exp(-14 * dt));
      }
    }
  }

  /** Which rings the user has turned out of line, and which ring is selected. */
  getRings(): RingsInfo {
    const turned = this.ringRot.map((r, i) => {
      const held = this.drag?.ring === i || this.ringTarget[i] === null ? r : (this.ringTarget[i] ?? 0);
      return Math.abs(held) > TURNED_EPS;
    });
    return { selected: this.selected, turned };
  }

  private reportRings(): void {
    if (!this.opts.onRingsChange) return;
    const info = this.getRings();
    const key = `${info.selected}|${info.turned.map((t) => (t ? 1 : 0)).join("")}`;
    if (key === this.ringsKey) return;
    this.ringsKey = key;
    this.opts.onRingsChange(info);
  }

  setSelected(i: number): void {
    const next = i >= 0 && i < RING_COUNT ? i : -1;
    if (next === this.selected) return;
    this.selected = next;
    this.render();
    this.reportRings();
  }

  /** Turn a ring by a step (keyboard). It stays where it is put; only a drag release snaps. */
  turnRing(i: number, delta: number): void {
    if (i < 0 || i >= RING_COUNT) return;
    const a = wrapAngle((this.ringTarget[i] ?? this.ringRot[i]) + delta);
    this.setRingAngle(i, Math.abs(a) < 0.02 ? 0 : a);
  }

  /** Move a ring to an angle (eased, or snapped under reduced motion). */
  setRingAngle(i: number, angle: number): void {
    if (i < 0 || i >= RING_COUNT) return;
    this.ringVel[i] = 0;
    this.ringTarget[i] = angle;
    if (prefersReducedMotion()) {
      this.ringRot[i] = angle;
      this.render();
    } else {
      this.kick();
    }
    this.reportRings();
  }

  resetRings(): void {
    for (let i = 0; i < RING_COUNT; i++) {
      this.ringVel[i] = 0;
      this.ringTarget[i] = 0;
      if (prefersReducedMotion()) this.ringRot[i] = 0;
    }
    this.drag = null;
    this.render();
    this.kick();
    this.reportRings();
  }

  private hitRing(x: number, y: number): number {
    let hit = -1;
    this.layout.bands.forEach((b, i) => {
      if (Math.abs(x - this.layout.cx) < b.half && y >= b.y0 && y <= b.y1) hit = i;
    });
    return hit;
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
    this.stepRings(dt);
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
    this.reportRings();
  }

  private reportHover(): void {
    const h = this.layout.hover;
    if (h === this.hoverReported) return;
    this.hoverReported = h;
    if (this.opts.interactive && this.pointerEl && !this.drag) this.pointerEl.style.cursor = h >= 0 ? "grab" : "";
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
      if (this.onDown) this.pointerEl.removeEventListener("pointerdown", this.onDown);
      if (this.onUp) {
        this.pointerEl.removeEventListener("pointerup", this.onUp);
        this.pointerEl.removeEventListener("pointercancel", this.onUp);
      }
    }
  }
}
