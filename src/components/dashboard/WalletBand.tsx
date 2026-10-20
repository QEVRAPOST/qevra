"use client";

import { Button } from "@/components/ui/Button";
import { SimTag } from "@/components/ui/SimTag";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import type { Material, ReadOnlyWalletStatus } from "@/types";
import { useAppModel } from "./DemoAppProvider";

/** What each wallet state means for the visitor. The wallet's own words are never replaced. */
const STATES: Record<ReadOnlyWalletStatus, { label: string; material: Material; help: string }> = {
  disconnected: { label: "No wallet connected", material: "dotted", help: "Connecting is optional and happens only when you press the button." },
  loading: { label: "Waiting for your wallet", material: "outline", help: "Your wallet is asking you to approve read access. Nothing is shared until you do." },
  connected: { label: "Connected · read-only", material: "outline", help: "The app can read this account’s public data. It cannot sign, send, or change your wallet’s network." },
  unsupported_network: { label: "Unsupported network", material: "dotted", help: "Your wallet is on a network this app does not read. The wallet was not changed; switch it yourself if you want to see a balance." },
  wallet_not_installed: { label: "No wallet found", material: "dotted", help: "No browser wallet answered. Install one, then connect again." },
  connection_rejected: { label: "Request declined", material: "dotted", help: "You declined the request, so nothing was shared. You can try again." },
  rpc_unavailable: { label: "RPC unavailable", material: "dotted", help: "The wallet is connected but the balance could not be read. No value is shown in its place." },
  invalid_rpc_response: { label: "Unexpected reply", material: "dotted", help: "The RPC answered in a form the app does not trust, so no balance is shown." },
  provider_error: { label: "Wallet error", material: "dotted", help: "Your wallet reported an error. Nothing was shared or changed." },
};

function short(address: string): string {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

/**
 * The wallet route's opening: one ring that says whether a wallet is connected, and what it can see. When nothing is connected
 * this is a plain invitation with the read-only boundary in three short lines. It is read-only: there is no signing here, and no way
 * to switch the wallet's network.
 */
export function WalletBand() {
  const { model, actions } = useAppModel();
  const live = model.mode === "live";
  const w = model.wallet;
  const conn = w.connection;
  const status: ReadOnlyWalletStatus = live ? (conn?.status ?? "disconnected") : w.stage === 0 ? "disconnected" : "connected";
  const info = STATES[status];
  const connected = live ? !!conn?.address : w.stage > 0;
  const net = model.network.options.find((n) => n.id === model.network.selected);
  const address = live ? conn?.address : w.eoa.address?.label;
  const balance = live ? conn?.balance : undefined;
  const busy = status === "loading";
  const exBalance = !live && w.eoa.assets[0] ? `${w.eoa.assets[0].amount} ${w.eoa.assets[0].symbol}` : null;

  return (
    <section className={`wl-band${connected ? " on" : ""}`} aria-labelledby="h-wl-band">
      <h2 id="h-wl-band" className="sr">Connection</h2>
      <div className="wl-orb" aria-hidden="true">
        <span className="wl-r3" />
        <span className="wl-r2" />
        <span className="wl-r1">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <rect x="3" y="6" width="18" height="13" rx="2" />
            <path d="M3 10h18M16 14.5h2" />
          </svg>
        </span>
      </div>
      <div className="wl-body">
        <p className="wl-state">
          <StatusMaterial material={connected ? "outline" : "dotted"} />
          {live ? info.label : connected ? "Connected · simulated wallet" : "No wallet connected"}
          {!live && connected ? <SimTag /> : null}
        </p>
        {connected ? (
          <>
            <p className="wl-address">{address ? short(address) : "No address"}</p>
            <dl className="wl-facts">
              <div>
                <dt>Network</dt>
                <dd>{live ? (conn?.networkName ?? `Chain ${conn?.chainId ?? "unknown"}`) : (net?.label ?? "Unavailable")}</dd>
                <small>
                  {live
                    ? model.network.walletMismatch
                      ? `Differs from the network the app reads (${net?.short ?? "selected"}). Your wallet was not changed.`
                      : "Matches the network the app reads."
                    : "Simulated: nothing is read."}
                </small>
              </div>
              <div>
                <dt>Public balance</dt>
                <dd>{balance ? `${balance.amount} ${balance.symbol}` : (exBalance ?? "Not available")}</dd>
                <small>{balance ? `Read at block ${balance.blockNumber}. A snapshot, not a live feed.` : live ? "Shown only after a successful read." : "Simulated value."}</small>
              </div>
            </dl>
          </>
        ) : (
          <>
            <h2 className="wl-h">Look at a wallet without handing it over.</h2>
            <ul className="wl-rules">
              <li>Reads the public address and balance you choose to show.</li>
              <li>Never signs, sends or switches your network.</li>
              <li>Disconnect any time.</li>
            </ul>
          </>
        )}
        <p className="wl-help" role="status">
          {live && conn?.message ? `${conn.message} ` : ""}
          {connected ? (live ? info.help : "") : live ? info.help : ""}
        </p>
        <div className="wl-act">
          {connected ? (
            live ? (
              <>
                {actions.refreshWallet ? (
                  <Button variant="ghost" onClick={actions.refreshWallet}>
                    Refresh balance
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => actions.pressLedgerAction("disconnect")}>
                  Disconnect
                </Button>
              </>
            ) : null
          ) : (
            <Button variant="primary" onClick={() => actions.pressLedgerAction("connect")} disabled={busy}>
              {busy ? "Waiting…" : live ? "Connect wallet, read-only" : "Connect a simulated wallet"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
