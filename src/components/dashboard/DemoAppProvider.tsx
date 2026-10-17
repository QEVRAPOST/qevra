"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { buildDemoModel } from "@/lib/demo/model";
import type { ActsMode, AppActions, AppModelValue, PreviewControls, RunsMode, SetupStage, SwapButtonKey } from "@/types";

/*
 * DEMO PROVIDER. Every value it produces is a labelled example from src/lib/demo-fixtures.ts.
 * It moves example state only: no wallet is connected, no chain is read, nothing is signed or sent.
 *
 * Engineering integration point: replace this provider with one that supplies a real AppModelValue
 * (src/types/app-model.ts). The screens under src/components/dashboard read only useAppModel().
 */
const ModelContext = createContext<AppModelValue | null>(null);
const PreviewContext = createContext<PreviewControls | null>(null);

export function useAppModel(): AppModelValue {
  const v = useContext(ModelContext);
  if (!v) throw new Error("useAppModel must be used inside an app model provider");
  return v;
}

/** Preview controls exist only in demo mode. Returns null when the provider does not supply them. */
export function usePreviewControls(): PreviewControls | null {
  return useContext(PreviewContext);
}

const DEFAULT_AMOUNT = "100";

export function DemoAppProvider({ children }: { children: React.ReactNode }) {
  const [stage, setStageRaw] = useState<SetupStage>(0);
  const [forced, setForced] = useState<SwapButtonKey | null>(null);
  const [reviewed, setReviewed] = useState<number | null>(null);
  const [amount, setAmountRaw] = useState(DEFAULT_AMOUNT);
  const [runsMode, setRunsMode] = useState<RunsMode>("examples");
  const [actsMode, setActsMode] = useState<ActsMode>("examples");

  const model = useMemo(
    () => buildDemoModel({ stage, forced, reviewed, amount, runsMode, actsMode }),
    [stage, forced, reviewed, amount, runsMode, actsMode],
  );

  const actions = useMemo<AppActions>(() => {
    const advance = (to: SetupStage) => {
      setStageRaw((s) => (s >= to ? s : to));
      setForced(null);
    };
    return {
      setAmount(value) {
        setForced(null);
        setAmountRaw(value);
      },
      pressSwapButton() {
        if (forced) return; /* a forced preview state never acts */
        switch (model.swap.button.key) {
          case "connect":
            return advance(1);
          case "account":
            return advance(2);
          case "key":
            return advance(3);
          case "fund":
            return advance(4);
          case "review":
          case "rereview": {
            const n = parseFloat(amount.replace(/,/g, ""));
            if (Number.isFinite(n) && n > 0) setReviewed(n);
            return;
          }
          default:
            return;
        }
      },
      pressWalletButton() {
        if (stage === 0) advance(1);
      },
      pressLedgerAction(id) {
        if (id === "connect") advance(1);
        else if (id === "createAccount") advance(2);
        else if (id === "registerKey") advance(3);
        else if (id === "fund") advance(4);
        /* deposit and withdraw are not built: nothing happens */
      },
    };
  }, [amount, forced, model.swap.button.key, stage]);

  const preview = useMemo<PreviewControls>(
    () => ({
      stage,
      forced,
      runsMode,
      actsMode,
      setStage(next) {
        setStageRaw(next);
        setForced(null);
        if (next < 4) setReviewed(null);
      },
      setForced,
      setRunsMode,
      setActsMode,
      reset() {
        setStageRaw(0);
        setForced(null);
        setReviewed(null);
        setRunsMode("examples");
        setActsMode("examples");
        setAmountRaw(DEFAULT_AMOUNT);
      },
    }),
    [stage, forced, runsMode, actsMode],
  );

  const value = useMemo<AppModelValue>(() => ({ model, actions }), [model, actions]);

  return (
    <ModelContext.Provider value={value}>
      <PreviewContext.Provider value={preview}>{children}</PreviewContext.Provider>
    </ModelContext.Provider>
  );
}
