"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StateCard } from "@/components/ui/StateCard";
import { ToggleGroup } from "@/components/ui/ToggleGroup";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildPreviewComparison,
  formatAmount,
  otherToken,
  parseAmount,
  PREVIEW_SLIPPAGES,
  PREVIEW_TOKENS,
  type PreviewParams,
  type PreviewSlippage,
  type PreviewToken,
} from "@/lib/demo/swap";
import { useAppModel } from "./DemoAppProvider";
import { IntentLockPanel } from "./IntentLockPanel";
import { PageHead } from "./PageHead";

/** pay token ··· router ··· receive token. The router is not configured, so the line breaks there: that is why there is no quote. */
function Route({ pay, receive, edited }: { pay: string; receive: string; edited: number }) {
  return (
    <figure className="sp-route" aria-label={`Route from ${pay} to ${receive}: no router is configured, so the route is not complete`}>
      <svg viewBox="0 0 520 70" role="img" aria-hidden="true" focusable="false">
        <path className="sp-r1" d="M70 35 H228" />
        <path className="sp-r2" d="M292 35 H450" />
        <circle className="sp-n" cx="46" cy="35" r="22" />
        <circle className="sp-n" cx="474" cy="35" r="22" />
        <rect className="sp-rt" x="228" y="14" width="64" height="42" rx="21" />
        <path className="sp-x" d="M252 26 L268 44 M268 26 L252 44" />
        {/* a pulse on the open end each time the visitor changes the swap: it is feedback, not a signal */}
        <circle key={edited} className="sp-pulse" cx="228" cy="35" r="3" />
      </svg>
      <span className="sp-l1">{pay}</span>
      <span className="sp-l2">Router not configured</span>
      <span className="sp-l3">{receive}</span>
    </figure>
  );
}

/**
 * Simple swap, as a preview. The amount, the pair and the slippage respond to what you do, and Intent Lock reviews them: change
 * a reviewed parameter and exactly that row and its ring turn out of line. There is no price, no quote and no route, and nothing
 * can be signed or sent, so the last step says so instead of pretending.
 */
