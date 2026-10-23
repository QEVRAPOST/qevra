"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther } from "viem";
import { Button, buttonVariants } from "@/components/ui/Button";
import { CopyAddressButton } from "@/components/dashboard/CopyAddressButton";
import { getAuthCapabilities, getBuiltInWalletStatus, getCurrentAuthSession, provisionBuiltInWallet, AuthApiError } from "@/features/auth/client";
import type { BuiltInWalletStatus } from "@/features/auth/contracts";
import { NetworkStatusClientError, getRobinhoodPublicAddress } from "@/features/wallet/network-client";
import type { RobinhoodPublicAddressSnapshot } from "@/features/wallet/public-rpc";
import { getExplorerAddressUrl, NETWORKS } from "@/lib/config/networks";
import type { NetworkId } from "@/types/network";
import { StatusMaterial } from "@/components/ui/StatusMaterial";

type BuiltInWalletViewState =
  | { status: "checking" }
  | { status: "preview" }
  | { status: "signed_out" }
  | { status: "error"; message: string }
  | { status: "blocked"; wallet: Extract<BuiltInWalletStatus, { status: "blocked" }>; creationAvailable: boolean }
  | { status: "active"; wallet: Extract<BuiltInWalletStatus, { status: "active" }> };

type BalanceState = { status: "idle" }
  | { status: "loading"; networkId: NetworkId; address: string }
  | { status: "available"; snapshot: RobinhoodPublicAddressSnapshot }
  | { status: "error"; networkId: NetworkId; address: string; message: string };

function presentStatusError(error: unknown): string {
  if (error instanceof AuthApiError && error.status === 401) return "Your VEYRA Account session expired. Sign in again to view its wallet status.";
  if (error instanceof AuthApiError && (error.code.includes("persistence") || error.code.includes("unavailable"))) return "The wallet status service is temporarily unavailable. Try again shortly.";
  if (error instanceof Error && error.message) return error.message;
  return "The VEYRA Wallet status could not be checked.";
}

