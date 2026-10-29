"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther, formatUnits } from "viem";
import { AuthApiError, getCurrentAuthSession, getWalletSmartAccountStatus, requestWalletLinkChallenge, verifyWalletLink } from "@/features/auth/client";
import { linkEip1193OwnerWallet } from "@/features/wallet/owner-link";
import type { WalletSmartAccountStatusResponse } from "@/features/wallet/smart-account-contract";
import type { NetworkId } from "@/types/network";
import { NETWORKS, getExplorerAddressUrl, getExplorerTransactionUrl } from "@/lib/config/networks";
import { useAppModel } from "@/components/dashboard/DemoAppProvider";
import { useLiveWalletExecutionProvider } from "@/features/dashboard/LiveAppProvider";
import { sendRobinhoodTestnetSelfCall, type TestnetSelfCallReceipt } from "@/features/wallet/testnet-execution";
import { MAX_TESTNET_SELF_CALL_COST_WEI } from "@/features/wallet/testnet-user-operation";
import { CopyAddressButton } from "@/components/dashboard/CopyAddressButton";
import { Button, buttonVariants } from "@/components/ui/Button";
import { StatusMaterial } from "@/components/ui/StatusMaterial";

type PanelState =
  | { status: "checking" }
  | { status: "preview" }
  | { status: "signed_out" }
  | { status: "owner_link_required" }
  | { status: "account_owner_mismatch"; accountAddress: string }
  | { status: "infrastructure_blocked"; response: Extract<WalletSmartAccountStatusResponse, { status: "infrastructure_blocked" }> }
  | { status: "account_ready"; response: Extract<WalletSmartAccountStatusResponse, { status: "account_ready" }> }
  | { status: "error"; message: string };

type TestnetActionState =
  | { status: "idle" }
  | { status: "review" }
  | { status: "submitting" }
  | { status: "failed"; message: string }
  | { status: "confirmed"; receipt: TestnetSelfCallReceipt };

function statusMessage(error: unknown): string {
  if (error instanceof AuthApiError && error.status === 401) return "Sign in to your VEYRA Account before linking a wallet or viewing its smart account.";
  if (error instanceof Error && error.message === "wallet_account_changed") return "The wallet account changed during approval. No wallet link was saved; reconnect and try again.";
  if (error instanceof Error && error.message === "wallet_chain_changed") return "The wallet network changed during approval. No wallet link was saved; select the intended Robinhood network and try again.";
  if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 4001) return "The wallet signature was declined. No wallet link or UserOperation was submitted.";
  if (error instanceof AuthApiError && error.status === 503) return "The selected Robinhood RPC or VEYRA persistence service is unavailable. No account status is claimed.";
  return "The smart wallet action could not be verified. No successful operation is claimed; check the owner wallet, Testnet ETH balance, RPC, bundler, and fee limit.";
}

function statusFromResponse(response: WalletSmartAccountStatusResponse): PanelState {
  if (response.status === "owner_link_required") return { status: "owner_link_required" };
  if (response.status === "account_owner_mismatch") return { status: "account_owner_mismatch", accountAddress: response.accountAddress };
  if (response.status === "infrastructure_blocked") return { status: "infrastructure_blocked", response };
  return { status: "account_ready", response };
}

