"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brandizePillar, PILLARS, PILLARS_SECTION, type Pillar, type PillarId } from "@/lib/content/pillars";
import { brandizeProjectName } from "@/lib/project-brand";
import { chapterTarget, DEMO_AT, pillarFrame, READY_AT } from "@/lib/pillar-timeline";
import { illustrationModel } from "@/lib/swarm-view";
import { useMediaQuery } from "@/lib/use-media-query";
import { scrollBehavior } from "@/lib/aperture/scroll";
import { SwarmPipeline } from "@/components/dashboard/SwarmPipeline";
import { AccountArt, LockArt } from "./PillarArt";
import { LaunchLink } from "./LaunchLink";

const IDS: readonly PillarId[] = ["account", "swap", "swarm"];
const clamp = (v: number): number => Math.min(1, Math.max(0, v));

/** The illustration of a run: which step it is at, and which way it is going (forward, held at the end, or back). null = not running. */
type Run = { step: number; dir: 1 | 0 | -1 } | null;

/**
 * The Swarm drawing. Once it has been built (and it is the chapter on show) it runs its illustration by itself: the agents take their turns as
 * in the app, the end is held for a moment, and then it plays back to the start and rests. Stop ends it at any time, and "Trace a run" plays it
 * again. Leaving the chapter stops it, so it can never be left running behind another one. Under reduced motion nothing plays by itself: the
 * visitor steps through it. It is an illustration only: no agent runs, and the label on it says so.
 */
function SwarmArt({ active, built, reduced }: { active: boolean; built: boolean; reduced: boolean }) {
  const [run, setRun] = useState<Run>(null);
  const [armed, setArmed] = useState(false);
  const want = active && built;
  if (want !== armed) {
    setArmed(want);
    setRun(want && !reduced ? { step: 1, dir: 1 } : null);
  }
  if (!active && run) setRun(null);

  useEffect(() => {
    if (!run || reduced) return;
    const ms = run.dir === 1 ? (run.step >= 4 ? 1200 : 1900) : run.dir === 0 ? 1300 : 800;
    const t = window.setTimeout(() => {
      setRun((r) => {
        if (!r) return r;
        if (r.dir === 1) return r.step >= 4 ? { step: 4, dir: 0 } : { step: r.step + 1, dir: 1 };
        if (r.dir === 0) return { step: 4, dir: -1 };
        return r.step <= 0 ? null : { step: r.step - 1, dir: -1 };
      });
    }, ms);
    return () => window.clearTimeout(t);
  }, [run, reduced]);

  const tracing = run !== null;
  return (
    <div className={`pl-art pl-swarm${tracing ? " tracing" : ""}`}>
      <div className="sw-stage">
        <SwarmPipeline
          model={run ? illustrationModel(run.step) : null}
          compact
          trace={!tracing}
          level={3}
          title="How a run works"
          tag={tracing ? undefined : "Illustration · no agent has run"}
          actions={
            !tracing ? (
              <Button variant="ghost" size="small" onClick={() => setRun({ step: reduced ? 0 : 1, dir: 1 })}>
                Trace a run
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="small" onClick={() => setRun((r) => (r ? { step: Math.min(4, r.step + 1), dir: 1 } : r))} disabled={run.step >= 4 && run.dir !== -1}>
                  Next step
                </Button>
                <Button variant="ghost" size="small" onClick={() => setRun(null)}>
                  Stop
                </Button>
              </>
            )
          }
        />
      </div>
      <p className="pl-art-note">
        Public sources go in. Findings with quoted evidence come out, as a report. Human review sits outside the pipeline, and a finished run is never an approval.
      </p>
    </div>
  );
}

