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
} from "@/types";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { StatusBar } from "@/components/ui/StatusBar";
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
import { toLiveSecurityRun } from "./live-adapters";
import { buildLiveAppModel } from "./live-model";

type GateState = "checking" | "unconfigured" | "login" | "authenticated" | "unavailable";
const STATUS = [{ id: "live-access", tone: "unk" as const, text: "LIVE DATA · READ-ONLY ACCESS" }];
const POLL_INTERVAL_MS = 5_000;
const DETAIL_BATCH_SIZE = 3;

function errorMessage(error: unknown): string {
  if (error instanceof SecurityApiClientError) return `${error.code}: ${error.message}`;
  return "The live service request failed. Existing live values were not replaced with demo data.";
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof SecurityApiClientError && error.status === 401;
}

function detailToRun(
  summary: ResearchRunSummary,
  detail?: ResearchRunDetail,
  detailUnavailable?: string,
) {
  if (!detail) {
    return {
      origin: "live" as const,
      id: summary.id,
      role: "Research · Analysis · Verification",
      goal: summary.topic,
      status: summary.status === "completed"
        ? { label: "Research completed", tone: "neutral" as const, material: "solid" as const }
        : summary.status === "failed"
          ? { label: "Failed", tone: "bad" as const, material: "solid" as const }
          : summary.status === "running"
            ? { label: "Running", tone: "exp" as const, material: "outline" as const }
            : { label: "Queued", tone: "unk" as const, material: "dotted" as const },
      shows: `${summary.findingCount} findings; ${summary.availableSourceCount} of ${summary.sourceCount} sources available.`,
      how: `Current stage: ${summary.currentStage}. ${summary.agents.map((agent) => `${agent.role}: ${agent.status}`).join(" · ")}.`,
      notShown: "Research completion is not an audit, independent review, or security guarantee.",
      limitation: "Full source evidence and limitations are not currently available.",
      evidence: detailUnavailable ? "Full run detail is unavailable." : "Loading full source evidence and limitations.",
      unavailableSource: summary.availableSourceCount < summary.sourceCount,
      zeroFindings: summary.status === "completed" && summary.findingCount === 0,
      humanReview: { recorded: false as const },
      liveSummary: summary,
      ...(detailUnavailable ? { detailUnavailable } : {}),
    };
  }

  const hasUnavailableSource = detail.sources.some((source) => source.status === "unavailable");
  const sourceText = detail.sources.map((source) =>
    `${source.status}: ${source.title} · ${source.url} · retrieved ${source.retrievedAt}${source.sha256 ? ` · SHA-256 ${source.sha256}` : ""}`,
  ).join("\n");
  const findingText = detail.findings.map((finding) =>
    `${finding.modelAssessment}/${finding.evidenceStatus}: ${finding.claim}`,
  ).join("\n");
  return {
    ...toLiveSecurityRun(detail),
    role: "Research · Analysis · Verification",
    goal: detail.topic,
    status: detail.status === "completed"
      ? { label: "Research completed", tone: "neutral" as const, material: "solid" as const }
      : detail.status === "failed"
        ? { label: "Failed", tone: "bad" as const, material: "solid" as const }
        : detail.status === "running"
          ? { label: "Running", tone: "exp" as const, material: "outline" as const }
          : { label: "Queued", tone: "unk" as const, material: "dotted" as const },
    shows: detail.summary ?? `${detail.findings.length} findings recorded.`,
    how: `Current stage: ${detail.currentStage}. ${detail.agents.map((agent) => `${agent.role}: ${agent.status}`).join(" · ")}.`,
    notShown: "Research completion is not an audit, independent review, or security guarantee.",
    limitation: detail.limitations.join(" · ") || "No limitations were recorded by the agents; this does not imply that none exist.",
    evidence: [sourceText, findingText].filter(Boolean).join("\n") || "No source or finding evidence was recorded.",
    unavailableSource: hasUnavailableSource,
    zeroFindings: detail.status === "completed" && detail.findings.length === 0,
    humanReview: detail.humanReview.status === "reviewed" && detail.humanReview.reviewer && detail.humanReview.reviewedAt
      ? { recorded: true as const, by: detail.humanReview.reviewer, at: detail.humanReview.reviewedAt }
      : { recorded: false as const },
    liveSummary: summary,
    liveDetail: detail,
  };
}

