"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type {
  AppActions,
  AppModel,
  AppModelValue,
  ReadOnlyWalletState,
  ResearchRunDetail,
  ResearchRunSummary,
  ResearchTopicId,
  NetworkId,
  NetworkRpcState,
} from "@/types";
import { Button } from "@/components/ui/Button";
import { ModelContext } from "@/components/dashboard/AppModelContext";
import { WalletPickerDialog } from "@/components/dashboard/WalletPickerDialog";
import {
  completeWalletAuthChallenge,
  createSecurityRun,
  getSecurityCapabilities,
  getSecurityRun,
  getSecuritySessionStatus,
  getWalletSessionStatus,
  listSecurityRuns,
  loginToSecurityService,
  logoutWalletSession,
  logoutFromSecurityService,
  requestWalletAuthChallenge,
  signWalletAuthenticationMessage,
  SecurityApiClientError,
  type WalletAuthChallenge,
} from "@/features/security/client";
import { connectReadOnlyWallet, createWalletRequestGuard, disconnectReadOnlyWallet, refreshReadOnlyWallet, watchReadOnlyWallet, type ReadOnlyEip1193Provider } from "@/features/wallet/read-only";
import { discoverInjectedReadOnlyWallets, type InjectedReadOnlyWalletChoice } from "@/features/wallet/browser";
import { getRobinhoodNetworkStatus, NetworkStatusClientError } from "@/features/wallet/network-client";
import { DEFAULT_NETWORK_ID, isNetworkAvailable, NETWORKS } from "@/lib/config/networks";
import { buildLiveAppModel, newestFirstResearchRuns, reconcileResearchRunHistory, toLiveSwarmRun } from "./live-model";
import { canUseProtectedResearch, expireResearchSession, gateAfterProtectedResponse, mergeFirstHistoryPage, mergeHistoryPage, shouldLoadResearchCapabilities, type ResearchGateState } from "./live-ui-state";

type GateState = ResearchGateState;
const ACTIVE_RUN_POLL_INTERVAL_MS = 5_000;
const IDLE_POLL_INTERVAL_MS = 30_000;
const DETAIL_BATCH_SIZE = 3;
const NETWORK_REFRESH_INTERVAL_MS = 30_000;

interface ResearchHistoryState {
  runs: ResearchRunSummary[] | null;
  nextCursor?: string;
  loadedPageCount: number;
  isLoadingMore: boolean;
  historyError?: string;
}

interface LiveResearchAccessValue {
  gate: GateState;
  message?: string;
  capabilityMessage?: string;
  wallet: ReadOnlyWalletState;
  selectedNetwork: NetworkId;
  authenticationMethod?: "wallet" | "operator";
  authenticatedAddress?: `0x${string}`;
  walletAuthConfigured: boolean;
  operatorAuthConfigured: boolean;
  signInChallenge?: WalletAuthChallenge;
  signInBusy: boolean;
  signInError?: string;
  requestWalletSignIn: () => Promise<void>;
  approveWalletSignIn: () => Promise<void>;
  cancelWalletSignIn: () => void;
  connectWallet: () => void;
  login: (token: string) => Promise<void>;
  retry: () => void;
  hasMoreRuns: boolean;
  isLoadingMore: boolean;
  historyError?: string;
  loadMoreRuns: () => Promise<void>;
  refreshHistory: () => void;
  loadResearchRun: (id: string) => Promise<void>;
}

const LiveResearchAccessContext = createContext<LiveResearchAccessValue | null>(null);

export function useLiveResearchAccess(): LiveResearchAccessValue | null {
  return useContext(LiveResearchAccessContext);
}

/** Place this around Security Swarm history/actions; public app routes remain mounted around it. */
export function LiveResearchAccessBoundary({ children }: { children: ReactNode }) {
  const access = useLiveResearchAccess();
  if (!access || access.gate === "authenticated") return children;
  return (
    <LiveAccessGate
      gate={access.gate}
      message={access.message}
      wallet={access.wallet}
      selectedNetwork={access.selectedNetwork}
      walletAuthConfigured={access.walletAuthConfigured}
      operatorAuthConfigured={access.operatorAuthConfigured}
      signInChallenge={access.signInChallenge}
      signInBusy={access.signInBusy}
      signInError={access.signInError}
      onRequestWalletSignIn={access.requestWalletSignIn}
      onApproveWalletSignIn={access.approveWalletSignIn}
      onCancelWalletSignIn={access.cancelWalletSignIn}
      onConnectWallet={access.connectWallet}
      onLogin={access.login}
      onRetry={access.retry}
    />
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof SecurityApiClientError) return `${error.code}: ${error.message}`;
  return "The live service request failed. Existing live values were not replaced with demo data.";
}

export function operatorAccessErrorMessage(error: unknown): string {
  if (!(error instanceof SecurityApiClientError)) return "Sign-in could not be completed. Try again.";
  if (error.status === 401 || error.code === "invalid_access_token") {
    return "That operator access token was not accepted. Check the configured token and try again.";
  }
  if (error.status === 403) return "Operator access is not permitted for this request. Contact the service operator if you need access.";
  if (error.status === 429 || error.code === "rate_limit_exceeded") return "Too many sign-in attempts. Wait before trying again.";
  if (error.status === 503 || error.status >= 500) return "The operator service is temporarily unavailable. Try again shortly.";
  return "Sign-in could not be completed. Check the operator access settings and try again.";
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof SecurityApiClientError && error.status === 401;
}

function sessionErrorGate(error: unknown): Extract<GateState, "service_error" | "rate_limited"> {
  return error instanceof SecurityApiClientError && (error.status === 429 || error.code === "rate_limit_exceeded")
    ? "rate_limited"
    : "service_error";
}

