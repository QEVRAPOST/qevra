"use client";

import { Button } from "@/components/ui/Button";
import { Chip, DemoChip } from "@/components/ui/Chip";
import { Panel } from "@/components/ui/Panel";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { ACCOUNT_CONTROL, ACCOUNT_CONTROL_LEAD, ACCOUNT_CONTROL_RULE, TWO_LEDGERS } from "@/lib/content/copy-lock";
import { brandizeDisplayStrings, brandizeProjectName, PROJECT_NAME } from "@/lib/project-brand";
import type { LedgerActionId, LedgerView } from "@/types";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";
import { WalletBand } from "./WalletBand";

function Ledger({ ledger, onAction }: { ledger: LedgerView; onAction: (id: LedgerActionId) => void }) {
  const headingId = `led-${ledger.kind}-h`;
  const noteId = `led-${ledger.kind}-note`;
  return (
    <article className={ledger.kind === "qevra" ? "ledger q" : "ledger"} aria-labelledby={headingId}>
      <p className="wl-kick">{ledger.kind === "qevra" ? "Experimental · not available" : "Yours · external"}</p>
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
  const activeNetwork = model.network.options.find((network) => network.id === model.network.selected);
  const rpc = model.network.rpc;
  const complete = w.setupDone === 4;
  return (
    <section className="route" aria-labelledby="h-wallet">
      <PageHead
        id="h-wallet"
        kicker="Wallet and PQ Vault · read-only"
        title={model.mode === "live" ? "Read-only wallet" : "Wallet and PQ Vault"}
        lede={brandizeProjectName(model.mode === "live" ? "Look at your own wallet’s public balance. The app cannot sign, send or change anything. No QEVRA smart account exists in this mode." : "Your connected wallet and your QEVRA account are two different accounts. Only the wallet is a real idea today; the account is a concept being designed.", PROJECT_NAME)}
      />
      <WalletBand />
      <Panel
        title="Accounts"
        aside={
          model.mode === "live"
            ? <Chip tone="unk" material="dotted">Read-only · no custody</Chip>
            : <Chip tone="exp" material="outline">Experimental</Chip>
        }
      >
        <div className="ledgers">
          <Ledger ledger={brandizeDisplayStrings(w.eoa)} onAction={actions.pressLedgerAction} />
          <Ledger ledger={brandizeDisplayStrings(w.qevra)} onAction={actions.pressLedgerAction} />
        </div>
        <p className="nototal">
          <StatusMaterial material="outline" />
          <span>{brandizeProjectName(model.mode === "live" ? "No QEVRA ledger exists in this read-only mode. The external wallet balance is shown separately." : TWO_LEDGERS, PROJECT_NAME)}</span>
        </p>
      </Panel>
      <Panel
        title="Application network"
        aside={model.mode === "demo"
          ? <Chip tone="demo">Example only</Chip>
          : rpc.status === "available"
            ? <Chip tone="neutral" material="solid">RPC healthy</Chip>
            : <Chip tone="unk" material="dotted">{rpc.status === "loading" ? "Checking RPC" : "RPC unavailable"}</Chip>}
      >
        <dl className="kv">
          <div>
            <dt>Selected network</dt>
            <dd>{activeNetwork?.label ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Expected chain ID</dt>
            <dd>{activeNetwork?.chainId ?? "Unavailable"}</dd>
          </div>
          {model.mode === "demo" ? (
            <div>
              <dt>Public RPC</dt>
              <dd>Not queried in example mode</dd>
            </div>
          ) : (
            <>
              <div>
                <dt>RPC chain ID</dt>
                <dd>{rpc.chainId ?? (rpc.status === "loading" ? "Checking" : "Unavailable")}</dd>
              </div>
              <div>
                <dt>Latest block</dt>
                <dd>{rpc.latestBlock ?? "Unavailable"}</dd>
              </div>
              {rpc.observedAt ? (
                <div>
                  <dt>Observed at</dt>
                  <dd>{rpc.observedAt}</dd>
                </div>
              ) : null}
            </>
          )}
        </dl>
        {model.mode === "live" && rpc.message ? <p role="status" className="lt">{rpc.message}</p> : null}
        {model.mode === "live" && w.connection?.address ? (
          <p role="status" className="lt">
            {model.network.walletMismatch
              ? `Wallet is on ${w.connection.networkName ?? `chain ${w.connection.chainId}`}; the app reads ${activeNetwork?.label ?? "the selected network"}. The wallet network was not changed.`
              : `Wallet and app networks match. The wallet network was not changed.`}
          </p>
        ) : null}
      </Panel>
      <Panel
        title={model.mode === "live" ? "Read-only status" : `Set up your ${PROJECT_NAME} account`}
        aside={
          model.mode === "live"
            ? <Chip tone="unk" material="dotted">Account setup disabled</Chip>
            : <Chip tone={complete ? "neutral" : "unk"} material={complete ? "outline" : "dotted"}>{w.setupDone} of 4 done</Chip>
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
              <b>{brandizeProjectName(ACCOUNT_CONTROL_LEAD, PROJECT_NAME)}</b>{" "}
              {brandizeProjectName(ACCOUNT_CONTROL, PROJECT_NAME)}
            </p>
            <p>{brandizeProjectName(ACCOUNT_CONTROL_RULE, PROJECT_NAME)}</p>
        </div>
      </Panel>
    </section>
  );
}
