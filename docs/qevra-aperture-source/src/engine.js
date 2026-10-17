/* ---------- shared canvas engine ---------- */
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const isReduced = () => !!(mqReduce && mqReduce.matches);

/*
 * Scene: owns one <canvas>, a draw function and a small state machine.
 * - draws in CSS pixels (context is pre-scaled by devicePixelRatio, capped at 2)
 * - eases numeric state toward a target; snaps when reduced motion is on
 * - only runs its animation loop while on screen, with the tab visible, and motion allowed
 */
class Scene {
  constructor(canvas, draw, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.drawFn = draw;
    this.opts = opts;
    this.state = Object.assign({}, opts.state || {});
    this.target = Object.assign({}, opts.state || {});
    this.rate = opts.rate || 5;
    this.px = 0; this.py = 0; this.tpx = 0; this.tpy = 0;
    this.pointer = { x: -1e4, y: -1e4, inside: false };
    this.t = 0; this.last = 0; this.w = 0; this.h = 0; this.dpr = 1;
    this.visible = false; this.raf = 0; this.active = true;
    this.layout = {};
    this._resize();
    if (window.ResizeObserver) {
      new ResizeObserver(() => { this.render(); }).observe(canvas);
    }
    if (window.IntersectionObserver) {
      new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; this._kick(); }, { rootMargin: '80px' }).observe(canvas);
    } else { this.visible = true; }
    document.addEventListener('visibilitychange', () => this._kick());
    if (mqReduce && mqReduce.addEventListener) mqReduce.addEventListener('change', () => { this._kick(); this.render(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.render());
  }
  _resize() {
    const r = this.cv.getBoundingClientRect();
    /* a canvas that is hidden (display none) or collapsed reports no size: keep the last good one and skip drawing */
    if (r.width < 2 || r.height < 2) return false;
    const w = Math.round(r.width), h = Math.round(r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {
      this.w = w; this.h = h; this.dpr = dpr;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    }
    return true;
  }
  set(patch, snap) {
    Object.assign(this.target, patch);
    if (snap || isReduced()) { Object.assign(this.state, patch); this.render(); } else this._kick();
  }
  bindPointer(el) {
    const upd = (e) => {
      if (e.pointerType === 'touch' || isReduced()) return;
      const r = this.cv.getBoundingClientRect();
      this.pointer.x = e.clientX - r.left; this.pointer.y = e.clientY - r.top; this.pointer.inside = true;
      this.tpx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      this.tpy = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      this._kick();
    };
    el.addEventListener('pointermove', upd);
    el.addEventListener('pointerleave', () => { this.pointer.inside = false; this.pointer.x = this.pointer.y = -1e4; this.tpx = 0; this.tpy = 0; this._kick(); });
  }
  _animating() {
    if (isReduced()) return false;
    if (this.opts.ambient) return true;
    for (const k in this.target) if (typeof this.target[k] === 'number' && Math.abs(this.target[k] - this.state[k]) > 1e-3) return true;
    return Math.abs(this.tpx - this.px) > 1e-3 || Math.abs(this.tpy - this.py) > 1e-3;
  }
  _kick() {
    if (this.raf || !this.visible || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((n) => this._frame(n));
  }
  _frame(now) {
    this.raf = 0;
    if (!this.visible || document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    const k = 1 - Math.exp(-this.rate * dt);
    for (const key in this.target) {
      const tv = this.target[key];
      if (typeof tv === 'number') { const d = tv - this.state[key]; this.state[key] = Math.abs(d) < 1e-3 ? tv : this.state[key] + d * k; }
      else this.state[key] = tv;
    }
    this.px = lerp(this.px, this.tpx, 1 - Math.exp(-4 * dt)); this.py = lerp(this.py, this.tpy, 1 - Math.exp(-4 * dt));
    this.render();
    if (this._animating()) this.raf = requestAnimationFrame((n) => this._frame(n));
  }
  render() {
    if (!this._resize()) return;
    const c = this.ctx, d = this.dpr;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    this.drawFn(c, this.w, this.h, this.state, this);
    if (this.opts.onRender) this.opts.onRender(this);
  }
}

/* scroll progress of a tall section: 0 when its top reaches the sticky offset, 1 when its end does */
function sectionProgress(el, offset) {
  const r = el.getBoundingClientRect();
  const span = r.height - (window.innerHeight - offset);
  if (span <= 0) return 0;
  return clamp((offset - r.top) / span);
}

/* tiny deterministic hash for demo-only patterns (not cryptographic) */
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
