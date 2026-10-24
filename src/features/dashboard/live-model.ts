import type {
  ActivityView,
  AppModel,
  CoverageRow,
  NetworkId,
  NetworkRpcState,
  ReadOnlyWalletState,
  ResearchHumanReviewSubmission,
  ResearchRunDetail,
  ResearchRunSummary,
  SecurityResearchCapabilities,
  SetupStepView,
  StatusBarItem,
  SwarmRun,
} from "@/types";
import { NETWORKS } from "@/lib/config/networks";
import { COVERAGE_ROWS } from "@/lib/content/status";
import { brandizeDisplayStrings, brandizeProjectName, PROJECT_NAME } from "@/lib/project-brand";
import { runBadge, STAGE_META, STAGE_ORDER, STATUS_TEXT } from "@/lib/swarm-view";

const READ_ONLY_NOTICE = brandizeProjectName("This view reads public account/network data. Research sign-in can request an EIP-191 login-message signature after your approval; transaction signing, token approvals, custody, and swap execution are disabled.", PROJECT_NAME);

function validationPath(path: Array<string | number>): string {
  return path.length === 0 ? "<root>" : path.map((part) => typeof part === "number" ? `[${part}]` : part).join(".");
}

function appendProviderDiagnostics(detail: ResearchRunDetail): ResearchRunDetail {
  const messages = detail.agents.flatMap((agent) => {
    if (agent.status !== "failed") return [];
    const diagnostics = agent.providerReportedUsage?.outputDiagnostics;
    if (!diagnostics) return [];
    const issues = diagnostics.validationIssues?.map((issue) => `${validationPath(issue.path)} (${issue.code})`) ?? [];
    const issueSummary = diagnostics.validationIssueCount !== undefined
      ? `; ${diagnostics.validationIssueCount} schema issue${diagnostics.validationIssueCount === 1 ? "" : "s"}${issues.length > 0 ? `: ${issues.join(", ")}` : ""}`
      : "";
    return [`${agent.role} provider diagnostics: ${diagnostics.validationCategory ?? "response failure"}${diagnostics.finishReason ? `; finish reason ${diagnostics.finishReason}` : ""}${issueSummary}.`];
  });
  if (messages.length === 0) return detail;
  return { ...detail, errorMessage: [detail.errorMessage, ...messages].filter(Boolean).join(" ") };
}

function summarizeAgentStatuses(agents: ResearchRunSummary["agents"]): string {
  return STAGE_ORDER.map((role) => {
    const agent = agents.find((candidate) => candidate.role === role);
    return `${STAGE_META[role].title}: ${agent ? STATUS_TEXT[agent.status].toLowerCase() : "not reported"}`;
  }).join(" · ");
}

function currentActionMessage(message: string | undefined, runs: ResearchRunSummary[] | null | undefined): string | undefined {
  if (!message) return undefined;
  const queuedRunId = /^Live run ([^\s]+) queued\./.exec(message)?.[1];
  if (!queuedRunId) return message;
  const run = runs?.find((candidate) => candidate.id === queuedRunId);
  if (run && run.status !== "queued" && run.status !== "running") return undefined;
  return message;
}

