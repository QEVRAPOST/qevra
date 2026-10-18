import type { ResearchAgentRole, ResearchRunStatus, ResearchTopicId } from "@/types/integrations";
import type {
  AnalysisAgentOutput,
  ResearchAgentOutput,
  VerificationAgentOutput,
} from "./schemas";

export interface StoredSource {
  id: string;
  title: string;
  url: string;
  retrievedAt: string;
  status: "available" | "unavailable";
  httpStatus?: number;
  sha256?: string;
  text?: string;
  excerpt?: string;
  errorCode?: string;
}

export interface RunEvent {
  at: string;
  stage: string;
  message: string;
}

export interface ModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface StoredAgentExecution {
  role: ResearchAgentRole;
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
  usage?: ModelUsage;
  output?: ResearchAgentOutput | AnalysisAgentOutput | VerificationAgentOutput;
}

export interface StoredTestArtifact {
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

export interface VerifiedClaim {
  id: string;
  claim: string;
  modelAssessment: "supported" | "contradicted" | "unclear";
  evidenceStatus: "quote_matched" | "not_verified";
  evidence: Array<{ sourceId: string; quote: string; exactQuoteMatched: boolean }>;
  rationale: string;
}

export interface ResearchRunRecord {
  id: string;
  topicId: ResearchTopicId;
  topic: string;
  attemptCount: number;
  status: ResearchRunStatus;
  currentStage: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  agents: StoredAgentExecution[];
  sources: StoredSource[];
  tests: StoredTestArtifact[];
  research?: ResearchAgentOutput;
  analysis?: AnalysisAgentOutput;
  verification?: VerificationAgentOutput;
  findings: VerifiedClaim[];
  assumptions: string[];
  limitations: string[];
  recommendations: string[];
  events: RunEvent[];
  errorCode?: string;
  errorMessage?: string;
  humanReview: {
    status: "not_reviewed" | "reviewed";
    reviewer?: string;
    reviewedAt?: string;
    disposition?: string;
  };
}

export function createQueuedRun(
  id: string,
  topicId: ResearchTopicId,
  topic: string,
  testIds: string[] = [],
  now = new Date(),
): ResearchRunRecord {
  const timestamp = now.toISOString();
  return {
    id,
    topicId,
    topic,
    attemptCount: 0,
    status: "queued",
    currentStage: "queued",
    createdAt: timestamp,
    updatedAt: timestamp,
    agents: ["research", "analysis", "verification"].map((role) => ({
      role: role as ResearchAgentRole,
      status: "pending" as const,
    })),
    sources: [],
    tests: testIds.map((testId) => ({
      id: testId,
      name: "Pinned ML-DSA registration regression experiment",
      status: "queued",
      command: "contracts/scripts/run-ml-dsa-poc.sh (fixed test, pinned verifier commit)",
      limitations: ["Runs only the approved local Phase 0 reproduction; this does not authorize custody or transactions."],
    })),
    findings: [],
    assumptions: [],
    limitations: [],
    recommendations: [],
    events: [{ at: timestamp, stage: "queued", message: "Run queued for the isolated research worker." }],
    humanReview: { status: "not_reviewed" },
  };
}

export function addRunEvent(run: ResearchRunRecord, stage: string, message: string, now = new Date()): void {
  const at = now.toISOString();
  run.currentStage = stage;
  run.updatedAt = at;
  run.events.push({ at, stage, message });
  if (run.events.length > 100) run.events.splice(0, run.events.length - 100);
}
