"use client";

import { useEffect, useState } from "react";
import { ApertureCanvas } from "@/components/aperture/ApertureCanvas";
import type { ApertureScene } from "@/lib/aperture/engine";
import { INTRO_FROM, INTRO_RATE, SCENE_RATE, STORY_KEYFRAMES, STORY_KEYFRAMES_COMPACT, STORY_SWEEPS } from "@/lib/aperture/keyframes";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { registerHeroScene } from "@/lib/aperture/registry";
import { PIN_ID, computeStoryTarget, frameBounds, frameCenters, readingTop } from "@/lib/aperture/scroll";
import { FIGURE_DESCRIPTION, FIGURE_LABEL, STORY_INTRO, STORY_STEPS } from "@/lib/content/landing";
import { useMediaQuery } from "@/lib/use-media-query";
import { FigureCaption } from "./FigureCaption";
import { StepFrame } from "./StoryFrames";

/**
 * The ring sculpture's pinned stage and the frames that scroll past it: an intro, then the seven steps.
 * (The hero above it has its own pinned stage, see HeroStage.)
 * The scroll controller writes straight to the scene: scroll position is never React state. React state holds
 * only the active frame and the hovered ring, and only when they change.
 */
export function LandingStory() {
  const [scene, setScene] = useState<ApertureScene | null>(null);
  const [active, setActive] = useState(0);
  const [hoverRing, setHoverRing] = useState(-1);
  const canHover = useMediaQuery("(hover: hover)");

  useEffect(() => {
    if (!scene) return;
    const frames = Array.from(document.querySelectorAll<HTMLElement>("[data-story-frame]"));
    if (frames.length === 0) return;
    let queued = 0;
    let current = 0;
    let introRunning = false;
    const timers: number[] = [];

    const compute = () => {
      const bounds = frameBounds(frames);
      const rt = readingTop();
      return computeStoryTarget({
        centers: frameCenters(bounds, window.innerHeight - rt),
        bounds,
        sweeps: STORY_SWEEPS,
        readTop: rt,
        viewportHeight: window.innerHeight,
        reduced: prefersReducedMotion(),
        heroMis: 0,
        /* a narrow stage gets gentler close-ups */
        keyframes: scene.width < 520 ? STORY_KEYFRAMES_COMPACT : STORY_KEYFRAMES,
      });
    };

    /* ends the one-time assembly early, when the visitor has already scrolled past its frame */
    const endIntro = () => {
      introRunning = false;
      timers.forEach((t) => window.clearTimeout(t));
      timers.length = 0;
      scene.setRate(SCENE_RATE);
    };

    const apply = (snap = false) => {
      queued = 0;
      if (introRunning) {
        /* the one-time intro owns the scene while its own frame is on show */
        if (compute().active < 1) return;
        endIntro();
      }
      const r = compute();
      scene.set(r.target, snap);
      if (r.active !== current) {
        current = r.active;
        setActive(r.active);
      }
    };
    const queue = () => {
      if (!queued) queued = requestAnimationFrame(() => apply());
    };

    /* the one-time assembly: rings close up and turn into place top to bottom, then the PQ and Swarm rings appear */
    const runIntro = () => {
      introRunning = true;
      scene.jump(INTRO_FROM);
      scene.setRate(INTRO_RATE);
      timers.push(
        window.setTimeout(() => scene.set({ ...STORY_KEYFRAMES[0], scatter: 1, pq: 0, swarm: 0 }), 280),
        window.setTimeout(() => scene.set({ pq: 1, swarm: 1 }), 1500),
        window.setTimeout(() => {
          introRunning = false;
          scene.setRate(SCENE_RATE);
          apply();
        }, 2700),
      );
    };

    /* The hero is above the story now, so the assembly plays when the story comes into view, not on page load.
       Opening already inside the story, or with reduced motion, skips it and starts at the scroll-determined state. */
    const story = document.getElementById("story");
    let io: IntersectionObserver | undefined;
    const insideStory = !!story && story.getBoundingClientRect().top < window.innerHeight * 0.5;
    if (prefersReducedMotion() || insideStory || !story || typeof IntersectionObserver === "undefined") {
      scene.setRate(SCENE_RATE);
      apply(true);
    } else {
      scene.jump(INTRO_FROM);
      io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io?.disconnect();
          io = undefined;
          runIntro();
        },
        /* the story is several screens tall, so "visible" means its top crossed into the lower part of the screen */
        { rootMargin: "0px 0px -30% 0px", threshold: 0 },
      );
      io.observe(story);
    }

    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      io?.disconnect();
      if (queued) cancelAnimationFrame(queued);
      timers.forEach((t) => window.clearTimeout(t));
      scene.setRate(SCENE_RATE);
    };
  }, [scene]);

  /* the Launch App transition starts from this scene's pose */
  useEffect(() => {
    registerHeroScene(scene);
    return () => registerHeroScene(null);
  }, [scene]);

  return (
    <section className="story" id="story" aria-label="How QEVRA works">
      <noscript>
        <style>{".step{opacity:1}"}</style>
      </noscript>
      <div className="wrap wide">
        <div className="sgrid">
          <div className="scol" id="scol">
            <StepFrame step={STORY_INTRO} active={active === 0} />
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
            <FigureCaption active={active} hoverRing={hoverRing} canHover={canHover} />
            <div className="sr" id="fig-text">
              {FIGURE_DESCRIPTION}
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