export function toLiveSwarmRun(summary: ResearchRunSummary, detail?: ResearchRunDetail, detailUnavailable?: string): SwarmRun {
  const state = detail ?? summary;
  const safeDetail = detail ? appendProviderDiagnostics(detail) : undefined;
  const badgeInput: SwarmRun = {
    origin: "live",
    id: summary.id,
    role: "Research · Analysis · Verification",
    goal: summary.topic,
    status: { label: "Live research run", tone: "neutral", material: "outline" },
    shows: "",
    how: "",
    notShown: "",
    limitation: "",
    evidence: "",
    humanReview: { recorded: false },
    liveSummary: summary,
    ...(safeDetail ? { liveDetail: safeDetail } : {}),
  };
  const hasUnavailableSource = detail
    ? detail.sources.some((source) => source.status === "unavailable")
    : summary.availableSourceCount < summary.sourceCount;
  const sourceText = detail?.sources.map((source) =>
    `${source.status}: ${source.title} · ${source.url} · retrieved ${source.retrievedAt}${source.sha256 ? ` · SHA-256 ${source.sha256}` : ""}`,
  ).join("\n") ?? "";
  const findingText = detail?.findings.map((finding) =>
    `${finding.modelAssessment}/${finding.evidenceStatus}: ${finding.claim}`,
  ).join("\n") ?? "";
  return {
    origin: "live",
    id: summary.id,
    role: "Research · Analysis · Verification",
    goal: summary.topic,
    status: runBadge(badgeInput),
    shows: detail?.summary ?? `${state.findingCount} findings; ${state.availableSourceCount} of ${state.sourceCount} sources available.`,
    how: `Current stage: ${state.currentStage}. ${summarizeAgentStatuses(state.agents)}.`,
    notShown: "Model research is not an audit, an independent review, or proof that the system is safe.",
    limitation: "Source quotations are checked by exact text match; that check does not establish the semantic truth of a claim.",
    evidence: detail
      ? [sourceText, findingText].filter(Boolean).join("\n") || "No source or finding evidence was recorded."
      : detailUnavailable ? "Full run detail is unavailable." : "Loading full source evidence and limitations.",
    unavailableSource: hasUnavailableSource,
    ...(detail?.status === "completed" && detail.findings.length === 0 ? { zeroFindings: true } : {}),
    humanReview: safeDetail?.humanReview.status === "reviewed" && safeDetail.humanReview.reviewer && safeDetail.humanReview.reviewedAt
      ? {
          recorded: true,
          by: safeDetail.humanReview.reviewer,
          at: safeDetail.humanReview.reviewedAt,
          ...(safeDetail.humanReview.disposition ? { disposition: safeDetail.humanReview.disposition } : {}),
          ...(safeDetail.humanReview.decision ? { decision: safeDetail.humanReview.decision } : {}),
          ...(safeDetail.humanReview.notes ? { notes: safeDetail.humanReview.notes } : {}),
          ...(safeDetail.humanReview.reviewKind ? { reviewKind: safeDetail.humanReview.reviewKind } : {}),
          ...(safeDetail.humanReview.disclaimer ? { disclaimer: safeDetail.humanReview.disclaimer } : {}),
        }
      : { recorded: false },
    liveSummary: summary,
    ...(safeDetail ? { liveDetail: safeDetail } : {}),
    ...(detailUnavailable ? { detailUnavailable } : {}),
  };
}

/** Merge only the server-confirmed review response into the matching cached report. */
export function withPersistedHumanReview(
  run: ResearchRunDetail,
  saved: ResearchHumanReviewSubmission,
): ResearchRunDetail {
  if (run.id !== saved.runId) return run;
  return {
    ...run,
    humanReview: {
      status: "reviewed",
      reviewer: saved.reviewerId,
      reviewedAt: saved.reviewedAt,
      decision: saved.decision,
      ...(saved.notes ? { notes: saved.notes } : {}),
      reviewKind: saved.reviewKind,
      disclaimer: saved.disclaimer,
    },
  };
}

/** Deduplicate persisted run records and sort only from their stored timestamps. Invalid timestamps stay visible, last. */
export function newestFirstResearchRuns(runs: readonly ResearchRunSummary[]): ResearchRunSummary[] {
  const unique = new Map<string, ResearchRunSummary>();
  for (const run of runs) unique.set(run.id, run);

  const timed: Array<{ run: ResearchRunSummary; timestamp: number; index: number }> = [];
  const untimed: ResearchRunSummary[] = [];
  for (const [index, run] of Array.from(unique.values()).entries()) {
    const timestamp = Date.parse(run.createdAt);
    if (Number.isFinite(timestamp)) timed.push({ run, timestamp, index });
    else untimed.push(run);
  }
  timed.sort((a, b) => b.timestamp - a.timestamp || a.index - b.index);
  return [...timed.map(({ run }) => run), ...untimed];
}

/** Server records win over optimistic copies; unconfirmed creates remain visible until the list includes them. */
export function reconcileResearchRunHistory(
  serverRuns: readonly ResearchRunSummary[],
  optimisticRuns: readonly ResearchRunSummary[],
): ResearchRunSummary[] {
  const serverIds = new Set(serverRuns.map((run) => run.id));
  return newestFirstResearchRuns([
    ...optimisticRuns.filter((run) => !serverIds.has(run.id)),
    ...serverRuns,
  ]);
}

