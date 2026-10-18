"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApertureScene } from "@/lib/aperture/engine";
import { INTRO_FROM } from "@/lib/aperture/keyframes";
import { lerp, smooth } from "@/lib/aperture/math";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { getHeroScene } from "@/lib/aperture/registry";
import type { ApertureState } from "@/lib/aperture/types";

/*
 * Launch App transition.
 *
 * It is the same sculpture, drawn by the same renderer, not a separate loader. The overlay canvas comes into the
 * foreground and the rings are dragged into place: each ring turns from where it was left to its reviewed angle,
 * top ring first, while the stack slides together and the whole object glides in from the side. Then a beam of
 * light passes down the aligned notches. The route changes underneath; the overlay then fades and the dashboard
 * settles in. About 1.6 seconds in total, with no progress bar: nothing here measures or verifies anything.
 *
 * Where it starts depends on what the visitor is looking at:
 *   - if the story's ring canvas is on screen, the overlay starts exactly over it with the pose it left (the rings
 *     are first turned away for a moment, so there is something to drag), and grows to fill the screen
 *   - if the hero's stage is on screen (its objects are not the ring), the overlay starts over that panel from the
 *     scattered pose, and the rings are dragged in from the right as it grows
 *   - otherwise it starts full screen from the scattered pose
 *
 * The timeline is time-based and imperative (no React state per frame). It cannot get stuck:
 *   - the route change is a timer, not an animation frame, so it happens even if frames stop
 *   - the fade waits for the route, but only for ARRIVAL_WAIT_MS
 *   - a hard cap ends everything after HARD_CAP_MS
 *   - back navigation, unmounting and a failed canvas all end it at once
 *   - reduced motion skips it and navigates directly
 * The Launch App buttons are real links to /app, so navigation never depends on this component.
 */
const BG_MS = 320;
const EXPAND_MS = 560;
/** Starting over the story's canvas: the rings turn away first, over this long, so they can be dragged back. */
const UNLOCK_MS = 240;
/** The drag: rings turn to their reviewed angle, top first, and the stack closes up. Counted from the end of UNLOCK. */
const DRAG_MS = 900;
/** The object glides in from the side by this much (scene units, negative is toward the right) when it starts full screen. */
const SLIDE_FX = -120;
/** The beam, counted from the start of the drag. */
const BEAM_AT = 780;
const BEAM_MS = 450;
/** Route change and the earliest fade, counted from the start of the drag. */
const PUSH_AT = 850;
const HOLD_AT = 1300;
const FADE_MS = 340;
const ARRIVAL_WAIT_MS = 3500;
const HARD_CAP_MS = 7000;

interface LaunchApi {
  launch: (origin: Element, href: string) => void;
}

const LaunchContext = createContext<LaunchApi | null>(null);

export function useLaunch(): LaunchApi | null {
  return useContext(LaunchContext);
}

interface Run {
  scene: ApertureScene;
  t0: number;
  raf: number;
  from: ApertureState;
  /** the story's ring canvas was on screen, so the overlay started over it with its pose */
  over: boolean;
  rect: { left: number; top: number; width: number; height: number };
  arrived: boolean;
  fadeAt: number | null;
  timers: number[];
  onPop: () => void;
}

