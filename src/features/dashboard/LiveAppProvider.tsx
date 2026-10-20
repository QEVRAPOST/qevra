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
  createSecurityRun,
  getSecurityCapabilities,
  getSecurityRun,
  getSecuritySessionStatus,
  listSecurityRuns,
  loginToSecurityService,
  logoutFromSecurityService,
  SecurityApiClientError,
} from "@/features/security/client";
import { connectReadOnlyWallet, createWalletRequestGuard, disconnectReadOnlyWallet, refreshReadOnlyWallet, watchReadOnlyWallet, type ReadOnlyEip1193Provider } from "@/features/wallet/read-only";
import { discoverInjectedReadOnlyWallets, type InjectedReadOnlyWalletChoice } from "@/features/wallet/browser";
import { getRobinhoodNetworkStatus, NetworkStatusClientError } from "@/features/wallet/network-client";
import { DEFAULT_NETWORK_ID, isNetworkAvailable } from "@/lib/config/networks";
import { buildLiveAppModel, newestFirstResearchRuns, reconcileResearchRunHistory, toLiveSwarmRun } from "./live-model";
import { canUseProtectedResearch, expireResearchSession, gateAfterProtectedResponse, mergeFirstHistoryPage, mergeHistoryPage, type ResearchGateState } from "./live-ui-state";

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
  return <LiveAccessGate gate={access.gate} message={access.message} onLogin={access.login} onRetry={access.retry} />;
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

function sessionStatusGate(status: { configured: boolean; authenticated: boolean }): GateState {
  if (!status.configured) return "not_configured";
  return status.authenticated ? "authenticated" : "unauthenticated";
}