export function SwapView() {
  const { model, actions } = useAppModel();
  const live = model.mode === "live";
  const s = model.swap;
  const chainId = model.network.options.find((n) => n.id === model.network.selected)?.chainId ?? 0;

  const [pay, setPay] = useState<PreviewToken>("TKN-A");
  const [slippage, setSlippage] = useState<PreviewSlippage>("0.5");
  const [reviewed, setReviewed] = useState<PreviewParams | null>(null);
  const [edits, setEdits] = useState(0);
  const receive = otherToken(pay);
  const amount = parseAmount(s.amount);
  const now: PreviewParams = useMemo(() => ({ pay, amount, slippage, chainId }), [pay, amount, slippage, chainId]);
  const preview = useMemo(() => buildPreviewComparison(reviewed, now), [reviewed, now]);
  const comparison = live ? s.comparison : preview.comparison;
  const changed = !live && reviewed !== null && preview.comparison.changedCount > 0;
  const touch = () => setEdits((n) => n + 1);

  const step = !amount || Number.isNaN(amount) ? 0 : reviewed === null ? 1 : changed ? 1 : 2;
  const steps = [
    { name: "Amount", note: Number.isNaN(amount) ? "Enter what you would pay" : `${formatAmount(amount)} ${pay}` },
    { name: "Review", note: reviewed === null ? "Not reviewed yet" : changed ? `${preview.comparison.changedCount} changed` : "Reviewed, matches" },
    { name: "Route", note: "Not configured" },
    { name: "Sign and send", note: "Not available" },
  ];

  return (
    <section className="route sp" aria-labelledby="h-swap">
      <PageHead
        id="h-swap"
        kicker="Simple swap · preview, switched off"
        title="Simple swap"
        lede={live ? "Swaps remain disabled. No reviewed route, quote, or transaction interface is active." : "Set up a swap and review it. Nothing can be sent: there is no route, no price and no signing."}
      />

      <ol className="sw-trail sp-trail" aria-label="The steps of a swap">
        {steps.map((st, i) => (
          <li key={st.name} className={i < step ? "done" : i === step ? "cur" : i >= 2 ? "block" : ""} aria-current={i === step ? "step" : undefined}>
            <span className="sw-tn" aria-hidden="true">{i + 1}</span>
            <span className="sp-tt">
              {st.name}
              <small>{st.note}</small>
            </span>
          </li>
        ))}
      </ol>

      <div className="sp-grid">
        <div className="sp-form">
          <div className="sp-box">
            <div className="sp-top">
              <label htmlFor="amt" id="amt-l">You pay</label>
              <Select value={pay} onValueChange={(v) => { setPay(v as PreviewToken); touch(); }} disabled={live}>
                <SelectTrigger aria-label="Token you pay" className="sp-tok font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PREVIEW_TOKENS.map((t) => (
                    <SelectItem key={t} value={t} className="font-mono text-xs">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              id="amt"
              className="sp-amt"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={s.amount}
              disabled={live}
              aria-labelledby="amt-l"
              aria-describedby="amt-h"
              onChange={(e) => {
                actions.setAmount(e.target.value);
                touch();
              }}
            />
            <small id="amt-h">Simulated token. It has no price and no balance here.</small>
          </div>

          <button type="button" className="sp-flip" aria-label={`Swap sides: pay ${receive} instead`} disabled={live} onClick={() => { setPay(receive); touch(); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" key={edits}>
              <path d="M8 4v14M4 14l4 4 4-4M16 20V6M12 10l4-4 4 4" />
            </svg>
          </button>

          <div className="sp-box">
            <div className="sp-top">
              <span id="rcv-l">You receive, at least</span>
              <span className="sp-chip">{receive}</span>
            </div>
            <span className="sp-amt none" aria-labelledby="rcv-l">No quote</span>
            <small>No route is configured, so no amount can be quoted. None is made up.</small>
          </div>

          <Route pay={pay} receive={receive} edited={edits} />

          <div className="sp-slip">
            <span id="slip-l">Slippage tolerance</span>
            <ToggleGroup
              labelledBy="slip-l"
              value={slippage}
              onChange={(v) => { setSlippage(v); touch(); }}
              options={PREVIEW_SLIPPAGES.map((v) => ({ value: v, label: `${v}%`, disabled: live }))}
            />
          </div>

          <dl className="sp-q">
            <div><dt>Minimum received</dt><dd>No quote</dd></div>
            <div><dt>Network fee</dt><dd>Not estimated</dd></div>
            <div><dt>Quote expires</dt><dd>No quote</dd></div>
          </dl>

          {live ? (
            <>
              <Button className="swapbtn" disabled>{s.button.label}</Button>
              <StateCard severity={s.button.severity} cause={s.button.cause} notDone={s.button.notDone} />
            </>
          ) : (
            <>
              {reviewed !== null && !changed ? (
                <Button className="swapbtn" disabled>Route unavailable</Button>
              ) : (
                <Button
                  className="swapbtn"
                  disabled={Number.isNaN(amount)}
                  onClick={() => {
                    setReviewed(now);
                  }}
                >
                  {Number.isNaN(amount) ? "Enter an amount" : changed ? "Review the changed details" : "Review these details"}
                </Button>
              )}
              <p className="sp-note" role="status">
                {Number.isNaN(amount)
                  ? "Enter an amount to start."
                  : reviewed === null
                    ? "Review the details with Intent Lock. Nothing is sent."
                    : changed
                      ? `${preview.comparison.changedCount} reviewed ${preview.comparison.changedCount === 1 ? "detail has" : "details have"} changed. Review again before anything could be signed.`
                      : "Reviewed. No route is configured, so there is nothing to sign or send."}
              </p>
            </>
          )}
          <p className="sp-fee">
            Network fees can be spent even when a swap fails. <Link href="/app/protocol">What works today</Link>
          </p>
        </div>

        <div className="sp-review">
          <IntentLockPanel comparison={comparison} driven={live ? undefined : preview.driven} />
        </div>
      </div>
    </section>
  );
}
