"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CopyAddressButton } from "@/components/dashboard/CopyAddressButton";
import { Button, buttonVariants } from "@/components/ui/Button";
import { getRobinhoodNetworkStatus, NetworkStatusClientError } from "@/features/wallet/network-client";
import { getExplorerAddressUrl } from "@/lib/config/networks";
import { getVerifiedVeyraDeployments, VEYRA_DEPLOYMENTS, type VerifiedVeyraDeployment } from "@/lib/config/veyra-deployments";
import { PROJECT_NAME } from "@/lib/project-brand";
import type { NetworkId, NetworkRpcState } from "@/types/network";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";

export function NetworksView({ deploymentRecords }: { deploymentRecords?: readonly VerifiedVeyraDeployment[] }) {
  const { model, actions } = useAppModel();
  const [previewRpc, setPreviewRpc] = useState<{ networkId: NetworkId; attempt: number; state: NetworkRpcState }>({
    networkId: "testnet",
    attempt: 0,
    state: { status: "loading" },
  });
  const [previewRetry, setPreviewRetry] = useState(0);
  const selected = model.network.options.find((network) => network.id === model.network.selected);
  const deployments = getVerifiedVeyraDeployments(model.network.selected, deploymentRecords ?? VEYRA_DEPLOYMENTS);

  useEffect(() => {
    if (model.mode !== "demo") return;
    let active = true;
    void getRobinhoodNetworkStatus(model.network.selected).then((snapshot) => {
      if (!active) return;
      setPreviewRpc({
        networkId: model.network.selected,
        attempt: previewRetry,
        state: {
          status: "available",
          chainId: snapshot.chainId,
          latestBlock: snapshot.latestBlock,
          observedAt: snapshot.observedAt,
        },
      });
    }).catch((error: unknown) => {
      if (!active) return;
      setPreviewRpc({
        networkId: model.network.selected,
        attempt: previewRetry,
        state: {
          status: "unavailable",
          ...(error instanceof NetworkStatusClientError ? { errorCode: error.code, message: error.message } : {
            errorCode: "rpc_unavailable",
            message: "The public Robinhood RPC could not be reached.",
          }),
        },
      });
    });
    return () => { active = false; };
  }, [model.mode, model.network.selected, previewRetry]);

  const rpc = model.mode === "live"
    ? model.network.rpc
    : previewRpc.networkId === model.network.selected && previewRpc.attempt === previewRetry
      ? previewRpc.state
      : { status: "loading" as const };
  const refreshPublicRpc = () => {
    if (model.mode === "live") actions.refreshNetwork?.();
    else setPreviewRetry((current) => current + 1);
  };

  return (
    <section className="route ne" aria-labelledby="h-networks">
      <PageHead
        id="h-networks"
        kicker="Networks · public reads"
        title="Networks and contracts"
        lede="Check the selected Robinhood Chain network against its public RPC, then inspect VEYRA deployment records kept separately from public wallet addresses. These views do not require Security Swarm sign-in."
      />

      <div className="ne-links">
        <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/app/wallet">Return to wallet</Link>
        <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/app/protocol">View status</Link>
      </div>

      <section className="ne-picker" aria-labelledby="h-ne-picker">
        <h2 id="h-ne-picker" className="ov-h">Select public network</h2>
        <div role="group" aria-label="Select public network" className="ne-picker-actions">
          {model.network.options.map((network) => (
            <Button
              key={network.id}
              type="button"
              variant={network.id === model.network.selected ? "primary" : "ghost"}
              aria-pressed={network.id === model.network.selected}
              disabled={!network.available}
              onClick={() => actions.setNetwork(network.id)}
            >
              {network.label} · {network.chainId}
            </Button>
          ))}
        </div>
      </section>

      <div className="ne-grid">
        <section className="ne-panel" aria-labelledby="h-ne-network">
          <h2 id="h-ne-network" className="ov-h">Public network status</h2>
          <dl className="kv">
            <div><dt>Network</dt><dd>{selected?.label ?? "Unavailable"}</dd></div>
            <div><dt>Configured chain ID</dt><dd>{selected?.chainId ?? "Unavailable"}</dd></div>
            <div><dt>RPC connectivity</dt><dd>{rpc.status === "available" ? "Available" : rpc.status === "loading" || rpc.status === "not_requested" ? "Checking" : "Unavailable"}</dd></div>
            <div><dt>Observed chain ID</dt><dd>{rpc.chainId ?? (rpc.status === "loading" || rpc.status === "not_requested" ? "Checking" : "Unavailable")}</dd></div>
            <div><dt>Latest block</dt><dd>{rpc.latestBlock ?? (rpc.status === "loading" || rpc.status === "not_requested" ? "Checking" : "Unavailable")}</dd></div>
            {rpc.observedAt ? <div><dt>Observed at</dt><dd><time dateTime={rpc.observedAt}>{rpc.observedAt}</time></dd></div> : null}
            <div><dt>Native token</dt><dd>ETH</dd></div>
            <div><dt>Block explorer</dt><dd>{selected ? <a href={selected.explorerUrl} target="_blank" rel="noopener noreferrer">Open {selected.short} explorer</a> : "Unavailable"}</dd></div>
          </dl>
          {rpc.message ? <p className="ne-error" role="status">{rpc.message}</p> : null}
          <Button type="button" variant="ghost" size="small" onClick={refreshPublicRpc} disabled={rpc.status === "loading"}>
            {rpc.status === "unavailable" ? "Retry public RPC" : rpc.status === "loading" ? "Reading public RPC…" : "Refresh public RPC"}
          </Button>
          <p className="ne-readonly">This view reads public chain data only. It does not connect to a wallet, sign, submit, or change a network.</p>
        </section>

        <section className="ne-panel" aria-labelledby="h-ne-contracts">
          <h2 id="h-ne-contracts" className="ov-h">{PROJECT_NAME} contract registry</h2>
          <p className="ne-separation">This registry is separate from connected public wallet addresses.</p>
          {deployments.length === 0 ? (
            <div className="empty ne-empty">
              <b>No verified {PROJECT_NAME} contract deployments on this network.</b>
              <p>Phase 0B remains SECURITY NO-GO. Research harnesses are not production custody contracts. Only approved deployment records validated for this chain appear here.</p>
            </div>
          ) : (
            <ul className="ne-contracts">
              {deployments.map((deployment) => {
                const addressUrl = getExplorerAddressUrl(deployment.networkId, deployment.address);
                return (
                  <li key={`${deployment.networkId}:${deployment.address}`} className="ne-contract">
                    <h3>{deployment.name}</h3>
                    <dl className="kv">
                      <div><dt>Network</dt><dd>{selected?.label}</dd></div>
                      <div><dt>Chain ID</dt><dd>{deployment.chainId}</dd></div>
                      <div><dt>Contract address</dt><dd><code>{deployment.address}</code></dd></div>
                      <div><dt>Deployment status</dt><dd>Verified deployment</dd></div>
                      {deployment.sourceVerification === "verified" ? <div><dt>Source status</dt><dd>Source verified</dd></div> : null}
                    </dl>
                    <div className="ne-actions">
                      <CopyAddressButton address={deployment.address} />
                      {addressUrl ? <a className="wl-copy" href={addressUrl} target="_blank" rel="noopener noreferrer">Open in Explorer</a> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