function LiveAccessGate({
  gate,
  message,
  onLogin,
}: {
  gate: Exclude<GateState, "authenticated">;
  message?: string;
  onLogin: (token: string) => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || submitting) return;
    setSubmitting(true);
    setLoginError(undefined);
    try {
      await onLogin(token);
      setToken("");
    } catch (error) {
      setLoginError(errorMessage(error));
      setToken("");
    } finally {
      setSubmitting(false);
    }
  }

  const title = gate === "checking" ? "Checking live service" : gate === "unconfigured" ? "Live access is not configured" : gate === "unavailable" ? "Live service unavailable" : "Sign in to live services";
  const detail = gate === "checking"
    ? "Checking server-side session status. No wallet request is made."
    : gate === "unconfigured"
      ? "The server has not configured operator authentication. Example data is not substituted in live mode."
      : gate === "unavailable"
        ? message ?? "The live service could not be reached. Example data is not substituted in live mode."
        : "Use the operator access token to start a short-lived, HTTP-only session. The token is kept only in this form while signing in.";

  return (
    <>
      <StatusBar items={STATUS} />
      <main className="wrap wide notice-page" id="main" tabIndex={-1}>
        <div className="rhead">
          <h1>{title}</h1>
          <p>{detail}</p>
        </div>
        {gate === "login" ? (
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
              <Button type="submit" disabled={!token || submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
              {loginError ? <p role="alert">{loginError}</p> : null}
            </form>
          </Panel>
        ) : (
          <EmptyState title="No live data is shown.">{message ?? detail}</EmptyState>
        )}
      </main>
    </>
  );
}

export function LiveAppProvider({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<GateState>("checking");
  const [gateMessage, setGateMessage] = useState<string>();
  const [wallet, setWallet] = useState<ReadOnlyWalletState>({ status: "disconnected" });
  const [capabilities, setCapabilities] = useState<AppModel["security"]["capabilities"]>();
  const [summaries, setSummaries] = useState<ResearchRunSummary[] | null>(null);
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

  const refreshWallet = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) return;
    const requestId = walletRequestGuardRef.current.begin();
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
  }, [disconnectWallet, refreshWallet, wallet.address]);

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
        setGate("login");
        setDataError("Your live session expired. Sign in again to continue reading the live API.");
        return;
      }
      if (capabilityResult.status === "fulfilled") setCapabilities(capabilityResult.value);
      else setDataError(errorMessage(capabilityResult.reason));
      if (listResult.status === "rejected") {
        setDataError(errorMessage(listResult.reason));
        return;
      }
      const list = listResult.value;
      setSummaries(list.runs);
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
          setGate("login");
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
        setGate("login");
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
    let mounted = true;
    void getSecuritySessionStatus().then((status) => {
      if (!mounted) return;
      if (!status.configured) setGate("unconfigured");
      else if (status.authenticated) setGate("authenticated");
      else setGate("login");
    }).catch((error: unknown) => {
      if (!mounted) return;
      setGate("unavailable");
      setGateMessage(errorMessage(error));
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (gate !== "authenticated") return;
    const initialLoad = setTimeout(() => { void loadLiveData(); }, 0);
    const interval = setInterval(() => { void loadLiveData(); }, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [gate, loadLiveData]);

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
      setGate("login");
      setSummaries(null);
      setDetails({});
      detailCache.current = {};
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
      return detailToRun(summary, current, detailError);
    }) ?? [],
    [summaries, details, detailErrors],
  );
  const model = useMemo(() => buildLiveAppModel({
    wallet,
    capabilities,
    runs: summaries,
    dataError,
    isRefreshing,
    isCreating,
    actionMessage,
  }), [wallet, capabilities, summaries, dataError, isRefreshing, isCreating, actionMessage]);
  const actions = useMemo<AppActions>(() => ({
    setNetwork() { /* Read-only mode never asks a wallet to switch chains. */ },
    setAmount() { /* Swap input remains non-executable and disabled. */ },
    pressSwapButton() { /* No swap route or transaction method is configured. */ },
    pressWalletButton() { void connectWallet(); },
    pressLedgerAction(id) {
      if (id === "connect") void connectWallet();
      else if (id === "disconnect") disconnectWallet();
    },
    createSecurityRun: startResearch,
    logout,
  }), [connectWallet, disconnectWallet, startResearch, logout]);
  const value = useMemo<AppModelValue>(() => ({ model: { ...model, security: { ...model.security, runs: securityRuns } }, actions }), [model, actions, securityRuns]);

  if (gate !== "authenticated") {
    return <LiveAccessGate gate={gate} message={gateMessage ?? dataError} onLogin={login} />;
  }

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}
