"use client";

import { useMemo, useState } from "react";
import { DEFAULT_NETWORK_ID, isNetworkAvailable } from "@/lib/config/networks";
import { buildDemoModel } from "@/lib/demo/model";
import type { ActsMode, AppActions, AppModelValue, NetworkId, PreviewControls, RunsMode, SetupStage, SwapButtonKey } from "@/types";
import { ModelContext, PreviewContext } from "./AppModelContext";

export { useAppModel, usePreviewControls } from "./AppModelContext";

/*
 * DEMO PROVIDER. Every value it produces is a labelled example from src/lib/demo-fixtures.ts.
 * It moves example state only: no wallet is connected, no chain is read, nothing is signed or sent.
 *
 * QEVRA_APP_MODE selects a separate live provider when explicitly requested. The screens under
 * src/components/dashboard read only useAppModel(); this provider remains fixtures-only.
 */
const DEFAULT_AMOUNT = "100";

export function DemoAppProvider({ children }: { children: React.ReactNode }) {
  const [stage, setStageRaw] = useState<SetupStage>(0);
  const [forced, setForced] = useState<SwapButtonKey | null>(null);
  const [reviewed, setReviewed] = useState<number | null>(null);
  const [amount, setAmountRaw] = useState(DEFAULT_AMOUNT);
  const [runsMode, setRunsMode] = useState<RunsMode>("examples");
  const [actsMode, setActsMode] = useState<ActsMode>("examples");
  const [network, setNetworkRaw] = useState<NetworkId>(DEFAULT_NETWORK_ID);

  const model = useMemo(
    () => buildDemoModel({ stage, forced, reviewed, amount, runsMode, actsMode, network }),
    [stage, forced, reviewed, amount, runsMode, actsMode, network],
  );

  const actions = useMemo<AppActions>(() => {
    const advance = (to: SetupStage) => {
      setStageRaw((s) => (s >= to ? s : to));
      setForced(null);
    };
    return {
      setNetwork(id) {
        /* an unavailable network (mainnet, for now) is never selected, whatever the caller asks */
        if (isNetworkAvailable(id)) setNetworkRaw(id);
      },
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
      createSecurityRun() {
        /* The demo provider never starts a live Security Swarm run. */
      },
      logout() {
        /* Demo mode has no authenticated live-service session. */
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
        setNetworkRaw(DEFAULT_NETWORK_ID);
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