export function LaunchTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const overlay = useRef<HTMLDivElement>(null);
  const bg = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const note = useRef<HTMLParagraphElement>(null);
  const run = useRef<Run | null>(null);

  /* the route has rendered: the fade may start */
  useEffect(() => {
    if (run.current && pathname.startsWith("/app")) run.current.arrived = true;
  }, [pathname]);

  const finish = useCallback(() => {
    const r = run.current;
    if (!r) return;
    run.current = null;
    cancelAnimationFrame(r.raf);
    r.timers.forEach((t) => window.clearTimeout(t));
    window.removeEventListener("popstate", r.onPop);
    r.scene.dispose();
    document.documentElement.removeAttribute("data-launching");
    if (overlay.current) {
      overlay.current.style.visibility = "hidden";
      overlay.current.style.pointerEvents = "none";
    }
    for (const el of [bg.current, canvas.current, note.current]) {
      if (el) {
        el.style.transition = "none";
        el.style.opacity = "0";
      }
    }
  }, []);

  const beginFade = useCallback(
    (r: Run) => {
      if (r.fadeAt != null) return;
      r.fadeAt = performance.now();
      for (const el of [bg.current, canvas.current, note.current]) {
        if (el) {
          el.style.transition = `opacity ${FADE_MS}ms cubic-bezier(.2,.7,.2,1)`;
          el.style.opacity = "0";
        }
      }
      /* the dashboard settles in while the overlay fades */
      document.documentElement.dataset.arrive = "1";
      r.timers.push(window.setTimeout(() => document.documentElement.removeAttribute("data-arrive"), 1000));
      r.timers.push(window.setTimeout(finish, FADE_MS + 40));
    },
    [finish],
  );

  const launch = useCallback(
    (_origin: Element, href: string) => {
      if (run.current) return; /* rapid clicks: the first one wins */
      const el = canvas.current;
      const box = overlay.current;
      if (prefersReducedMotion() || !el || !box) {
        router.push(href);
        return;
      }
      const hero = getHeroScene();
      const shown = (r: DOMRect | null) =>
        !!r &&
        r.width > 2 &&
        r.height > 2 &&
        (Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0))) /
          (r.width * r.height) >
          0.5;
      const ring = hero ? (document.querySelector<HTMLCanvasElement>(".stage canvas")?.getBoundingClientRect() ?? null) : null;
      const panel = document.querySelector<HTMLCanvasElement>(".hcanvas canvas")?.getBoundingClientRect() ?? null;
      const over = shown(ring);
      const start = over ? ring : shown(panel) ? panel : null;
      const grow = !!start;
      const rect = start ? { left: start.left, top: start.top, width: start.width, height: start.height } : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const from: ApertureState = over && hero ? { ...hero.state } : { ...INTRO_FROM, lbl: 0 };
      const off = over ? UNLOCK_MS : 0;

      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      let scene: ApertureScene;
      try {
        scene = new ApertureScene(el, { mode: "hero", labels: true }, from);
      } catch {
        router.push(href); /* no canvas: skip the animation, never the navigation */
        return;
      }
      if (hero && over) {
        scene.t = hero.t;
        scene.px = hero.px;
        scene.py = hero.py;
      }
      scene.render();

      const t0 = performance.now();
      const r: Run = { scene, t0, raf: 0, from, over, rect, arrived: false, fadeAt: null, timers: [], onPop: () => finish() };
      run.current = r;
      window.addEventListener("popstate", r.onPop);
      document.documentElement.dataset.launching = "1";
      box.style.visibility = "visible";
      box.style.pointerEvents = "auto";
      el.style.transition = "none";
      el.style.opacity = over ? "1" : "0";
      if (bg.current) {
        bg.current.style.transition = "none";
        bg.current.style.opacity = "0";
      }
      if (note.current) {
        note.current.style.transition = "none";
        note.current.style.opacity = "0";
      }

      r.timers.push(
        window.setTimeout(() => router.push(href), off + PUSH_AT),
        window.setTimeout(finish, HARD_CAP_MS),
      );

      const tick = (now: number) => {
        if (run.current !== r) return;
        const t = now - t0;
        if (r.fadeAt == null) {
          /* the drag clock starts after the rings have been turned away (only when starting over the story canvas) */
          const dt = Math.max(0, t - off);
          const k = smooth(0, DRAG_MS, dt);
          const e = smooth(80, 600, t);
          if (grow) {
            const p = smooth(0, EXPAND_MS, t);
            el.style.left = `${lerp(rect.left, 0, p)}px`;
            el.style.top = `${lerp(rect.top, 0, p)}px`;
            el.style.width = `${lerp(rect.width, window.innerWidth, p)}px`;
            el.style.height = `${lerp(rect.height, window.innerHeight, p)}px`;
          }
          if (!over) el.style.opacity = String(smooth(0, 220, t));
          if (bg.current) bg.current.style.opacity = String(smooth(0, BG_MS, t));
          if (note.current) note.current.style.opacity = String(smooth(off + 200, off + 520, t) * 0.9);
          const s = scene.layout.s || 1;
          const open = over ? 0.9 : 1;
          const un = smooth(0, UNLOCK_MS, t);
          const calm = smooth(0, 260, t);
          scene.set(
            {
              /* the rings: turned away, then dragged to their reviewed angle one after another, top first */
              scatter: over ? lerp(from.scatter, 1, un) : 1,
              rev: over ? (t < off ? lerp(from.rev, 0, un) : k) : k,
              /* the stack: opens a little, then slides closed */
              explode: over ? (t < off ? lerp(from.explode, open, un) : lerp(open, 0, k)) : lerp(open, 0, k),
              pq: over ? from.pq : lerp(0, 1, smooth(DRAG_MS * 0.5, DRAG_MS, dt)),
              swarm: lerp(from.swarm, 0, smooth(0, 360, t)),
              lbl: lerp(from.lbl, 0, calm),
              mis: lerp(from.mis, 0, calm),
              hlA: lerp(from.hlA, 0, calm),
              dim: lerp(from.dim, 0, calm),
              acct: lerp(from.acct, 0, calm),
              air: lerp(from.air, 0, calm),
              pqGlow: lerp(from.pqGlow, 0, calm),
              tilt: lerp(from.tilt, 0.02, smooth(0, 700, t)),
              zoom: lerp(from.zoom, 1, smooth(0, 600, t)),
              fy: lerp(from.fy, 0.5, smooth(0, 600, t)),
              /* centre the stack axis in the growing canvas; when starting full screen, glide in from the side too */
              fx: lerp(from.fx, 0, e) + e * ((scene.layout.cx0 - scene.width / 2) / s) + (over ? 0 : (1 - smooth(0, DRAG_MS * 0.85, dt)) * SLIDE_FX),
              beam: dt < BEAM_AT ? -1 : lerp(0, 1.2, smooth(BEAM_AT, BEAM_AT + BEAM_MS, dt)),
            },
            true,
          );
          if (t >= off + HOLD_AT && (r.arrived || t >= off + HOLD_AT + ARRIVAL_WAIT_MS)) beginFade(r);
        }
        r.raf = requestAnimationFrame(tick);
      };
      r.raf = requestAnimationFrame(tick);
    },
    [beginFade, finish, router],
  );

  /* unmount ends any run in progress */
  useEffect(() => finish, [finish]);

  const api = useMemo<LaunchApi>(() => ({ launch }), [launch]);

  return (
    <LaunchContext.Provider value={api}>
      {children}
      <div ref={overlay} className="launch" aria-hidden="true">
        <div ref={bg} className="launch-bg" />
        <canvas ref={canvas} className="launch-canvas" />
        <p ref={note} className="launch-note">
          Opening the app preview
        </p>
      </div>
    </LaunchContext.Provider>
  );
}