function buildLiveWallet(wallet: ReadOnlyWalletState, walletMismatch: boolean, selectedNetwork: NetworkId): AppModel["wallet"] {
  const hasAddress = wallet.address !== undefined;
  const network = NETWORKS.find((candidate) => candidate.id === selectedNetwork);
  const visibleBalance = walletMismatch ? undefined : wallet.balance;
  const mismatchMessage = walletMismatch
    ? `Your wallet is on ${wallet.networkName ?? "an unknown network"} (chain ID ${wallet.chainId ?? "unknown"}); the app is set to ${network?.label ?? "the selected network"} (chain ID ${network?.chainId ?? "unknown"}). No balance is shown. To read this network, manually select ${network?.label ?? "the selected network"} (chain ID ${network?.chainId ?? "unknown"}) in your wallet. VEYRA will not switch it.`
    : undefined;
  const facts = [
    { label: "Network", value: wallet.networkName ?? "Not connected" },
    ...(hasAddress ? [{ label: "Provider", value: wallet.providerName ?? "Injected EIP-1193 wallet provider" }] : []),
    ...(wallet.chainId !== undefined ? [{ label: "Chain ID", value: String(wallet.chainId) }] : []),
    ...(visibleBalance ? [
      { label: "Latest block", value: visibleBalance.blockNumber },
      { label: "Block hash", value: visibleBalance.blockHash },
      { label: "Observed at", value: visibleBalance.observedAt },
      { label: "Read source", value: visibleBalance.provider },
    ] : []),
    { label: `${PROJECT_NAME} authority`, value: "None claimed" },
  ];
  const steps: SetupStepView[] = [
    { title: "External wallet", detail: "User-initiated, read-only account access.", tag: hasAddress ? "Connected · read-only" : "Not connected", state: hasAddress ? "done" : "current" },
    { title: `${PROJECT_NAME} smart account`, detail: `Not built. No assets are held by ${PROJECT_NAME}.`, tag: "Not built", state: "todo" },
    { title: "Authorization key", detail: "Key registration is blocked by the Phase 0B NO-GO.", tag: "Disabled", state: "todo" },
    { title: "Funding or swaps", detail: "No deposit path or reviewed swap route is active.", tag: "Disabled", state: "todo" },
  ];

  return {
    origin: "live",
    stage: hasAddress ? 1 : 0,
    setupDone: hasAddress ? 1 : 0,
    walletButtonLabel: wallet.status === "loading"
      ? wallet.message?.startsWith("Refreshing") ? "Refreshing balance…" : "Connecting…"
      : hasAddress ? "Disconnect wallet" : "Connect wallet",
    connection: wallet,
    eoa: {
      kind: "eoa",
      title: "Connected external wallet",
      subtitle: `Your external account. ${PROJECT_NAME} requests reads only.`,
      intro: hasAddress ? READ_ONLY_NOTICE : wallet.message ?? "No wallet is connected. Connect only when you choose.",
      ...(hasAddress ? { address: { label: wallet.address!, demo: false } } : {}),
      facts,
      assets: visibleBalance ? [{ symbol: visibleBalance.symbol, amount: visibleBalance.amount }] : [],
      ...(visibleBalance ? {} : {
        emptyAssets: hasAddress
          ? mismatchMessage ?? "Public native balance is unavailable."
          : "Connect to request public balance data.",
      }),
      actions: hasAddress
        ? [{ id: "disconnect", label: "Disconnect", variant: "ghost" }]
        : [{ id: "connect", label: "Connect wallet", variant: "primary" }],
      footnote: mismatchMessage ?? wallet.message,
    },
    qevra: {
      kind: "qevra",
      title: `${PROJECT_NAME} smart account`,
      subtitle: "Not built · no custody",
      intro: `No ${PROJECT_NAME} smart account exists. No assets are held or controlled here.`,
      facts: [{ label: "Account status", value: "Not built" }, { label: "Transfers and swaps", value: "Disabled" }],
      assets: [],
      emptyAssets: `No ${PROJECT_NAME} assets; no account is deployed.`,
      actions: [],
      footnote: "Phase 0B authorization NO-GO remains in force.",
    },
    steps,
  };
}

function buildLiveSwap(): AppModel["swap"] {
  return {
    amount: "",
    payToken: "Not configured",
    receiveToken: "Not configured",
    payHint: "No token list or quote route is active.",
    receive: { display: "Unavailable", hint: "No reviewed swap route is configured." },
    routeChip: { label: "Route unavailable", tone: "unk", material: "dotted" },
    quote: [],
    button: {
      key: "route",
      label: "Swaps unavailable",
      severity: "blocked",
      disabled: true,
      cause: "No reviewed swap route is configured.",
      notDone: "No transaction was requested or sent.",
    },
    comparison: {
      rows: ["recipient", "chain", "tokens", "amount", "router", "slippage", "nonce", "deadline"].map((id) => ({
        id: id as AppModel["swap"]["comparison"]["rows"][number]["id"],
        label: id[0]!.toUpperCase() + id.slice(1),
        reviewed: "Not set",
        toSign: "Not available",
        match: "not-set" as const,
        dim: true,
      })),
      reviewed: false,
      changedCount: 0,
      setupComplete: false,
    },
  };
}