export function LiveAccessGate({
  gate,
  message,
  onLogin,
  onRetry,
}: {
  gate: Exclude<GateState, "authenticated">;
  message?: string;
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

  return (
    <section className="operator-access-gate" aria-busy={gate === "checking" || undefined}>
      {gate === "unauthenticated" ? (
        <>
          {message ? <p className="operator-access-message" role="status">{message}</p> : null}
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
              <small id="qevra-live-token-hint">Enter the configured operator access token. A research Run ID is not an authentication token. It is sent only to the same-origin sign-in endpoint.</small>
            </div>
            <Button type="submit" disabled={!token || submitting || (loginRateLimited && loginRetryAt !== undefined && loginRetryAt > clock)}>
              {submitting ? "Signing in…" : loginRateLimited && loginRetryAt !== undefined && loginRetryAt > clock
                ? `Try again in ${Math.ceil((loginRetryAt - clock) / 1_000)}s`
                : "Sign in"}
            </Button>
            {loginError ? <p role="alert" className="operator-access-error">{loginError}</p> : null}
          </form>
        </>
      ) : gate === "service_error" || gate === "rate_limited" ? (
        <div className="operator-access-status" role="status">
          <p>{message ?? (gate === "rate_limited" ? "The operator session check is being rate-limited. Wait before trying again." : "The operator session could not be checked. Try again shortly.")}</p>
          <Button type="button" variant="ghost" onClick={onRetry}>Retry session check</Button>
        </div>
      ) : gate === "checking" ? (
        <p className="operator-access-status" role="status">Checking the server-side operator session.</p>
      ) : (
        <p className="operator-access-status" role="status">Operator authentication is not configured on the server. Research history and run creation remain protected.</p>
      )}
    </section>
  );
}

export function LiveAppProvider({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<GateState>("checking");
  const [gateMessage, setGateMessage] = useState<string>();
  const gateRef = useRef<GateState>("checking");
  const [wallet, setWallet] = useState<ReadOnlyWalletState>({ status: "disconnected" });
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [walletChoices, setWalletChoices] = useState<InjectedReadOnlyWalletChoice[]>([]);
  const [walletDiscoveryLoading, setWalletDiscoveryLoading] = useState(false);
  const [walletDiscoveryError, setWalletDiscoveryError] = useState<string>();
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkId>(DEFAULT_NETWORK_ID);
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

  const updateHistory = useCallback((update: (current: ResearchHistoryState) => ResearchHistoryState) => {
    const next = update(historyRef.current);
    historyRef.current = next;
    setHistory(next);
  }, []);

  const updateGate = useCallback((next: GateState) => {
    gateRef.current = next;
    setGate(next);
  }, []);

  const expireSession = useCallback((message = "Your operator session expired. Sign in again to continue using research history and run details.") => {
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
  }, [updateGate, updateHistory]);

  const checkSession = useCallback(async () => {
    const requestId = ++sessionCheckId.current;
    updateGate("checking");
    setGateMessage(undefined);
    try {
      const status = await getSecuritySessionStatus();
      if (requestId !== sessionCheckId.current) return;
      updateGate(sessionStatusGate(status));
    } catch (error) {
      if (requestId !== sessionCheckId.current) return;
      updateGate(sessionErrorGate(error));
      const message = error instanceof SecurityApiClientError && error.status === 401
        ? "The operator session could not be verified. Sign in again to continue using research history."
        : error instanceof SecurityApiClientError && (error.status === 429 || error.code === "rate_limit_exceeded")
          ? "The operator session check is rate-limited. Wait before trying again."
          : operatorAccessErrorMessage(error);
      setGateMessage(message);
    }
  }, [updateGate]);

  const refreshWallet = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) return;
    const requestId = walletRequestGuardRef.current.begin();
    setWallet({ status: "loading", message: "Refreshing the wallet account, network, and read-only balance." });
    const value = await refreshReadOnlyWallet(provider);
    if (!walletRequestGuardRef.current.isCurrent(requestId) || providerRef.current !== provider) return;
    setWallet(value);
  }, []);

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
    setWallet(state);
    if (state.address) {
      unwatchRef.current = watchReadOnlyWallet(provider, () => { void refreshWallet(); });
    } else {
      providerRef.current = undefined;
    }
  }, [closeWalletPicker, refreshWallet, wallet.address, wallet.status]);

  const selectWallet = useCallback((id: string) => {
    const choice = walletChoices.find((walletChoice) => walletChoice.id === id);
    if (!choice || wallet.address || wallet.status === "loading") return;
    void connectWallet(choice.provider);
  }, [connectWallet, wallet.address, wallet.status, walletChoices]);

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
      const [capabilityResult, listResult] = await Promise.allSettled([
        protectRequest(getSecurityCapabilities(), requestEpoch),
        protectRequest(listSecurityRuns({ limit: 20 }), requestEpoch),
      ]);
      if (requestEpoch !== accessEpoch.current || !canUseProtectedResearch(gateRef.current)) return;
      if (capabilityResult.status === "fulfilled") setCapabilities(capabilityResult.value);
      else {
        setCapabilities(undefined);
        setDataError(errorMessage(capabilityResult.reason));
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
    const requestId = ++sessionCheckId.current;
    let active = true;
    void getSecuritySessionStatus().then((status) => {
      if (!active || requestId !== sessionCheckId.current) return;
      updateGate(sessionStatusGate(status));
    }).catch((error: unknown) => {
      if (!active || requestId !== sessionCheckId.current) return;
      updateGate(sessionErrorGate(error));
      setGateMessage(errorMessage(error));
    });
    return () => {
      active = false;
      sessionCheckId.current += 1;
    };
  }, [updateGate]);

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
    void logoutFromSecurityService().catch(() => undefined).finally(() => {
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
    });
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
      setActionMessage("Live research execution is unavailable. Existing live run history remains available.");
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
  }, [capabilities, loadLiveData, protectRequest, updateHistory]);

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
      accessMessage: gateMessage,
      preferredRunId,
      dataError: history.historyError ?? dataError,
      isRefreshing,
      isCreating,
      actionMessage,
      hasMoreRuns: Boolean(history.nextCursor),
    }), [wallet, selectedNetwork, networkRpc, capabilities, history, gate, gateMessage, preferredRunId, dataError, isRefreshing, isCreating, actionMessage]);
  const actions = useMemo<AppActions>(() => ({
      setNetwork(id) {
        if (!isNetworkAvailable(id)) return;
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
  }), [pressWalletButton, openWalletPicker, disconnectWallet, refreshWallet, startResearch, logout]);
  const value = useMemo<AppModelValue>(() => ({ model: { ...model, security: { ...model.security, runs: securityRuns } }, actions }), [model, actions, securityRuns]);
  const access = useMemo<LiveResearchAccessValue>(() => ({
    gate,
    message: gateMessage,
    login,
    retry: () => { void checkSession(); },
    hasMoreRuns: Boolean(history.nextCursor),
    isLoadingMore: history.isLoadingMore,
    historyError: history.historyError,
    loadMoreRuns,
    refreshHistory: () => { void loadLiveData(); },
    loadResearchRun,
  }), [gate, gateMessage, login, checkSession, history.nextCursor, history.isLoadingMore, history.historyError, loadMoreRuns, loadLiveData, loadResearchRun]);

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
