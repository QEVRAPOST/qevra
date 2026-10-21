"use client";

import { useState } from "react";
import { AddressGlyph } from "@/components/ui/AddressGlyph";
import { Button, buttonVariants } from "@/components/ui/Button";
import { SimTag } from "@/components/ui/SimTag";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { CopyAddressButton } from "./CopyAddressButton";
import { NETWORKS, getExplorerAddressUrl } from "@/lib/config/networks";
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

const CAN = ["See this public address", "See its public balance when networks match", "Read the network the app is on"];
const CANNOT = ["Sign anything", "Send or approve spending", "Switch your wallet’s network", "Hold or move funds"];

/** 0x1a2b…c3d4: enough to recognise an address, never the whole of it in a headline. */
function middle(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/**
 * The wallet route's opening: an identity, not a form. A ring pattern drawn from the address, the address with its middle folded away, the
 * network and whether it matches the app, the public balance, and what this connection can and cannot do. When nothing is connected the same
 * layout is an invitation, with the read-only boundary already visible. It is read-only: there is no signing here, and no way to switch the
 * wallet's network.
 */
export function WalletBand() {
  const { model, actions } = useAppModel();
  const live = model.mode === "live";
  const w = model.wallet;
  const conn = w.connection;
  const status: ReadOnlyWalletStatus = live ? (conn?.status ?? "disconnected") : w.stage === 0 ? "disconnected" : "connected";
  const info = STATES[status];
  const connected = live ? !!conn?.address : w.stage > 0;
  const [showFullAddress, setShowFullAddress] = useState(false);
  const walletReadFailed = live && status === "rpc_unavailable";
  const walletRefreshing = live && status === "loading" && conn?.message?.startsWith("Refreshing");
  const canRecoverWallet = walletReadFailed || walletRefreshing;
  const net = model.network.options.find((n) => n.id === model.network.selected);
  const address = live ? conn?.address : connected ? "simulated" : undefined;
  const shown = live ? (address ? middle(address) : "") : "0xSIMU…LATED";
  const busy = status === "loading";
  const mismatch = live && model.network.walletMismatch;
  const balance = live && !mismatch ? conn?.balance : undefined;
  const exBalance = !live && w.eoa.assets[0] ? w.eoa.assets[0] : null;
  const walletNet = live ? (conn?.networkName ?? `Chain ${conn?.chainId ?? "unknown"}`) : (net?.label ?? "Unavailable");
  const walletNetwork = live ? NETWORKS.find((network) => network.chainId === conn?.chainId) : undefined;
  const addressExplorerUrl = address && walletNetwork ? getExplorerAddressUrl(walletNetwork.id, address) : undefined;

  return (
    <section className={`wl-band${connected || canRecoverWallet ? " on" : ""}`} aria-labelledby="h-wl-band">
      <h2 id="h-wl-band" className="sr">Connection</h2>
      <div className="wl-id">
        <AddressGlyph address={address} live={connected} />
      </div>

      <div className="wl-main">
        <p className="wl-state">
          <StatusMaterial material={connected ? "outline" : "dotted"} />
          {live ? (walletRefreshing ? "Refreshing wallet" : info.label) : connected ? "Connected · simulated wallet" : "No wallet connected"}
          {!live && connected ? <SimTag /> : null}
        </p>

        {connected ? (
          <>
            <div className="wl-addr-row">
              <p className="wl-address" title={live ? address : undefined}>{showFullAddress ? address : shown}</p>
              {live && address ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    className="wl-copy"
                    aria-expanded={showFullAddress}
                    onClick={() => setShowFullAddress((visible) => !visible)}
                  >
                    {showFullAddress ? "Shorten address" : "Show full address"}
                  </Button>
                  <CopyAddressButton address={address} />
                  {addressExplorerUrl ? <a className={`${buttonVariants({ variant: "ghost", size: "small" })} wl-copy`} href={addressExplorerUrl} target="_blank" rel="noopener noreferrer">Open in Explorer</a> : null}
                </>
              ) : null}
            </div>
            <p className={`wl-net${mismatch ? " warn" : ""}`}>
              <span className="wl-pip" aria-hidden="true" />
              {walletNet}
              {live && conn?.chainId !== undefined ? <span className="wl-chain">chain {conn.chainId}</span> : null}
              <span className="wl-match">{live ? (mismatch
                ? `Differs from ${net?.label ?? "the selected network"} (chain ID ${net?.chainId ?? "unknown"}). In your wallet, manually select ${net?.label ?? "the selected network"} (chain ID ${net?.chainId ?? "unknown"}) to match. VEYRA will not switch networks.`
                : "Matches the network the app reads") : "Simulated: nothing is read"}</span>
            </p>
            <div className="wl-bal">
              <span className="wl-bal-n">{balance ? balance.amount : exBalance ? exBalance.amount : "Not available"}</span>
              {balance || exBalance ? <span className="wl-bal-s">{balance ? balance.symbol : exBalance?.symbol}</span> : null}
              <span className="wl-bal-m">
                {balance ? `Public balance · read at block ${balance.blockNumber}, a snapshot` : live ? "Shown only after a successful read" : "Simulated value"}
                {balance?.observedAt ? <> · Last successful read <time dateTime={balance.observedAt}>{balance.observedAt}</time></> : null}
              </span>
            </div>
          </>
        ) : walletReadFailed ? (
          <>
            <h2 className="wl-h">The wallet read did not finish.</h2>
            <p className="wl-sub">Address and balance stay hidden until a fresh, consistent read succeeds.</p>
          </>
        ) : walletRefreshing ? (
          <>
            <h2 className="wl-h">Refreshing wallet details.</h2>
            <p className="wl-sub">Reading the current account, network and public balance. No wallet permission prompt is being requested.</p>
          </>
        ) : (
          <>
            <h2 className="wl-h">Look at a wallet without handing it over.</h2>
            <p className="wl-sub">Connect to see an address, its network and its public balance. What that allows is listed with it, and that is all there is.</p>
          </>
        )}

        <p className="wl-help" role="status">
          {live && conn?.message ? `${conn.message} ` : ""}
          {live ? walletRefreshing
            ? "This read does not request account permission or change the wallet network."
            : mismatch
              ? "The native balance is hidden until the wallet chain and selected app network match."
              : info.help
            : ""}
        </p>

        <div className="wl-act">
          {connected || canRecoverWallet ? (
            live ? (
              <>
                {actions.refreshWallet ? (
                  <Button variant="ghost" onClick={actions.refreshWallet} disabled={walletRefreshing}>
                    {walletRefreshing ? "Refreshing wallet…" : walletReadFailed ? "Retry wallet read" : "Refresh balance"}
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => actions.pressLedgerAction("disconnect")}>
                  Disconnect
                </Button>
              </>
            ) : null
          ) : (
            <button type="button" className="cta-connect" disabled={busy} onClick={() => actions.pressLedgerAction("connect")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <rect x="3" y="6" width="18" height="13" rx="2" />
                <path d="M3 10h18M16 14.5h2" />
              </svg>
              <span>{busy ? "Waiting for your wallet…" : live ? "Connect wallet" : "Connect a simulated wallet"}</span>
              <small>read-only</small>
              <svg className="cta-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <aside className="wl-perm" aria-label="What this connection can and cannot do">
        <div>
          <h3>{connected || canRecoverWallet ? "This connection can" : "Connecting lets the app"}</h3>
          <ul className="can">
            {CAN.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>It cannot</h3>
          <ul className="cannot">
            {CANNOT.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </aside>
    </section>
  );
}
