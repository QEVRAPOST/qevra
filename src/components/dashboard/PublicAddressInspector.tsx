"use client";

import { useRef, useState, type FormEvent } from "react";
import { formatEther, isAddress } from "viem";
import { CopyAddressButton } from "@/components/dashboard/CopyAddressButton";
import { Button } from "@/components/ui/Button";
import { getRobinhoodPublicAddress, NetworkStatusClientError } from "@/features/wallet/network-client";
import type { RobinhoodPublicAddressSnapshot } from "@/features/wallet/public-rpc";
import { NETWORKS, getExplorerAddressUrl } from "@/lib/config/networks";
import type { NetworkId } from "@/types/network";

type InspectionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "available"; snapshot: RobinhoodPublicAddressSnapshot }
  | { status: "error"; message: string };

const FALLBACK_ERROR = "The public Robinhood RPC could not be reached.";

export function PublicAddressInspector() {
  const [networkId, setNetworkId] = useState<NetworkId>("testnet");
  const [address, setAddress] = useState("");
  const [inspection, setInspection] = useState<InspectionState>({ status: "idle" });
  const requestId = useRef(0);

  function clearInspection() {
    requestId.current += 1;
    setInspection({ status: "idle" });
  }

  function changeNetwork(nextNetworkId: NetworkId) {
    setNetworkId(nextNetworkId);
    clearInspection();
  }

  function changeAddress(nextAddress: string) {
    setAddress(nextAddress);
    clearInspection();
  }

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAddress(address)) {
      setInspection({ status: "error", message: "Enter a valid EVM address to inspect." });
      return;
    }

    const currentRequest = ++requestId.current;
    setInspection({ status: "loading" });
    try {
      const snapshot = await getRobinhoodPublicAddress(networkId, address);
      if (requestId.current === currentRequest) setInspection({ status: "available", snapshot });
    } catch (error) {
      if (requestId.current !== currentRequest) return;
      setInspection({
        status: "error",
        message: error instanceof NetworkStatusClientError ? error.message : FALLBACK_ERROR,
      });
    }
  }

  const snapshot = inspection.status === "available" ? inspection.snapshot : undefined;
  const explorerUrl = snapshot ? getExplorerAddressUrl(snapshot.networkId, snapshot.address) : undefined;

  return (
    <section className="ne-inspector" aria-labelledby="h-public-address-inspector">
      <header className="ne-section-head">
        <div className="ne-section-title">
          <p className="ne-section-index">02 · WATCH-ONLY ADDRESS</p>
          <h2 id="h-public-address-inspector" className="ov-h">Inspect Public Address</h2>
        </div>
        <p className="ne-separation">Public chain data only. No wallet connection or account permission is used.</p>
      </header>

      <div role="group" aria-label="Select inspection network" className="ne-picker-actions">
        {NETWORKS.filter((network) => network.available).map((network) => (
          <Button
            key={network.id}
            type="button"
            size="small"
            variant={network.id === networkId ? "primary" : "ghost"}
            aria-pressed={network.id === networkId}
            onClick={() => changeNetwork(network.id)}
          >
            {network.short} · {network.chainId}
          </Button>
        ))}
      </div>

      <form className="ne-address-form" onSubmit={(event) => { void inspect(event); }}>
        <label htmlFor="public-address" className="ne-address-label">Public EVM address</label>
        <input
          id="public-address"
          name="public-address"
          className="ne-address-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="0x…"
          value={address}
          onChange={(event) => changeAddress(event.currentTarget.value)}
          aria-describedby="public-address-help"
        />
        <p id="public-address-help" className="ne-separation">Reads use the selected network’s public RPC. Inspected addresses stay separate from connected accounts.</p>
        <Button type="submit" variant="ghost" size="small" disabled={inspection.status === "loading"}>
          {inspection.status === "loading"
            ? "Reading public address…"
            : snapshot ? "Refresh public balance" : "Inspect address"}
        </Button>
      </form>

      {inspection.status === "error" ? <p className="ne-error" role="alert">{inspection.message}</p> : null}
      {inspection.status === "loading" ? <p className="ne-address-loading" role="status">Reading the latest native balance from the selected Robinhood RPC…</p> : null}
      {inspection.status === "idle" ? <p className="ne-address-empty">Enter a public EVM address to view its balance and network details.</p> : null}

      {snapshot ? (
        <div className="ne-address-result" aria-live="polite">
          <p className="ne-address-badge">Watch-only address</p>
          <div className="ne-balance-readout">
            <span>Native balance</span>
            <strong>{formatEther(BigInt(snapshot.balanceWei))} ETH</strong>
            <small>{NETWORKS.find((network) => network.id === snapshot.networkId)?.label} · chain ID {snapshot.chainId}</small>
          </div>
          <dl className="kv">
            <div><dt>Inspected address</dt><dd><code>{snapshot.address}</code></dd></div>
            <div><dt>Selected read network</dt><dd>{NETWORKS.find((network) => network.id === snapshot.networkId)?.label}</dd></div>
            <div><dt>RPC chain ID</dt><dd>{snapshot.chainId}</dd></div>
            <div><dt>Observed block</dt><dd>{snapshot.observedBlock}</dd></div>
            <div><dt>Read status</dt><dd>Available · balance requested at latest</dd></div>
            <div><dt>Observed at</dt><dd><time dateTime={snapshot.observedAt}>{snapshot.observedAt}</time></dd></div>
          </dl>
          <div className="ne-actions">
            <CopyAddressButton address={snapshot.address} label="Copy Address" />
            {explorerUrl ? <a className="wl-copy" href={explorerUrl} target="_blank" rel="noopener noreferrer">Open in Explorer</a> : null}
          </div>
          <p className="ne-readonly">This address is watch-only. It is not a connected wallet or a verified VEYRA deployment.</p>
        </div>
      ) : null}
    </section>
  );
}