export function SmartAccountPanel({ networkId, enabled }: { networkId: NetworkId; enabled: boolean }) {
  const { model, actions } = useAppModel();
  const provider = useLiveWalletExecutionProvider();
  const ownerAddress = model.wallet.connection?.address;
  const ownerChainId = model.wallet.connection?.chainId;
  const [state, setState] = useState<PanelState>({ status: "checking" });
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [testnetAction, setTestnetAction] = useState<TestnetActionState>({ status: "idle" });
  const [reviewedContext, setReviewedContext] = useState<string>();
  const [resolvedContext, setResolvedContext] = useState<string>();
  const requestId = useRef(0);
  const contextKey = `${networkId}:${ownerAddress ?? ""}:${refreshVersion}`;
  const displayState: PanelState = !enabled
    ? { status: "preview" }
    : resolvedContext === contextKey ? state : { status: "checking" };

  const refresh = useCallback(() => setRefreshVersion((value) => value + 1), []);

  useEffect(() => {
    const id = ++requestId.current;
    let active = true;
    if (!enabled) {
      return () => { active = false; };
    }
    void (async () => {
      try {
        const session = await getCurrentAuthSession();
        if (!session.authenticated || !session.identity || session.identity.provider === "wallet") {
          if (active && requestId.current === id) {
            setState({ status: "signed_out" });
            setResolvedContext(contextKey);
          }
          return;
        }
        const response = await getWalletSmartAccountStatus(networkId, ownerAddress);
        if (!active || requestId.current !== id) return;
        if (response.status === "account_ready" && ownerAddress
          && response.smartAccount.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
          setState({ status: "account_owner_mismatch", accountAddress: response.smartAccount.account?.address ?? "" });
          setResolvedContext(contextKey);
          return;
        }
        if (response.status === "infrastructure_blocked" && ownerAddress
          && response.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
          setState({ status: "account_owner_mismatch", accountAddress: "" });
          setResolvedContext(contextKey);
          return;
        }
        setState(statusFromResponse(response));
        setResolvedContext(contextKey);
      } catch (error) {
        if (active && requestId.current === id) {
          setState({ status: "error", message: statusMessage(error) });
          setResolvedContext(contextKey);
        }
      }
    })();
    return () => { active = false; };
  }, [enabled, networkId, ownerAddress, refreshVersion, contextKey]);

  const linkOwner = async () => {
    if (!provider || !ownerAddress || linking) return;
    const network = NETWORKS.find((candidate) => candidate.id === networkId);
    if (!network || ownerChainId !== network.chainId) {
      setLinkError(`Select ${network?.label ?? "the chosen Robinhood network"} (chain ID ${network?.chainId ?? "unknown"}) in the wallet before linking. VEYRA will not switch it.`);
      return;
    }
    setLinking(true);
    setLinkError(undefined);
    try {
      const signedProvider = provider as unknown as { request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> };
      await linkEip1193OwnerWallet({
        provider: signedProvider,
        address: ownerAddress,
        networkId,
        requestChallenge: requestWalletLinkChallenge,
        verify: verifyWalletLink,
      });
      refresh();
    } catch (error) {
      setLinkError(statusMessage(error));
    } finally {
      setLinking(false);
    }
  };

  const network = NETWORKS.find((candidate) => candidate.id === networkId);
  const requiredChainId = network?.chainId;
  const connectedMismatch = Boolean(ownerAddress && ownerChainId !== requiredChainId);
  const accountStatus = displayState.status === "account_ready" ? displayState.response.smartAccount : undefined;
  const infra = displayState.status === "infrastructure_blocked" ? displayState.response.infrastructure : accountStatus?.infrastructure;
  const account = accountStatus?.account;
  const accountExplorerUrl = account ? getExplorerAddressUrl(networkId, account.address) : undefined;
  const canReviewTestnetSelfCall = Boolean(networkId === "testnet" && enabled && provider && ownerAddress && account
    && accountStatus?.ownerAddress.toLowerCase() === ownerAddress.toLowerCase()
    && ownerChainId === NETWORKS.find((candidate) => candidate.id === "testnet")?.chainId
    && accountStatus.bundler === "available" && accountStatus.infrastructure.ready
    && BigInt(account.balanceWei) >= MAX_TESTNET_SELF_CALL_COST_WEI);
  const currentTestnetContext = `${networkId}:${ownerAddress ?? ""}:${ownerChainId ?? ""}:${account?.address ?? ""}`;
  const reviewStillValid = canReviewTestnetSelfCall && reviewedContext === currentTestnetContext;

  const submitTestnetSelfCall = async () => {
    if (!canReviewTestnetSelfCall || !provider || !ownerAddress || !account) return;
    setTestnetAction({ status: "submitting" });
    try {
      const signedProvider = provider as unknown as { request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> };
      const receipt = await sendRobinhoodTestnetSelfCall({
        provider: signedProvider,
        ownerAddress,
        expectedAccountAddress: account.address,
      });
      setTestnetAction({ status: "confirmed", receipt });
      refresh();
    } catch (error) {
      setTestnetAction({ status: "failed", message: statusMessage(error) });
    }
  };

  return (
    <section className="wl-provisioning" aria-labelledby="h-veyra-smart-wallet">
      <div className="wl-provisioning-head">
        <div>
          <p className="auth-kicker">ROBINHOOD · ERC-4337 · ECDSA OWNER</p>
          <h2 id="h-veyra-smart-wallet" className="ov-h">VEYRA Smart Wallet</h2>
        </div>
        <p className="wl-provisioning-state" role="status">
          <StatusMaterial material={account ? "outline" : "dotted"} />
          {displayState.status === "checking" ? "Checking wallet" : displayState.status === "account_ready" ? account?.deployment === "deployed" ? "Deployed account" : "Counterfactual account" : displayState.status === "infrastructure_blocked" ? "Network support unverified" : displayState.status === "owner_link_required" ? "Owner link required" : displayState.status === "account_owner_mismatch" ? "Owner mismatch" : displayState.status === "signed_out" ? "Sign in required" : displayState.status === "preview" ? "Preview only" : "Unavailable"}
        </p>
      </div>

      {displayState.status === "checking" ? <p role="status">Checking the signed-in account, linked EVM owner, and selected Robinhood network…</p> : null}
      {displayState.status === "preview" ? <p>Smart wallet status is not queried in the interactive preview.</p> : null}
      {displayState.status === "signed_out" ? <p>Sign in with your VEYRA Account first. A wallet signature is required only to link its EVM address; no transaction is requested.</p> : null}
      {!ownerAddress && enabled && displayState.status !== "checking" ? (
        <p>No owner wallet is connected. Connect Phantom EVM or another EIP-1193 wallet to continue.</p>
      ) : null}
      {ownerAddress && connectedMismatch ? (
        <p className="auth-error" role="alert">Connected owner is on chain {ownerChainId ?? "unknown"}. Select {network?.label ?? "the selected network"} (chain ID {requiredChainId ?? "unknown"}) manually. VEYRA will not switch your wallet.</p>
      ) : null}
      {displayState.status === "owner_link_required" && ownerAddress && !connectedMismatch ? (
        <>
          <p>Link this EVM owner to your signed-in VEYRA Account. The wallet will display an EIP-191 message; it does not approve or authorize a transaction.</p>
          <Button variant="ghost" disabled={!provider || linking} onClick={() => { void linkOwner(); }}>{linking ? "Waiting for wallet approval…" : "Link connected wallet owner"}</Button>
        </>
      ) : null}
      {displayState.status === "account_owner_mismatch" ? <p className="auth-error" role="alert">The deployed account owner does not match the EIP-191 linked wallet. The account is blocked and no funding or execution action is available.</p> : null}
      {displayState.status === "infrastructure_blocked" ? <p className="auth-error" role="alert">The factory, implementation, or EntryPoint bytecode is missing on this network. No VEYRA wallet address is offered for funding.</p> : null}
      {displayState.status === "error" ? <p className="auth-error" role="alert">{displayState.message}</p> : null}

      {infra ? (
        <dl className="wl-provisioning-facts">
          <div><dt>Selected network</dt><dd>{network?.label ?? "Unavailable"} · chain ID {infra.chainId}</dd></div>
          <div><dt>Alchemy Light Account factory</dt><dd><code>{infra.factory.address}</code> · bytecode {infra.factory.bytecode}</dd></div>
          <div><dt>Light Account implementation</dt><dd><code>{infra.implementation.address}</code> · bytecode {infra.implementation.bytecode}</dd></div>
          <div><dt>ERC-4337 EntryPoint</dt><dd><code>{infra.entryPoint.address}</code> · bytecode {infra.entryPoint.bytecode}</dd></div>
          <div><dt>RPC observation</dt><dd>Block {infra.latestBlock} · {infra.observedAt}</dd></div>
        </dl>
      ) : null}

      {accountStatus && account ? (
        <>
          <div className="wl-provisioned-address">
            <div><span>Connected owner · Phantom EVM / external EOA</span><code>{accountStatus.ownerAddress}</code></div>
            <div><span>VEYRA Light Account · {account.deployment === "deployed" ? "deployed" : "not deployed"}</span><code>{account.address}</code></div>
            <div className="wl-provisioned-actions">
              <CopyAddressButton address={account.address} label="Copy VEYRA wallet address" />
              {accountExplorerUrl ? <a className={buttonVariants({ variant: "ghost", size: "small" })} href={accountExplorerUrl} target="_blank" rel="noopener noreferrer">Open in Explorer</a> : null}
            </div>
          </div>
          <dl className="wl-provisioning-facts">
            <div><dt>Wallet balance</dt><dd>{formatEther(BigInt(account.balanceWei))} ETH · public RPC at block {account.observedBlock}</dd></div>
            {accountStatus.tokenBalances.map((token) => <div key={token.address}><dt>{token.symbol} balance</dt><dd>{token.status === "available" && token.balanceRaw !== null ? `${formatUnits(BigInt(token.balanceRaw), token.decimals)} ${token.symbol}` : token.status === "token_contract_missing" ? "Token contract bytecode is not present on this network" : token.status === "metadata_mismatch" ? "On-chain decimals do not match configured token metadata" : "Token balance unavailable from the public RPC"} · configured address {token.address}</dd></div>)}
            {accountStatus.tokenBalances.length === 0 ? <div><dt>Token balances</dt><dd>No verified token list is configured for this network.</dd></div> : null}
            <div><dt>Account version</dt><dd>Alchemy Light Account v2.0.0 · salt 0</dd></div>
            <div><dt>Owner relationship</dt><dd>{account.deployment === "deployed" ? account.ownerVerified ? "On-chain owner matches linked EIP-191 wallet" : "Not verified" : "Counterfactual address derived from linked owner"}</dd></div>
            <div><dt>Bundler</dt><dd>{accountStatus.bundler === "available" ? "Alchemy reports the Light Account EntryPoint" : accountStatus.bundler === "not_configured" ? "ALCHEMY_API_KEY is not configured server-side" : accountStatus.bundler === "entry_point_unsupported" ? "Configured Alchemy endpoint does not report the required EntryPoint" : "Alchemy bundler could not be reached"}</dd></div>
            <div><dt>Funding</dt><dd>{account.deployment === "counterfactual" ? "Receive address is available after on-chain factory checks; VEYRA does not transfer funds." : "Receive address is the deployed smart account; VEYRA does not transfer funds."}</dd></div>
            <div><dt>Security boundary</dt><dd>Single ECDSA owner through Phantom. This is not post-quantum protected. Loss of the owner wallet means loss of account access.</dd></div>
          </dl>
          {networkId === "testnet" ? (
            <div className="wl-provisioning-read" aria-label="Robinhood Testnet smart account operation">
              <h3 className="ov-h">Controlled Testnet operation</h3>
              {accountStatus.bundler !== "available" ? <p>Testnet UserOperation submission is unavailable because the Robinhood Alchemy bundler has not been verified.</p> : null}
              {BigInt(account.balanceWei) < MAX_TESTNET_SELF_CALL_COST_WEI ? <p>Fund this VEYRA Testnet address with at least {formatEther(MAX_TESTNET_SELF_CALL_COST_WEI)} Robinhood Testnet ETH before review is enabled. The bundler rejects any estimate above this fee ceiling; VEYRA will not transfer funds.</p> : null}
              {ownerAddress && ownerChainId !== NETWORKS.find((candidate) => candidate.id === "testnet")?.chainId ? <p>Connect the linked owner on Robinhood Testnet (chain 46630). VEYRA will not change the wallet network.</p> : null}
              {canReviewTestnetSelfCall && testnetAction.status === "idle" ? <Button variant="ghost" onClick={() => { setReviewedContext(currentTestnetContext); setTestnetAction({ status: "review" }); }}>Review zero-value Testnet operation</Button> : null}
              {testnetAction.status === "review" ? (
                <>
                  {reviewStillValid && account && ownerAddress ? <>
                    <p>Network: Robinhood Testnet · chain 46630. Smart account: <code>{account.address}</code>. Call target: your linked EOA <code>{ownerAddress}</code>. Value: 0 ETH. No token call, approval, or swap is included. The smart account may spend at most {formatEther(MAX_TESTNET_SELF_CALL_COST_WEI)} testnet ETH on gas; the server rejects estimates above this limit.</p>
                    <p>Signing and submitting is a separate action. Your wallet will authorize the UserOperation; the account, not the EOA, pays gas. This test does not run on Mainnet.</p>
                    <Button variant="quiet" onClick={() => setTestnetAction({ status: "idle" })}>Cancel</Button>
                    <Button variant="ghost" onClick={() => { void submitTestnetSelfCall(); }}>Sign and submit Testnet self-call</Button>
                  </> : <>
                    <p>The reviewed owner, network, or account changed. This review is invalid; start a new review before any wallet signature.</p>
                    <Button variant="quiet" onClick={() => { setReviewedContext(undefined); setTestnetAction({ status: "idle" }); }}>Discard expired review</Button>
                  </>}
                </>
              ) : null}
              {testnetAction.status === "submitting" ? <p role="status">Waiting for the wallet signature, bundler result, and on-chain receipt…</p> : null}
              {testnetAction.status === "failed" ? <p className="auth-error" role="alert">{testnetAction.message}</p> : null}
              {testnetAction.status === "confirmed" && testnetAction.receipt.ownerAddress.toLowerCase() === ownerAddress?.toLowerCase() ? (
                <p role="status">Testnet UserOperation verified in block {testnetAction.receipt.blockNumber}. {getExplorerTransactionUrl("testnet", testnetAction.receipt.transactionHash) ? <a href={getExplorerTransactionUrl("testnet", testnetAction.receipt.transactionHash)} target="_blank" rel="noopener noreferrer">View transaction receipt</a> : null}</p>
              ) : null}
              <p>Swaps are not integrated through this account. The existing 0x EOA quote is not reused, and VEYRA will not fall back to an EOA transaction.</p>
            </div>
          ) : <p className="wl-provisioning-read" role="note">Smart Account UserOperation and 0x swap execution are not enabled on Robinhood Mainnet.</p>}
        </>
      ) : null}
      {linkError ? <p className="auth-error" role="alert">{linkError}</p> : null}
      {enabled && displayState.status !== "signed_out" && ownerAddress ? <Button variant="quiet" size="small" disabled={displayState.status === "checking" || linking} onClick={refresh}>Refresh smart wallet status</Button> : null}
      {displayState.status === "owner_link_required" && !ownerAddress && enabled ? <Button variant="quiet" size="small" onClick={() => actions.pressLedgerAction("connect")}>Connect owner wallet</Button> : null}
      <p className="wl-provisioning-read">The account address is returned only when the selected Robinhood RPC confirms bytecode for its factory, implementation, and EntryPoint. Bytecode presence is not an independent source audit.</p>
    </section>
  );
}
