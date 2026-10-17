"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { StatusMaterial } from "@/components/ui/StatusMaterial";

/*
 * Launch App transition (docs/QEVRA_DESIGN_DIRECTION.md section 7.13).
 * A circular curtain grows from the button over 620ms, the route changes underneath it at 640ms, then it fades
 * over 420ms. Reduced motion skips it. The buttons are real links to /app, so navigation still works when
 * JavaScript is slow or the transition is skipped.
 *
 * The provider lives in the root layout so the curtain survives the route change and can fade over the app.
 */
type Phase = "idle" | "on" | "off" | "reset";

interface LaunchApi {
  launch: (origin: Element, href: string) => void;
}

const LaunchContext = createContext<LaunchApi | null>(null);

export function useLaunch(): LaunchApi | null {
  return useContext(LaunchContext);
}

/** The fade starts when the new route has rendered, or after this long if it has not. */
const ARRIVAL_TIMEOUT_MS = 5000;

export function LaunchCurtainProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const curtainRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const waiting = useRef(false);

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  /** Fade out, then reset to the hidden state with transitions off so the circle does not visibly shrink. */
  const finish = useCallback(() => {
    clearTimers();
    waiting.current = false;
    setPhaseBoth("off");
    timers.current.push(window.setTimeout(() => setPhaseBoth("reset"), 460));
    timers.current.push(window.setTimeout(() => setPhaseBoth("idle"), 520));
  }, [clearTimers, setPhaseBoth]);

  const launch = useCallback(
    (origin: Element, href: string) => {
      if (prefersReducedMotion() || phaseRef.current !== "idle") {
        router.push(href);
        return;
      }
      const r = origin.getBoundingClientRect();
      const el = curtainRef.current;
      el?.style.setProperty("--cx", `${r.left + r.width / 2}px`);
      el?.style.setProperty("--cy", `${r.top + r.height / 2}px`);
      setPhaseBoth("on");
      waiting.current = true;
      timers.current.push(
        window.setTimeout(() => router.push(href), 640),
        window.setTimeout(finish, 640 + ARRIVAL_TIMEOUT_MS),
      );
    },
    [finish, router, setPhaseBoth],
  );

  /* when the app route has rendered under the curtain, fade it */
  useEffect(() => {
    if (!waiting.current || !pathname.startsWith("/app")) return;
    const id = requestAnimationFrame(finish);
    return () => cancelAnimationFrame(id);
  }, [pathname, finish]);

  useEffect(() => clearTimers, [clearTimers]);

  const api = useMemo<LaunchApi>(() => ({ launch }), [launch]);
  const cls = ["curtain", phase === "on" || phase === "off" ? "on" : "", phase === "off" ? "off" : "", phase === "reset" ? "reset" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <LaunchContext.Provider value={api}>
      {children}
      <div ref={curtainRef} className={cls} aria-hidden="true">
        <div className="cm">
          <StatusMaterial material="outline" />
          <span>Opening the app preview</span>
        </div>
      </div>
    </LaunchContext.Provider>
  );
}
