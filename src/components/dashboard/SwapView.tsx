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
import { useMediaQuery } from "@/lib/use-media-query";
import { useAppModel } from "./DemoAppProvider";
import { IntentLockPanel } from "./IntentLockPanel";
import { MainnetSwapPanel } from "./MainnetSwapPanel";
import { PageHead } from "./PageHead";

/** A token's mark: a ring and the letter of its name. The two preview tokens differ by the ring, so they are never confused. */
function Coin({ token }: { token: string }) {
  return <span className={`coin ${token === "TKN-A" ? "a" : "b"}`} aria-hidden="true">{token.slice(-1)}</span>;
}

/**
 * pay token → router → receive token. The router is the missing piece: the line from the token you pay stops at its dashed ring, and the
 * line onward to the token you would receive is dotted. When you change the swap, a spark travels to the router and ripples there: it is
 * feedback that the change reached the router slot, not a lookup, and it finds nothing because nothing is configured.
 */
function Route({ pay, receive, edited }: { pay: PreviewToken; receive: PreviewToken; edited: number }) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  return (
    <figure className="sp-route">
      <svg viewBox="0 0 560 150" role="img" aria-label={`Route from ${pay} to ${receive}. No router is configured, so the route is not complete.`} focusable="false">
        <path id="sp-path" className="sp-r1" d="M106 62 H246" />
        <path className="sp-r2" d="M314 62 H454" />
        <g transform="translate(70 62)">
          <circle className="sp-coin1" r="34" />
          <circle className="sp-coin2" r="26" />
          <text className="sp-letter" textAnchor="middle" dy="10">{pay.slice(-1)}</text>
        </g>
        <g transform="translate(490 62)">
          <circle className="sp-coin1 dim" r="34" />
          <circle className="sp-coin2 dim" r="26" />
          <text className="sp-letter dim" textAnchor="middle" dy="10">{receive.slice(-1)}</text>
        </g>
        <g transform="translate(280 62)">
          <circle className="sp-router" r="32" />
          <circle className="sp-router-in" r="22" />
          <path className="sp-slash" d="M-15 15 L15 -15" />
          {!reduce ? <circle key={edited} className="sp-ripple" r="32" /> : null}
        </g>
        {!reduce && edited > 0 ? (
          <circle key={`p${edited}`} className="sp-spark" r="4.5">
            <animateMotion dur="0.8s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1">
              <mpath href="#sp-path" />
            </animateMotion>
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur="0.85s" fill="freeze" />
          </circle>
        ) : null}
        <text className="sp-t1" x="70" y="122" textAnchor="middle">{pay}</text>
        <text className="sp-t2" x="70" y="140" textAnchor="middle">you pay</text>
        <text className="sp-t1" x="280" y="122" textAnchor="middle">Router</text>
        <text className="sp-t2 warn" x="280" y="140" textAnchor="middle">none configured</text>
        <text className="sp-t1 dim" x="490" y="122" textAnchor="middle">{receive}</text>
        <text className="sp-t2" x="490" y="140" textAnchor="middle">no quote</text>
      </svg>
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

  if (live) {
    return (
      <section className="route sp" aria-labelledby="h-swap">
        <PageHead
          id="h-swap"
          kicker="Robinhood Mainnet · wallet-authorized"
          title="Simple swap"
          lede="Real 0x Mainnet quotes are checked against chain 4663 contract reads. Approval and swap transactions require separate, explicit wallet confirmation. No Testnet fallback is used."
        />
        <MainnetSwapPanel />
      </section>
    );
  }

  return (
    <section className="route sp" aria-labelledby="h-swap">
      <PageHead
        id="h-swap"
        kicker="Simple swap · preview, switched off"
        title="Simple swap"
        lede={live ? "Swap execution is unavailable: there is no supported, reviewed route or live quote. Signing and transaction controls are not enabled." : "Preview the intended flow. No live token list, price, route, quote, signing, or transaction is available."}
      />

      <p className="sp-flow-note">
        <b>Intended flow</b>
        <span>Select tokens, enter an amount, review the route and slippage, inspect Intent Lock, then execute only when a supported real integration provides a reviewed route and quote.</span>
      </p>

      {live ? (
        <p className="sp-preview-note" role="status">
          <b>Quote integration status.</b> No verified token pair is configured in this screen, so the illustrative TKN-A and TKN-B values are not sent to the quote API. The API currently reports no verified route; no price, output amount, or execution readiness is shown.
        </p>
      ) : null}

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
                  <Coin token={pay} />
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
            <small id="amt-h">TKN-A and TKN-B are placeholder preview tokens. They have no live price or balance.</small>
          </div>

          <button type="button" className="sp-flip" aria-label={`Swap sides: pay ${receive} instead`} disabled={live} onClick={() => { setPay(receive); touch(); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" key={edits}>
              <path d="M8 4v14M4 14l4 4 4-4M16 20V6M12 10l4-4 4 4" />
            </svg>
          </button>

          <div className="sp-box">
            <div className="sp-top">
              <span id="rcv-l">You receive, at least</span>
              <span className="sp-chip"><Coin token={receive} />{receive}</span>
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
          <p className="sp-preview-note"><b>Preview only.</b> Intent Lock parameters here are illustrative. A mismatch means local values differ from the values captured for review; it is not a wallet rejection or an on-chain transaction result.</p>
          <IntentLockPanel comparison={comparison} driven={live ? undefined : preview.driven} />
        </div>
      </div>
    </section>
  );
}
