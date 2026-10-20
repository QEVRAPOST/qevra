"use client";

import { Button } from "@/components/ui/Button";
import { DemoChip } from "@/components/ui/Chip";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import type { Material, ReadOnlyWalletStatus } from "@/types";
import { useAppModel } from "./DemoAppProvider";

/** What each wallet state means for the visitor, and what they can do about it. The wallet's own words are never replaced. */
const STATES: Record<ReadOnlyWalletStatus, { label: string; material: Material; help: string }> = {
  disconnected: { label: "Not connected", material: "dotted", help: "Connecting is optional and only when you press the button. It reads your public address and balance. It never signs or sends." },
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
 * The first thing on the wallet route: is a wallet connected, which network is it on, and what is its public balance.
 * One primary action, always the one that fits. It is read-only: there is no signing here, and no way to switch the wallet's network.
 */
export function WalletBand() {
  const { model, actions } = useAppModel();
  const live = model.mode === "live";
  const w = model.wallet;
  const conn = w.connection;
  const status: ReadOnlyWalletStatus = live ? (conn?.status ?? "disconnected") : w.stage === 0 ? "disconnected" : "connected";
  const info = STATES[status];
  const connected = status === "connected" || (status === "unsupported_network" && !!conn?.address) || (live && !!conn?.address);
  const net = model.network.options.find((n) => n.id === model.network.selected);
  const address = live ? conn?.address : w.eoa.address?.label;
  const balance = live ? conn?.balance : undefined;
  const busy = status === "loading";

  return (
    <section className="wl-band" aria-labelledby="h-wl-band">
      <h2 id="h-wl-band" className="ov-h">Connection</h2>
      <div className="wl-grid">
        <div className="wl-cell">
          <span className="ov-k">Status</span>
          <b className="wl-v">
            <StatusMaterial material={live ? info.material : connected ? "outline" : "dotted"} />
            {live ? info.label : connected ? "Connected · example wallet" : "Not connected · example"}
          </b>
          <span className="wl-addr">
            {address ? short(address) : "No address"}
            {!live && address ? <DemoChip>EXAMPLE</DemoChip> : null}
          </span>
        </div>
        <div className="wl-cell">
          <span className="ov-k">Network</span>
          <b className="wl-v">{live && conn?.address ? (conn.networkName ?? `Chain ${conn.chainId ?? "unknown"}`) : (net?.label ?? "Unavailable")}</b>
          <span className="wl-sub">
            {live
              ? conn?.address
                ? model.network.walletMismatch
                  ? `Differs from the network the app reads (${net?.short ?? "selected"}). Your wallet was not changed.`
                  : "Matches the network the app reads."
                : `The app reads ${net?.label ?? "the selected network"} when you connect.`
              : "Example mode reads no chain."}
          </span>
        </div>
        <div className="wl-cell">
          <span className="ov-k">Public balance</span>
          <b className="wl-v">{balance ? `${balance.amount} ${balance.symbol}` : live ? "Not available" : w.eoa.assets[0] ? `${w.eoa.assets[0].amount} ${w.eoa.assets[0].symbol}` : "Not available"}</b>
          <span className="wl-sub">{balance ? `Read at block ${balance.blockNumber}. A snapshot, not a live feed.` : live ? "Shown only after a successful read." : w.eoa.assets[0] ? "Example value." : "Connect to see one."}</span>
        </div>
        <div className="wl-act">
          {connected ? (
            live ? (
              <Button variant="ghost" onClick={() => actions.pressLedgerAction("disconnect")}>
                Disconnect
              </Button>
            ) : null
          ) : (
            <Button variant="primary" onClick={() => actions.pressLedgerAction("connect")} disabled={busy}>
              {busy ? "Waiting…" : live ? "Connect wallet, read-only" : "Connect example wallet"}
            </Button>
          )}
        </div>
      </div>
      <p className="wl-help" role="status">
        {live && conn?.message ? `${conn.message} ` : ""}
        {info.help}
      </p>
    </section>
  );
}
