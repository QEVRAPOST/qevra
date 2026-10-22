"use client";

import Link from "next/link";
import { Check, ChevronDown, Copy, ExternalLink, FileText } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/Button";
import { copyTextToClipboard } from "@/features/wallet/clipboard";
import { getRobinhoodNetworkStatus, NetworkStatusClientError } from "@/features/wallet/network-client";
import { getExplorerAddressUrl, getExplorerTransactionUrl } from "@/lib/config/networks";
import { PublicAddressInspector } from "@/components/dashboard/PublicAddressInspector";
import {
  getVerifiedVeyraDeployments,
  isSwapExecutionInactiveSlot,
  type VerifiedVeyraDeploymentEvidence,
  type VerifiedVeyraDeployment,
  type VerifiedVeyraStandaloneDeployment,
} from "@/lib/config/veyra-deployments";
import type { VeyraArchitectureSlotDefinition } from "@/lib/config/veyra-deployment-manifest";
import { PROJECT_NAME } from "@/lib/project-brand";
import type { NetworkId, NetworkRpcState } from "@/types/network";
import { useAppModel } from "./DemoAppProvider";
import { PageHead } from "./PageHead";

const MVP_ARCHITECTURE_SLOT_RANGE = { first: 6, last: 10 } as const;
const MVP_ARCHITECTURE_SLOT_COUNT = MVP_ARCHITECTURE_SLOT_RANGE.last - MVP_ARCHITECTURE_SLOT_RANGE.first + 1;

function RegistryCopyAction({ address }: { address: string }) {
  const tooltipId = useId();
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => () => {
    if (timeout.current) clearTimeout(timeout.current);
  }, []);

  const copy = async () => {
    if (timeout.current) clearTimeout(timeout.current);
    const copied = await copyTextToClipboard(address);
    setResult(copied ? "copied" : "failed");
    timeout.current = setTimeout(() => setResult("idle"), 1800);
  };
  const tooltip = result === "copied" ? "Address copied" : result === "failed" ? "Copy unavailable" : "Copy address";

  return (
    <button
      className="ne-icon-action"
      type="button"
      aria-label="Copy address"
      aria-describedby={tooltipId}
      data-tooltip={tooltip}
      title={tooltip}
      onClick={() => void copy()}
    >
      {result === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span className="sr" id={tooltipId} role="tooltip">{tooltip}</span>
      <span className="sr" role="status" aria-live="polite">
        {result === "copied" ? "Address copied to clipboard." : result === "failed" ? "Address could not be copied." : ""}
      </span>
    </button>
  );
}

function RegistryLinkAction({
  href,
  label,
  children,
}: {
  href: string;
  label: "View contract" | "View transaction";
  children: ReactNode;
}) {
  const tooltipId = useId();
  return (
    <a
      className="ne-icon-action"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      aria-describedby={tooltipId}
      data-tooltip={label}
      title={label}
    >
      {children}
      <span className="sr" id={tooltipId} role="tooltip">{label}</span>
    </a>
  );
}

type NetworkArchitectureSlot = VeyraArchitectureSlotDefinition & { networkId: NetworkId };

