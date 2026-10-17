"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApertureCanvas } from "@/components/aperture/ApertureCanvas";
import type { ApertureScene } from "@/lib/aperture/engine";
import { APERTURE_KEYFRAMES, INTRO_FROM, INTRO_RATE, SCENE_RATE } from "@/lib/aperture/keyframes";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { PIN_ID, computeStoryTarget, frameCenters, readingTop } from "@/lib/aperture/scroll";
import { FIGURE_DESCRIPTION, FIGURE_LABEL, STORY_STEPS } from "@/lib/content/landing";
import { useMediaQuery } from "@/lib/use-media-query";
import { FigureCaption } from "./FigureCaption";
import { HeroFrame, StepFrame } from "./StoryFrames";

/**
 * The pinned 3D stage and the seven frames that scroll past it.
 * The scroll controller writes straight to the scene: scroll position is never React state. React state holds
 * only the active frame, the Try it value and the hovered ring, and only when they change.
 */
export function LandingStory() {
  const [scene, setScene] = useState<ApertureScene | null>(null);
  const [active, setActive] = useState(0);
  const [tryValue, setTryValue] = useState<0 | 1 | null>(null);
  const [hoverRing, setHoverRing] = useState(-1);
  const canHover = useMediaQuery("(hover: hover)");
  /* the scroll handler reads these without re-subscribing */
  const tryRef = useRef<0 | 1 | null>(null);
  const applyRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!scene) return;
    const frames = Array.from(document.querySelectorAll<HTMLElement>("[data-story-frame]"));
    if (frames.length === 0) return;
    let queued = 0;
    let current = 0;
    let introRunning = false;
    const timers: number[] = [];

    const compute = (heroMis: number) =>
      computeStoryTarget({
        centers: frameCenters(frames),
        readTop: readingTop(),
        viewportHeight: window.innerHeight,
        reduced: prefersReducedMotion(),
        heroMis,
        keyframes: APERTURE_KEYFRAMES,
      });

    const apply = (snap = false) => {
      queued = 0;
      if (introRunning) return; /* the one-time intro owns the scene until it finishes */
      let r = compute(tryRef.current ?? 0);
      if (r.active !== 0 && tryRef.current != null) {
        /* leaving the hero resets the Try it toggle */
        tryRef.current = null;
        setTryValue(null);
        r = compute(0);
      }
      scene.set(r.target, snap);
      if (r.active !== current) {
        current = r.active;
        setActive(r.active);
      }
    };
    applyRef.current = () => apply();

    const queue = () => {
      if (!queued) queued = requestAnimationFrame(() => apply());
    };

    if (prefersReducedMotion() || window.scrollY > 40) {
      /* no intro: start at the scroll-determined state */
      scene.setRate(SCENE_RATE);
      apply(true);
    } else {
      /* one-time assembly: rings close up and turn into place top to bottom, then the PQ and Swarm rings appear */
      introRunning = true;
      scene.jump(INTRO_FROM);
      scene.setRate(INTRO_RATE);
      timers.push(
        window.setTimeout(() => scene.set({ ...APERTURE_KEYFRAMES[0], scatter: 1, pq: 0, swarm: 0 }), 280),
        window.setTimeout(() => scene.set({ pq: 1, swarm: 1 }), 1500),
        window.setTimeout(() => {
          introRunning = false;
          scene.setRate(SCENE_RATE);
          apply();
        }, 2700),
      );
    }

    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      if (queued) cancelAnimationFrame(queued);
      timers.forEach((t) => window.clearTimeout(t));
      applyRef.current = () => {};
      scene.setRate(SCENE_RATE);
    };
  }, [scene]);

  const onTry = useCallback((value: 0 | 1) => {
    tryRef.current = value;
    setTryValue(value);
    applyRef.current();
  }, []);

  return (
    <section className="story" id="story" aria-label="How QEVRA works">
      <noscript>
        <style>{".step{opacity:1}"}</style>
      </noscript>
      <div className="wrap wide">
        <div className="sgrid">
          <div className="scol" id="scol">
            <HeroFrame />
            {STORY_STEPS.map((step, i) => (
              <StepFrame key={step.title} step={step} active={active === i + 1} />
            ))}
          </div>
          <figure className="pin" id={PIN_ID}>
            <div className="stage">
              <ApertureCanvas
                mode="hero"
                initial={INTRO_FROM}
                rate={SCENE_RATE}
                pointer
                label={FIGURE_LABEL}
                describedBy="fig-text"
                onSceneChange={setScene}
                onHoverChange={setHoverRing}
              />
            </div>
            <FigureCaption active={active} tryValue={tryValue} hoverRing={hoverRing} canHover={canHover} onTry={onTry} />
            <div className="sr" id="fig-text">
              {FIGURE_DESCRIPTION}
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
