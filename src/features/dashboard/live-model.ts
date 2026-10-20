import type {
  ActivityView,
  AppModel,
  CoverageRow,
  NetworkId,
  NetworkRpcState,
  ReadOnlyWalletState,
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

const READ_ONLY_NOTICE = brandizeProjectName("This view only reads public account/network data. QEVRA has no smart account, custody, signing, approvals, or swap execution.", PROJECT_NAME);

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
      ? { recorded: true, by: safeDetail.humanReview.reviewer, at: safeDetail.humanReview.reviewedAt }
      : { recorded: false },
    liveSummary: summary,
    ...(safeDetail ? { liveDetail: safeDetail } : {}),
    ...(detailUnavailable ? { detailUnavailable } : {}),
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

function buildLiveWallet(wallet: ReadOnlyWalletState): AppModel["wallet"] {
  const hasAddress = wallet.address !== undefined;
  const facts = [
    { label: "Network", value: wallet.networkName ?? "Not connected" },
    ...(hasAddress ? [{ label: "Provider", value: wallet.providerName ?? "Injected EIP-1193 wallet provider" }] : []),
    ...(wallet.chainId !== undefined ? [{ label: "Chain ID", value: String(wallet.chainId) }] : []),
    ...(wallet.balance ? [
      { label: "Latest block", value: wallet.balance.blockNumber },
      { label: "Block hash", value: wallet.balance.blockHash },
      { label: "Observed at", value: wallet.balance.observedAt },
      { label: "Read source", value: wallet.balance.provider },
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
      assets: wallet.balance ? [{ symbol: wallet.balance.symbol, amount: wallet.balance.amount }] : [],
      ...(wallet.balance ? {} : { emptyAssets: hasAddress ? "Public native balance is unavailable." : "Connect to request public balance data." }),
      actions: hasAddress
        ? [{ id: "disconnect", label: "Disconnect", variant: "ghost" }]
        : [{ id: "connect", label: "Connect wallet", variant: "primary" }],
      footnote: wallet.message,
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
): StatusBarItem[] {
  const walletText = wallet.address
    ? `Wallet · ${wallet.networkName === "Robinhood Chain Testnet" ? "Testnet" : wallet.networkName === "Robinhood Chain" ? "Mainnet" : "Unknown"}`
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
  capabilities: SecurityResearchCapabilities | undefined,
  accessState: NonNullable<AppModel["security"]["accessState"]>,
  runs: ResearchRunSummary[] | null,
  historyError?: string,
): CoverageRow[] {
  return COVERAGE_ROWS.map((sourceRow) => {
    const row = brandizeDisplayStrings(sourceRow, PROJECT_NAME);
    if (row.id === "wallet-connection") {
      return {
        ...row,
        tone: wallet.address ? "neutral" : "unk",
        material: wallet.address ? "solid" : "dotted",
        statusLabel: wallet.address ? "Connected · read-only" : wallet.status.replaceAll("_", " "),
        note: wallet.address
          ? `Public balance read from ${wallet.balance?.provider ?? "wallet RPC"}; observed at block ${wallet.balance?.blockNumber ?? "unavailable"}. No signature requested.`
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
          ? "Research history and run creation require an operator session. Public wallet and network reads remain available."
          : runs === null
            ? historyError ?? "Checking the authenticated Security Research API."
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
  accessMessage?: string;
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
  const unavailableMessage = input.accessMessage ?? input.dataError;
  const securityStatus: AppModel["security"]["status"] = accessState !== "authenticated"
    ? "unavailable"
    : runs === null
    ? input.dataError ? "unavailable" : "loading"
    : liveRuns.length > 0 ? "ready" : "empty";
  const security: AppModel["security"] = {
    origin: "live",
    accessState,
    status: securityStatus,
    runs: liveRuns,
    ...(input.preferredRunId ? { preferredRunId: input.preferredRunId } : {}),
    capabilities,
    isRefreshing: input.isRefreshing,
    isCreating: input.isCreating,
    hasMoreRuns: input.hasMoreRuns,
    ...(unavailableMessage ? { unavailableMessage } : {}),
    ...(input.actionMessage ? { actionMessage: input.actionMessage } : {}),
  };
  const activity: ActivityView = {
    origin: "live",
    status: "unavailable",
    rows: [],
    sourceTag: undefined,
  };

  return {
    mode: "live",
    statusBar: buildLiveStatusBar(wallet, capabilities, accessState, Boolean(input.dataError)),
    coverage: buildLiveCoverage(wallet, capabilities, accessState, runs, input.dataError),
    network: { selected: selectedNetwork, options: [...NETWORKS], rpc, walletMismatch },
    wallet: buildLiveWallet(wallet),
    swap: buildLiveSwap(),
    activity,
    security,
  };
}
