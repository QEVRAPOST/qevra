"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { AppNotice } from "@/components/ui/AppNotice";
import { ModelContext } from "@/components/dashboard/AppModelContext";
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
import { getInjectedReadOnlyProvider } from "@/features/wallet/browser";
import { getRobinhoodNetworkStatus, NetworkStatusClientError } from "@/features/wallet/network-client";
import { DEFAULT_NETWORK_ID, isNetworkAvailable } from "@/lib/config/networks";
import { buildLiveAppModel, newestFirstResearchRuns, reconcileResearchRunHistory, toLiveSwarmRun } from "./live-model";

type GateState = "checking" | "not_configured" | "unauthenticated" | "authenticated" | "service_error" | "rate_limited";
const ACTIVE_RUN_POLL_INTERVAL_MS = 5_000;
const IDLE_POLL_INTERVAL_MS = 30_000;
const DETAIL_BATCH_SIZE = 3;
const NETWORK_REFRESH_INTERVAL_MS = 30_000;

function errorMessage(error: unknown): string {
  if (error instanceof SecurityApiClientError) return `${error.code}: ${error.message}`;
  return "The live service request failed. Existing live values were not replaced with demo data.";
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

function LiveAccessGate({
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
      setLoginError(errorMessage(error));
      if (error instanceof SecurityApiClientError && error.status === 429) {
        setLoginRateLimited(true);
        setLoginRetryAt(Date.now() + (error.retryAfterMs ?? 60_000));
      }
      setToken("");
    } finally {
      setSubmitting(false);
    }
  }

  const title = loginRateLimited
    ? "Sign-in rate-limited"
    : gate === "checking" ? "Checking live service"
      : gate === "not_configured" ? "Live access is not configured"
        : gate === "service_error" ? "Live service error"
          : gate === "rate_limited" ? "Live access rate-limited"
            : "Sign in to live services";
  const detail = gate === "checking"
    ? "Checking server-side session status. No wallet request is made."
    : gate === "not_configured"
      ? "The server has not configured operator authentication. Example data is not substituted in live mode."
      : gate === "service_error"
        ? message ?? "The live service could not be reached. Example data is not substituted in live mode."
        : gate === "rate_limited"
          ? message ?? "The live service is rate-limiting access checks. Wait before retrying."
          : "Use the operator access token to start a short-lived, HTTP-only session. The token is kept only in this form while signing in.";

  return (
    <AppNotice
      title={title}
      lead={detail}
      busy={gate === "checking"}
      tone={gate === "service_error" || gate === "rate_limited" || loginError ? "problem" : "info"}
    >
        {gate === "unauthenticated" ? (
          <Panel title="Live service access">
            <form onSubmit={submit}>
              <Field label="Operator access token" token="private" hint="Sent only to this site's same-origin session endpoint." htmlFor="qevra-live-token">
                <input
                  id="qevra-live-token"
                  type="password"
                  autoComplete="current-password"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
              </Field>
              <Button type="submit" disabled={!token || submitting || (loginRateLimited && loginRetryAt !== undefined && loginRetryAt > clock)}>
                {submitting ? "Signing in…" : loginRateLimited && loginRetryAt !== undefined && loginRetryAt > clock
                  ? `Try again in ${Math.ceil((loginRetryAt - clock) / 1_000)}s`
                  : "Sign in"}
              </Button>
              {loginError ? <p role="alert">{loginError}</p> : null}
            </form>
          </Panel>
        ) : gate === "service_error" || gate === "rate_limited" ? (
          <Panel title="Retry live access check">
            <p>{message ?? detail}</p>
            <Button type="button" onClick={onRetry}>Retry</Button>
          </Panel>
        ) : (
          <Panel title="No live data is shown.">{message ?? detail}</Panel>
        )}
    </AppNotice>
  );
}