export function BuiltInWalletPanel({ networkId, enabled }: { networkId: NetworkId; enabled: boolean }) {
  const [state, setState] = useState<BuiltInWalletViewState>({ status: "checking" });
  const [balance, setBalance] = useState<BalanceState>({ status: "idle" });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [balanceRefreshVersion, setBalanceRefreshVersion] = useState(0);
  const [explicitConsent, setExplicitConsent] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string>();
  const statusRequest = useRef(0);
  const balanceRequest = useRef(0);

  const refreshStatus = useCallback(() => {
    setState({ status: "checking" });
    setProvisionError(undefined);
    setRefreshVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const requestId = ++statusRequest.current;
    let active = true;
    if (!enabled) return;
    void (async () => {
      try {
        const session = await getCurrentAuthSession();
        if (!session.authenticated || !session.identity) {
          if (active && statusRequest.current === requestId) setState({ status: "signed_out" });
          return;
        }
        const [capabilities, walletStatus] = await Promise.all([getAuthCapabilities(), getBuiltInWalletStatus()]);
        if (!active || statusRequest.current !== requestId) return;
        if (walletStatus.status === "active") setState({ status: "active", wallet: walletStatus });
        else setState({ status: "blocked", wallet: walletStatus, creationAvailable: capabilities.embeddedWallet });
      } catch (error) {
        if (active && statusRequest.current === requestId) setState({ status: "error", message: presentStatusError(error) });
      }
    })();
    return () => { active = false; };
  }, [enabled, refreshVersion]);

  useEffect(() => {
    const requestId = ++balanceRequest.current;
    if (state.status !== "active") return () => { balanceRequest.current += 1; };
    const address = state.wallet.wallet.address;
    void Promise.resolve().then(() => {
      if (balanceRequest.current !== requestId) return undefined;
      setBalance({ status: "loading", networkId, address });
      return getRobinhoodPublicAddress(networkId, address);
    }).then((snapshot) => {
      if (snapshot && balanceRequest.current === requestId) setBalance({ status: "available", snapshot });
    }).catch((error: unknown) => {
      if (balanceRequest.current !== requestId) return;
      setBalance({ status: "error", networkId, address, message: error instanceof NetworkStatusClientError ? error.message : "The public Robinhood RPC could not be reached." });
    });
    return () => { balanceRequest.current += 1; };
  }, [state, networkId, balanceRefreshVersion]);

  const displayState = enabled ? state : { status: "preview" as const };
  const currentBalance = (() => {
    if (displayState.status !== "active" || balance.status === "idle") return null;
    const address = displayState.wallet.wallet.address.toLowerCase();
    if (balance.status === "available") {
      return balance.snapshot.networkId === networkId && balance.snapshot.address.toLowerCase() === address ? balance : null;
    }
    return balance.networkId === networkId && balance.address.toLowerCase() === address ? balance : null;
  })();

  const createWallet = async () => {
    if (state.status !== "blocked" || !state.creationAvailable || !explicitConsent || provisioning) return;
    setProvisioning(true);
    setProvisionError(undefined);
    try {
      const next = await provisionBuiltInWallet(true);
      if (next.status === "active") setState({ status: "active", wallet: next });
      else setState({ status: "blocked", wallet: next, creationAvailable: false });
      setExplicitConsent(false);
    } catch (error) {
      setProvisionError(error instanceof AuthApiError && error.code === "embedded_wallet_blocked"
        ? "Wallet creation remains blocked until provider ownership and the user recovery flow are verified."
        : presentStatusError(error));
    } finally {
      setProvisioning(false);
    }
  };

  const network = NETWORKS.find((item) => item.id === networkId);
  const explorerUrl = displayState.status === "active" ? getExplorerAddressUrl(networkId, displayState.wallet.wallet.address) : undefined;

  return (
    <section className="wl-provisioning" aria-labelledby="h-veyra-wallet">
      <div className="wl-provisioning-head">
        <div>
          <p className="auth-kicker">VEYRA ACCOUNT · BUILT-IN WALLET</p>
          <h2 id="h-veyra-wallet" className="ov-h">Built-in VEYRA Wallet</h2>
        </div>
        <p className="wl-provisioning-state" role="status">
          <StatusMaterial material={displayState.status === "active" ? "outline" : "dotted"} />
          {displayState.status === "checking" ? "Checking account" : displayState.status === "active" ? "Provider wallet active" : displayState.status === "signed_out" ? "Sign in required" : displayState.status === "preview" ? "Preview only" : displayState.status === "error" ? "Status unavailable" : "Not available"}
        </p>
      </div>

      {displayState.status === "checking" ? <p role="status">Checking your VEYRA Account for a provider-managed wallet…</p> : null}
      {displayState.status === "preview" ? <p>Built-in wallet status is not queried in the interactive preview.</p> : null}
      {displayState.status === "signed_out" ? <p>Sign in with your VEYRA Account to check its wallet. No MetaMask connection is required for account access.</p> : null}
      {displayState.status === "error" ? <p className="auth-error" role="alert">{displayState.message}</p> : null}
      {displayState.status === "blocked" ? (
        <>
          <p>{displayState.wallet.reason === "recovery_not_verified"
            ? "Wallet creation is blocked until the recovery and account-restoration flow is verified."
            : "Built-in wallet creation is not available because no verified wallet provider is integrated. No wallet has been created for this account."}</p>
          {displayState.creationAvailable ? (
            <div className="wl-provisioning-consent">
              <label><input type="checkbox" checked={explicitConsent} onChange={(event) => setExplicitConsent(event.currentTarget.checked)} /> I explicitly consent to creating a provider-managed VEYRA Wallet for this account.</label>
              <Button variant="ghost" disabled={!explicitConsent || provisioning} onClick={() => { void createWallet(); }}>{provisioning ? "Creating wallet…" : "Create VEYRA Wallet"}</Button>
            </div>
          ) : null}
        </>
      ) : null}
      {displayState.status === "active" ? (
        <>
          <div className="wl-provisioned-address">
            <div><span>Provider-verified address</span><code>{displayState.wallet.wallet.address}</code></div>
            <div className="wl-provisioned-actions">
              <CopyAddressButton address={displayState.wallet.wallet.address} label="Copy address" />
              {explorerUrl ? <a className={buttonVariants({ variant: "ghost", size: "small" })} href={explorerUrl} target="_blank" rel="noopener noreferrer">Open in Explorer</a> : null}
            </div>
          </div>
          <dl className="wl-provisioning-facts">
            <div><dt>Selected network</dt><dd>{network?.label ?? "Unavailable"} · chain ID {currentBalance?.status === "available" ? currentBalance.snapshot.chainId : network?.chainId ?? "Unavailable"}</dd></div>
            <div><dt>Native balance</dt><dd>{currentBalance?.status === "available" ? `${formatEther(BigInt(currentBalance.snapshot.balanceWei))} ETH` : currentBalance?.status === "loading" ? "Reading public RPC…" : currentBalance?.status === "error" ? "Unavailable" : "Reading public RPC…"}</dd></div>
            <div><dt>Wallet provider</dt><dd>{displayState.wallet.wallet.provider}</dd></div>
            <div><dt>Ownership</dt><dd>Provider account reported</dd></div>
            <div><dt>Security and recovery</dt><dd>Not returned by the wallet status API; not independently verified</dd></div>
            <div><dt>Created</dt><dd><time dateTime={displayState.wallet.wallet.createdAt}>{displayState.wallet.wallet.createdAt}</time></dd></div>
          </dl>
          {currentBalance?.status === "available" ? <p className="wl-provisioning-read">Public RPC snapshot at block {currentBalance.snapshot.observedBlock} · read {currentBalance.snapshot.observedAt}</p> : null}
          {currentBalance?.status === "error" ? <p className="auth-error" role="alert">{currentBalance.message}</p> : null}
          <div className="wl-provisioning-actions">
            <Button variant="ghost" size="small" disabled={currentBalance?.status === "loading"} onClick={() => setBalanceRefreshVersion((version) => version + 1)}>{currentBalance?.status === "loading" ? "Refreshing balance…" : "Refresh public balance"}</Button>
            <Button variant="quiet" size="small" onClick={refreshStatus}>Refresh wallet status</Button>
          </div>
          <p className="wl-provisioning-read">Public balance reads use the selected Robinhood network. No signing, transfer, or automatic network switch is performed.</p>
        </>
      ) : null}
      {provisionError ? <p className="auth-error" role="alert">{provisionError}</p> : null}
      {displayState.status === "blocked" || displayState.status === "error" ? <Button variant="quiet" size="small" onClick={refreshStatus}>Refresh wallet status</Button> : null}
    </section>
  );
}
