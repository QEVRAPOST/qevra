import type {
  ReadOnlyWalletState,
  ResearchRunDetail,
  ResearchRunSummary,
  SecurityResearchCapabilities,
} from "@/types/integrations";

/**
 * This is deliberately not an AppModelValue yet: AppModel.mode is demo-only and
 * the current SecurityView renders its sourceTag as DemoChip. The UI owner must
 * add an explicit live origin before these records can be passed to components.
 */

export interface LiveSecurityRun {
  origin: "live";
  id: string;
  topicId: ResearchRunDetail["topicId"];
  topic: string;
  status: ResearchRunDetail["status"];
  currentStage: string;
  summary?: string;
  agents: ResearchRunDetail["agents"];
  events: ResearchRunDetail["events"];
  sourceCount: number;
  availableSourceCount: number;
  findingCount: number;
  sources: ResearchRunDetail["sources"];
  findings: ResearchRunDetail["findings"];
  deterministicTests: ResearchRunDetail["deterministicTests"];
  assumptions: string[];
  limitations: string[];
  recommendations: string[];
  humanReview: ResearchRunDetail["humanReview"];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  verificationNote?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface LiveSecurityRunSummary {
  origin: "live";
  id: string;
  topicId: ResearchRunSummary["topicId"];
  topic: string;
  status: ResearchRunSummary["status"];
  currentStage: string;
  agents: ResearchRunSummary["agents"];
  events: ResearchRunSummary["events"];
  sourceCount: number;
  availableSourceCount: number;
  findingCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  errorCode?: string;
}

export interface LiveDashboardSnapshot {
  origin: "live";
  capabilities: SecurityResearchCapabilities;
  wallet: {
    origin: "live";
    connection: ReadOnlyWalletState;
    qevraAccount: { status: "not_built"; address: null; custodyEnabled: false };
  };
  security: {
    origin: "live";
    status: "ready" | "empty";
    runs: LiveSecurityRunSummary[];
  };
}

export function toLiveSecurityRunSummary(run: ResearchRunSummary): LiveSecurityRunSummary {
  return {
    origin: "live",
    id: run.id,
    topicId: run.topicId,
    topic: run.topic,
    status: run.status,
    currentStage: run.currentStage,
    agents: run.agents,
    events: run.events,
    sourceCount: run.sourceCount,
    availableSourceCount: run.availableSourceCount,
    findingCount: run.findingCount,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.errorCode ? { errorCode: run.errorCode } : {}),
  };
}

export function toLiveSecurityRun(run: ResearchRunDetail): LiveSecurityRun {
  return {
    origin: "live",
    id: run.id,
    topicId: run.topicId,
    topic: run.topic,
    status: run.status,
    currentStage: run.currentStage,
    ...(run.summary ? { summary: run.summary } : {}),
    agents: run.agents,
    events: run.events,
    sourceCount: run.sourceCount,
    availableSourceCount: run.availableSourceCount,
    findingCount: run.findingCount,
    sources: run.sources,
    findings: run.findings,
    deterministicTests: run.deterministicTests,
    assumptions: run.assumptions,
    limitations: run.limitations,
    recommendations: run.recommendations,
    humanReview: run.humanReview,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.verificationNote ? { verificationNote: run.verificationNote } : {}),
    ...(run.errorCode ? { errorCode: run.errorCode } : {}),
    ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
  };
}

export function toLiveDashboardSnapshot(input: {
  capabilities: SecurityResearchCapabilities;
  wallet: ReadOnlyWalletState;
  runs: ResearchRunSummary[];
}): LiveDashboardSnapshot {
  return {
    origin: "live",
    capabilities: input.capabilities,
    wallet: {
      origin: "live",
      connection: input.wallet,
      qevraAccount: { status: "not_built", address: null, custodyEnabled: false },
    },
    security: {
      origin: "live",
      status: input.runs.length > 0 ? "ready" : "empty",
      runs: input.runs.map(toLiveSecurityRunSummary),
    },
  };
}
