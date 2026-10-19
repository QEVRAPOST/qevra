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
import { drawPointer } from "./gfx";
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
  /** zoom: how far the camera has flown in (0..1), how far it zooms at 1, and the point in the scene it flies to */
  zm: number;
  zk: number;
  cx: number;
  cy: number;
  cz: number;
}

/** All-zero state, with any patch applied. */
export function stageState(patch: Partial<StageState> = {}): StageState {
  return { f0: 0, f1: 0, f2: 0, u: 0.5, mis: 0, ry: 0, rp: 0, zm: 0, zk: 1, cx: 0, cy: 0, cz: 0, ...patch };
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
  /** the project name, for the text engraved on the objects */
  readonly projectName: string;
  /** water lies under the stage, so the scenes leave their own floor out */
  readonly water: boolean;
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
  projectName = "QEVRA";
  water = false;
  /** the part the camera has flown in on, or null */
  zoomId: string | null = null;
  /** called when the camera flies in on a part, or back out */
  onZoom?: (id: string | null) => void;
  /** called when the part being pointed at changes (a hover, or a tap on touch) */
  onHover?: (id: string | null) => void;
  /** called when the object is turned away from, or back to, its authored view by the visitor */
  onView?: (turned: boolean) => void;
  /** the parts of the object on show, in canvas pixels, from the last frame */
  hot: Hotspot[] = [];

  /** the marker on the part under the pointer: it fades in and glides from part to part instead of jumping */
  private ring = { x: 0, y: 0, r: 20, a: 0 };
  private hoverSpot: Hotspot | null = null;
  private zoomTween: { t0: number; dur: number; from: Pick<StageState, "zm" | "zk" | "cx" | "cy" | "cz">; to: Pick<StageState, "zm" | "zk" | "cx" | "cy" | "cz"> } | null = null;
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
    this.hoverSpot = null;
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
    if (this.zoomId != null) this.zoomTo(null);
    this.onView?.(this.zoomId != null);
    if (prefersReducedMotion()) {
      this.state.ry = 0;
      this.state.rp = 0;
      this.render();
    } else this.kick();
  }

  get isRotated(): boolean {
    return Math.abs(this.target.ry) > 0.01 || Math.abs(this.target.rp) > 0.01;
  }

  /** The view is away from the authored one: turned, or zoomed in. */
  get isChanged(): boolean {
    return this.isRotated || this.zoomId != null;
  }

  /**
   * Fly the camera in on a part, or back out (null). A time tween with ease-in-out, so it starts and lands softly. Going from
   * one part to another while zoomed glides along instead of zooming out and in.
   */
  zoomTo(h: Hotspot | null): void {
    const cur = { zm: this.state.zm, zk: this.state.zk, cx: this.state.cx, cy: this.state.cy, cz: this.state.cz };
    const to = h ? { zm: 1, zk: h.zoom, cx: h.wx, cy: h.wy, cz: h.wz } : { ...cur, zm: 0 };
    this.zoomId = h ? h.id : null;
    Object.assign(this.target, { cx: to.cx, cy: to.cy, cz: to.cz });
    this.onZoom?.(this.zoomId);
    this.onView?.(this.isChanged);
    if (prefersReducedMotion()) {
      this.zoomTween = null;
      Object.assign(this.state, to);
      this.render();
      return;
    }
    /* coming in from rest, take a little longer than gliding between parts */
    this.zoomTween = { t0: performance.now(), dur: h && cur.zm > 0.05 ? 760 : 920, from: cur, to };
    this.kick();
  }

  /** Keyboard: fly to the next (or previous) part of the object on show; past the last, back out. */
  cycleZoom(step = 1): void {
    const parts = [...this.hot].sort((a, b) => a.id.localeCompare(b.id) || a.wx - b.wx);
    if (parts.length === 0) return;
    const at = this.zoomId == null ? -1 : parts.findIndex((p) => p.id === this.zoomId && p.wx === this.target.cx && p.wy === this.target.cy);
    const next = at + step;
    if (next >= parts.length || next < -1) this.zoomTo(null);
    else this.zoomTo(next === -1 ? null : parts[next]);
  }

  private noteRotated(): void {
    this.rotated = true;
    this.onView?.(true);
  }

  /** Point at a part (or at nothing). The caption follows the id; the marker follows the part itself. */
  private pointAt(spot: Hotspot | null): void {
    this.hoverSpot = spot;
    this.setHover(spot ? spot.id : null);
    if (prefersReducedMotion()) this.settleRing();
    else this.kick();
  }

  private spotKey(h: Hotspot): string {
    return `${h.id}|${h.wx}|${h.wy}|${h.wz}`;
  }

  /** where the marker should be right now: on the part being pointed at, at its current place on screen */
  private ringWant(): Hotspot | null {
    if (!this.hoverSpot || this.state.zm > 0.2) return null;
    const key = this.spotKey(this.hoverSpot);
    return this.hot.find((h) => this.spotKey(h) === key) ?? null;
  }

  private settleRing(): void {
    const w = this.ringWant();
    if (w) this.ring = { x: w.x, y: w.y, r: w.r * 0.88, a: 1 };
    else this.ring.a = 0;
    this.render();
  }

  private ringMoving(): boolean {
    const w = this.ringWant();
    if (!w) return this.ring.a > 0.01;
    return this.ring.a < 0.99 || Math.hypot(w.x - this.ring.x, w.y - this.ring.y) > 0.4 || Math.abs(w.r * 0.88 - this.ring.r) > 0.4;
  }

  private setHover(id: string | null): void {
    if (this.hover === id) return;
    this.hover = id;
    this.onHover?.(id);
    this.kick();
    if (prefersReducedMotion()) this.render();
  }

  private hitSpot(x: number, y: number): Hotspot | null {
    let best: Hotspot | null = null;
    let bd = Infinity;
    for (const h of this.hot) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d <= h.r && d < bd) {
        best = h;
        bd = d;
      }
    }
    return best;
  }

  private hitTest(x: number, y: number): string | null {
    return this.hitSpot(x, y)?.id ?? null;
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
          this.hoverSpot = null;
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
      this.pointAt(this.hitSpot(p.x, p.y));
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
      /* a click or tap: fly in on the part under it, and back out on the same part, on empty space, or on Escape */
      const p = local(e);
      const hit = this.hitSpot(p.x, p.y);
      if (hit) {
        const same = this.zoomId === hit.id && this.target.cx === hit.wx && this.target.cy === hit.wy && this.target.cz === hit.wz;
        this.zoomTo(same ? null : hit);
      } else if (this.zoomId != null) this.zoomTo(null);
      this.pointAt(hit);
    };
    const cancel = () => {
      this.drag = null;
      delete el.dataset.dragging;
    };
    const leave = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && !this.drag) this.pointAt(null);
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
    if (this.tweens.size > 0 || this.zoomTween || this.ringMoving()) return true;
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
    const zt = this.zoomTween;
    if (zt) {
      const x = clamp((now - zt.t0) / zt.dur);
      const p = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; /* ease-in-out cubic */
      for (const k of ["zm", "zk", "cx", "cy", "cz"] as const) this.state[k] = lerp(zt.from[k], zt.to[k], p);
      if (x >= 1) this.zoomTween = null;
    }
    /* the marker: fade and glide toward the part being pointed at (or fade out where it was) */
    const want = this.ringWant();
    if (want) {
      if (this.ring.a < 0.02) this.ring = { x: want.x, y: want.y, r: want.r * 0.8, a: this.ring.a };
      const kr = 1 - Math.exp(-15 * dt);
      this.ring.x += (want.x - this.ring.x) * kr;
      this.ring.y += (want.y - this.ring.y) * kr;
      this.ring.r += (want.r * 0.88 - this.ring.r) * kr;
      this.ring.a += (1 - this.ring.a) * (1 - Math.exp(-10 * dt));
    } else {
      this.ring.a += (0 - this.ring.a) * (1 - Math.exp(-12 * dt));
      if (this.ring.a < 0.01) this.ring.a = 0;
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
    if (this.ring.a > 0.01) {
      /* the marker grows a little as it fades in, so it settles onto the part rather than popping */
      const k = 0.9 + 0.1 * this.ring.a;
      drawPointer(c, this.ring.x, this.ring.y, this.ring.r * k, this.ring.a);
    }
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
