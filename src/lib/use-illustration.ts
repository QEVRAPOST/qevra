"use client";

import { useCallback, useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { ILLUSTRATION_LAST } from "@/lib/swarm-view";

/**
 * The visitor-started walkthrough of a run. It advances by itself every couple of seconds, unless the visitor prefers less
 * motion: then it waits for "Next step". It is state only; what it draws is labelled an illustration where it is shown.
 */
export function useIllustration() {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    if (step === null || step >= ILLUSTRATION_LAST || prefersReducedMotion()) return;
    const t = window.setTimeout(() => setStep((s) => (s === null ? s : s + 1)), 1900);
    return () => window.clearTimeout(t);
  }, [step]);
  const start = useCallback(() => setStep(0), []);
  const next = useCallback(() => setStep((s) => (s === null ? s : Math.min(ILLUSTRATION_LAST, s + 1))), []);
  const stop = useCallback(() => setStep(null), []);
  return { step, start, next, stop };
}
