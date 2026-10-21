"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CopyAddressButton } from "@/components/dashboard/CopyAddressButton";
import { Button, buttonVariants } from "@/components/ui/Button";
import { getRobinhoodNetworkStatus, NetworkStatusClientError } from "@/features/wallet/network-client";
import { getExplorerAddressUrl, getExplorerTransactionUrl } from "@/lib/config/networks";
import { PublicAddressInspector } from "@/components/dashboard/PublicAddressInspector";
import { getVerifiedVeyraDeployments, type VerifiedVeyraDeployment } from "@/lib/config/veyra-deployments";
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
  const deploymentNetworks = model.network.options.filter((network) => network.available);
  const deploymentGroups = deploymentNetworks.map((network) => {
    const verified = getVerifiedVeyraDeployments(network.id, deploymentRecords ?? []);
    return { network, total: verified.length, deployments: verified.slice(0, 10) };
  });
  const hasVerifiedDeployments = deploymentGroups.some((group) => group.total > 0);
  const wallet = model.mode === "live" ? model.wallet.connection : undefined;
  const walletConnection = model.mode !== "live"
    ? "Preview only"
    : wallet?.status === "loading"
      ? wallet.message?.startsWith("Refreshing") ? "Refreshing wallet" : "Connecting"
      : wallet?.address
        ? model.network.walletMismatch
          ? "Connected · network mismatch"
          : wallet.status === "connected" ? "Connected · read-only" : "Connected · read unavailable"
        : wallet?.status === "disconnected" || !wallet
          ? "Not connected"
          : wallet.status.replaceAll("_", " ");
  const walletNetwork = wallet?.networkName === "Unsupported network"
    ? "Unknown / unsupported (name unavailable from this wallet read)"
    : wallet?.networkName ?? "Unavailable";

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
        lede="Read Robinhood Chain status, inspect public addresses without connecting a wallet, and review verified VEYRA deployment records. Public reads do not require Security Swarm sign-in."
      />

      <div className="ne-links">
        <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/app/wallet">Return to wallet</Link>
        <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/app/protocol">View status</Link>
      </div>

      <div className="ne-sections">
        <section className="ne-section" aria-labelledby="h-ne-network">
          <header className="ne-section-head">
            <div className="ne-section-title">
              <p className="ne-section-index">01 · NETWORK STATUS</p>
              <h2 id="h-ne-network" className="ov-h">Public network status</h2>
            </div>
            <div role="group" aria-label="Select public network" className="ne-picker-actions ne-network-picker">
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
          </header>

          <dl className="kv ne-status-facts">
            <div><dt>Selected network</dt><dd>{selected?.label ?? "Unavailable"}</dd></div>
            <div><dt>Expected chain ID</dt><dd>{selected?.chainId ?? "Unavailable"}</dd></div>
            <div><dt>Observed chain ID</dt><dd>{rpc.chainId ?? (rpc.status === "loading" || rpc.status === "not_requested" ? "Checking" : "Unavailable")}</dd></div>
            <div><dt>RPC connectivity</dt><dd>{rpc.status === "available" ? "Available" : rpc.status === "loading" || rpc.status === "not_requested" ? "Checking" : "Unavailable"}</dd></div>
            <div><dt>Latest block</dt><dd>{rpc.latestBlock ?? (rpc.status === "loading" || rpc.status === "not_requested" ? "Checking" : "Unavailable")}</dd></div>
            <div><dt>Wallet connection</dt><dd>{walletConnection}</dd></div>
            {wallet?.address ? (
              <>
                <div><dt>Wallet provider</dt><dd>{wallet.providerName ?? "Injected EIP-1193 wallet provider"}</dd></div>
                <div><dt>Wallet network</dt><dd>{walletNetwork}</dd></div>
                <div><dt>Wallet chain ID</dt><dd>{wallet.chainId ?? "Unavailable"}</dd></div>
                <div><dt>Wallet/app network</dt><dd>{model.network.walletMismatch ? "Mismatch" : "Match"}</dd></div>
              </>
            ) : null}
            {rpc.observedAt ? <div><dt>Observed at</dt><dd><time dateTime={rpc.observedAt}>{rpc.observedAt}</time></dd></div> : null}
            <div><dt>Native token</dt><dd>ETH</dd></div>
          </dl>

          {wallet?.address && model.network.walletMismatch ? (
            <p className="ne-warning" role="status">
              {wallet.providerName ?? "Your wallet"} is on {walletNetwork} (chain ID {wallet.chainId ?? "unavailable"}). Manually select {selected?.label ?? "the selected network"} (chain ID {selected?.chainId ?? "unknown"}) in your wallet to match. VEYRA will not switch it.
            </p>
          ) : null}
          {rpc.message ? <p className="ne-error" role="status">{rpc.message}</p> : null}

          <div className="ne-section-actions">
            <Button type="button" variant="ghost" size="small" onClick={refreshPublicRpc} disabled={rpc.status === "loading"}>
              {rpc.status === "unavailable" ? "Retry public RPC" : rpc.status === "loading" ? "Reading public RPC…" : "Refresh public RPC"}
            </Button>
            {selected ? <a className={buttonVariants({ variant: "ghost", size: "small" })} href={selected.explorerUrl} target="_blank" rel="noopener noreferrer">Open {selected.short} explorer</a> : null}
            <p className="ne-readonly">Public data only. No wallet permission, signing, or network changes.</p>
          </div>
        </section>

        <PublicAddressInspector />

        <section className="ne-section ne-registry" aria-labelledby="h-ne-contracts">
          <header className="ne-section-head ne-registry-head">
            <div className="ne-section-title">
              <p className="ne-section-index">03 · CONTRACT REGISTRY</p>
              <h2 id="h-ne-contracts" className="ov-h">{PROJECT_NAME} deployments</h2>
            </div>
            <p className="ne-registry-caption">Verified deployments only · connected and watch-only addresses are excluded</p>
          </header>
          {!hasVerifiedDeployments ? (
            <div className="ne-registry-empty">
              <strong>No verified {PROJECT_NAME} deployments.</strong>
              <p>Phase 0B remains SECURITY NO-GO. Deployment and custody are disabled.</p>
            </div>
          ) : null}
          <div className="ne-registry-networks">
            {deploymentGroups.map(({ network, total, deployments }) => {
              const progress = Math.min(total, 10);
              return (
                <section className="ne-registry-network" key={network.id} aria-labelledby={`h-ne-registry-${network.id}`}>
                  <header className="ne-registry-network-head">
                    <h3 id={`h-ne-registry-${network.id}`}>{network.label}</h3>
                    <span>Chain ID {network.chainId}</span>
                    <span className="ne-registry-meter" aria-label={`${progress} of 10 verified deployment slots used`}>
                      <strong>{progress}/10</strong> verified
                    </span>
                  </header>
                  {deployments.length > 0 ? (
                    <ul className="ne-contracts">
                      {deployments.map((deployment) => {
                        const addressUrl = getExplorerAddressUrl(deployment.networkId, deployment.address);
                        const transactionUrl = getExplorerTransactionUrl(deployment.networkId, deployment.transactionHash);
                        return (
                          <li key={`${deployment.networkId}:${deployment.address}`} className="ne-contract">
                            <h4>{deployment.name}</h4>
                            <p className="ne-contract-purpose">{deployment.purpose ?? "Purpose not provided in the deployment manifest."}</p>
                            <dl className="kv">
                              <div><dt>Verified deployed address</dt><dd><code>{deployment.address}</code></dd></div>
                              <div><dt>Deployment status</dt><dd>Verified deployment</dd></div>
                              <div><dt>Deployer</dt><dd><code>{deployment.deployerAddress}</code></dd></div>
                              <div><dt>Transaction hash</dt><dd><code>{deployment.transactionHash}</code></dd></div>
                              <div><dt>Block number</dt><dd><code>{deployment.blockNumber}</code></dd></div>
                              <div><dt>Source verification</dt><dd>{deployment.sourceVerification === "verified" ? "Source verified" : "Not independently verified"}</dd></div>
                            </dl>
                            <div className="ne-actions">
                              <CopyAddressButton address={deployment.address} />
                              {addressUrl ? <a className={buttonVariants({ variant: "ghost", size: "small" })} href={addressUrl} target="_blank" rel="noopener noreferrer">Open in Explorer</a> : null}
                              {transactionUrl ? <a className={buttonVariants({ variant: "ghost", size: "small" })} href={transactionUrl} target="_blank" rel="noopener noreferrer">View deployment transaction</a> : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="ne-registry-network-empty">No verified {PROJECT_NAME} deployments on {network.label}.</p>
                  )}
                  {total > deployments.length ? <p className="ne-registry-network-note">Showing the first {deployments.length} of {total} verified deployments on this network.</p> : null}
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
