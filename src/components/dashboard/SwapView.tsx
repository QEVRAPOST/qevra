"use client";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { StateCard } from "@/components/ui/StateCard";
import Link from "next/link";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";
import { IntentLockPanel } from "./IntentLockPanel";

/**
 * Simple swap. The form, the quote states, the Intent Lock and the blocked execution states.
 * Execution stays switched off: with no route configured the primary button ends at "Route unavailable".
 */
export function SwapView() {
  const { model, actions } = useAppModel();
  const s = model.swap;
  const amountOk = Number.parseFloat(s.amount.replace(/,/g, "")) > 0;
  /* the four steps, and where each stands. The last two are never "done": there is no route and execution is off. */
  const steps: Array<{ name: string; note: string; state: "done" | "cur" | "block" | "" }> = [
    { name: "Enter an amount", note: amountOk ? "Done · example value" : "Enter what you would pay", state: amountOk ? "done" : "cur" },
    { name: "Review the quote", note: s.routeChip.label, state: "block" },
    { name: "Intent Lock review", note: s.comparison.reviewed ? "Reviewed" : "Not reviewed yet", state: s.comparison.reviewed ? "done" : "" },
    { name: "Sign and send", note: "Not available", state: "block" },
  ];
  return (
    <section className="route" aria-labelledby="h-swap">
      <PageHead
        id="h-swap"
        kicker="Simple swap · preview, switched off"
        title="Simple swap"
        lede={model.mode === "live" ? "Swaps remain disabled. No reviewed route, quote, or transaction interface is active." : "One swap, with every detail reviewed before you sign. Here you can see the steps; nothing can be sent."}
      />
      <div className="sp-why">
        <b>Why you cannot swap yet.</b>{" "}
        <span>
          No swap route is configured, so there is no quote and nothing can be signed or sent. This page previews the four steps and what each will show.{" "}
          <Link href="/app/protocol">See what works today</Link>
        </span>
      </div>
      <ol className="sw-trail sp-trail" aria-label="The steps of a swap">
        {steps.map((st, i) => (
          <li key={st.name} className={st.state} aria-current={st.state === "cur" ? "step" : undefined}>
            <span className="sw-tn" aria-hidden="true">{i + 1}</span>
            <span className="sp-tt">
              {st.name}
              <small>{st.note}</small>
            </span>
          </li>
        ))}
      </ol>
      <div className="swapgrid">
        <Panel
          title="Your swap"
          aside={
            <Chip tone={s.routeChip.tone} material={s.routeChip.material}>
              {s.routeChip.label}
            </Chip>
          }
        >
          <h3 className="ov-h">1 · Amount</h3>
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
          <h3 className="ov-h">2 · Quote</h3>
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
          <h3 className="ov-h">4 · Sign and send</h3>
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
