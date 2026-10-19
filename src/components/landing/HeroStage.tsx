"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/Button";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup } from "@/components/ui/ToggleGroup";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { clamp } from "@/lib/aperture/math";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { scrollBehavior, scrollToFrame } from "@/lib/aperture/scroll";
import { whenSplashDone } from "@/lib/splash";
import { StageScene, stageState } from "@/lib/aperture/stage/engine";
import { WaterScene } from "@/lib/aperture/water";
import { brandizeDisplayStrings } from "@/lib/project-brand";
import { CORE_SENTENCE } from "@/lib/content/copy-lock";
import {
  brandize,
  FRAME_SWARM,
  HERO,
  HERO_FACTS,
  HERO_LOCK_CAPTIONS,
  HERO_PARTS,
  HERO_POINT_HINT,
  HERO_ROTATE_HINT,
  HERO_ROTATE_LABEL,
  HERO_SCENES,
  HERO_SCROLL_HINT,
  HERO_STAGE_KEYS,
  HERO_ZOOM_HINT,
  HERO_TABS_LABEL,
  TRY_GROUP_LABEL,
  TRY_LABEL,
  TRY_OPTIONS,
} from "@/lib/content/landing";
import { LaunchLink } from "./LaunchLink";

const N = HERO_SCENES.length;
/** Scroll progress where one object hands over to the next, with a little hysteresis so a boundary does not flicker. */
const HYST = 0.02;
/** The Intent Lock object breaks its own line of light once the visitor has scrolled this far into it. */
const AUTO_BREAK_AT = 0.62;
/** Auto tour: when each object arrives, in ms from load. It ends back on the first object. */
const TOUR = { sway: 1900, lock: 3400, lockBreak: 5300, swarm: 7000, home: 10400 } as const;

type SceneIndex = 0 | 1 | 2;

/** The hero copy, in the layout the approved hero has always had. `activeFact` lights the line for the object on show. */
function HeroText({ activeFact, projectName }: { activeFact: number; projectName: string }) {
  const facts = brandizeDisplayStrings(HERO_FACTS, projectName);
  return (
    <header className="hero">
      <p className="eyebrow">{HERO.eyebrow}</p>
      <h1>{HERO.headline}</h1>
        <p className="lede">{brandize(HERO.lede, projectName)}</p>
      <div className="ctas">
        <LaunchLink>Launch App</LaunchLink>
        <a
          className={buttonVariants({ variant: "ghost" })}
          href="#swarm"
          onClick={(e) => {
            e.preventDefault();
            scrollToFrame(FRAME_SWARM, prefersReducedMotion());
          }}
        >
          Explore Security
        </a>
      </div>
      <p className="ctas-note">{HERO.note}</p>
        <ul className="facts" aria-label={`What ${projectName} is`}>
          {facts.map((f, i) => (
          <li key={f.lead} className={activeFact === i ? "on" : undefined}>
            <StatusMaterial material={f.material} />
            <span>
              <b>{f.lead}.</b>
              {f.body}
            </span>
          </li>
        ))}
      </ul>
      <p className="core">
        <StatusMaterial material="outline" />
          <span>{brandize(CORE_SENTENCE, projectName)}</span>
      </p>
    </header>
  );
}

/**
 * The hero: the first screen, pinned. The copy stays put and the object on the right is built piece by piece, then
 * taken apart and replaced by the next one as the visitor scrolls (or chooses a tab):
 *   1. the QEVRA smart account, 2. Intent Lock, 3. post-quantum research and the Security Swarm.
 * Left alone for about ten seconds, it shows all three in turn and comes back to the first.
 *
 * Scroll position is the source of truth and is never React state: it drives the stage directly, and React state
 * holds only which object is on show and the Try it value, which change a few times in a visit.
 */
