"use client";

import { Button } from "@/components/ui/Button";
import { Chip, DemoChip } from "@/components/ui/Chip";
import { Panel } from "@/components/ui/Panel";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { ACCOUNT_CONTROL, ACCOUNT_CONTROL_LEAD, ACCOUNT_CONTROL_RULE, TWO_LEDGERS } from "@/lib/content/copy-lock";
import type { LedgerActionId, LedgerView } from "@/types";
import { useAppModel } from "./DemoAppProvider";

function Ledger({ ledger, onAction }: { ledger: LedgerView; onAction: (id: LedgerActionId) => void }) {
  const headingId = `led-${ledger.kind}-h`;
  const noteId = `led-${ledger.kind}-note`;
  return (
    <article className={ledger.kind === "qevra" ? "ledger q" : "ledger"} aria-labelledby={headingId}>
      <h3 id={headingId}>
        {ledger.kind === "qevra" ? <StatusMaterial material="outline" /> : null}
        {ledger.title}
      </h3>
      <p className="lt">{ledger.subtitle}</p>
      {ledger.intro ? <p className="intro">{ledger.intro}</p> : null}
      {ledger.hint ? <p className="lt">{ledger.hint}</p> : null}
      {ledger.address ? (
        <div className="addr">
          <span>{ledger.address.label}</span>
          {ledger.address.demo ? <DemoChip /> : null}
        </div>
      ) : null}
      {ledger.facts.length > 0 ? (
        <dl className="kv">
          {ledger.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {ledger.assets.length > 0 || ledger.emptyAssets ? (
        <ul className="assets">
          {ledger.assets.length > 0 ? (
            ledger.assets.map((a) => (
              <li key={a.symbol}>
                <span>{a.symbol}</span>
                <b>{a.amount}</b>
              </li>
            ))
          ) : (
            <li className="none">
              <span>{ledger.emptyAssets}</span>
            </li>
          )}
        </ul>
      ) : null}
      {ledger.actions.length > 0 ? (
        <div className="acts-row">
          {ledger.actions.map((a) => (
            <Button
              key={a.id}
              variant={a.variant}
              size="small"
              disabled={a.disabled}
              aria-describedby={a.disabled && ledger.footnote ? noteId : undefined}
              onClick={() => onAction(a.id)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
      {ledger.footnote ? (
        <p className="lt" id={noteId}>
          {ledger.footnote}
        </p>
      ) : null}
    </article>
  );
}

/** Wallet and PQ Vault: the connected wallet and the QEVRA account as two separate ledgers, never one total. */
export function WalletView() {
  const { model, actions } = useAppModel();
  const w = model.wallet;
  const complete = w.setupDone === 4;
  return (
    <section className="route" aria-labelledby="h-wallet">
      <div className="rhead">
        <h1 id="h-wallet">Wallet and PQ Vault</h1>
        <p>Your connected wallet and your QEVRA account are two different accounts.</p>
      </div>
      <Panel
        title="Accounts"
        aside={
          <Chip tone="exp" material="outline">
            Experimental
          </Chip>
        }
      >
        <div className="ledgers">
          <Ledger ledger={w.eoa} onAction={actions.pressLedgerAction} />
          <Ledger ledger={w.qevra} onAction={actions.pressLedgerAction} />
        </div>
        <p className="nototal">
          <StatusMaterial material="outline" />
          <span>{TWO_LEDGERS}</span>
        </p>
      </Panel>
      <Panel
        title="Set up your QEVRA account"
        aside={
          <Chip tone={complete ? "neutral" : "unk"} material={complete ? "outline" : "dotted"}>
            {w.setupDone} of 4 done
          </Chip>
        }
      >
        <ol className="setup" aria-label="Setup steps">
          {w.steps.map((step, i) => (
            <li key={step.title} className={step.state === "current" ? "cur" : step.state} aria-current={step.state === "current" ? "step" : undefined}>
              <span className="sb">
                {step.state === "done" ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M2 6.4l2.6 2.6L10 3.4" />
                  </svg>
                ) : (
                  String(i + 1)
                )}
              </span>
              <span className="st">
                <b>{step.title}</b>
                <small>{step.detail}</small>
              </span>
              <span className="tag">{step.tag}</span>
            </li>
          ))}
        </ol>
        <div className="ctrlnote">
          <p>
            <b>{ACCOUNT_CONTROL_LEAD}</b> {ACCOUNT_CONTROL}
          </p>
          <p>{ACCOUNT_CONTROL_RULE}</p>
        </div>
      </Panel>
    </section>
  );
}
