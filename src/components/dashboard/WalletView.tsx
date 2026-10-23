"use client";

import Link from "next/link";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { ACCOUNT_CONTROL, ACCOUNT_CONTROL_LEAD, ACCOUNT_CONTROL_RULE } from "@/lib/content/copy-lock";
import { brandizeProjectName, PROJECT_NAME } from "@/lib/project-brand";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";
import { WalletBand } from "./WalletBand";
import { BuiltInWalletPanel } from "./BuiltInWalletPanel";
import { buttonVariants } from "@/components/ui/Button";

/**
 * Wallet: your external wallet, read-only, first. The experimental account is shown after it, as research and not as a task:
 * nothing here can create it, fund it or move anything.
 */
export function WalletView() {
  const { model } = useAppModel();
  const live = model.mode === "live";
  const w = model.wallet;
  const rpc = model.network.rpc;
  const net = model.network.options.find((n) => n.id === model.network.selected);
  const connection = w.connection;
  const connected = live ? !!w.connection?.address : w.stage > 0;

  return (
    <section className="route wl" aria-labelledby="h-wallet">
      <PageHead
        id="h-wallet"
        kicker="Wallet · account and external reads"
        title="Wallet overview"
        lede={brandizeProjectName("Your VEYRA Account and an external EVM wallet are separate. Account sign-in does not require MetaMask; connecting an external wallet is optional and read-only here.", PROJECT_NAME)}
      />
      <BuiltInWalletPanel networkId={model.network.selected} enabled={live} />

      <section className="wl-external" aria-labelledby="h-external-wallet">
        <h2 id="h-external-wallet" className="ov-h">External wallet · read-only</h2>
        <WalletBand />
      </section>

      <div className="wl-two">
        <section aria-labelledby="h-wl-net">
          <h2 id="h-wl-net" className="ov-h">Network the app reads</h2>
          <dl className="kv">
            <div><dt>Selected network</dt><dd>{net?.label ?? "Unavailable"}</dd></div>
            <div><dt>Expected chain ID</dt><dd>{net?.chainId ?? "Unavailable"}</dd></div>
            {live ? (
              <>
                {connection?.address ? (
                  <>
                    <div><dt>Wallet provider</dt><dd>{connection.providerName ?? "Injected EIP-1193 wallet provider"}</dd></div>
                    <div><dt>Wallet network</dt><dd>{connection.networkName === "Unsupported network" ? "Unknown / unsupported (network name unavailable from this wallet read)" : connection.networkName ?? "Unavailable"}</dd></div>
                    <div><dt>Wallet chain ID</dt><dd>{connection.chainId ?? "Unavailable"}</dd></div>
                  </>
                ) : null}
                <div><dt>Public RPC chain ID</dt><dd>{rpc.chainId ?? (rpc.status === "loading" ? "Checking" : "Unavailable")}</dd></div>
                <div><dt>Latest block</dt><dd>{rpc.latestBlock ?? "Unavailable"}</dd></div>
                {rpc.observedAt ? <div><dt>Observed at</dt><dd>{rpc.observedAt}</dd></div> : null}
                {!model.network.walletMismatch && connection?.balance ? <div><dt>Wallet read block</dt><dd>{connection.balance.blockNumber}</dd></div> : null}
                {!model.network.walletMismatch && connection?.balance?.observedAt ? <div><dt>Last successful wallet read</dt><dd><time dateTime={connection.balance.observedAt}>{connection.balance.observedAt}</time></dd></div> : null}
              </>
            ) : (
              <div><dt>Public RPC</dt><dd>Not queried in the preview</dd></div>
            )}
          </dl>
          {live && rpc.message ? <p role="status" className="sw-hint">{rpc.message}</p> : null}
          <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/app/networks">Network &amp; contracts explorer</Link>
          {connected && w.eoa.facts.length > 0 ? (
            <details className="sw-about">
              <summary>More about this wallet read</summary>
              <dl className="kv">
                {w.eoa.facts.map((f) => (
                  <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>
                ))}
              </dl>
            </details>
          ) : null}
        </section>

        <section className="wl-exp" aria-labelledby="h-wl-exp">
          <h2 id="h-wl-exp" className="ov-h">Post-quantum wallet research · not provisioned</h2>
          <p className="wl-exp-lede">
            {brandizeProjectName("A separate smart account with post-quantum authorization is being researched. It is not built, holds nothing and cannot be created here.", PROJECT_NAME)}
          </p>
          <ul className="wl-ladder">
            <li><StatusMaterial material="dotted" /><b>Smart account</b><span>Not built</span></li>
            <li><StatusMaterial material="outline" /><b>ML-DSA authorization</b><span>Under evaluation</span></li>
            <li><StatusMaterial material="dotted" /><b>Key control and recovery</b><span>Not decided</span></li>
          </ul>
          <details className="sw-about">
            <summary>Why it is not offered yet</summary>
            <p>
              <b>{brandizeProjectName(ACCOUNT_CONTROL_LEAD, PROJECT_NAME)}</b> {brandizeProjectName(ACCOUNT_CONTROL, PROJECT_NAME)} {brandizeProjectName(ACCOUNT_CONTROL_RULE, PROJECT_NAME)}
            </p>
          </details>
          <Link className="ov-l" href="/app/protocol">
            See the full status<span aria-hidden="true">→</span>
          </Link>
        </section>
      </div>
    </section>
  );
}