export function HeroStage({ projectName }: { projectName: string }) {
  const [scene, setScene] = useState<SceneIndex>(0);
  const [tryValue, setTryValue] = useState<0 | 1 | null>(null);
  const [broken, setBroken] = useState<0 | 1>(0);
  /** the part being pointed at (a hover, or a tap on touch), and whether the visitor has turned the object */
  const [partId, setPartId] = useState<string | null>(null);
  /** the part the camera has flown in on */
  const [zoomId, setZoomId] = useState<string | null>(null);
  const [turned, setTurned] = useState(false);
  const [hinted, setHinted] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const figRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waterRef = useRef<HTMLCanvasElement>(null);
  /* the effect below owns these; handlers reach it through them */
  const tryRef = useRef<0 | 1 | null>(null);
  const gotoRef = useRef<(i: SceneIndex) => void>(() => {});
  const syncRef = useRef<() => void>(() => {});
  const stageRef = useRef<StageScene | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const fig = figRef.current;
    const track = trackRef.current;
    const pin = pinRef.current;
    if (!cv || !fig || !track || !pin) return;
    let stage: StageScene;
    try {
      stage = new StageScene(cv, stageState());
    } catch {
      return; /* no Canvas 2D: the copy and the tabs still work */
    }
    stageRef.current = stage;
    stage.projectName = projectName;

    /* The water under the stage: it stays while the objects change, so it is the hero's ground. It is calm and has no
       sculpture to mirror, and it runs only while the stage is on screen and the splash screen (if any) has lifted. */
    let water: WaterScene | null = null;
    let onScreen = false;
    let ready = false;
    let io: IntersectionObserver | undefined;
    let cancelWater: () => void = () => {};
    if (waterRef.current) {
      try {
        water = new WaterScene(waterRef.current, () => null, {
          home: { x: 0.5, y: 0.64, plate: 86 },
          sinT: 0.5,
          reach: 0.8,
          strength: 1,
          fadeLeft: 0,
          fadeTop: 0.3,
          waterline: false,
          path: false,
          fps: 30,
        });
        stage.water = true;
        const sync = () => water?.setActive(onScreen && ready);
        if (typeof IntersectionObserver !== "undefined") {
          io = new IntersectionObserver((es) => {
            onScreen = es.some((e) => e.isIntersecting);
            sync();
          });
          io.observe(fig);
        } else onScreen = true;
        cancelWater = whenSplashDone(() => {
          ready = true;
          sync();
        });
      } catch {
        water = null; /* no Canvas 2D: the stage keeps its own floor */
      }
    }
    stage.onZoom = setZoomId;
    stage.bindPointer(fig);
    stage.bindInteraction(cv);
    stage.onHover = (id) => {
      setPartId(id);
      cv.style.cursor = id ? "pointer" : "";
    };
    stage.onView = (t) => {
      setTurned(t);
      if (t) setHinted(true);
    };

    let cur = -1;
    let u = 0.5;
    let misNow: 0 | 1 = 0;
    let tourOn = false;
    let tourMis: 0 | 1 = 0;
    let lock: SceneIndex | null = null;
    let lockTimer = 0;
    let queued = 0;
    let cancelWait: () => void = () => {};
    const timers: number[] = [];

    /** Which element is the pinned one: the whole hero on tall desktops, otherwise just the figure. */
    const pinned = () => (getComputedStyle(pin).position === "sticky" ? pin : fig);

    const progress = () => {
      const el = pinned();
      const r = track.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(el).top) || 0;
      const range = r.height - el.offsetHeight;
      return range > 4 ? clamp((top - r.top) / range) : 0;
    };

    const sceneAt = (p: number, from: number): SceneIndex => {
      let s = from < 0 ? 0 : from;
      while (s < N - 1 && p > (s + 1) / N + HYST) s++;
      while (s > 0 && p < s / N - HYST) s--;
      return s as SceneIndex;
    };

    const wantMis = (): 0 | 1 => {
      if (tryRef.current != null) return tryRef.current;
      if (tourOn) return tourMis;
      return cur === 1 && u > AUTO_BREAK_AT ? 1 : 0;
    };
    const syncMis = () => {
      const m = wantMis();
      stage.set({ mis: m });
      if (m !== misNow) {
        misNow = m;
        setBroken(m);
      }
    };
    syncRef.current = syncMis;

    const show = (next: SceneIndex) => {
      if (next === cur) return;
      const prev = cur;
      cur = next;
      setScene(next);
      stage.setScene(next);
      stage.setAmbient(next === 2);
      if (tryRef.current != null && next !== 1) {
        tryRef.current = null;
        setTryValue(null);
      }
      /* the old object comes apart quickly; the new one starts building just after, so they never both stand whole */
      if (prev >= 0) stage.form(prev as SceneIndex, 0, 440);
      stage.form(next, 1, 1500, prev >= 0 ? 340 : 250);
      syncMis();
    };

    const stopTour = () => {
      if (!tourOn) return;
      tourOn = false;
      tourMis = 0;
      timers.forEach((t) => window.clearTimeout(t));
      timers.length = 0;
      syncMis();
    };

    const apply = () => {
      queued = 0;
      if (tourOn) {
        if (window.scrollY <= 40) return;
        stopTour();
      }
      const p = progress();
      const s = lock ?? sceneAt(p, cur);
      u = lock != null ? 0.5 : clamp((p - s / N) * N);
      tabsRef.current?.style.setProperty("--hu", u.toFixed(3));
      stage.set({ u });
      show(s);
      syncMis();
    };
    const queue = () => {
      if (!queued) queued = requestAnimationFrame(apply);
    };

    /* a tab scrolls to its object; the objects in between are skipped while the page travels there */
    const unlock = () => {
      lock = null;
      queue();
    };
    gotoRef.current = (i) => {
      stopTour();
      const el = pinned();
      const r = track.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(el).top) || 0;
      const range = Math.max(0, r.height - el.offsetHeight);
      const p = i === 0 ? 0 : (i + 0.5) / N;
      lock = i;
      window.clearTimeout(lockTimer);
      lockTimer = window.setTimeout(unlock, 700);
      show(i);
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top - top + p * range), behavior: scrollBehavior(prefersReducedMotion()) });
    };
    const onScroll = () => {
      if (lock != null) {
        window.clearTimeout(lockTimer);
        lockTimer = window.setTimeout(unlock, 160);
      }
      queue();
    };
    const onInput = () => {
      stopTour();
      if (lock != null) unlock();
    };

    /* start: build the first object, or, if the page opens already scrolled or motion is reduced, just show the right one */
    const startScrolled = window.scrollY > 40;
    if (prefersReducedMotion() || startScrolled) {
      const s = sceneAt(progress(), -1);
      cur = s;
      setScene(s);
      u = clamp((progress() - s / N) * N);
      tabsRef.current?.style.setProperty("--hu", u.toFixed(3));
      stage.jump(stageState({ f0: s === 0 ? 1 : 0, f1: s === 1 ? 1 : 0, f2: s === 2 ? 1 : 0, u }));
      stage.setScene(s);
      stage.setAmbient(s === 2);
      syncMis();
    } else {
      /* the first object builds when the splash screen (if one is playing) lifts away */
      cancelWait = whenSplashDone(() => {
        tourOn = true;
        show(0);
        timers.push(
          /* a small sway once the first object is built, to show it can be turned (not if the visitor already has) */
          window.setTimeout(() => tourOn && !stage.userRotated && stage.rotateBy(0.32, 0, false), TOUR.sway),
          window.setTimeout(() => tourOn && !stage.userRotated && stage.resetView(), TOUR.sway + 850),
          window.setTimeout(() => tourOn && show(1), TOUR.lock),
          window.setTimeout(() => {
            if (!tourOn) return;
            tourMis = 1;
            syncMis();
          }, TOUR.lockBreak),
          window.setTimeout(() => {
            if (!tourOn) return;
            tourMis = 0;
            show(2);
          }, TOUR.swarm),
          window.setTimeout(() => {
            if (!tourOn) return;
            show(0);
            stopTour();
          }, TOUR.home),
        );
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", queue);
    window.addEventListener("wheel", onInput, { passive: true });
    window.addEventListener("touchstart", onInput, { passive: true });
    window.addEventListener("keydown", onInput);
    window.addEventListener("pointerdown", onInput, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", queue);
      window.removeEventListener("wheel", onInput);
      window.removeEventListener("touchstart", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("pointerdown", onInput);
      if (queued) cancelAnimationFrame(queued);
      window.clearTimeout(lockTimer);
      timers.forEach((t) => window.clearTimeout(t));
      gotoRef.current = () => {};
      syncRef.current = () => {};
      stageRef.current = null;
      cancelWait();
      cancelWater();
      io?.disconnect();
      water?.dispose();
      stage.dispose();
    };
  }, [projectName]);

  const onTry = useCallback((value: 0 | 1) => {
    tryRef.current = value;
    setTryValue(value);
    syncRef.current();
  }, []);

  const s = HERO_SCENES[scene];
  const bn = (t: string) => brandize(t, projectName);
  /* the part the camera is on stays described after the pointer leaves it; otherwise the part under the pointer */
  const shownId = zoomId ?? partId;
  const part = shownId ? HERO_PARTS[shownId] : null;
  const cap = scene === 1 ? HERO_LOCK_CAPTIONS[broken] : s;
  const showTry = scene === 1;
  const turnBy = (d: number) => stageRef.current?.rotateBy(d);
  /* keyboard: the arrows turn it, Enter flies to the next part, Escape resets (the buttons do the same for a pointer) */
  const onStageKey = (e: React.KeyboardEvent) => {
    const st = stageRef.current;
    if (!st || e.target !== e.currentTarget) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      st.rotateBy(e.key === "ArrowLeft" ? -0.2 : 0.2);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      st.cycleZoom(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      st.resetView();
    }
  };

  return (
    <section className="hstage" id="hero" aria-label={`${projectName} at a glance`} data-scene={scene}>
      <div className="hs-track" ref={trackRef}>
        <div className="hs-pin" ref={pinRef}>
          <div className="wrap wide">
            <div className="sgrid hgrid">
              <HeroText activeFact={scene} projectName={projectName} />
              <figure className="hfig" ref={figRef}>
                <div className="hcanvas" tabIndex={0} role="group" aria-label={HERO_STAGE_KEYS} onKeyDown={onStageKey}>
                  <canvas ref={canvasRef} role="img" aria-label={bn(s.label)} />
                  {/* behind the stage: the water that stays while the objects change */}
                  <canvas ref={waterRef} className="hwater" aria-hidden="true" />
                  <p className="hbadge" aria-hidden="true">
                    <span>
                      {scene + 1} / {N}
                    </span>
                    {bn(s.name)}
                  </p>
                  <TooltipProvider>
                    <div className="hrot" role="group" aria-label={HERO_ROTATE_LABEL}>
                      <span className={hinted ? "hrot-hint off" : "hrot-hint"} aria-hidden="true">
                        {HERO_ROTATE_HINT}
                      </span>
                      <RotateButton label="Rotate left" onClick={() => turnBy(-0.35)}>
                        <ChevronLeft aria-hidden="true" />
                      </RotateButton>
                      <RotateButton label="Rotate right" onClick={() => turnBy(0.35)}>
                        <ChevronRight aria-hidden="true" />
                      </RotateButton>
                      <RotateButton label="Reset view" onClick={() => stageRef.current?.resetView()} disabled={!turned}>
                        <RotateCcw aria-hidden="true" />
                      </RotateButton>
                    </div>
                  </TooltipProvider>
                </div>
                <Tabs value={String(scene)} onValueChange={(v) => gotoRef.current(Number(v) as SceneIndex)} activationMode="manual" className="contents">
                  <div className="htabs" ref={tabsRef}>
                    <TabsList className="htabs-row" aria-label={HERO_TABS_LABEL}>
                      {HERO_SCENES.map((h, i) => (
                        <TabsTrigger key={h.tab} value={String(i)} className="htab">
                          {h.tab}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <span className="hhint" aria-hidden="true">
                      {HERO_SCROLL_HINT}
                    </span>
                  </div>
                  <div className="pcap">
                    <div aria-live="polite" className="min-w-0">
                      <TabsContent value={String(scene)} className="m-0">
                        <p className="cap">
                          {part ? (
                            <>
                              <b>{bn(part.name)}.</b> {bn(part.text)}
                              {zoomId ? <span className="cap-hint"> {HERO_ZOOM_HINT}.</span> : null}
                            </>
                          ) : (
                            <>
                              <b>{bn(cap.lead)}</b> {bn(cap.text)} <span className="cap-hint">{HERO_POINT_HINT}.</span>
                            </>
                          )}
                        </p>
                      </TabsContent>
                    </div>
                    {/* inert while hidden, so keyboard focus never lands on an invisible control */}
                    <div className={showTry ? "tryit" : "tryit off"} inert={!showTry}>
                      <span>{TRY_LABEL}</span>
                      <ToggleGroup
                        label={TRY_GROUP_LABEL}
                        options={[
                          { value: 0, label: TRY_OPTIONS[0] },
                          { value: 1, label: TRY_OPTIONS[1] },
                        ]}
                        value={tryValue ?? broken}
                        onChange={onTry}
                      />
                    </div>
                  </div>
                </Tabs>
              </figure>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A small icon button with a name on hover and focus. */
function RotateButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="hrot-btn" aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
