"use client";

import { useRef, useState, type FormEvent } from "react";
import { formatEther, isAddress } from "viem";
import { CopyAddressButton } from "@/components/dashboard/CopyAddressButton";
import { Button, buttonVariants } from "@/components/ui/Button";
import { getRobinhoodPublicAddress, NetworkStatusClientError } from "@/features/wallet/network-client";
import type { RobinhoodPublicAddressSnapshot } from "@/features/wallet/public-rpc";
import { DEFAULT_NETWORK_ID, NETWORKS, getExplorerAddressUrl } from "@/lib/config/networks";
import type { NetworkId } from "@/types/network";

export type PublicAddressInspectionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "available"; snapshot: RobinhoodPublicAddressSnapshot }
  | { status: "error"; message: string };

const FALLBACK_ERROR = "The public Robinhood RPC could not be reached.";

export function publicAddressActionLabel(state: PublicAddressInspectionState): string {
  if (state.status === "loading") return "Reading public address…";
  return state.status === "available" ? "Refresh public balance" : "Inspect Address";
}

export function PublicAddressInspectionMessage({ state }: { state: Exclude<PublicAddressInspectionState, { status: "available" }> }) {
  if (state.status === "error") return <p className="ne-error" role="alert">{state.message}</p>;
  if (state.status === "loading") return <p className="ne-address-loading" role="status">Reading the latest native balance from the selected Robinhood RPC…</p>;
  return <p className="ne-address-empty">Enter a public EVM address to view its balance and network details.</p>;
}

export function PublicAddressActionButton({ state }: { state: PublicAddressInspectionState }) {
  return (
    <Button type="submit" variant="ghost" size="small" disabled={state.status === "loading"}>
      {publicAddressActionLabel(state)}
    </Button>
  );
}

export function PublicAddressResult({ snapshot }: { snapshot: RobinhoodPublicAddressSnapshot }) {
  const network = NETWORKS.find((item) => item.id === snapshot.networkId);
  const explorerUrl = getExplorerAddressUrl(snapshot.networkId, snapshot.address);

  return (
    <div className="ne-address-result" aria-live="polite">
      <p className="ne-address-badge">Watch-only address</p>
      <div className="ne-balance-readout">
        <span>Native balance</span>
        <strong>{formatEther(BigInt(snapshot.balanceWei))} ETH</strong>
        <small>{network?.label} · chain ID {snapshot.chainId}</small>
      </div>
      <dl className="kv">
        <div><dt>Inspected address</dt><dd><code>{snapshot.address}</code></dd></div>
        <div><dt>Selected read network</dt><dd>{network?.label}</dd></div>
        <div><dt>RPC chain ID</dt><dd>{snapshot.chainId}</dd></div>
        <div><dt>Observed block</dt><dd>{snapshot.observedBlock}</dd></div>
        <div><dt>Read status</dt><dd>Available · balance requested at latest</dd></div>
        <div><dt>Observed at</dt><dd><time dateTime={snapshot.observedAt}>{snapshot.observedAt}</time></dd></div>
      </dl>
      <div className="ne-actions">
        <CopyAddressButton address={snapshot.address} label="Copy Address" />
        {explorerUrl ? <a className={buttonVariants({ variant: "ghost", size: "small" })} href={explorerUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open inspected address on ${network?.label ?? "selected network"} explorer`}>Open in Explorer</a> : null}
      </div>
      <p className="ne-readonly">This address is watch-only. It is not a connected wallet or a verified VEYRA deployment.</p>
    </div>
  );
}

export function PublicAddressInspector() {
  const [networkId, setNetworkId] = useState<NetworkId>(DEFAULT_NETWORK_ID);
  const [address, setAddress] = useState("");
  const [inspection, setInspection] = useState<PublicAddressInspectionState>({ status: "idle" });
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

  return (
    <section className="ne-inspector" aria-labelledby="h-public-address-inspector">
      <header className="ne-section-head">
        <div className="ne-section-title">
          <p className="ne-section-index">02 · WATCH-ONLY ADDRESS</p>
          <h2 id="h-public-address-inspector" className="ov-h">Inspect Public Address</h2>
        </div>
        <p className="ne-separation">Public chain data only. This inspection network is independent of VEYRA&apos;s selected application network. No wallet connection or account permission is used.</p>
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
        <p id="public-address-help" className="ne-separation">Choose the chain, enter an EVM address, then inspect to read native ETH balance and the observed block. Reads use that network’s public RPC and do not request wallet access.</p>
        <PublicAddressActionButton state={inspection} />
      </form>

      {inspection.status === "available"
        ? <PublicAddressResult snapshot={inspection.snapshot} />
        : <PublicAddressInspectionMessage state={inspection} />}
    </section>
  );
}