function buildLiveStatusBar(
  wallet: ReadOnlyWalletState,
  capabilities: SecurityResearchCapabilities | undefined,
  accessState: NonNullable<AppModel["security"]["accessState"]>,
  serviceError = false,
  walletMismatch = false,
  capabilitiesMessage?: string,
): StatusBarItem[] {
  const walletText = wallet.address
    ? walletMismatch
      ? "Wallet · network mismatch"
      : `Wallet · ${wallet.networkName === "Robinhood Chain Testnet" ? "Testnet" : wallet.networkName === "Robinhood Chain" ? "Mainnet" : "Unknown"}`
    : `Wallet · ${wallet.status === "disconnected" ? "not connected" : wallet.status.replaceAll("_", " ")}`;
  const swarmText = accessState === "unauthenticated"
    ? "Swarm · sign in required"
    : accessState === "not_configured"
      ? "Swarm · access not configured"
      : accessState === "checking"
        ? "Swarm · checking access"
        : accessState === "rate_limited"
          ? "Swarm · access rate-limited"
          : accessState === "service_error"
            ? "Swarm · access unavailable"
          : capabilitiesMessage
            ? "Research availability · unavailable"
            : serviceError
    ? "Live service · error"
    : !capabilities
      ? "Swarm · checking"
      : capabilities.provider === "not_configured"
        ? "AI provider · not configured"
        : capabilities.provider === "unsupported"
          ? "AI provider · unsupported"
          : capabilities.provider === "unavailable"
            ? "AI provider · unavailable"
            : capabilities.persistence !== "available"
              ? "Run history · unavailable"
              : capabilities.worker !== "available"
                ? "Research worker · unavailable"
                : "Swarm · available";
  return [
    { id: "wallet-live", tone: wallet.status === "connected" ? "exp" : "unk", text: walletText },
    { id: "swarm-live", tone: !serviceError && capabilities?.provider === "available" && capabilities.worker === "available" && capabilities.persistence === "available" ? "exp" : "unk", text: swarmText },
    { id: "custody-disabled", tone: "unk", text: "No account · swaps disabled" },
  ];
}

function buildLiveCoverage(
  wallet: ReadOnlyWalletState,
  walletMismatch: boolean,
  selectedNetwork: NetworkId,
  capabilities: SecurityResearchCapabilities | undefined,
  accessState: NonNullable<AppModel["security"]["accessState"]>,
  runs: ResearchRunSummary[] | null,
  historyError?: string,
  capabilitiesMessage?: string,
): CoverageRow[] {
  return COVERAGE_ROWS.map((sourceRow) => {
    const row = brandizeDisplayStrings(sourceRow, PROJECT_NAME);
    if (row.id === "wallet-connection") {
      const selected = NETWORKS.find((network) => network.id === selectedNetwork);
      return {
        ...row,
        tone: wallet.address ? "neutral" : "unk",
        material: wallet.address ? "solid" : "dotted",
        statusLabel: wallet.address
          ? walletMismatch ? "Connected · network mismatch" : "Connected · read-only"
          : wallet.status.replaceAll("_", " "),
        note: wallet.address
          ? walletMismatch
            ? `Wallet network ${wallet.networkName ?? "unknown"} (chain ID ${wallet.chainId ?? "unknown"}) differs from selected ${selected?.label ?? "network"} (chain ID ${selected?.chainId ?? "unknown"}). No balance is shown. Manually select ${selected?.label ?? "the selected network"} (chain ID ${selected?.chainId ?? "unknown"}) in your wallet to match; VEYRA will not switch it.`
            : `Public balance read from ${wallet.balance?.provider ?? "wallet RPC"}; observed at block ${wallet.balance?.blockNumber ?? "unavailable"}. No signature requested.`
          : wallet.message ?? "No wallet connection was requested.",
      };
    }
    if (row.id === "swarm-runs") {
      const runCount = runs?.length ?? 0;
      const signedOutLabel = accessState === "unauthenticated"
        ? "Sign-in required"
        : accessState === "not_configured"
          ? "Operator access not configured"
          : accessState === "checking"
            ? "Checking access"
            : accessState === "rate_limited"
              ? "Access rate-limited"
              : accessState === "service_error"
                ? "Access unavailable"
            : undefined;
      return {
        ...row,
        tone: signedOutLabel ? "unk" : capabilities?.provider === "available" ? "exp" : "unk",
        material: signedOutLabel ? "dotted" : runCount > 0 ? "solid" : capabilities?.provider === "available" ? "outline" : "dotted",
        statusLabel: signedOutLabel ?? (runCount > 0
          ? `${runCount} loaded record${runCount === 1 ? "" : "s"}`
          : runs === null ? historyError ? "History unavailable" : "Checking history" : "No live runs recorded"),
        note: signedOutLabel
          ? "Research history and run creation require a wallet research sign-in or the separate operator administration session. Public wallet and network reads remain available."
          : runs === null
            ? historyError ?? "Checking the authenticated Security Research API."
            : capabilitiesMessage
              ? capabilitiesMessage
            : capabilities?.provider === "available"
            ? "Loaded run history comes from the authenticated Security Research API. Additional records may be available. Agent completion is not a passed security test."
            : "Live run history is read from the API; new AI research is unavailable until a provider is configured and billing is approved.",
      };
    }
    return row;
  });
}