export function walletSignInErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === 4001) return "The wallet sign-in message was rejected. No research session was created.";
  if (error instanceof SecurityApiClientError) {
    if (error.code === "wallet_signature_invalid") return "The wallet signature did not match the connected account. No research session was created; request a new sign-in message.";
    if (error.code === "wallet_challenge_expired" || error.code === "wallet_challenge_invalid" || error.code === "wallet_challenge_consumed") {
      return "This one-time sign-in message expired or was already used. Request a new message.";
    }
    if (error.code === "wallet_auth_not_configured") return "Wallet sign-in is not configured on the server.";
    if (error.code === "persistence_not_configured") return "Wallet sign-in cannot continue because research persistence is not configured on the server.";
    if (error.status === 403) return "Wallet sign-in is not enabled for this configured VEYRA site origin.";
    if (error.status === 429) return "Wallet sign-in is rate-limited. Wait before trying again.";
    if (error.status === 503 || error.status >= 500) return "Wallet sign-in is temporarily unavailable. Your wallet remains connected.";
    if (error.status === 401) return "The wallet sign-in could not be verified. Request a new message and try again.";
  }
  return "Wallet sign-in could not be completed. No transaction or token approval was requested.";
}

export function LiveAccessGate({
  gate,
  message,
  wallet = { status: "disconnected" },
  selectedNetwork = DEFAULT_NETWORK_ID,
  walletAuthConfigured = true,
  operatorAuthConfigured = true,
  signInChallenge,
  signInBusy = false,
  signInError,
  onRequestWalletSignIn = () => Promise.resolve(),
  onApproveWalletSignIn = () => Promise.resolve(),
  onCancelWalletSignIn = () => {},
  onConnectWallet = () => {},
  onLogin,
  onRetry,
}: {
  gate: Exclude<GateState, "authenticated">;
  message?: string;
  wallet?: ReadOnlyWalletState;
  selectedNetwork?: NetworkId;
  walletAuthConfigured?: boolean;
  operatorAuthConfigured?: boolean;
  signInChallenge?: WalletAuthChallenge;
  signInBusy?: boolean;
  signInError?: string;
  onRequestWalletSignIn?: () => Promise<void>;
  onApproveWalletSignIn?: () => Promise<void>;
  onCancelWalletSignIn?: () => void;
  onConnectWallet?: () => void;
  onLogin: (token: string) => Promise<void>;
  onRetry: () => void;
}) {
  const [token, setToken] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string>();
  const [loginRateLimited, setLoginRateLimited] = useState(false);
  const [loginRetryAt, setLoginRetryAt] = useState<number>();
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (loginRetryAt === undefined) return;
    const timeout = window.setTimeout(() => {
      setLoginRetryAt(undefined);
      setLoginRateLimited(false);
      setLoginError(undefined);
    }, Math.max(0, loginRetryAt - Date.now()));
    const interval = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [loginRetryAt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || submitting) return;
    setSubmitting(true);
    setLoginError(undefined);
    setLoginRateLimited(false);
    try {
      await onLogin(token);
      setToken("");
    } catch (error) {
      setLoginError(operatorAccessErrorMessage(error));
      if (error instanceof SecurityApiClientError && error.status === 429) {
        setLoginRateLimited(true);
        setLoginRetryAt(Date.now() + (error.retryAfterMs ?? 60_000));
      }
      setToken("");
    } finally {
      setSubmitting(false);
    }
  }

  const selected = NETWORKS.find((network) => network.id === selectedNetwork);
  const walletMatchesSelected = Boolean(wallet.address && selected && wallet.chainId === selected.chainId);
  const walletHasAccount = Boolean(wallet.address);
  const challengeMatchesCurrent = Boolean(signInChallenge && wallet.address && selected
    && signInChallenge.message.toLowerCase().includes(wallet.address.toLowerCase())
    && signInChallenge.message.includes(`Chain ID: ${selected.chainId}`));

  return (
    <section className="operator-access-gate" aria-busy={gate === "checking" || signInBusy || submitting || undefined}>
      {message ? <p className="operator-access-message" role="status">{message}</p> : null}
      <section className="wallet-research-access" aria-labelledby="wallet-research-access-heading">
        <p className="operator-access-kicker">Wallet-owned research</p>
        <h3 id="wallet-research-access-heading">Sign in to Research</h3>
        <p>Connect a wallet, request a one-time sign-in challenge, then approve that exact EIP-191 login message in your wallet. This login-message signature is not a blockchain transaction signature; it does not approve tokens or authorize transactions.</p>
        {gate === "checking" ? <p className="operator-access-status" role="status">Checking your server-side research session.</p> : null}
        {walletAuthConfigured && gate !== "checking" ? (
          <div className="wallet-research-identity">
            {walletHasAccount ? (
              <dl className="kv">
                <div><dt>Connected provider</dt><dd>{wallet.providerName ?? "EIP-1193 wallet"}</dd></div>
                <div><dt>Connected account</dt><dd><code>{wallet.address}</code></dd></div>
                <div><dt>Wallet network</dt><dd>{wallet.networkName ?? "Unknown network"}</dd></div>
                <div><dt>Wallet chain ID</dt><dd>{wallet.chainId ?? "Unknown"}</dd></div>
                <div><dt>Selected VEYRA network</dt><dd>{selected?.label ?? "Unknown"} · chain ID {selected?.chainId ?? "Unknown"}</dd></div>
              </dl>
            ) : (
              <p className="operator-access-status">Connect MetaMask, Phantom, or another detected EVM wallet to sign in with your account.</p>
            )}
            {walletHasAccount && !walletMatchesSelected ? (
              <p className="operator-access-error" role="status">
                To sign in on {selected?.label ?? "the selected network"}, manually select chain ID {selected?.chainId ?? "unknown"} in your wallet, then refresh the wallet status. VEYRA will not switch networks.
              </p>
            ) : null}
            {signInChallenge ? (
              <div className="wallet-sign-in-challenge">
                <details open>
                  <summary>Review the one-time sign-in message</summary>
                  <pre>{signInChallenge.message}</pre>
                </details>
                <p>This message expires at {signInChallenge.expiresAt}. Your wallet may label it personal_sign; this is an EIP-191 login-message signature, not a blockchain transaction signature. Approve it only if the origin, account, and chain match this page. No transaction or token approval is requested.</p>
                {!challengeMatchesCurrent ? <p role="status">This message belongs to another account or network. Cancel it and request a new message for the current wallet state.</p> : null}
                <div className="wallet-sign-in-actions">
                  <Button type="button" variant="primary" disabled={signInBusy || !walletMatchesSelected || !challengeMatchesCurrent} onClick={() => { void onApproveWalletSignIn(); }}>
                    {signInBusy ? "Waiting for wallet approval…" : "Approve EIP-191 sign-in message"}
                  </Button>
                  <Button type="button" variant="ghost" disabled={signInBusy} onClick={onCancelWalletSignIn}>Cancel</Button>
                </div>
              </div>
            ) : walletHasAccount && walletMatchesSelected ? (
              <Button type="button" variant="primary" disabled={signInBusy} onClick={() => { void onRequestWalletSignIn(); }}>
                {signInBusy ? "Preparing one-time challenge…" : "Sign in to Research"}
              </Button>
            ) : !walletHasAccount ? (
              <Button type="button" variant="primary" onClick={onConnectWallet}>Connect wallet to sign in</Button>
            ) : null}
          </div>
        ) : gate !== "checking" ? (
          <p className="operator-access-status" role="status">Wallet sign-in is not configured on the server. Public wallet and network reads remain available.</p>
        ) : null}
        {signInError ? <p role="alert" className="operator-access-error">{signInError}</p> : null}
        {gate === "service_error" || gate === "rate_limited" ? (
          <div className="operator-access-status" role="status">
            <p>{message ?? (gate === "rate_limited" ? "The research session check is rate-limited. Wait before trying again." : "The research session could not be checked. Try again shortly.")}</p>
            <Button type="button" variant="ghost" onClick={onRetry}>Retry session check</Button>
          </div>
        ) : null}
      </section>
      <details className="operator-admin-access">
        <summary>Operator administration</summary>
        <p>Service administrators can use the separately configured operator access token here. This does not sign in a wallet user. A research Run ID is not an authentication token.</p>
        {!operatorAuthConfigured ? <p className="operator-access-status">Operator authentication is not configured on the server.</p> : null}
        <form className="operator-access-form" onSubmit={submit}>
          <div className="fld operator-token-field">
            <label className="fl" htmlFor="qevra-live-token">Operator access token</label>
            <span className="fr operator-token-control">
              <input
                id="qevra-live-token"
                type={tokenVisible ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="qevra-live-token-hint"
                aria-invalid={loginError ? true : undefined}
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="small"
                aria-label={tokenVisible ? "Hide operator access token" : "Show operator access token"}
                aria-pressed={tokenVisible}
                aria-controls="qevra-live-token"
                onClick={() => setTokenVisible((visible) => !visible)}
              >
                {tokenVisible ? "Hide" : "Show"}
              </Button>
            </span>
            <small id="qevra-live-token-hint">Enter the configured operator access token. It is sent only to the same-origin administrator sign-in endpoint.</small>
          </div>
          <Button type="submit" disabled={!token || !operatorAuthConfigured || submitting || (loginRateLimited && loginRetryAt !== undefined && loginRetryAt > clock)}>
            {submitting ? "Signing in…" : loginRateLimited && loginRetryAt !== undefined && loginRetryAt > clock
              ? `Try again in ${Math.ceil((loginRetryAt - clock) / 1_000)}s`
              : "Sign in as operator"}
          </Button>
          {loginError ? <p role="alert" className="operator-access-error">{loginError}</p> : null}
        </form>
      </details>
    </section>
  );
}

