import type {
  ActivityView,
  AppModel,
  CoverageRow,
  NetworkId,
  ReadOnlyWalletState,
  ResearchRunSummary,
  SecurityResearchCapabilities,
  SetupStepView,
  StatusBarItem,
  SwarmRun,
} from "@/types";
import { NETWORKS } from "@/lib/config/networks";
import { COVERAGE_ROWS } from "@/lib/content/status";

const READ_ONLY_NOTICE = "This view only reads public account/network data. QEVRA has no smart account, custody, signing, approvals, or swap execution.";

function networkIdFor(wallet: ReadOnlyWalletState): NetworkId {
  return wallet.chainId === 4_663 ? "mainnet" : "testnet";
}

function agentStatusSummary(run: ResearchRunSummary): string {
  return run.agents.map((agent) => `${agent.role}: ${agent.status}`).join(" · ") || "Agent states not reported";
}

function toSwarmRun(run: ResearchRunSummary): SwarmRun {
  const status = run.status === "completed"
    ? { label: "Research completed", tone: "neutral" as const, material: "solid" as const }
    : run.status === "failed" && run.errorCode === "provider_rate_limited"
      ? { label: "Rate-limited", tone: "bad" as const, material: "solid" as const }
      : run.status === "failed"
        ? { label: "Research failed", tone: "bad" as const, material: "solid" as const }
        : run.status === "running"
          ? { label: "Research running", tone: "exp" as const, material: "outline" as const }
          : { label: "Research queued", tone: "unk" as const, material: "dotted" as const };
  const unavailableSource = run.availableSourceCount < run.sourceCount;
  return {
    origin: "live",
    id: run.id,
    role: "Research · Analysis · Verification",
    goal: run.topic,
    status,
    shows: `${run.findingCount} findings; ${run.availableSourceCount} of ${run.sourceCount} sources available.`,
    how: `Current stage: ${run.currentStage}. ${agentStatusSummary(run)}.`,
    notShown: "Model research is not an audit, an independent review, or proof that the system is safe.",
    limitation: "Source quotations are checked by exact text match; that check does not establish the semantic truth of a claim.",
    evidence: "Open the run detail for source URLs, retrieval times, quotes, and limitations.",
    unavailableSource,
    humanReview: { recorded: false },
    liveSummary: run,
  };
}

function buildLiveWallet(wallet: ReadOnlyWalletState): AppModel["wallet"] {
  const hasAddress = wallet.address !== undefined;
  const facts = [
    { label: "Network", value: wallet.networkName ?? "Not connected" },
    ...(wallet.chainId !== undefined ? [{ label: "Chain ID", value: String(wallet.chainId) }] : []),
    ...(wallet.balance ? [
      { label: "Latest block", value: wallet.balance.blockNumber },
      { label: "Block hash", value: wallet.balance.blockHash },
      { label: "Observed at", value: wallet.balance.observedAt },
      { label: "Read source", value: wallet.balance.provider },
    ] : []),
    { label: "QEVRA authority", value: "None claimed" },
  ];
  const steps: SetupStepView[] = [
    { title: "External wallet", detail: "User-initiated, read-only account access.", tag: hasAddress ? "Connected · read-only" : "Not connected", state: hasAddress ? "done" : "current" },
    { title: "QEVRA smart account", detail: "Not built. No assets are held by QEVRA.", tag: "Not built", state: "todo" },
    { title: "Authorization key", detail: "Key registration is blocked by the Phase 0B NO-GO.", tag: "Disabled", state: "todo" },
    { title: "Funding or swaps", detail: "No deposit path or reviewed swap route is active.", tag: "Disabled", state: "todo" },
  ];

  return {
    origin: "live",
    stage: hasAddress ? 1 : 0,
    setupDone: hasAddress ? 1 : 0,
    walletButtonLabel: hasAddress ? "Disconnect wallet" : "Connect wallet",
    connection: wallet,
    eoa: {
      kind: "eoa",
      title: "Connected external wallet",
      subtitle: "Your external account. QEVRA requests reads only.",
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
      title: "QEVRA smart account",
      subtitle: "Not built · no custody",
      intro: "No QEVRA smart account exists. No assets are held or controlled here.",
      facts: [{ label: "Account status", value: "Not built" }, { label: "Transfers and swaps", value: "Disabled" }],
      assets: [],
      emptyAssets: "No QEVRA assets; no account is deployed.",
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

function buildLiveStatusBar(wallet: ReadOnlyWalletState, capabilities?: SecurityResearchCapabilities): StatusBarItem[] {
  const walletText = wallet.address
    ? `Wallet · ${wallet.networkName === "Robinhood Chain Testnet" ? "Testnet" : wallet.networkName === "Robinhood Chain" ? "Mainnet" : "Unknown"}`
    : `Wallet · ${wallet.status === "disconnected" ? "not connected" : wallet.status.replaceAll("_", " ")}`;
  const swarmText = !capabilities
    ? "Swarm · checking"
    : capabilities.provider !== "available"
      ? "AI research · unavailable"
      : capabilities.worker !== "available"
        ? "Worker · unavailable"
        : "Swarm · available";
  return [
    { id: "wallet-live", tone: wallet.status === "connected" ? "exp" : "unk", text: walletText },
    { id: "swarm-live", tone: capabilities?.provider === "available" && capabilities.worker === "available" ? "exp" : "unk", text: swarmText },
    { id: "custody-disabled", tone: "unk", text: "No account · swaps disabled" },
  ];
}

function buildLiveCoverage(wallet: ReadOnlyWalletState, capabilities?: SecurityResearchCapabilities, runCount = 0): CoverageRow[] {
  return COVERAGE_ROWS.map((row) => {
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
      return {
        ...row,
        tone: capabilities?.provider === "available" ? "exp" : "unk",
        material: runCount > 0 ? "solid" : capabilities?.provider === "available" ? "outline" : "dotted",
        statusLabel: runCount > 0 ? `${runCount} live record${runCount === 1 ? "" : "s"}` : "No live runs recorded",
        note: capabilities?.provider === "available"
          ? "Run history comes from the authenticated Security Research API. Agent completion is not a passed security test."
          : "Live run history is read from the API; new AI research is unavailable until a provider is configured and billing is approved.",
      };
    }
    return row;
  });
}

export function buildLiveAppModel(input: {
  wallet: ReadOnlyWalletState;
  capabilities?: SecurityResearchCapabilities;
  runs: ResearchRunSummary[] | null;
  dataError?: string;
  isRefreshing: boolean;
  isCreating: boolean;
  actionMessage?: string;
}): AppModel {
  const { wallet, capabilities, runs } = input;
  const liveRuns = runs?.map(toSwarmRun) ?? [];
  const securityStatus: AppModel["security"]["status"] = runs === null
    ? input.dataError ? "unavailable" : "loading"
    : liveRuns.length > 0 ? "ready" : "empty";
  const security: AppModel["security"] = {
    origin: "live",
    status: securityStatus,
    runs: liveRuns,
    capabilities,
    isRefreshing: input.isRefreshing,
    isCreating: input.isCreating,
    ...(input.dataError ? { unavailableMessage: input.dataError } : {}),
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
    statusBar: buildLiveStatusBar(wallet, capabilities),
    coverage: buildLiveCoverage(wallet, capabilities, liveRuns.length),
    network: { selected: networkIdFor(wallet), options: [...NETWORKS] },
    wallet: buildLiveWallet(wallet),
    swap: buildLiveSwap(),
    activity,
    security,
  };
}