export function buildLiveAppModel(input: {
  wallet: ReadOnlyWalletState;
  selectedNetwork?: NetworkId;
  networkRpc?: NetworkRpcState;
  capabilities?: SecurityResearchCapabilities;
  runs: ResearchRunSummary[] | null;
  accessState?: NonNullable<AppModel["security"]["accessState"]>;
  authenticationMethod?: "wallet" | "operator";
  authenticatedAddress?: `0x${string}`;
  accessMessage?: string;
  capabilitiesMessage?: string;
  preferredRunId?: string;
  dataError?: string;
  hasMoreRuns?: boolean;
  isRefreshing: boolean;
  isCreating: boolean;
  actionMessage?: string;
}): AppModel {
  const { wallet, capabilities, runs } = input;
  const accessState = input.accessState ?? "authenticated";
  const selectedNetwork = input.selectedNetwork ?? "testnet";
  const rpc = input.networkRpc ?? { status: "loading" as const };
  const selectedChainId = NETWORKS.find((network) => network.id === selectedNetwork)?.chainId;
  const walletMismatch = wallet.address !== undefined && wallet.chainId !== undefined && wallet.chainId !== selectedChainId;
  const liveRuns = runs?.map((run) => toLiveSwarmRun(run)) ?? [];
  const actionMessage = currentActionMessage(input.actionMessage, input.runs);
  const unavailableMessage = input.accessMessage ?? input.capabilitiesMessage ?? input.dataError;
  const securityStatus: AppModel["security"]["status"] = accessState !== "authenticated"
    ? "unavailable"
    : runs === null
    ? input.dataError ? "unavailable" : "loading"
    : liveRuns.length > 0 ? "ready" : "empty";
  const security: AppModel["security"] = {
    origin: "live",
    accessState,
    ...(input.authenticationMethod ? { authenticationMethod: input.authenticationMethod } : {}),
    ...(input.authenticatedAddress ? { authenticatedAddress: input.authenticatedAddress } : {}),
    status: securityStatus,
    runs: liveRuns,
    ...(input.preferredRunId ? { preferredRunId: input.preferredRunId } : {}),
    capabilities,
    isRefreshing: input.isRefreshing,
    isCreating: input.isCreating,
    hasMoreRuns: input.hasMoreRuns,
    ...(unavailableMessage ? { unavailableMessage } : {}),
    ...(actionMessage ? { actionMessage } : {}),
  };
  const activity: ActivityView = {
    origin: "live",
    status: "unavailable",
    rows: [],
    sourceTag: undefined,
  };

  return {
    mode: "live",
    statusBar: buildLiveStatusBar(wallet, capabilities, accessState, Boolean(input.dataError), walletMismatch, input.capabilitiesMessage),
    coverage: buildLiveCoverage(wallet, walletMismatch, selectedNetwork, capabilities, accessState, runs, input.dataError, input.capabilitiesMessage),
    network: { selected: selectedNetwork, options: [...NETWORKS], rpc, walletMismatch },
    wallet: buildLiveWallet(wallet, walletMismatch, selectedNetwork),
    swap: buildLiveSwap(),
    activity,
    security,
  };
}
