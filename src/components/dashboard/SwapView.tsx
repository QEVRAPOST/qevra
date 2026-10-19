"use client";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { StateCard } from "@/components/ui/StateCard";
import { useAppModel } from "./DemoAppProvider";
import { IntentLockPanel } from "./IntentLockPanel";

/**
 * Simple swap. The form, the quote states, the Intent Lock and the blocked execution states.
 * Execution stays switched off: with no route configured the primary button ends at "Route unavailable".
 */
export function SwapView() {
  const { model, actions } = useAppModel();
  const s = model.swap;
  return (
    <section className="route" aria-labelledby="h-swap">
      <div className="rhead">
        <h1 id="h-swap">Simple swap</h1>
        <p>{model.mode === "live" ? "Swaps remain disabled. No reviewed route, quote, or transaction interface is active." : "One swap, with every detail reviewed before you sign."}</p>
      </div>
      <div className="swapgrid">
        <Panel
          title="Your swap"
          aside={
            <Chip tone={s.routeChip.tone} material={s.routeChip.material}>
              {s.routeChip.label}
            </Chip>
          }
        >
          <div className="swapbox">
            <Field label="You pay" labelId="amt-l" token={s.payToken} hint={s.payHint} hintId="amt-h" htmlFor="amt">
              <input
                id="amt"
                inputMode="decimal"
                autoComplete="off"
                value={s.amount}
                disabled={model.mode === "live"}
                aria-labelledby="amt-l"
                aria-describedby="amt-h"
                onChange={(e) => actions.setAmount(e.target.value)}
              />
            </Field>
            <Field label="You receive, at least" token={s.receiveToken} hint={s.receive.hint}>
              <span className="val">{s.receive.display}</span>
            </Field>
          </div>
          <dl className="quote">
            {s.quote.map((q) => (
              <div key={q.label}>
                <dt>{q.label}</dt>
                <dd>
                  {q.value}
                  {q.tag ? (
                    <>
                      {" "}
                      <em>{q.tag}</em>
                    </>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
          <Button className="swapbtn" disabled={s.button.disabled} data-key={s.button.key} onClick={actions.pressSwapButton}>
            {s.button.label}
          </Button>
          <StateCard severity={s.button.severity} cause={s.button.cause} notDone={s.button.notDone} />
          <p className="feenote">Network fees can be spent even when a swap fails.</p>
        </Panel>
        <IntentLockPanel comparison={s.comparison} />
      </div>
    </section>
  );
}
