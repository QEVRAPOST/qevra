"use client";

import { useCallback, useEffect, useRef } from "react";
import { ApertureCanvas } from "@/components/aperture/ApertureCanvas";
import type { ApertureScene } from "@/lib/aperture/engine";
import { INTRO_FROM, INTRO_RATE, SCENE_RATE, STORY_KEYFRAMES } from "@/lib/aperture/keyframes";
import { buttonVariants } from "@/components/ui/Button";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { scrollBehavior, scrollToFrame, scrollToId } from "@/lib/aperture/scroll";
import { FOOTER_PREVIEW, FOOTER_ROBINHOOD } from "@/lib/content/copy-lock";
import { CURTAIN, FRAME_HOW_IT_WORKS, FRAME_SWARM } from "@/lib/content/landing";
import { cn } from "@/lib/utils";
import { LaunchLink } from "./LaunchLink";

/**
 * The closing section, and the page's footer. It is a curtain: it stands still at the bottom of the window, behind the page,
 * and the page scrolls up off it to uncover it (CSS: the footer is `position: sticky; bottom: 0` under a main with a higher
 * z-index). The only script is a progress value, 0 to 1 as it is uncovered, that lets its words rise into place; with
 * reduced motion, or without script, it is simply there.
 */
export function Curtain({ projectName }: { projectName: string }) {
  const ref = useRef<HTMLElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const scene = useRef<ApertureScene | null>(null);
  /** the sculpture on the right: scattered until the curtain is uncovered, then put together one ring at a time */
  const built = useRef(false);
  const timers = useRef<number[]>([]);
  const onScene = useCallback((s: ApertureScene | null) => {
    scene.current = s;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const main = document.getElementById("main");
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    /* the story's own assembly: rings turn into place from the top, then the post-quantum and Swarm rings join */
    const build = () => {
      const sc = scene.current;
      if (!sc || built.current) return;
      built.current = true;
      art.current?.setAttribute("data-built", "1");
      if (prefersReducedMotion()) {
        sc.jump(STORY_KEYFRAMES[0]);
        return;
      }
      clear();
      sc.jump(INTRO_FROM);
      /* slower than the story's own assembly, so each ring can be seen finding its place */
      sc.setRate(INTRO_RATE * 0.68);
      timers.current.push(
        window.setTimeout(() => sc.set({ ...STORY_KEYFRAMES[0], scatter: 1, pq: 0, swarm: 0 }), 250),
        window.setTimeout(() => sc.set({ pq: 1, swarm: 1 }), 2300),
        window.setTimeout(() => sc.setRate(SCENE_RATE), 4200),
      );
    };
    /* covered again (scrolled back up): scatter it, so it is put together afresh the next time */
    const unbuild = () => {
      const sc = scene.current;
      if (!built.current || !sc) return;
      built.current = false;
      clear();
      art.current?.removeAttribute("data-built");
      sc.setRate(SCENE_RATE);
      sc.jump(INTRO_FROM);
    };
    if (!main || prefersReducedMotion()) {
      el.style.setProperty("--rv", "1");
      /* no motion: the finished sculpture is simply there once the curtain is */
      const t = window.setTimeout(build, 60);
      return () => window.clearTimeout(t);
    }
    let queued = 0;
    const update = () => {
      queued = 0;
      /* how much of the curtain the page has scrolled off: 0 when the page's bottom edge is at the window's bottom, 1 when
         the whole curtain is uncovered */
      const uncovered = window.innerHeight - main.getBoundingClientRect().bottom;
      const rv = Math.min(1, Math.max(0, uncovered / Math.max(1, el.offsetHeight * 0.85)));
      el.style.setProperty("--rv", rv.toFixed(3));
      if (rv > 0.6) build();
      else if (rv < 0.1) unbuild();
    };
    const queue = () => {
      if (!queued) queued = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      if (queued) cancelAnimationFrame(queued);
      clear();
    };
  }, []);

  const reduced = () => prefersReducedMotion();
  return (
    <footer className="curtain" id="curtain" ref={ref} aria-label={projectName}>
      <div className="cu-glow" aria-hidden="true" />
      <div className="wrap wide cu-inner">
        {/* the sculpture, put together ring by ring as the curtain is uncovered (decorative: the page says everything in words) */}
        <div className="cu-art" ref={art} aria-hidden="true">
          <ApertureCanvas mode="hero" initial={INTRO_FROM} rate={SCENE_RATE} labels={false} pointer label="" onSceneChange={onScene} />
        </div>
        <div className="cu-top">
          <p className="cu-kicker">{CURTAIN.kicker}</p>
          <h2 className="cu-title">{CURTAIN.title}</h2>
          <p className="cu-body">{CURTAIN.body}</p>
          <div className="ctas">
            <LaunchLink>Launch App</LaunchLink>
            <a
              className={buttonVariants({ variant: "ghost" })}
              href="#status"
              onClick={(e) => {
                e.preventDefault();
                scrollToId("status", reduced());
              }}
            >
              What is real today
            </a>
          </div>
        </div>
        <nav className="cu-links" aria-label="Go to">
          <button type="button" className={cn(buttonVariants({ variant: "quiet", size: "small" }))} onClick={() => scrollToFrame(FRAME_HOW_IT_WORKS, reduced())}>
            How it works
          </button>
          <button type="button" className={cn(buttonVariants({ variant: "quiet", size: "small" }))} onClick={() => scrollToFrame(FRAME_SWARM, reduced())}>
            Security Swarm
          </button>
          <button type="button" className={cn(buttonVariants({ variant: "quiet", size: "small" }))} onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior(reduced()) })}>
            Back to top
          </button>
        </nav>
        <div className="cu-foot">
          <p>{FOOTER_PREVIEW}</p>
          <p>{FOOTER_ROBINHOOD}</p>
        </div>
        <p className="cu-name" aria-hidden="true">
          {projectName}
        </p>
      </div>
    </footer>
  );
}