function DeploymentTableRow({
  deployment,
  slot,
  standalone = false,
}: {
  deployment?: VerifiedVeyraDeploymentEvidence;
  slot?: NetworkArchitectureSlot;
  standalone?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const networkId = slot?.networkId ?? deployment?.networkId ?? "testnet";
  const name = slot?.solidityName ?? deployment?.name ?? "Unknown contract";
  const reason = slot?.reason;
  const addressUrl = deployment ? getExplorerAddressUrl(networkId, deployment.address) : undefined;
  const transactionUrl = deployment ? getExplorerTransactionUrl(networkId, deployment.transactionHash) : undefined;
  const swapInactive = Boolean(deployment && slot && isSwapExecutionInactiveSlot(slot.slot));
  const sourceStatus = !deployment
    ? "NOT APPLICABLE"
    : deployment.sourceVerification === "verified"
      ? "VERIFIED"
      : deployment.sourceVerification === "not_verified"
        ? "NOT VERIFIED"
        : "NOT REPORTED";
  const readiness = slot?.readiness?.toLowerCase();
  const operationalStatus = standalone
    ? "NOT APPLICABLE"
    : swapInactive
      ? "INACTIVE"
      : deployment && (readiness === "active" || readiness === "ready")
        ? "ACTIVE"
        : readiness === "blocked" || readiness === "hard_no_go"
          ? "SECURITY BLOCKED"
          : "INACTIVE";
  const summary = reason ?? deployment?.purpose ?? "No readiness reason provided by the manifest.";
  const networkLabel = networkId === "testnet" ? "Robinhood Testnet" : "Robinhood Mainnet";
  const operationalClass = operationalStatus === "ACTIVE"
    ? "active"
    : operationalStatus === "SECURITY BLOCKED"
      ? "blocked"
      : operationalStatus === "INACTIVE"
        ? "inactive"
        : "na";

  return (
    <>
      <tr className="ne-contract">
        <th className="ne-contract-name" scope="row" data-label="Contract">
          <button
            className="ne-row-expand"
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={`${expanded ? "Hide" : "Show"} details for ${name}`}
            onClick={() => setExpanded((current) => !current)}
          >
            <ChevronDown aria-hidden="true" className="ne-row-chevron" />
            <span className="ne-contract-title">
              <strong>{name}</strong>
              <small>{summary}</small>
            </span>
          </button>
        </th>
        <td className={`ne-status-cell ne-deployment-status ${deployment ? "ne-status-deployed" : "ne-status-not-deployed"}`} data-label="Deployment">
          <span>{deployment ? "DEPLOYED" : "NOT DEPLOYED"}</span>
        </td>
        <td className="ne-address-cell" data-label="Contract Address">
            {deployment ? addressUrl ? (
            <a className="ne-address-link" href={addressUrl} target="_blank" rel="noopener noreferrer" title={deployment.address} aria-label={`View deployed address ${deployment.address} on ${networkLabel}`}>
                <code>{deployment.address}</code>
            </a>
            ) : <code>{deployment.address}</code> : <span className="ne-no-address" aria-label="No verified deployed address">—</span>}
        </td>
        <td className={`ne-status-cell ne-operational-status ne-status-${operationalClass}`} data-label="Readiness">
          <span>{operationalStatus}</span>
        </td>
        <td className="ne-contract-actions" data-label="Actions">
          {deployment ? (
            <>
              <RegistryCopyAction address={deployment.address} />
              {addressUrl ? <RegistryLinkAction href={addressUrl} label="View contract"><ExternalLink aria-hidden="true" /></RegistryLinkAction> : null}
              {transactionUrl ? <RegistryLinkAction href={transactionUrl} label="View transaction"><FileText aria-hidden="true" /></RegistryLinkAction> : null}
            </>
          ) : <span className="ne-no-actions" aria-label="No deployment actions">—</span>}
        </td>
      </tr>
      <tr className="ne-detail-row" id={detailsId} hidden={!expanded}>
        <td colSpan={5}>
          <dl className="ne-contract-details">
            <div><dt>On-chain deployment</dt><dd>{deployment ? "On-chain deployment confirmed" : "No verified deployment record"}</dd></div>
            {deployment && addressUrl ? <div><dt>Full contract address</dt><dd><a className="ne-evidence-link" href={addressUrl} target="_blank" rel="noopener noreferrer"><code>{deployment.address}</code></a></dd></div> : null}
            {deployment && transactionUrl ? <div><dt>Full transaction hash</dt><dd><a className="ne-evidence-link" href={transactionUrl} target="_blank" rel="noopener noreferrer"><code>{deployment.transactionHash}</code></a></dd></div> : null}
            {deployment ? <div><dt>Deployer address</dt><dd><code>{deployment.deployerAddress}</code></dd></div> : null}
            {deployment ? <div><dt>Block number</dt><dd><code>{deployment.blockNumber}</code></dd></div> : null}
            <div><dt>Manifest deployment verification</dt><dd>{deployment ? "Verified on-chain record" : "Not applicable"}</dd></div>
            <div>
              <dt>Source verification</dt>
              <dd>
                {sourceStatus}
                {deployment?.sourceVerification === "not_verified" ? (
                  <small>Source verification unavailable; no independent source verification is recorded.</small>
                ) : null}
              </dd>
            </div>
            <div><dt>Operational readiness</dt><dd>{operationalStatus}</dd></div>
            {deployment?.runtimeBytecodeHash ? <div><dt>Runtime bytecode hash</dt><dd><code>{deployment.runtimeBytecodeHash}</code></dd></div> : null}
            {deployment?.purpose ? <div className="ne-detail-purpose"><dt>Contract purpose</dt><dd>{deployment.purpose}</dd></div> : null}
            {reason ? <div className="ne-detail-purpose"><dt>Manifest readiness reason</dt><dd>{reason}</dd></div> : null}
            <div className="ne-detail-restrictions">
              <dt>Operational restrictions</dt>
              <dd>{standalone
                ? "Standalone research utility; excluded from architecture progress. Registry actions are read-only."
                : deployment && operationalStatus === "INACTIVE"
                  ? "Deployment is confirmed, but this contract is not enabled for real swaps or asset authorization. Registry actions are read-only."
                  : deployment
                    ? "Deployment evidence is separate from operational readiness. The registry does not initiate contract actions."
                    : "This contract has not been deployed. Deployment and related execution remain disabled until the manifest blocker is resolved."}</dd>
            </div>
          </dl>
        </td>
      </tr>
    </>
  );
}

function DeploymentTable({
  rows,
  label,
}: {
  rows: readonly { deployment?: VerifiedVeyraDeploymentEvidence; slot?: NetworkArchitectureSlot; standalone?: boolean }[];
  label: string;
}) {
  return (
    <div className="ne-contract-table-wrap">
      <table className="ne-contract-table" aria-label={label}>
        <caption className="sr">Deployment, source verification, and operational readiness. Expand a row for full manifest details.</caption>
        <thead>
          <tr>
            <th scope="col">Contract</th>
            <th scope="col">Deployment</th>
            <th scope="col">Contract Address</th>
            <th scope="col">Readiness</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ deployment, slot, standalone }, index) => (
            <DeploymentTableRow
              key={`${slot?.networkId ?? deployment?.networkId ?? "network"}:${slot?.slot ?? deployment?.address ?? index}`}
              deployment={deployment}
              slot={slot}
              standalone={standalone}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NetworksView({
  deploymentRecords,
  standaloneResearchEvidenceAnchors = [],
  architectureSlots = [],
}: {
  deploymentRecords?: readonly VerifiedVeyraDeployment[];
  standaloneResearchEvidenceAnchors?: readonly VerifiedVeyraStandaloneDeployment[];
  architectureSlots?: readonly NetworkArchitectureSlot[];
}) {
  const { model, actions } = useAppModel();
  const [previewRpc, setPreviewRpc] = useState<{ networkId: NetworkId; attempt: number; state: NetworkRpcState }>({
    networkId: "testnet",
    attempt: 0,
    state: { status: "loading" },
  });
  const [previewRetry, setPreviewRetry] = useState(0);
  const selected = model.network.options.find((network) => network.id === model.network.selected);
  const deploymentNetworks = model.network.options.filter((network) => network.available);
  const deploymentGroups = deploymentNetworks.filter((network) => network.id === model.network.selected).map((network) => {
    const verified = getVerifiedVeyraDeployments(network.id, deploymentRecords ?? []);
    const standalone = standaloneResearchEvidenceAnchors.filter((record) => record.networkId === network.id);
    const slots = architectureSlots
      .filter((slot) => slot.networkId === network.id)
      .sort((left, right) => left.slot - right.slot)
      .slice(0, 10)
      .map((slot) => ({ slot, deployment: verified.find((record) => record.architectureSlot === slot.slot) }));
    const futureResearchSlots = slots.filter(({ slot }) => slot.slot < MVP_ARCHITECTURE_SLOT_RANGE.first);
    const mvpSlots = slots.filter(({ slot }) => slot.slot >= MVP_ARCHITECTURE_SLOT_RANGE.first && slot.slot <= MVP_ARCHITECTURE_SLOT_RANGE.last);
    const deployedMvpSlots = mvpSlots.filter(({ deployment }) => Boolean(deployment));
    const undeployedMvpSlots = mvpSlots.filter(({ deployment }) => !deployment);
    return { network, standalone, futureResearchSlots, deployedMvpSlots, undeployedMvpSlots };
  });
  const hasVerifiedMvpDeployments = deploymentGroups.some((group) => group.deployedMvpSlots.length > 0);
  const hasStandaloneDeployments = deploymentGroups.some((group) => group.standalone.length > 0);
  const hasArchitectureSlots = deploymentGroups.some((group) =>
    group.futureResearchSlots.length + group.deployedMvpSlots.length + group.undeployedMvpSlots.length > 0,
  );
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
            <p className="ne-registry-caption">Follows the network selected above · manifest-verified on-chain records only · wallet addresses are excluded</p>
          </header>
          {!hasVerifiedMvpDeployments && !hasStandaloneDeployments && !hasArchitectureSlots ? (
            <div className="ne-registry-empty">
              <strong>No verified {PROJECT_NAME} MVP deployments.</strong>
              <p>Phase 0B remains SECURITY NO-GO. Deployment and custody are disabled.</p>
            </div>
          ) : null}
          {!hasVerifiedMvpDeployments && hasStandaloneDeployments && !hasArchitectureSlots ? (
            <div className="ne-registry-empty">
              <strong>No verified MVP contracts.</strong>
              <p>The standalone research utility below is separate from the five-contract MVP. Phase 0B remains SECURITY NO-GO.</p>
            </div>
          ) : null}
          <div className="ne-registry-networks">
            {deploymentGroups.map(({ network, standalone, futureResearchSlots, deployedMvpSlots, undeployedMvpSlots }) => {
              const progress = Math.min(deployedMvpSlots.length, MVP_ARCHITECTURE_SLOT_COUNT);
              const networkName = network.id === "testnet" ? "Testnet" : "Mainnet";
              return (
                <section className="ne-registry-network" key={network.id} aria-labelledby={`h-ne-registry-${network.id}`}>
                  <header className="ne-registry-network-head">
                    <h3 id={`h-ne-registry-${network.id}`}>{networkName} MVP Deployments</h3>
                    <span>{network.label} · Chain ID {network.chainId}</span>
                    <span className="ne-registry-meter" aria-label={`${progress} of ${MVP_ARCHITECTURE_SLOT_COUNT} ${networkName} MVP contracts deployed based on verified on-chain records`}>
                      <strong>{progress}/{MVP_ARCHITECTURE_SLOT_COUNT}</strong> MVP contracts deployed
                    </span>
                    <p className="ne-registry-composition">
                      {progress} deployed · {futureResearchSlots.length} future security-research slots outside MVP scope
                      {undeployedMvpSlots.length > 0 ? ` · ${undeployedMvpSlots.length} MVP slots not deployed` : ""}
                    </p>
                  </header>
                  {deployedMvpSlots.length > 0 ? (
                    <DeploymentTable
                      rows={deployedMvpSlots.map(({ slot, deployment }) => ({ slot, deployment }))}
                      label={`${networkName} MVP architecture deployments`}
                    />
                  ) : (
                    <p className="ne-registry-network-empty">
                      {`No deployed ${PROJECT_NAME} MVP contracts on ${network.label}.`}
                    </p>
                  )}
                  {deployedMvpSlots.length > 0 ? (
                    <p className="ne-registry-network-note">
                      Inactive means deployment is confirmed, but contracts are not enabled for real swaps or asset authorization.
                    </p>
                  ) : null}
                  {futureResearchSlots.length > 0 ? (
                    <details className="ne-architecture-details">
                      <summary>
                        <span>Future Architecture / Security Research</span>
                        <small>Slots 1–5 · outside MVP scope</small>
                      </summary>
                      <DeploymentTable
                        rows={futureResearchSlots.map(({ slot, deployment }) => ({ slot, deployment }))}
                        label={`Future architecture / security research slots on ${network.label}`}
                      />
                    </details>
                  ) : null}
                  {undeployedMvpSlots.length > 0 ? (
                    <details className="ne-architecture-details">
                      <summary>
                        <span>MVP Contracts Not Deployed</span>
                        <small>{undeployedMvpSlots.length} slots · {networkName}</small>
                      </summary>
                      <DeploymentTable
                        rows={undeployedMvpSlots.map(({ slot, deployment }) => ({ slot, deployment }))}
                        label={`MVP architecture slots not deployed on ${network.label}`}
                      />
                    </details>
                  ) : null}
                  {standalone.length > 0 ? (
                    <section className="ne-standalone-registry" aria-label="Standalone research utilities">
                      <header>
                        <div>
                          <p className="ne-section-index">STANDALONE RESEARCH UTILITY</p>
                          <h4>Evidence Anchor</h4>
                        </div>
                        <p>Excluded from the five-contract MVP progress.</p>
                      </header>
                      <DeploymentTable
                        rows={standalone.map((deployment) => ({ deployment, standalone: true }))}
                        label={`Standalone research utility deployments on ${network.label}`}
                      />
                    </section>
                  ) : null}
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
