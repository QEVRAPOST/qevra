export type IntegrationAvailability = "available" | "unavailable" | "not_configured" | "unsupported";

export type ReadOnlyWalletStatus =
  | "disconnected"
  | "loading"
  | "connected"
  | "unsupported_network"
  | "wallet_not_installed"
  | "connection_rejected"
  | "rpc_unavailable"
  | "invalid_rpc_response"
  | "provider_error";

export interface PublicNativeBalance {
  symbol: "ETH";
  amount: string;
  wei: string;
  blockNumber: string;
  blockHash: `0x${string}`;
  provider: "connected_wallet_rpc";
  observedAt: string;
}

export interface ReadOnlyWalletState {
  status: ReadOnlyWalletStatus;
  address?: `0x${string}`;
  providerName?: string;
  chainId?: number;
  networkName?: "Robinhood Chain" | "Robinhood Chain Testnet" | "Unsupported network";
  isQevraTargetNetwork?: boolean;
  balance?: PublicNativeBalance;
  message?: string;
}

export type ResearchAgentRole = "research" | "analysis" | "verification";
export type ResearchAgentStatus = "pending" | "running" | "completed" | "failed" | "blocked";
export type ResearchRunStatus = "queued" | "running" | "completed" | "failed";
export type ResearchTopicId = "mldsa-key-registration" | "robinhood-readonly-wallet" | "security-evidence";

export interface AgentExecutionState {
  role: ResearchAgentRole;
  status: ResearchAgentStatus;
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
  providerReportedUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    requestId?: string;
    outputDiagnostics?: {
      finishReason?: "stop" | "length" | "tool_calls" | "function_call" | "content_filter" | "other";
      validationCategory?: "provider_response_json_parse" | "provider_response_shape" | "structured_output_json_parse" | "schema_validation" | "truncated";
      validationIssueCount?: number;
      validationIssues?: Array<{ code: string; path: Array<string | number> }>;
    };
    rateLimit?: {
      tokensLimit?: number;
      tokensRemaining?: number;
      tokensReset?: string;
      retryAfter?: string;
    };
  };
}

export interface ResearchEvidenceSource {
  id: string;
  title: string;
  url: string;
  retrievedAt: string;
  sha256?: string;
  status: "available" | "unavailable";
  excerpt?: string;
  errorCode?: string;
}

export interface ResearchFinding {
  id: string;
  claim: string;
  modelAssessment: "supported" | "contradicted" | "unclear";
  evidenceStatus: "quote_matched" | "not_verified";
  evidence: Array<{ sourceId: string; quote: string; exactQuoteMatched: boolean }>;
  rationale: string;
}

export interface ResearchAnalysisDetail {
  summary: string;
  assumptions: string[];
  risks: Array<{
    id: string;
    title: string;
    severity: "critical" | "high" | "medium" | "low" | "unknown";
    analysis: string;
    sourceIds: string[];
  }>;
  unknowns: string[];
  recommendations: string[];
}

export interface ResearchVerificationDetail {
  summary: string;
  claimChecks: Array<{
    claimId: string;
    assessment: "supported" | "contradicted" | "unclear";
    evidence: Array<{ sourceId: string; quote: string }>;
    rationale: string;
  }>;
  testArtifactChecks: Array<{
    artifactId: string;
    assessment: "supports" | "contradicts" | "inconclusive";
    rationale: string;
  }>;
  limitations: string[];
}

export type ResearchHumanReviewDecision = "evidence_supported" | "needs_investigation" | "insufficient_evidence";

export interface ResearchHumanReviewRequest {
  decision: ResearchHumanReviewDecision;
  notes?: string;
}

export interface ResearchHumanReviewRecord {
  runId: string;
  reviewerId: string;
  decision: ResearchHumanReviewDecision;
  notes?: string;
  reviewedAt: string;
}

export interface ResearchHumanReviewSubmission extends ResearchHumanReviewRecord {
  reviewKind: "owner_self_review";
  disclaimer: string;
}

export interface ResearchHumanReviewResponse {
  review: ResearchHumanReviewSubmission;
}

export interface ResearchRunSummary {
  id: string;
  topicId: ResearchTopicId;
  topic: string;
  status: ResearchRunStatus;
  currentStage: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  agents: AgentExecutionState[];
  sourceCount: number;
  availableSourceCount: number;
  findingCount: number;
  errorCode?: string;
  events: Array<{ at: string; stage: string; message: string }>;
}

export interface ResearchRunDetail extends ResearchRunSummary {
  summary?: string;
  /** Original validated Analysis output; absent on older reports without the persisted stage output. */
  analysis?: ResearchAnalysisDetail;
  /** Original validated Verification checks; absent on older reports without the persisted stage output. */
  verification?: ResearchVerificationDetail;
  sources: ResearchEvidenceSource[];
  findings: ResearchFinding[];
  assumptions: string[];
  limitations: string[];
  recommendations: string[];
  deterministicTests: DeterministicTestSummary[];
  humanReview: {
    status: "not_reviewed" | "reviewed";
    reviewer?: string;
    reviewedAt?: string;
    disposition?: string;
    decision?: ResearchHumanReviewDecision;
    notes?: string;
    reviewKind?: "owner_self_review";
    disclaimer?: string;
  };
  verificationNote?: string;
  errorMessage?: string;
}

export interface DeterministicTestSummary {
  id: string;
  name: string;
  status: "not_requested" | "queued" | "running" | "passed" | "failed" | "blocked";
  command: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  artifactSha256?: string;
  outputExcerpt?: string;
  limitations: string[];
}

export interface SecurityResearchCapabilities {
  provider: IntegrationAvailability;
  providerName?: string;
  /** Safe provider identity for optional technical disclosure; never a credential or endpoint URL. */
  providerVendor?: string;
  providerModel?: string;
  authentication: IntegrationAvailability;
  /** Explicit owner approval gate for billable model requests. */
  billing: IntegrationAvailability;
  persistence: IntegrationAvailability;
  worker: IntegrationAvailability;
  deterministicExperiments: IntegrationAvailability;
  sourceCount: number;
  unavailableReason?: string;
  runCreation?: ResearchRunCreationCapability;
}

export type ResearchRunAccessModeState = "owner_only" | "public_limited" | "not_configured" | "invalid";

export type ResearchRunCreationBlocker =
  | "wallet_authentication_required"
  | "access_mode_not_configured"
  | "access_mode_invalid"
  | "owner_allowlist_not_configured"
  | "wallet_not_allowed"
  | "research_run_limits_not_configured"
  | "research_run_limits_invalid"
  | "wallet_cooldown"
  | "global_hourly_quota"
  | "global_daily_quota"
  | "max_active_runs"
  | "persistence_unavailable";

export interface ResearchRunCreationCapability {
  accessMode: ResearchRunAccessModeState;
  allowed: boolean;
  blocker?: ResearchRunCreationBlocker;
  limits?: {
    walletCooldownSeconds: number;
    globalHourlyRunLimit: number;
    globalDailyRunLimit: number;
    maxActiveRuns: number;
  };
  usage?: {
    walletCooldownRemainingSeconds: number;
    globalHourlyRuns: number;
    globalDailyRuns: number;
    activeRuns: number;
  };
}