function Text({ p }: { p: Pillar }) {
  return (
    <div className="pl-text">
      <p className="pl-body">{p.body}</p>
      <ul className="pl-caps" aria-label="What exists today">
        {p.capabilities.map((c) => (
          <li key={c.label}>
            <StatusMaterial material={c.material} />
            <span>{c.label}</span>
            <em>{c.state}</em>
          </li>
        ))}
      </ul>
      <details className="pl-how">
        <summary>How it is meant to work</summary>
        <ul>
          {p.how.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </details>
      <LaunchLink href={p.cta.href} variant="ghost" className="pl-cta">
        {p.cta.label}
      </LaunchLink>
    </div>
  );
}

/**
 * The three parts the product is built around, as one pinned explanation.
 *
 * On a large screen the section pins and the scroll drives it: the active part moves 01 → 02 → 03 along the rail (the page itself never moves
 * sideways), the text beneath it changes with it, and each illustration is assembled piece by piece as you scroll, then taken apart as the next one
 * begins; scrolling up plays it backwards. One timeline (src/lib/pillar-timeline.ts) writes plain numbers to CSS variables, so a scroll frame
 * costs no React render; React only hears about a change of chapter, of "built" and of the demonstration.
 *
 * Everywhere else (a phone, a short window, or reduced motion) there is no pin: the rail is a set of buttons, the drawing builds once when it is
 * shown (or is simply complete under reduced motion), and the page scrolls normally.
 */
export function Pillars({ projectName }: { projectName: string }) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const roomy = useMediaQuery("(min-width: 1180px) and (min-height: 760px)");
  const pinned = roomy && !reduced;
  const [active, setActive] = useState<0 | 1 | 2>(0);
  const [readyKey, setReadyKey] = useState("000");
  const [demo, setDemo] = useState(false);
  /* not pinned: which drawing has finished building (null while one is building) */
  const [tabDone, setTabDone] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLDivElement>(null);

  /* pinned: scroll position → build values, written straight to the section's CSS variables */
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !pinned) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const t = track.current;
      const pn = pin.current;
      if (!t || !pn) return;
      const span = t.offsetHeight - pn.offsetHeight;
      const top = Number.parseFloat(getComputedStyle(pn).top) || 0;
      const f = pillarFrame(span > 0 ? clamp((top - t.getBoundingClientRect().top) / span) : 0);
      f.b.forEach((v, i) => el.style.setProperty(`--b${i + 1}`, v.toFixed(3)));
      el.style.setProperty("--pg", f.pg.toFixed(3));
      setActive(f.active);
      setReadyKey(f.b.map((v) => (v >= READY_AT ? "1" : "0")).join(""));
      setDemo(f.b[1] >= DEMO_AT);
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      if (raf) cancelAnimationFrame(raf);
      [1, 2, 3].forEach((n) => el.style.removeProperty(`--b${n}`));
      el.style.removeProperty("--pg");
      setDemo(false);
    };
  }, [pinned]);

  /* not pinned: the chosen drawing builds once when it is shown. Reduced motion: it is simply complete. */
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || pinned) return;
    const set = (i: number, v: number) => el.style.setProperty(`--b${i + 1}`, v.toFixed(3));
    if (reduced) {
      [0, 1, 2].forEach((i) => set(i, 1));
      return () => [1, 2, 3].forEach((n) => el.style.removeProperty(`--b${n}`));
    }
    [0, 1, 2].forEach((i) => set(i, i === active ? 0 : 1));
    let raf = 0;
    const run = () => {
      let t0 = 0;
      const step = (t: number) => {
        if (!t0) {
          t0 = t;
          setTabDone(null);
        }
        const k = clamp((t - t0) / 2200);
        set(active, 1 - Math.pow(1 - k, 3));
        if (k < 1) raf = requestAnimationFrame(step);
        else setTabDone(active);
      };
      raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        run();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      [1, 2, 3].forEach((n) => el.style.removeProperty(`--b${n}`));
    };
  }, [pinned, reduced, active]);

  /* a chosen heading: pinned, scroll to where its chapter is built; otherwise just switch */
  const choose = useCallback(
    (id: string) => {
      const c = Math.max(0, IDS.indexOf(id as PillarId)) as 0 | 1 | 2;
      const t = track.current;
      const pn = pin.current;
      if (!pinned || !t || !pn) {
        setActive(c);
        return;
      }
      const span = t.offsetHeight - pn.offsetHeight;
      const top = Number.parseFloat(getComputedStyle(pn).top) || 0;
      window.scrollTo({ top: window.scrollY + t.getBoundingClientRect().top - top + span * chapterTarget(c), behavior: scrollBehavior(false) });
    },
    [pinned],
  );

  const pillars = PILLARS.map((p) => brandizePillar(p, projectName));
  return (
    <section ref={root} className="band pillars" id="pillars" aria-labelledby="h-pillars" data-mode={pinned ? "pinned" : "tabs"}>
      <div className="pl-track" ref={track}>
        <div className="pl-pin" ref={pin}>
          <div className="wrap wide pl-wrap">
            <div className="bhead pl-head">
              <p className="pl-eyebrow">{PILLARS_SECTION.eyebrow}</p>
              <h2 id="h-pillars">{PILLARS_SECTION.title.replace("{name}", projectName)}</h2>
              <p className="sub">{brandizeProjectName(PILLARS_SECTION.lede, projectName)}</p>
            </div>

            <Tabs value={IDS[active]} onValueChange={choose} activationMode={pinned ? "manual" : "automatic"} className="pl-tabs">
              <TabsList className="pl-rail" aria-label="The three parts">
                {pillars.map((p) => (
                  <TabsTrigger key={p.id} value={p.id} className="pl-tab">
                    <span className="pl-n" aria-hidden="true">{p.number}</span>
                    <span className="pl-k">{p.kicker}</span>
                    <span className="pl-h">{p.headline}</span>
                    <span className="pl-status">
                      <StatusMaterial material={p.status.material} />
                      {p.status.label}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="pl-panel">
                <div className="pl-textcol">
                  {pillars.map((p) => (
                    <TabsContent key={p.id} value={p.id} forceMount className="pl-content">
                      <Text p={p} />
                    </TabsContent>
                  ))}
                </div>
                <div className="pl-visual">
                  <div className="pl-frame">
                    <div className="pl-stack">
                      {pillars.map((p, i) => {
                        const usable = pinned ? readyKey[i] === "1" : i === active;
                        return (
                          <div key={p.id} className="pl-slot" data-id={p.id} data-active={i === active || undefined} aria-hidden={i !== active} inert={!usable || i !== active}>
                            {p.id === "account" ? <AccountArt projectName={projectName} /> : p.id === "swap" ? <LockArt demo={pinned && demo && i === active} /> : <SwarmArt active={i === active} built={pinned ? readyKey[2] === "1" : tabDone === 2} reduced={reduced} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </Tabs>
          </div>
        </div>
      </div>
    </section>
  );
}

