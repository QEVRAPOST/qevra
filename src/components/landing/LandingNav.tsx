"use client";

import { prefersReducedMotion } from "@/lib/aperture/motion";
import { scrollBehavior, scrollToFrame, scrollToId } from "@/lib/aperture/scroll";
import { FRAME_HOW_IT_WORKS, FRAME_SWARM } from "@/lib/content/landing";
import { WordmarkMark } from "@/components/ui/Wordmark";
import { LaunchLink } from "./LaunchLink";

export function LandingNav() {
  return (
    <nav className="lnav" aria-label="QEVRA" data-sticky-nav>
      <div className="wrap wide">
        <button
          type="button"
          className="wordmark"
          aria-label="QEVRA, back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior(prefersReducedMotion()) })}
        >
          <WordmarkMark />
          QEVRA
        </button>
        <div className="links">
          <a
            href="#story"
            onClick={(e) => {
              e.preventDefault();
              scrollToFrame(FRAME_HOW_IT_WORKS, prefersReducedMotion());
            }}
          >
            How it works
          </a>
          <a
            href="#swarm"
            onClick={(e) => {
              e.preventDefault();
              scrollToFrame(FRAME_SWARM, prefersReducedMotion());
            }}
          >
            Security Swarm
          </a>
          <a
            href="#status"
            onClick={(e) => {
              e.preventDefault();
              scrollToId("status", prefersReducedMotion());
            }}
          >
            Status
          </a>
        </div>
        <LaunchLink>Launch App</LaunchLink>
      </div>
    </nav>
  );
}
