"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { scrollBehavior, scrollToFrame, scrollToId } from "@/lib/aperture/scroll";
import { FRAME_HOW_IT_WORKS, FRAME_SWARM } from "@/lib/content/landing";
import { useOverlay } from "@/lib/use-overlay";
import { WordmarkMark } from "@/components/ui/Wordmark";
import { LaunchLink } from "./LaunchLink";

type SectionId = "story" | "swarm" | "status";

/** The three landing sections the nav leads to. Each knows how to find itself and how to scroll there. */
const SECTIONS: ReadonlyArray<{ id: SectionId; label: string; top: () => number | null; go: (reduced: boolean) => void }> = [
  { id: "story", label: "How it works", top: () => document.getElementById("story")?.getBoundingClientRect().top ?? null, go: (r) => scrollToFrame(FRAME_HOW_IT_WORKS, r) },
  { id: "swarm", label: "Security Swarm", top: () => document.querySelectorAll<HTMLElement>("[data-story-frame]")[FRAME_SWARM]?.getBoundingClientRect().top ?? null, go: (r) => scrollToFrame(FRAME_SWARM, r) },
  { id: "status", label: "Status", top: () => document.getElementById("status")?.getBoundingClientRect().top ?? null, go: (r) => scrollToId("status", r) },
];

/**
 * Which section the reader is in right now: the last one whose top has passed the upper part of the screen. The Status band is the
 * last thing before the footer, so it can never scroll up that far; it counts as soon as it is well into view.
 */
function sectionAtReadingLine(): SectionId | null {
  let current: SectionId | null = null;
  for (const s of SECTIONS) {
    const t = s.top();
    const line = s.id === "status" ? 0.8 : 0.45;
    if (t !== null && t <= window.innerHeight * line) current = s.id;
  }
  return current;
}

/** Two bars that become a cross. The state is a data attribute so the morph is plain CSS. */
function Burger({ open }: { open: boolean }) {
  return (
    <span className="burger" data-open={open || undefined} aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

/**
 * The landing's header. From 1025px the three links sit in the bar. Below that they live in a menu: a compact sheet that drops from the top
 * with the same three links and Launch App as the one primary action. It closes on a link, Escape, the cross or a tap outside; the page behind
 * it does not scroll or take focus while it is open.
 */
export function LandingNav({ projectName }: { projectName: string }) {
  const uid = useId();
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<SectionId | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const openMenu = useCallback(() => {
    window.clearTimeout(timer.current);
    setActive(sectionAtReadingLine());
    setShown(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  }, []);
  const closeMenu = useCallback(() => {
    setOpen(false);
    timer.current = window.setTimeout(() => setShown(false), prefersReducedMotion() ? 0 : 260);
  }, []);

  useOverlay(open, closeMenu, sheet, { inertSelector: ".landing", returnFocus: toggle });

  /* the menu belongs to small screens: if the window grows past them, it goes */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1025px)");
    const onChange = () => {
      if (mq.matches) {
        setOpen(false);
        setShown(false);
      }
    };
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      window.clearTimeout(timer.current);
    };
  }, []);

  const goTo = (s: (typeof SECTIONS)[number]) => {
    const reduced = prefersReducedMotion();
    setOpen(false);
    setShown(false);
    /* the page is scrollable again only after the overlay's lock is gone: scroll on the frame after */
    requestAnimationFrame(() => requestAnimationFrame(() => s.go(reduced)));
  };

  const menuId = `${uid}-menu`;
  return (
    <nav className="lnav" aria-label={projectName} data-sticky-nav>
      <div className="wrap wide">
        <button
          type="button"
          className="wordmark"
          aria-label={`${projectName}, back to top`}
          onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior(prefersReducedMotion()) })}
        >
          <WordmarkMark />
          {projectName}
        </button>
        <div className="links">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                s.go(prefersReducedMotion());
              }}
            >
              {s.label}
            </a>
          ))}
          <Link href="/app/networks">Testnet deployments</Link>
        </div>
        <div className="lnav-tools">
          <LaunchLink>Launch App</LaunchLink>
          <button
            ref={toggle}
            type="button"
            className="menu-btn"
            aria-label="Open the menu"
            aria-expanded={open}
            aria-controls={menuId}
            aria-haspopup="dialog"
            onClick={openMenu}
          >
            <Burger open={false} />
          </button>
        </div>
      </div>

      {shown
        ? createPortal(
            <div className={`lmenu${open ? " is-open" : ""}`} id={menuId} role="dialog" aria-modal="true" aria-label={`${projectName} menu`}>
              <div className="lmenu-scrim" onClick={closeMenu} aria-hidden="true" />
              <div className="lmenu-sheet" ref={sheet}>
                <div className="lmenu-bar">
                  <span className="wordmark" aria-hidden="true">
                    <WordmarkMark />
                    {projectName}
                  </span>
                  <button type="button" className="menu-btn" aria-label="Close the menu" onClick={closeMenu}>
                    <Burger open={open} />
                  </button>
                </div>
                <ul className="lmenu-links">
                  {SECTIONS.map((s, i) => (
                    <li key={s.id} style={{ ["--i" as string]: i }}>
                      <a
                        href={`#${s.id}`}
                        aria-current={active === s.id ? "location" : undefined}
                        onClick={(e) => {
                          e.preventDefault();
                          goTo(s);
                        }}
                      >
                        <span>{s.label}</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </a>
                    </li>
                  ))}
                  <li style={{ ["--i" as string]: SECTIONS.length }}>
                    <Link href="/app/networks" onClick={closeMenu}>
                      <span>Testnet deployments</span>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </Link>
                  </li>
                </ul>
                <div className="lmenu-cta" style={{ ["--i" as string]: SECTIONS.length + 1 }}>
                  <LaunchLink className="lmenu-launch" onLaunch={closeMenu}>
                    Launch App
                  </LaunchLink>
                  <p>Opens the app. Nothing connects to a wallet until you choose.</p>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </nav>
  );
}