export function LiveAppProvider({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<GateState>("checking");
  const [gateMessage, setGateMessage] = useState<string>();
  const [wallet, setWallet] = useState<ReadOnlyWalletState>({ status: "disconnected" });
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkId>(DEFAULT_NETWORK_ID);
  const [networkRpc, setNetworkRpc] = useState<NetworkRpcState>({ status: "not_requested" });
  const [capabilities, setCapabilities] = useState<AppModel["security"]["capabilities"]>();
  const [summaries, setSummaries] = useState<ResearchRunSummary[] | null>(null);
  const [preferredRunId, setPreferredRunId] = useState<string>();
  const [details, setDetails] = useState<Record<string, ResearchRunDetail>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [actionMessage, setActionMessage] = useState<string>();
  const [dataError, setDataError] = useState<string>();
  const providerRef = useRef<ReadOnlyEip1193Provider | undefined>(undefined);
  const unwatchRef = useRef<(() => void) | undefined>(undefined);
  const walletRequestGuardRef = useRef(createWalletRequestGuard());
  const pollInFlight = useRef(false);
  const detailCache = useRef<Record<string, ResearchRunDetail>>({});
  const optimisticRuns = useRef(new Map<string, ResearchRunSummary>());
  const sessionCheckId = useRef(0);

  const checkSession = useCallback(async () => {
    const requestId = ++sessionCheckId.current;
    setGate("checking");
    setGateMessage(undefined);
    try {
      const status = await getSecuritySessionStatus();
      if (requestId !== sessionCheckId.current) return;
      setGate(sessionStatusGate(status));
    } catch (error) {
      if (requestId !== sessionCheckId.current) return;
      setGate(sessionErrorGate(error));
      setGateMessage(errorMessage(error));
    }
  }, []);

  const refreshWallet = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) return;
    const requestId = walletRequestGuardRef.current.begin();
    setWallet({ status: "loading", message: "Refreshing the wallet account, network, and read-only balance." });
    const value = await refreshReadOnlyWallet(provider);
    if (!walletRequestGuardRef.current.isCurrent(requestId) || providerRef.current !== provider) return;
    setWallet(value);
  }, []);

  const disconnectWallet = useCallback(() => {
    walletRequestGuardRef.current.invalidate();
    unwatchRef.current?.();
    unwatchRef.current = undefined;
    providerRef.current = undefined;
    setWallet(disconnectReadOnlyWallet());
  }, []);

  const connectWallet = useCallback(async () => {
    if (wallet.status === "loading") return;
    if (providerRef.current && wallet.address) {
      disconnectWallet();
      return;
    }
    const provider = getInjectedReadOnlyProvider();
    if (!provider) {
      walletRequestGuardRef.current.invalidate();
      setWallet({ status: "wallet_not_installed", message: "No EIP-1193 wallet provider is available." });
      return;
    }
    const requestId = walletRequestGuardRef.current.begin();
    setWallet({ status: "loading", message: "Waiting for your wallet's account-access decision." });
    providerRef.current = provider;
    const state = await connectReadOnlyWallet(provider);
    if (!walletRequestGuardRef.current.isCurrent(requestId) || providerRef.current !== provider) return;
    setWallet(state);
    if (state.address) {
      unwatchRef.current?.();
      unwatchRef.current = watchReadOnlyWallet(provider, () => { void refreshWallet(); });
    }
  }, [disconnectWallet, refreshWallet, wallet.address, wallet.status]);

  const loadLiveData = useCallback(async () => {
    if (pollInFlight.current || gate !== "authenticated") return;
    pollInFlight.current = true;
    setIsRefreshing(true);
    try {
      const [capabilityResult, listResult] = await Promise.allSettled([
        getSecurityCapabilities(),
        listSecurityRuns({ limit: 20 }),
      ]);
      const unauthorized = [capabilityResult, listResult].some((result) => result.status === "rejected" && isUnauthorized(result.reason));
      if (unauthorized) {
        disconnectWallet();
        setGate("unauthenticated");
        setDataError("Your live session expired. Sign in again to continue reading the live API.");
        return;
      }
      if (capabilityResult.status === "fulfilled") setCapabilities(capabilityResult.value);
      else {
        setCapabilities(undefined);
        setDataError(errorMessage(capabilityResult.reason));
      }
      if (listResult.status === "rejected") {
        setDataError(errorMessage(listResult.reason));
        return;
      }
      const list = listResult.value;
      const serverIds = new Set(list.runs.map((run) => run.id));
      for (const runId of serverIds) optimisticRuns.current.delete(runId);
      setSummaries(reconcileResearchRunHistory(list.runs, [...optimisticRuns.current.values()]));
      if (capabilityResult.status === "fulfilled") setDataError(undefined);

      const retainedIds = new Set(list.runs.map((run) => run.id));
      for (const runId of Object.keys(detailCache.current)) {
        if (!retainedIds.has(runId)) delete detailCache.current[runId];
      }

      const outdated = list.runs.filter((run) => detailCache.current[run.id]?.updatedAt !== run.updatedAt);
      const nextErrors: Record<string, string> = {};
      for (let offset = 0; offset < outdated.length; offset += DETAIL_BATCH_SIZE) {
        const batch = outdated.slice(offset, offset + DETAIL_BATCH_SIZE);
        const results = await Promise.allSettled(batch.map((run) => getSecurityRun(run.id)));
        if (results.some((result) => result.status === "rejected" && isUnauthorized(result.reason))) {
          disconnectWallet();
          setGate("unauthenticated");
          setDataError("Your live session expired. Sign in again to continue reading the live API.");
          return;
        }
        results.forEach((result, index) => {
          const runId = batch[index]!.id;
          if (result.status === "fulfilled") detailCache.current[runId] = result.value;
          else {
            nextErrors[runId] = errorMessage(result.reason);
          }
        });
      }
      setDetails({ ...detailCache.current });
      setDetailErrors(nextErrors);
    } catch (error) {
      if (isUnauthorized(error)) {
        disconnectWallet();
        setGate("unauthenticated");
        setDataError("Your live session expired. Sign in again to continue reading the live API.");
      } else {
        setDataError(errorMessage(error));
      }
    } finally {
      setIsRefreshing(false);
      pollInFlight.current = false;
    }
  }, [gate, disconnectWallet]);

  useEffect(() => {
    const requestId = ++sessionCheckId.current;
    let active = true;
    void getSecuritySessionStatus().then((status) => {
      if (!active || requestId !== sessionCheckId.current) return;
      setGate(sessionStatusGate(status));
    }).catch((error: unknown) => {
      if (!active || requestId !== sessionCheckId.current) return;
      setGate(sessionErrorGate(error));
      setGateMessage(errorMessage(error));
    });
    return () => {
      active = false;
      sessionCheckId.current += 1;
    };
  }, []);

  useEffect(() => {
    if (gate !== "authenticated") return;
    const initialLoad = setTimeout(() => { void loadLiveData(); }, 0);
    return () => {
      clearTimeout(initialLoad);
    };
  }, [gate, loadLiveData]);

  const hasActiveRuns = summaries?.some((run) => run.status === "queued" || run.status === "running") ?? false;
  const waitForManualRetry = summaries === null && Boolean(dataError);
  useEffect(() => {
    if (gate !== "authenticated" || waitForManualRetry) return;
    const interval = window.setInterval(
      () => { void loadLiveData(); },
      hasActiveRuns && !dataError ? ACTIVE_RUN_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [gate, hasActiveRuns, waitForManualRetry, dataError, loadLiveData]);

  useEffect(() => {
    if (gate !== "authenticated") return;
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
  }, [gate, selectedNetwork]);

  useEffect(() => () => {
    walletRequestGuardRef.current.invalidate();
    unwatchRef.current?.();
  }, []);

  const login = useCallback(async (token: string) => {
    await loginToSecurityService(token);
    setGateMessage(undefined);
    setDataError(undefined);
    setGate("authenticated");
  }, []);

  const logout = useCallback(() => {
    void logoutFromSecurityService().catch(() => undefined).finally(() => {
      disconnectWallet();
      setGate("unauthenticated");
      setSummaries(null);
      setDetails({});
      detailCache.current = {};
      optimisticRuns.current.clear();
      setPreferredRunId(undefined);
      setCapabilities(undefined);
      setDataError(undefined);
    });
  }, [disconnectWallet]);

  const startResearch = useCallback((topicId: ResearchTopicId) => {
    if (capabilities?.provider !== "available" || capabilities.worker !== "available" || capabilities.persistence !== "available") {
      setActionMessage("Live research execution is unavailable. Existing live run history remains available.");
      return;
    }
    setIsCreating(true);
    setActionMessage(undefined);
    void createSecurityRun({ topicId }).then((run) => {
      optimisticRuns.current.set(run.id, run);
      setPreferredRunId(run.id);
      setSummaries((current) => newestFirstResearchRuns([run, ...(current ?? []).filter((item) => item.id !== run.id)]));
      setActionMessage(`Live run ${run.id} queued. Completion is not a security approval or test pass.`);
      void loadLiveData();
    }).catch((error: unknown) => {
      setActionMessage(errorMessage(error));
    }).finally(() => setIsCreating(false));
  }, [capabilities, loadLiveData]);

  const securityRuns = useMemo(
    () => summaries?.map((summary) => {
      const cached = details[summary.id];
      const current = cached?.updatedAt === summary.updatedAt ? cached : undefined;
      const detailError = detailErrors[summary.id] ?? (cached && !current ? "The detailed run response is older than the latest run-list update." : undefined);
      return toLiveSwarmRun(summary, current, detailError);
    }) ?? [],
    [summaries, details, detailErrors],
  );
    const model = useMemo(() => buildLiveAppModel({
      wallet,
      selectedNetwork,
      networkRpc,
      capabilities,
      runs: summaries,
      preferredRunId,
      dataError,
    isRefreshing,
    isCreating,
    actionMessage,
    }), [wallet, selectedNetwork, networkRpc, capabilities, summaries, preferredRunId, dataError, isRefreshing, isCreating, actionMessage]);
    const actions = useMemo<AppActions>(() => ({
      setNetwork(id) {
        if (!isNetworkAvailable(id)) return;
        setSelectedNetwork(id);
        setNetworkRpc({ status: "loading" });
      },
    setAmount() { /* Swap input remains non-executable and disabled. */ },
    pressSwapButton() { /* No swap route or transaction method is configured. */ },
    pressWalletButton() { void connectWallet(); },
    refreshWallet: () => { void refreshWallet(); },
    pressLedgerAction(id) {
      if (id === "connect") void connectWallet();
      else if (id === "disconnect") disconnectWallet();
    },
    createSecurityRun: startResearch,
    logout,
    }), [connectWallet, disconnectWallet, refreshWallet, startResearch, logout]);
  const value = useMemo<AppModelValue>(() => ({ model: { ...model, security: { ...model.security, runs: securityRuns } }, actions }), [model, actions, securityRuns]);

  if (gate !== "authenticated") {
    return <LiveAccessGate gate={gate} message={gateMessage ?? dataError} onLogin={login} onRetry={() => { void checkSession(); }} />;
  }

  if (summaries === null && dataError) {
    return (
      <AppNotice title="Live service error" lead={dataError} tone="problem">
        <Panel title="Retry live run history">
          <p>No example runs were substituted. Retry the authenticated run-history request.</p>
          <Button type="button" disabled={isRefreshing} onClick={() => { void loadLiveData(); }}>
            {isRefreshing ? "Retrying…" : "Retry"}
          </Button>
        </Panel>
      </AppNotice>
    );
  }

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}
