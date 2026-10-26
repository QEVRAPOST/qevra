"use client";

import Link from "next/link";
import { Check, ChevronDown, Copy, ExternalLink, FileText } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CopyAddressButton } from "@/components/dashboard/CopyAddressButton";
import { Button, buttonVariants } from "@/components/ui/Button";
import { copyTextToClipboard } from "@/features/wallet/clipboard";
import { getRobinhoodMainnetInfrastructure, getRobinhoodNetworkStatus, NetworkStatusClientError } from "@/features/wallet/network-client";
import type { RobinhoodContractBytecodeStatus, RobinhoodMainnetInfrastructureSnapshot } from "@/features/wallet/public-rpc";
import { getExplorerAddressUrl, getExplorerTransactionUrl } from "@/lib/config/networks";
import { ROBINHOOD_MAINNET_TOKENS, ZEROX_ALLOWANCE_HOLDER, ZEROX_SETTLER_REGISTRY } from "@/lib/config/robinhood-mainnet-contracts";
import { PublicAddressInspector } from "@/components/dashboard/PublicAddressInspector";
import {
  getVerifiedVeyraDeployments,
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
const TESTNET_DEPLOYMENT_COPY = "These contracts are deployed on Robinhood Testnet. Product integration and security readiness are tracked separately. Deployment does not imply Mainnet availability or security approval.";

function compactAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export type MainnetInfrastructureReadState =
  | { status: "not_requested" }
  | { status: "loading" }
  | { status: "available"; snapshot: RobinhoodMainnetInfrastructureSnapshot }
  | { status: "unavailable"; message: string };

type MainnetInfrastructureResult = Exclude<MainnetInfrastructureReadState, { status: "not_requested" }>;

type InfrastructureRow = {
  key: "allowanceHolder" | "settlerRegistry" | "currentSettler" | "weth" | "usdg";
  name: string;
  address: string | null;
  bytecode?: RobinhoodContractBytecodeStatus;
  note?: string;
};

function infrastructureBytecodeLabel(status: RobinhoodContractBytecodeStatus | undefined, selectedNetwork: NetworkId, state: MainnetInfrastructureReadState): string {
  if (selectedNetwork !== "mainnet") return "Bytecode not checked";
  if (state.status === "loading") return "Checking bytecode…";
  if (state.status === "unavailable") return "Bytecode unavailable";
  if (state.status !== "available" || status === undefined) return "Bytecode not checked";
  if (status === "present") return "Bytecode present";
  if (status === "absent") return "Bytecode absent";
  return "Bytecode unavailable";
}

export function MainnetExternalInfrastructurePanel({
  selectedNetwork,
  state,
  onRefresh,
}: {
  selectedNetwork: NetworkId;
  state: MainnetInfrastructureReadState;
  onRefresh: () => void;
}) {
  const snapshot = state.status === "available" ? state.snapshot : undefined;
  const currentSettler = snapshot?.contracts.currentSettler;
  const registryBytecode = snapshot?.contracts.settlerRegistry.bytecode;
  const currentSettlerNote = currentSettler?.status === "not_assigned"
    ? "No current Settler address was returned by the registry at this block."
    : selectedNetwork !== "mainnet"
      ? "Select Robinhood Mainnet to read the configured registry."
      : state.status === "loading"
        ? "Reading the current Settler from token ID 2 in the registry."
        : state.status === "unavailable" || currentSettler?.status === "unavailable"
          ? registryBytecode === "absent"
            ? "Registry bytecode is absent at the observed block; the Settler address could not be read."
            : registryBytecode === "unavailable"
              ? "Registry bytecode could not be checked; the Settler address could not be read."
              : "The Settler Registry did not return an address for token ID 2."
          : undefined;
  const rows: InfrastructureRow[] = [
    { key: "allowanceHolder", name: "0x AllowanceHolder", address: ZEROX_ALLOWANCE_HOLDER, bytecode: snapshot?.contracts.allowanceHolder.bytecode, note: "Configured external allowance target." },
    { key: "settlerRegistry", name: "Settler Registry", address: ZEROX_SETTLER_REGISTRY, bytecode: snapshot?.contracts.settlerRegistry.bytecode, note: "Configured 0x Settler registry." },
    { key: "currentSettler", name: "Current Settler", address: currentSettler?.address ?? null, bytecode: currentSettler?.bytecode, note: currentSettlerNote },
    { key: "weth", name: "WETH", address: ROBINHOOD_MAINNET_TOKENS.WETH.address, bytecode: snapshot?.contracts.weth.bytecode, note: "Configured wrapped native token." },
    { key: "usdg", name: "USDG", address: ROBINHOOD_MAINNET_TOKENS.USDG.address, bytecode: snapshot?.contracts.usdg.bytecode, note: "Configured Mainnet stablecoin." },
  ];
  const actionLabel = selectedNetwork !== "mainnet"
    ? "Select Mainnet to read bytecode"
    : state.status === "loading" ? "Checking Mainnet bytecode…"
      : state.status === "unavailable" ? "Retry Mainnet read"
        : state.status === "available" ? "Refresh Mainnet read"
          : "Read Mainnet infrastructure";

  return (
    <section className="ne-section ne-infrastructure" aria-labelledby="h-ne-infrastructure">
      <header className="ne-section-head">
        <div className="ne-section-title">
          <p className="ne-section-index">ROBINHOOD MAINNET · EXTERNAL INFRASTRUCTURE</p>
          <h2 id="h-ne-infrastructure" className="ov-h">External Infrastructure</h2>
        </div>
        <p className="ne-separation">Configured third-party contracts on Robinhood Mainnet · chain ID 4663. This section is separate from VEYRA-owned deployments.</p>
      </header>

      {state.status === "unavailable" ? <p className="ne-error" role="status">{state.message}</p> : null}
      {selectedNetwork !== "mainnet" ? <p className="ne-separation">Select Robinhood Mainnet to read configured contract bytecode.</p> : null}
      {snapshot ? <p className="ne-infrastructure-observation">Observed at Mainnet block {snapshot.latestBlock} · {snapshot.observedAt}</p> : null}

      <div className="ne-contract-table-wrap ne-infrastructure-table-wrap">
        <table className="ne-contract-table ne-infrastructure-table" aria-label="External Robinhood Mainnet infrastructure contracts">
        <caption className="sr">Configured external Mainnet contracts, compact addresses, read-only bytecode status, and explorer actions.</caption>
          <thead>
                    <tr><th scope="col">Contract</th><th scope="col">Mainnet address</th><th scope="col">Bytecode status</th><th scope="col">Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const explorerUrl = row.address ? getExplorerAddressUrl("mainnet", row.address) : undefined;
              return (
                <tr className="ne-contract" key={row.key}>
                  <th scope="row" className="ne-contract-name" data-label="Contract">
                    <span className="ne-contract-title"><strong>{row.name}</strong><small>{row.note}</small></span>
                  </th>
                  <td className="ne-address-cell" data-label="Mainnet address">
                    {row.address && explorerUrl
                      ? <a className="ne-address-link" href={explorerUrl} target="_blank" rel="noopener noreferrer" title={row.address} aria-label={`View ${row.name} address ${row.address} on Robinhood Mainnet explorer`}><code><span className="ne-address-full">{row.address}</span><span className="ne-address-compact" aria-hidden="true">{compactAddress(row.address)}</span></code></a>
                      : <span className="ne-no-address">{row.note ?? "Unavailable from the registry read."}</span>}
                  </td>
                  <td className="ne-infrastructure-code-status" data-label="Bytecode status">
                    <span>{infrastructureBytecodeLabel(row.bytecode, selectedNetwork, state)}</span>
                    {row.key === "currentSettler" && currentSettler?.status !== "available" && state.status === "available"
                      ? <small>{currentSettlerNote ?? "Current Settler address unavailable."}</small>
                      : null}
                  </td>
                  <td className="ne-contract-actions" data-label="Actions">
                    <div className="ne-infrastructure-actions">
                      {row.address ? <RegistryCopyAction address={row.address} /> : <span className="ne-no-actions">—</span>}
                      {explorerUrl ? <RegistryLinkAction href={explorerUrl} label="Open explorer"><ExternalLink aria-hidden="true" /></RegistryLinkAction> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="ne-infrastructure-disclaimer">Bytecode presence does not verify Solidity source or establish a security audit. Source verification: not checked. Security audit: not assessed.</p>
      <div className="ne-section-actions">
        <Button type="button" variant="ghost" size="small" disabled={selectedNetwork !== "mainnet" || state.status === "loading"} onClick={onRefresh}>{actionLabel}</Button>
        <p className="ne-readonly">Public RPC reads only. No wallet permission, signing, or contract calls that change state.</p>
      </div>
    </section>
  );
}

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
  label: "Open explorer" | "View deployment evidence";
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
  const sourceStatus = !deployment
    ? "NOT APPLICABLE"
    : deployment.sourceVerification === "verified"
      ? "VERIFIED"
      : deployment.sourceVerification === "not_verified"
        ? "NOT VERIFIED"
        : "NOT REPORTED";
  const readiness = slot?.readiness?.toLowerCase();
  const productUseLabel = standalone
    ? "NOT APPLICABLE"
    : deployment && readiness === "restricted_testnet"
      ? "RESTRICTED"
      : deployment && (readiness === "active" || readiness === "ready")
        ? "ENABLED"
        : deployment
          ? "NOT ENABLED"
          : readiness === "blocked" || readiness === "hard_no_go"
            ? "SECURITY BLOCKED"
            : "NOT ENABLED";
  const summary = reason ?? deployment?.purpose ?? "No readiness reason provided by the manifest.";
  const networkLabel = networkId === "testnet" ? "Robinhood Testnet" : "Robinhood Mainnet";

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
                <code><span className="ne-address-full">{deployment.address}</span><span className="ne-address-compact" aria-hidden="true">{compactAddress(deployment.address)}</span></code>
            </a>
            ) : <code><span className="ne-address-full">{deployment.address}</span><span className="ne-address-compact" aria-hidden="true">{compactAddress(deployment.address)}</span></code> : <span className="ne-no-address" aria-label="No verified deployed address">—</span>}
        </td>
        <td className="ne-contract-actions" data-label="Actions">
          {deployment ? (
            <>
              <RegistryCopyAction address={deployment.address} />
              {addressUrl ? <RegistryLinkAction href={addressUrl} label="Open explorer"><ExternalLink aria-hidden="true" /></RegistryLinkAction> : null}
              {transactionUrl ? <RegistryLinkAction href={transactionUrl} label="View deployment evidence"><FileText aria-hidden="true" /></RegistryLinkAction> : null}
            </>
          ) : <span className="ne-no-actions" aria-label="No deployment actions">—</span>}
        </td>
      </tr>
      <tr className="ne-detail-row" id={detailsId} hidden={!expanded}>
        <td colSpan={4}>
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
            <div><dt>Product use</dt><dd>{productUseLabel}</dd></div>
            <div><dt>Manifest readiness</dt><dd>{slot?.readiness ? <code>{slot.readiness}</code> : "Not reported"}</dd></div>
            {deployment?.runtimeBytecodeHash ? <div><dt>Runtime bytecode hash</dt><dd><code>{deployment.runtimeBytecodeHash}</code></dd></div> : null}
            {deployment?.purpose ? <div className="ne-detail-purpose"><dt>Contract purpose</dt><dd>{deployment.purpose}</dd></div> : null}
            {reason ? <div className="ne-detail-purpose"><dt>Manifest readiness reason</dt><dd>{reason}</dd></div> : null}
            <div className="ne-detail-restrictions">
              <dt>Operational restrictions</dt>
              <dd>{standalone
                ? "Standalone research utility; excluded from architecture progress. Registry actions are read-only."
                : deployment && productUseLabel === "NOT ENABLED"
                  ? "Live product operations are disabled. See the recorded manifest readiness and reason above for security status. Registry actions are read-only."
                  : deployment && productUseLabel === "RESTRICTED"
                    ? "This Testnet deployment retains the restricted permissions and purpose recorded above. Registry actions are read-only."
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
        <caption className="sr">Deployment records. Expand a row for product-use status, full manifest readiness, evidence, and security limitations.</caption>
        <thead>
          <tr>
            <th scope="col">Contract</th>
            <th scope="col">Deployment</th>
            <th scope="col">Contract Address</th>
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
  const [mainnetInfrastructureResult, setMainnetInfrastructureResult] = useState<{ requestKey: number; state: MainnetInfrastructureResult } | null>(null);
  const [mainnetInfrastructureRetry, setMainnetInfrastructureRetry] = useState(0);
  const mainnetInfrastructure: MainnetInfrastructureReadState = model.network.selected !== "mainnet"
    ? { status: "not_requested" }
    : mainnetInfrastructureResult?.requestKey === mainnetInfrastructureRetry
      ? mainnetInfrastructureResult.state
      : { status: "loading" };
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
    return { network, standalone, futureResearchSlots, mvpSlots, deployedMvpSlots, undeployedMvpSlots };
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
  const walletBalance = wallet?.status === "connected" && !model.network.walletMismatch ? wallet.balance : undefined;
  const walletChainNetwork = wallet?.chainId === undefined
    ? undefined
    : model.network.options.find((network) => network.chainId === wallet.chainId);
  const walletExplorerUrl = wallet?.address && walletChainNetwork
    ? getExplorerAddressUrl(walletChainNetwork.id, wallet.address)
    : undefined;

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

  useEffect(() => {
    if (model.network.selected !== "mainnet") return;
    let active = true;
    const requestKey = mainnetInfrastructureRetry;
    void getRobinhoodMainnetInfrastructure().then((snapshot) => {
      if (active) setMainnetInfrastructureResult({ requestKey, state: { status: "available", snapshot } });
    }).catch((error: unknown) => {
      if (!active) return;
      setMainnetInfrastructureResult({
        requestKey,
        state: {
          status: "unavailable",
          message: error instanceof NetworkStatusClientError ? error.message : "The public Robinhood Mainnet RPC could not be reached.",
        },
      });
    });
    return () => { active = false; };
  }, [model.network.selected, mainnetInfrastructureRetry]);

  const rpc = model.mode === "live"
    ? model.network.rpc
    : previewRpc.networkId === model.network.selected && previewRpc.attempt === previewRetry
      ? previewRpc.state
      : { status: "loading" as const };
  const refreshPublicRpc = () => {
    if (model.mode === "live") actions.refreshNetwork?.();
    else setPreviewRetry((current) => current + 1);
  };
  const refreshMainnetInfrastructure = () => {
    if (model.network.selected === "mainnet") setMainnetInfrastructureRetry((current) => current + 1);
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
                  onClick={() => {
                    actions.setNetwork(network.id);
                    if (network.id === "mainnet") setMainnetInfrastructureRetry((current) => current + 1);
                  }}
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
                <div className="ne-wallet-address-fact">
                  <dt>Connected external wallet address</dt>
                  <dd className="ne-wallet-account">
                    <code>{wallet.address}</code>
                    <span className="ne-wallet-account-actions">
                      <CopyAddressButton address={wallet.address} label="Copy Address" />
                      {walletExplorerUrl ? <a className={buttonVariants({ variant: "ghost", size: "small" })} href={walletExplorerUrl} target="_blank" rel="noopener noreferrer">Open wallet in Explorer</a> : null}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Wallet native balance</dt>
                  <dd>
                    {model.network.walletMismatch
                      ? "Not shown · network mismatch"
                      : wallet.status === "loading"
                        ? "Reading wallet RPC…"
                        : walletBalance
                          ? `${walletBalance.amount} ETH`
                          : "Unavailable"}
                  </dd>
                </div>
                {walletBalance ? (
                  <div><dt>Wallet balance source</dt><dd>{walletBalance.provider} · block {walletBalance.blockNumber}</dd></div>
                ) : null}
              </>
            ) : null}
            {rpc.observedAt ? <div><dt>Observed at</dt><dd><time dateTime={rpc.observedAt}>{rpc.observedAt}</time></dd></div> : null}
            <div><dt>Native token</dt><dd>ETH</dd></div>
          </dl>

          {wallet?.address && model.network.walletMismatch ? (
            <p className="ne-warning" role="status">
              {wallet.providerName ?? "Your wallet"} is on {walletNetwork} (chain ID {wallet.chainId ?? "unavailable"}). Manually select {selected?.label ?? "the selected network"} (chain ID {selected?.chainId ?? "unknown"}) in your wallet to match. No balance is shown while this mismatch remains. VEYRA will not switch it.
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
            {deploymentGroups.map(({ network, standalone, futureResearchSlots, mvpSlots, deployedMvpSlots, undeployedMvpSlots }) => {
              const progress = Math.min(deployedMvpSlots.length, MVP_ARCHITECTURE_SLOT_COUNT);
              const networkName = network.id === "testnet" ? "Testnet" : "Mainnet";
              const primaryMvpSlots = network.id === "mainnet" ? mvpSlots : deployedMvpSlots;
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
                  {primaryMvpSlots.length > 0 ? (
                    <DeploymentTable
                      rows={primaryMvpSlots.map(({ slot, deployment }) => ({ slot, deployment }))}
                      label={`${networkName} MVP architecture deployments`}
                    />
                  ) : (
                    <p className="ne-registry-network-empty">
                      {`No deployed ${PROJECT_NAME} MVP contracts on ${network.label}.`}
                    </p>
                  )}
                  {deployedMvpSlots.length > 0 && network.id === "testnet" ? (
                    <p className="ne-registry-network-note">
                      {TESTNET_DEPLOYMENT_COPY}
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
                  {undeployedMvpSlots.length > 0 && network.id !== "mainnet" ? (
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

        <MainnetExternalInfrastructurePanel
          selectedNetwork={model.network.selected}
          state={mainnetInfrastructure}
          onRefresh={refreshMainnetInfrastructure}
        />
      </div>
    </section>
  );
}