export function LiveAppProvider({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<GateState>("checking");
  const [gateMessage, setGateMessage] = useState<string>();
  const [authenticationMethod, setAuthenticationMethod] = useState<"wallet" | "operator">();
  const [authenticatedAddress, setAuthenticatedAddress] = useState<`0x${string}`>();
  const [walletAuthConfigured, setWalletAuthConfigured] = useState(false);
  const [operatorAuthConfigured, setOperatorAuthConfigured] = useState(false);
  const [signInChallenge, setSignInChallenge] = useState<WalletAuthChallenge>();
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string>();
  const [capabilityMessage, setCapabilityMessage] = useState<string>();
  const gateRef = useRef<GateState>("checking");
  const authenticationMethodRef = useRef<"wallet" | "operator" | undefined>(undefined);
  const authenticatedAddressRef = useRef<`0x${string}` | undefined>(undefined);
  const [wallet, setWallet] = useState<ReadOnlyWalletState>({ status: "disconnected" });
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [walletChoices, setWalletChoices] = useState<InjectedReadOnlyWalletChoice[]>([]);
  const [walletDiscoveryLoading, setWalletDiscoveryLoading] = useState(false);
  const [walletDiscoveryError, setWalletDiscoveryError] = useState<string>();
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkId>(DEFAULT_NETWORK_ID);
  const selectedNetworkRef = useRef<NetworkId>(DEFAULT_NETWORK_ID);
  const [networkRpc, setNetworkRpc] = useState<NetworkRpcState>({ status: "not_requested" });
  const [networkRefreshNonce, setNetworkRefreshNonce] = useState(0);
  const [capabilities, setCapabilities] = useState<AppModel["security"]["capabilities"]>();
  const [history, setHistory] = useState<ResearchHistoryState>({ runs: null, loadedPageCount: 0, isLoadingMore: false });
  const [preferredRunId, setPreferredRunId] = useState<string>();
  const [details, setDetails] = useState<Record<string, ResearchRunDetail>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [actionMessage, setActionMessage] = useState<string>();
  const [dataError, setDataError] = useState<string>();
  const providerRef = useRef<ReadOnlyEip1193Provider | undefined>(undefined);
  const walletDiscoveryId = useRef(0);
  const unwatchRef = useRef<(() => void) | undefined>(undefined);
  const walletRequestGuardRef = useRef(createWalletRequestGuard());
  const pollInFlight = useRef(false);
  const pollRequestId = useRef(0);
  const loadingMoreRef = useRef(false);
  const loadingRunIds = useRef(new Map<string, number>());
  const accessEpoch = useRef(0);
  const historyRef = useRef(history);
  const detailCache = useRef<Record<string, ResearchRunDetail>>({});
  const optimisticRuns = useRef(new Map<string, ResearchRunSummary>());
  const sessionCheckId = useRef(0);

  useEffect(() => {
    selectedNetworkRef.current = selectedNetwork;
  }, [selectedNetwork]);

  const updateHistory = useCallback((update: (current: ResearchHistoryState) => ResearchHistoryState) => {
    const next = update(historyRef.current);
    historyRef.current = next;
    setHistory(next);
  }, []);

  const updateGate = useCallback((next: GateState) => {
    gateRef.current = next;
    setGate(next);
  }, []);

  const expireSession = useCallback((message = "Your research session expired. Sign in again to continue using saved runs and research.") => {
    const expiredMethod = authenticationMethodRef.current;
    accessEpoch.current += 1;
    pollRequestId.current += 1;
    pollInFlight.current = false;
    sessionCheckId.current += 1;
    const cleared = expireResearchSession({
      gate: gateRef.current,
      summaries: historyRef.current.runs,
      details: {},
      detailErrors: {},
      capabilities: undefined,
      nextCursor: historyRef.current.nextCursor,
      loadedPageCount: historyRef.current.loadedPageCount,
      isLoadingMore: historyRef.current.isLoadingMore,
      historyError: historyRef.current.historyError,
      dataError: undefined,
      actionMessage: undefined,
      preferredRunId: undefined,
    });
    updateGate(gateAfterProtectedResponse(gateRef.current, 401));
    authenticationMethodRef.current = undefined;
    authenticatedAddressRef.current = undefined;
    setAuthenticationMethod(undefined);
    setAuthenticatedAddress(undefined);
    setSignInChallenge(undefined);
    setSignInError(undefined);
    setSignInBusy(false);
    setCapabilityMessage(undefined);
    setGateMessage(message);
    setCapabilities(cleared.capabilities);
    updateHistory(() => ({
      runs: cleared.summaries as null,
      loadedPageCount: cleared.loadedPageCount as number,
      isLoadingMore: cleared.isLoadingMore as boolean,
    }));
    setDetails(cleared.details as Record<string, ResearchRunDetail>);
    detailCache.current = {};
    optimisticRuns.current.clear();
    loadingMoreRef.current = false;
    loadingRunIds.current.clear();
    setIsRefreshing(false);
    setIsCreating(false);
    setDetailErrors(cleared.detailErrors as Record<string, string>);
    setPreferredRunId(cleared.preferredRunId as string | undefined);
    setDataError(cleared.dataError as string | undefined);
    setActionMessage(cleared.actionMessage as string | undefined);
    if (expiredMethod === "wallet") void logoutWalletSession().catch(() => undefined);
    else if (expiredMethod === "operator") void logoutFromSecurityService().catch(() => undefined);
  }, [updateGate, updateHistory]);

  const checkSession = useCallback(async () => {
    const requestId = ++sessionCheckId.current;
    updateGate("checking");
    setGateMessage(undefined);
    const [operatorResult, walletResult] = await Promise.allSettled([
      getSecuritySessionStatus(),
      getWalletSessionStatus(),
    ]);
    if (requestId !== sessionCheckId.current) return;

    const operatorStatus = operatorResult.status === "fulfilled" ? operatorResult.value : undefined;
    const walletStatus = walletResult.status === "fulfilled" ? walletResult.value : undefined;
    setOperatorAuthConfigured(operatorStatus?.configured ?? false);
    setWalletAuthConfigured(walletStatus?.configured ?? false);

    // Protected APIs intentionally prefer the separately authenticated operator cookie when both exist.
    if (operatorStatus?.authenticated) {
      authenticationMethodRef.current = "operator";
      authenticatedAddressRef.current = undefined;
      setAuthenticationMethod("operator");
      setAuthenticatedAddress(undefined);
      updateGate("authenticated");
      if (walletStatus?.authenticated) {
        setGateMessage("Operator administration access is active in this browser. Sign out of it before using wallet-owned research history.");
      }
      return;
    }
    if (walletStatus?.authenticated && walletStatus.address) {
      authenticationMethodRef.current = "wallet";
      authenticatedAddressRef.current = walletStatus.address;
      setAuthenticationMethod("wallet");
      setAuthenticatedAddress(walletStatus.address);
      updateGate("authenticated");
      return;
    }

    authenticationMethodRef.current = undefined;
    authenticatedAddressRef.current = undefined;
    setAuthenticationMethod(undefined);
    setAuthenticatedAddress(undefined);
    if (operatorResult.status === "rejected" || walletResult.status === "rejected") {
      const error = operatorResult.status === "rejected" ? operatorResult.reason : walletResult.status === "rejected" ? walletResult.reason : undefined;
      updateGate(sessionErrorGate(error));
      const message = error instanceof SecurityApiClientError && (error.status === 429 || error.code === "rate_limit_exceeded")
        ? "The research session check is rate-limited. Wait before trying again."
        : "The research session could not be checked. Try again shortly.";
      setGateMessage(message);
      return;
    }
    updateGate(operatorStatus?.configured || walletStatus?.configured ? "unauthenticated" : "not_configured");
  }, [updateGate]);

  const applyWalletState = useCallback((value: ReadOnlyWalletState) => {
    setWallet(value);
    const sessionAddress = authenticatedAddressRef.current;
    if (authenticationMethodRef.current === "wallet" && sessionAddress
      && (!value.address || value.address.toLowerCase() !== sessionAddress.toLowerCase())) {
      setSignInChallenge(undefined);
      expireSession("The connected wallet account changed. The wallet-owned research session was cleared; sign in again with the authorized account.");
    }
  }, [expireSession]);

  const refreshWallet = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) return;
    const requestId = walletRequestGuardRef.current.begin();
    setWallet({ status: "loading", message: "Refreshing the wallet account, network, and read-only balance." });
    const value = await refreshReadOnlyWallet(provider);
    if (!walletRequestGuardRef.current.isCurrent(requestId) || providerRef.current !== provider) return;
    applyWalletState(value);
  }, [applyWalletState]);

  const closeWalletPicker = useCallback(() => {
    walletDiscoveryId.current += 1;
    setWalletPickerOpen(false);
    setWalletDiscoveryLoading(false);
  }, []);

  const openWalletPicker = useCallback(async () => {
    if (wallet.status === "loading" || wallet.address) return;
    const requestId = ++walletDiscoveryId.current;
    setWalletChoices([]);
    setWalletDiscoveryError(undefined);
    setWalletDiscoveryLoading(true);
    setWalletPickerOpen(true);
    try {
      const choices = await discoverInjectedReadOnlyWallets();
      if (requestId !== walletDiscoveryId.current) return;
      setWalletChoices(choices);
    } catch {
      if (requestId !== walletDiscoveryId.current) return;
      setWalletDiscoveryError("Wallet discovery could not be completed. Check your browser wallet extensions and try again.");
    } finally {
      if (requestId === walletDiscoveryId.current) setWalletDiscoveryLoading(false);
    }
  }, [wallet.address, wallet.status]);

  const disconnectWallet = useCallback(() => {
    walletRequestGuardRef.current.invalidate();
    unwatchRef.current?.();
    unwatchRef.current = undefined;
    providerRef.current = undefined;
    setWallet(disconnectReadOnlyWallet());
  }, []);

  const connectWallet = useCallback(async (provider: ReadOnlyEip1193Provider) => {
    if (wallet.status === "loading") return;
    if (wallet.address) return;
    closeWalletPicker();
    const requestId = walletRequestGuardRef.current.begin();
    setWallet({ status: "loading", message: "Waiting for your wallet's account-access decision." });
    unwatchRef.current?.();
    unwatchRef.current = undefined;
    providerRef.current = provider;
    const state = await connectReadOnlyWallet(provider);
    if (!walletRequestGuardRef.current.isCurrent(requestId) || providerRef.current !== provider) return;
    applyWalletState(state);
    if (state.address) {
      unwatchRef.current = watchReadOnlyWallet(provider, () => { void refreshWallet(); });
    } else {
      providerRef.current = undefined;
    }
  }, [applyWalletState, closeWalletPicker, refreshWallet, wallet.address, wallet.status]);

  const selectWallet = useCallback((id: string) => {
    const choice = walletChoices.find((walletChoice) => walletChoice.id === id);
    if (!choice || wallet.address || wallet.status === "loading") return;
    void connectWallet(choice.provider);
  }, [connectWallet, wallet.address, wallet.status, walletChoices]);

  const requestWalletSignIn = useCallback(async () => {
    if (gateRef.current === "authenticated" || signInBusy) return;
    const provider = providerRef.current;
    const expectedChainId = NETWORKS.find((network) => network.id === selectedNetwork)?.chainId;
    if (!wallet.address || !provider) {
      setSignInError("Connect a wallet before requesting a research sign-in message.");
      return;
    }
    if (!expectedChainId || wallet.chainId !== expectedChainId) {
      setSignInError(`Manually select ${NETWORKS.find((network) => network.id === selectedNetwork)?.label ?? "the selected network"} (chain ID ${expectedChainId ?? "unknown"}) in your wallet before signing in. VEYRA will not switch it.`);
      return;
    }
    setSignInBusy(true);
    setSignInError(undefined);
    setSignInChallenge(undefined);
    try {
      const challenge = await requestWalletAuthChallenge({ networkId: selectedNetwork, address: wallet.address });
      if (Date.parse(challenge.expiresAt) <= Date.now()) {
        throw new SecurityApiClientError(401, "wallet_challenge_expired", "The sign-in message expired before it could be reviewed.");
      }
      const [accounts, chainValue] = await Promise.all([
        provider.request({ method: "eth_accounts" }),
        provider.request({ method: "eth_chainId" }),
      ]);
      const currentAddress = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : undefined;
      const currentChainId = typeof chainValue === "string" && /^0x[0-9a-f]+$/i.test(chainValue) ? Number.parseInt(chainValue, 16) : undefined;
      if (providerRef.current !== provider || currentAddress?.toLowerCase() !== wallet.address.toLowerCase()
        || currentChainId !== expectedChainId || selectedNetworkRef.current !== selectedNetwork) {
        throw new Error("wallet_auth_context_changed");
      }
      setSignInChallenge(challenge);
    } catch (error) {
      setSignInError(walletSignInErrorMessage(error));
    } finally {
      setSignInBusy(false);
    }
  }, [signInBusy, selectedNetwork, wallet.address, wallet.chainId]);

  const approveWalletSignIn = useCallback(async () => {
    const provider = providerRef.current;
    const challenge = signInChallenge;
    const expectedChainId = NETWORKS.find((network) => network.id === selectedNetwork)?.chainId;
    if (gateRef.current === "authenticated" || signInBusy) return;
    if (!challenge || !wallet.address || !provider || !expectedChainId) {
      setSignInError("Request a new sign-in message after connecting your wallet.");
      return;
    }
    if (Date.parse(challenge.expiresAt) <= Date.now()) {
      setSignInChallenge(undefined);
      setSignInError("This one-time sign-in message expired. Request a new message.");
      return;
    }
    if (wallet.chainId !== expectedChainId) {
      setSignInChallenge(undefined);
      setSignInError(`Manually select ${NETWORKS.find((network) => network.id === selectedNetwork)?.label ?? "the selected network"} (chain ID ${expectedChainId}) in your wallet, then request a new sign-in message.`);
      return;
    }
    if (!challenge.message.toLowerCase().includes(wallet.address.toLowerCase()) || !challenge.message.includes(`Chain ID: ${expectedChainId}`)) {
      setSignInChallenge(undefined);
      setSignInError("This sign-in message belongs to another account or network. Request a new message for the current wallet state.");
      return;
    }
    setSignInBusy(true);
    setSignInError(undefined);
    try {
      const contextMatches = async () => {
        const [accounts, chainValue] = await Promise.all([
          provider.request({ method: "eth_accounts" }),
          provider.request({ method: "eth_chainId" }),
        ]);
        const currentAddress = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : undefined;
        const currentChainId = typeof chainValue === "string" && /^0x[0-9a-f]+$/i.test(chainValue) ? Number.parseInt(chainValue, 16) : undefined;
        return providerRef.current === provider && currentAddress?.toLowerCase() === wallet.address!.toLowerCase()
          && currentChainId === expectedChainId && selectedNetworkRef.current === selectedNetwork;
      };
      if (!(await contextMatches())) {
        setSignInChallenge(undefined);
        setSignInError("The wallet account or network changed. No sign-in message was requested; refresh the wallet and start again.");
        return;
      }
      const signature = await signWalletAuthenticationMessage(provider, wallet.address, challenge.message);
      if (!(await contextMatches())) {
        throw new Error("wallet_auth_context_changed");
      }
      const session = await completeWalletAuthChallenge({ address: wallet.address, nonce: challenge.nonce, signature });
      accessEpoch.current += 1;
      pollRequestId.current += 1;
      pollInFlight.current = false;
      authenticationMethodRef.current = "wallet";
      authenticatedAddressRef.current = session.address;
      setAuthenticationMethod("wallet");
      setAuthenticatedAddress(session.address);
      setWalletAuthConfigured(true);
      setSignInChallenge(undefined);
      setSignInError(undefined);
      setCapabilityMessage(undefined);
      updateHistory(() => ({ runs: null, loadedPageCount: 0, isLoadingMore: false }));
      setDetails({});
      detailCache.current = {};
      optimisticRuns.current.clear();
      setDetailErrors({});
      setPreferredRunId(undefined);
      setCapabilities(undefined);
      setGateMessage(undefined);
      setDataError(undefined);
      updateGate("authenticated");
    } catch (error) {
      if (error instanceof SecurityApiClientError && error.status === 401) setSignInChallenge(undefined);
      setSignInError(walletSignInErrorMessage(error));
    } finally {
      setSignInBusy(false);
    }
  }, [signInChallenge, selectedNetwork, signInBusy, wallet.address, wallet.chainId, updateHistory, updateGate]);

  const cancelWalletSignIn = useCallback(() => {
    if (signInBusy) return;
    setSignInChallenge(undefined);
    setSignInError(undefined);
  }, [signInBusy]);

  const pressWalletButton = useCallback(() => {
    if (wallet.address) {
      disconnectWallet();
      return;
    }
    void openWalletPicker();
  }, [disconnectWallet, openWalletPicker, wallet.address]);

  const protectRequest = useCallback(<T,>(request: Promise<T>, requestEpoch: number): Promise<T> => request.catch((error: unknown) => {
    if (isUnauthorized(error) && requestEpoch === accessEpoch.current) expireSession();
    throw error;
  }), [expireSession]);

  const loadLiveData = useCallback(async () => {
    if (pollInFlight.current || !canUseProtectedResearch(gateRef.current)) return;
    const requestEpoch = accessEpoch.current;
    const activePollId = ++pollRequestId.current;
    pollInFlight.current = true;
    setIsRefreshing(true);
    try {
      const canReadCapabilities = shouldLoadResearchCapabilities(gateRef.current, authenticationMethodRef.current);
      const [capabilityResult, listResult] = await Promise.allSettled([
        canReadCapabilities ? protectRequest(getSecurityCapabilities(), requestEpoch) : Promise.resolve(undefined),
        protectRequest(listSecurityRuns({ limit: 20 }), requestEpoch),
      ]);
      if (requestEpoch !== accessEpoch.current || !canUseProtectedResearch(gateRef.current)) return;
      if (capabilityResult.status === "fulfilled" && capabilityResult.value) {
        setCapabilities(capabilityResult.value);
        setCapabilityMessage(undefined);
      } else if (capabilityResult.status === "fulfilled") {
        setCapabilities(undefined);
        setCapabilityMessage("Research capabilities could not be checked for this session. Creating a new run remains disabled until availability can be confirmed.");
      }
      else {
        setCapabilities(undefined);
        setCapabilityMessage(errorMessage(capabilityResult.reason));
      }
      if (listResult.status === "rejected") {
        setDataError(errorMessage(listResult.reason));
        updateHistory((current) => ({ ...current, historyError: errorMessage(listResult.reason) }));
        return;
      }
      const list = listResult.value;
      const serverIds = new Set(list.runs.map((run) => run.id));
      for (const runId of serverIds) optimisticRuns.current.delete(runId);
      const serverAndOptimisticRuns = reconcileResearchRunHistory(list.runs, [...optimisticRuns.current.values()]);
      updateHistory((current) => ({
        ...mergeFirstHistoryPage({
          runs: current.runs ?? [],
          nextCursor: current.nextCursor,
          loadedPageCount: current.loadedPageCount,
        }, { runs: serverAndOptimisticRuns, nextCursor: list.nextCursor }),
        isLoadingMore: current.isLoadingMore,
        historyError: undefined,
      }));
      if (capabilityResult.status === "fulfilled") setDataError(undefined);

      const retainedIds = new Set(historyRef.current.runs?.map((run) => run.id) ?? []);
      for (const runId of Object.keys(detailCache.current)) {
        if (!retainedIds.has(runId)) delete detailCache.current[runId];
      }

      const outdated = list.runs.filter((run) => detailCache.current[run.id]?.updatedAt !== run.updatedAt);
      const nextErrors: Record<string, string> = {};
      for (let offset = 0; offset < outdated.length; offset += DETAIL_BATCH_SIZE) {
        if (requestEpoch !== accessEpoch.current || !canUseProtectedResearch(gateRef.current)) return;
        const batch = outdated.slice(offset, offset + DETAIL_BATCH_SIZE);
        const results = await Promise.allSettled(batch.map((run) => protectRequest(getSecurityRun(run.id), requestEpoch)));
        if (requestEpoch !== accessEpoch.current || !canUseProtectedResearch(gateRef.current)) return;
        results.forEach((result, index) => {
          const runId = batch[index]!.id;
          if (result.status === "fulfilled") detailCache.current[runId] = result.value;
          else {
            nextErrors[runId] = errorMessage(result.reason);
          }
        });
      }
      setDetails({ ...detailCache.current });
      setDetailErrors((current) => {
        const merged = { ...current };
        for (const run of list.runs) delete merged[run.id];
        return { ...merged, ...nextErrors };
      });
    } catch (error) {
      if (!isUnauthorized(error) && requestEpoch === accessEpoch.current) setDataError(errorMessage(error));
    } finally {
      if (pollRequestId.current === activePollId) {
        setIsRefreshing(false);
        pollInFlight.current = false;
      }
    }
  }, [protectRequest, updateHistory]);

  useEffect(() => {
    void checkSession();
    return () => {
      sessionCheckId.current += 1;
    };
  }, [checkSession]);

  useEffect(() => {
    if (gate !== "authenticated") return;
    const initialLoad = setTimeout(() => { void loadLiveData(); }, 0);
    return () => {
      clearTimeout(initialLoad);
    };
  }, [gate, loadLiveData]);

  const hasActiveRuns = history.runs?.some((run) => run.status === "queued" || run.status === "running") ?? false;
  const waitForManualRetry = history.runs === null && Boolean(history.historyError);
  useEffect(() => {
    if (gate !== "authenticated" || waitForManualRetry) return;
    const interval = window.setInterval(
      () => { void loadLiveData(); },
      hasActiveRuns && !history.historyError ? ACTIVE_RUN_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [gate, hasActiveRuns, waitForManualRetry, history.historyError, loadLiveData]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setNetworkRpc({ status: "loading" });
      try {
        const snapshot = await getRobinhoodNetworkStatus(selectedNetwork);
        if (!active) return;
        setNetworkRpc({
          status: "available",
          chainId: snapshot.chainId,
          latestBlock: snapshot.latestBlock,
          observedAt: snapshot.observedAt,
        });
      } catch (error) {
        if (!active) return;
        setNetworkRpc({
          status: "unavailable",
          ...(error instanceof NetworkStatusClientError ? { errorCode: error.code, message: error.message } : {
            errorCode: "rpc_unavailable",
            message: "The public Robinhood RPC could not be reached.",
          }),
        });
      }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, NETWORK_REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedNetwork, networkRefreshNonce]);

  useEffect(() => () => {
    walletRequestGuardRef.current.invalidate();
    unwatchRef.current?.();
  }, []);

  const login = useCallback(async (token: string) => {
    await loginToSecurityService(token);
    accessEpoch.current += 1;
    pollRequestId.current += 1;
    pollInFlight.current = false;
    authenticationMethodRef.current = "operator";
    authenticatedAddressRef.current = undefined;
    setAuthenticationMethod("operator");
    setAuthenticatedAddress(undefined);
    setOperatorAuthConfigured(true);
    setCapabilityMessage(undefined);
    setSignInChallenge(undefined);
    updateHistory(() => ({ runs: null, loadedPageCount: 0, isLoadingMore: false }));
    setDetails({});
    detailCache.current = {};
    optimisticRuns.current.clear();
    setDetailErrors({});
    setPreferredRunId(undefined);
    setCapabilities(undefined);
    setGateMessage(undefined);
    setDataError(undefined);
    updateGate("authenticated");
  }, [updateGate, updateHistory]);

  const logout = useCallback(() => {
    const activeMethod = authenticationMethodRef.current;
    authenticationMethodRef.current = undefined;
    authenticatedAddressRef.current = undefined;
    setAuthenticationMethod(undefined);
    setAuthenticatedAddress(undefined);
    setSignInChallenge(undefined);
    setSignInError(undefined);
    setCapabilityMessage(undefined);
    accessEpoch.current += 1;
    pollRequestId.current += 1;
    pollInFlight.current = false;
    updateGate("unauthenticated");
    updateHistory(() => ({ runs: null, loadedPageCount: 0, isLoadingMore: false }));
    setDetails({});
    detailCache.current = {};
    optimisticRuns.current.clear();
    setPreferredRunId(undefined);
    setCapabilities(undefined);
    setDetailErrors({});
    setGateMessage(undefined);
    setDataError(undefined);
    setActionMessage(undefined);
    setIsRefreshing(false);
    setIsCreating(false);
    const signOut = activeMethod === "wallet" ? logoutWalletSession() : logoutFromSecurityService();
    void signOut.catch(() => setGateMessage("Your local research view is signed out, but the server could not confirm that the session cookie was cleared."));
  }, [updateGate, updateHistory]);

  const loadMoreRuns = useCallback(async () => {
    const current = historyRef.current;
    if (loadingMoreRef.current || !current.nextCursor || !canUseProtectedResearch(gateRef.current)) return;
    loadingMoreRef.current = true;
    const requestEpoch = accessEpoch.current;
    updateHistory((value) => ({ ...value, isLoadingMore: true, historyError: undefined }));
    try {
      const page = await protectRequest(listSecurityRuns({ limit: 20, cursor: current.nextCursor }), requestEpoch);
      if (requestEpoch !== accessEpoch.current || !canUseProtectedResearch(gateRef.current)) return;
      updateHistory((value) => ({ ...mergeHistoryPage({
        runs: value.runs ?? [],
        nextCursor: value.nextCursor,
        loadedPageCount: value.loadedPageCount,
      }, page), isLoadingMore: false, historyError: undefined }));

      const results = await Promise.allSettled(page.runs.map((run) => protectRequest(getSecurityRun(run.id), requestEpoch)));
      if (requestEpoch !== accessEpoch.current || !canUseProtectedResearch(gateRef.current)) return;
      const nextErrors: Record<string, string> = {};
      results.forEach((result, index) => {
        const runId = page.runs[index]!.id;
        if (result.status === "fulfilled") detailCache.current[runId] = result.value;
        else nextErrors[runId] = errorMessage(result.reason);
      });
      setDetails({ ...detailCache.current });
      setDetailErrors((value) => ({ ...value, ...nextErrors }));
    } catch (error) {
      if (requestEpoch === accessEpoch.current && !isUnauthorized(error)) {
        updateHistory((value) => ({ ...value, historyError: errorMessage(error) }));
      }
    } finally {
      if (requestEpoch === accessEpoch.current) {
        loadingMoreRef.current = false;
        updateHistory((value) => ({ ...value, isLoadingMore: false }));
      }
    }
  }, [protectRequest, updateHistory]);

  const loadResearchRun = useCallback(async (id: string) => {
    const activeEpoch = accessEpoch.current;
    if (!id || !canUseProtectedResearch(gateRef.current) || detailCache.current[id] || loadingRunIds.current.get(id) === activeEpoch) return;
    loadingRunIds.current.set(id, activeEpoch);
    const requestEpoch = activeEpoch;
    try {
      const detail = await protectRequest(getSecurityRun(id), requestEpoch);
      if (requestEpoch !== accessEpoch.current || !canUseProtectedResearch(gateRef.current)) return;
      detailCache.current[id] = detail;
      setDetails((value) => ({ ...value, [id]: detail }));
      setDetailErrors((value) => {
        const next = { ...value };
        delete next[id];
        return next;
      });
      updateHistory((value) => ({
        ...value,
        runs: newestFirstResearchRuns([...(value.runs ?? []), detail]),
      }));
      setPreferredRunId(id);
    } catch (error) {
      if (requestEpoch === accessEpoch.current && !isUnauthorized(error)) {
        setDetailErrors((value) => ({ ...value, [id]: errorMessage(error) }));
      }
    } finally {
      if (loadingRunIds.current.get(id) === requestEpoch) loadingRunIds.current.delete(id);
    }
  }, [protectRequest, updateHistory]);

  const startResearch = useCallback((topicId: ResearchTopicId) => {
    if (!canUseProtectedResearch(gateRef.current)) {
      setActionMessage("Sign in to the Security Swarm before starting a research run.");
      return;
    }
    if (capabilities?.provider !== "available" || capabilities.worker !== "available" || capabilities.persistence !== "available") {
      setActionMessage(capabilityMessage ?? "Live research execution is unavailable. Existing live run history remains available.");
      return;
    }
    const requestEpoch = accessEpoch.current;
    setIsCreating(true);
    setActionMessage(undefined);
    void protectRequest(createSecurityRun({ topicId }), requestEpoch).then((run) => {
      if (requestEpoch !== accessEpoch.current || !canUseProtectedResearch(gateRef.current)) return;
      optimisticRuns.current.set(run.id, run);
      setPreferredRunId(run.id);
      updateHistory((current) => ({ ...current, runs: newestFirstResearchRuns([...(current.runs ?? []).filter((item) => item.id !== run.id), run]) }));
      setActionMessage(`Live run ${run.id} queued. Completion is not a security approval or test pass.`);
      void loadLiveData();
    }).catch((error: unknown) => {
      if (requestEpoch === accessEpoch.current && !isUnauthorized(error)) setActionMessage(errorMessage(error));
    }).finally(() => setIsCreating(false));
  }, [capabilities, capabilityMessage, loadLiveData, protectRequest, updateHistory]);

  const securityRuns = useMemo(
    () => history.runs?.map((summary) => {
      const cached = details[summary.id];
      const current = cached?.updatedAt === summary.updatedAt ? cached : undefined;
      const detailError = detailErrors[summary.id] ?? (cached && !current ? "The detailed run response is older than the latest run-list update." : undefined);
      return toLiveSwarmRun(summary, current, detailError);
    }) ?? [],
    [history.runs, details, detailErrors],
  );
  const model = useMemo(() => buildLiveAppModel({
      wallet,
      selectedNetwork,
      networkRpc,
      capabilities,
      runs: history.runs,
      accessState: gate,
      authenticationMethod,
      authenticatedAddress,
      accessMessage: gateMessage,
      capabilitiesMessage: capabilityMessage,
      preferredRunId,
      dataError: history.historyError ?? dataError,
      isRefreshing,
      isCreating,
      actionMessage,
      hasMoreRuns: Boolean(history.nextCursor),
    }), [wallet, selectedNetwork, networkRpc, capabilities, history, gate, authenticationMethod, authenticatedAddress, gateMessage, capabilityMessage, preferredRunId, dataError, isRefreshing, isCreating, actionMessage]);
  const actions = useMemo<AppActions>(() => ({
      setNetwork(id) {
        if (!isNetworkAvailable(id)) return;
        if (selectedNetworkRef.current !== id && signInChallenge) {
          setSignInChallenge(undefined);
          setSignInError("The selected network changed. Request a new sign-in message for the current network.");
        }
        selectedNetworkRef.current = id;
        setSelectedNetwork(id);
        setNetworkRpc({ status: "loading" });
      },
    setAmount() { /* Swap input remains non-executable and disabled. */ },
    pressSwapButton() { /* No swap route or transaction method is configured. */ },
    pressWalletButton,
    refreshWallet: () => { void refreshWallet(); },
    refreshNetwork() {
      setNetworkRpc({ status: "loading" });
      setNetworkRefreshNonce((current) => current + 1);
    },
    pressLedgerAction(id) {
      if (id === "connect") void openWalletPicker();
      else if (id === "disconnect") disconnectWallet();
    },
    createSecurityRun: startResearch,
    logout,
  }), [pressWalletButton, openWalletPicker, disconnectWallet, refreshWallet, startResearch, logout, signInChallenge]);
  const value = useMemo<AppModelValue>(() => ({ model: { ...model, security: { ...model.security, runs: securityRuns } }, actions }), [model, actions, securityRuns]);
  const access = useMemo<LiveResearchAccessValue>(() => ({
    gate,
    message: gateMessage ?? capabilityMessage,
    capabilityMessage,
    wallet,
    selectedNetwork,
    authenticationMethod,
    authenticatedAddress,
    walletAuthConfigured,
    operatorAuthConfigured,
    signInChallenge,
    signInBusy,
    signInError,
    requestWalletSignIn,
    approveWalletSignIn,
    cancelWalletSignIn,
    connectWallet: () => { void openWalletPicker(); },
    login,
    retry: () => { void checkSession(); },
    hasMoreRuns: Boolean(history.nextCursor),
    isLoadingMore: history.isLoadingMore,
    historyError: history.historyError,
    loadMoreRuns,
    refreshHistory: () => { void loadLiveData(); },
    loadResearchRun,
  }), [gate, gateMessage, capabilityMessage, wallet, selectedNetwork, authenticationMethod, authenticatedAddress, walletAuthConfigured, operatorAuthConfigured, signInChallenge, signInBusy, signInError, requestWalletSignIn, approveWalletSignIn, cancelWalletSignIn, openWalletPicker, login, checkSession, history.nextCursor, history.isLoadingMore, history.historyError, loadMoreRuns, loadLiveData, loadResearchRun]);

  return (
    <LiveResearchAccessContext.Provider value={access}>
      <ModelContext.Provider value={value}>
        {children}
        <WalletPickerDialog
          open={walletPickerOpen}
          choices={walletChoices}
          isDiscovering={walletDiscoveryLoading}
          error={walletDiscoveryError}
          onSelect={selectWallet}
          onClose={closeWalletPicker}
        />
      </ModelContext.Provider>
    </LiveResearchAccessContext.Provider>
  );
}
