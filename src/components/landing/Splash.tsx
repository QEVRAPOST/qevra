"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { ApertureScene } from "@/lib/aperture/engine";
import { INTRO_FROM } from "@/lib/aperture/keyframes";
import { lerp, smooth } from "@/lib/aperture/math";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { finishSplash, markSplashSeen, resetSplash, splashExpected, splashMounted, splashSeen, splashUnmounted } from "@/lib/splash";

/*
 * Splash screen: the same sculpture as the Launch App transition, drawn by the same renderer. The rings start scattered and
 * far apart, are dragged into place one after another from the top, the stack closes, the post-quantum and Swarm rings join,
 * and a beam of light passes down the aligned notches. Then the screen lifts away like a curtain and the hero builds beneath it.
 * About 2.2 seconds, on every full load of the page, never with reduced motion.
 *
 * It cannot hold the page: any key, click, touch or scroll skips it (after a short grace period, so the tail of the gesture
 * that loaded the page, such as a trackpad's coasting scroll, never skips it); a timer ends it at 4.5 seconds whatever happens;
 * a canvas that fails to start ends it at once. The page beneath is already there (the markup is server-rendered).
 */
const DRAG_MS = 900;
const SLIDE_FX = -120;
const BEAM_AT = 780;
const BEAM_MS = 450;
const HOLD_MS = 1500;
const LIFT_MS = 720;
const HARD_CAP_MS = 4500;
/** inputs in the first moments are ignored: the page was just loaded by a gesture whose last events are still arriving */
const GRACE_MS = 800;

export function Splash({ projectName }: { projectName: string }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  /* Decided before the first paint, so a page that should not have a splash is never covered, not even for a frame. */
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    /* a splash element that has just been rendered is a new visit to the landing, even if this page has shown one before */
    if (el.dataset.state === "run") resetSplash();
    if (!splashExpected() || splashSeen() || prefersReducedMotion() || window.location.hash) {
      el.dataset.state = "off";
      finishSplash();
    }
  }, []);

  useEffect(() => {
    const el = root.current;
    const cv = canvas.current;
    if (!el || !cv || el.dataset.state !== "run") return;
    let scene: ApertureScene;
    try {
      scene = new ApertureScene(cv, { mode: "hero", labels: false }, { ...INTRO_FROM, lbl: 0 });
    } catch {
      el.dataset.state = "off";
      finishSplash();
      return;
    }
    splashMounted();
    scene.render();

    const timers: number[] = [];
    let raf = 0;
    let lifting = false;
    let ended = false;

    const stop = () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      timers.length = 0;
    };
    const end = () => {
      if (ended) return;
      ended = true;
      stop();
      el.dataset.state = "off";
      scene.dispose();
    };
    /* the screen rises; the hero starts building as it goes */
    const lift = () => {
      if (lifting || ended) return;
      lifting = true;
      markSplashSeen();
      el.dataset.state = "lift";
      finishSplash();
      timers.push(window.setTimeout(end, LIFT_MS + 60));
    };

    const t0 = performance.now();
    const tick = (now: number) => {
      if (ended) return;
      const t = now - t0;
      const k = smooth(0, DRAG_MS, t);
      if (!lifting) {
        scene.set(
          {
            scatter: 1,
            rev: k,
            explode: lerp(INTRO_FROM.explode, 0.26, k),
            tilt: lerp(INTRO_FROM.tilt, 0, k),
            pq: smooth(520, 960, t),
            swarm: smooth(700, 1200, t),
            fx: (1 - smooth(0, DRAG_MS * 0.85, t)) * SLIDE_FX,
            beam: t < BEAM_AT ? -1 : lerp(0, 1.2, smooth(BEAM_AT, BEAM_AT + BEAM_MS, t)),
          },
          true,
        );
        if (t >= HOLD_MS) lift();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    timers.push(window.setTimeout(lift, HARD_CAP_MS - LIFT_MS));

    const opts = { passive: true } as const;
    const skip = () => {
      if (performance.now() - t0 >= GRACE_MS) lift();
    };
    window.addEventListener("pointerdown", skip, opts);
    window.addEventListener("keydown", skip);
    window.addEventListener("wheel", skip, opts);
    window.addEventListener("touchstart", skip, opts);
    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchstart", skip);
      /* An unmount that is followed at once by a mount (React's development check) restarts the splash from the top;
         a real unmount releases the hero a tick later (see splashUnmounted). */
      if (!ended) {
        stop();
        scene.dispose();
        ended = true;
      }
      splashUnmounted();
    };
  }, []);

  return (
    <div ref={root} className="splash" data-state="run" aria-hidden="true" suppressHydrationWarning>
      <canvas ref={canvas} />
      <p className="splash-name">{projectName} · design preview</p>
    </div>
  );
}
