import type { ResearchRunDetail, ResearchRunSummary } from "@/types/integrations";
import type { ResearchRunRecord, StoredHumanReview } from "./model";

export const OWNER_REVIEW_DISCLAIMER = "This is the report owner's self-review of the evidence, not an independent security audit, certification, or proof that any system is safe.";

const HUMAN_REVIEW_LABELS = {
  evidence_supported: "Evidence supported",
  needs_investigation: "Needs investigation",
  insufficient_evidence: "Insufficient evidence",
} as const;

export function toResearchRunSummary(run: ResearchRunRecord): ResearchRunSummary {
  return {
    id: run.id,
    topicId: run.topicId,
    topic: run.topic,
    status: run.status,
    currentStage: run.currentStage,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    agents: run.agents.map(({ role, status, startedAt, completedAt, errorCode, usage }) => ({
      role,
      status,
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(errorCode ? { errorCode } : {}),
      ...(usage ? { providerReportedUsage: usage } : {}),
    })),
    sourceCount: run.sources.length,
    availableSourceCount: run.sources.filter((source) => source.status === "available").length,
    findingCount: run.findings.length,
    ...(run.errorCode ? { errorCode: run.errorCode } : {}),
    events: run.events.map(({ at, stage, message }) => ({ at, stage, message })),
  };
}

export function toResearchRunDetail(run: ResearchRunRecord, savedReview?: StoredHumanReview): ResearchRunDetail {
  return {
    ...toResearchRunSummary(run),
    ...(run.analysis?.summary ? { summary: run.analysis.summary } : run.research?.summary ? { summary: run.research.summary } : {}),
    ...(run.analysis ? { analysis: run.analysis } : {}),
    ...(run.verification ? { verification: run.verification } : {}),
    sources: run.sources.map(({ id, title, url, retrievedAt, status, sha256, excerpt, errorCode }) => ({
      id,
      title,
      url,
      retrievedAt,
      status,
      ...(sha256 ? { sha256 } : {}),
      ...(excerpt ? { excerpt } : {}),
      ...(errorCode ? { errorCode } : {}),
    })),
    findings: run.findings,
    assumptions: run.assumptions,
    limitations: run.limitations,
    recommendations: run.recommendations,
    deterministicTests: run.tests.map((test) => ({ ...test })),
    humanReview: savedReview ? {
      status: "reviewed",
      reviewer: savedReview.reviewerId,
      reviewedAt: savedReview.reviewedAt,
      decision: savedReview.decision,
      disposition: HUMAN_REVIEW_LABELS[savedReview.decision],
      ...(savedReview.notes ? { notes: savedReview.notes } : {}),
      reviewKind: "owner_self_review",
      disclaimer: OWNER_REVIEW_DISCLAIMER,
    } : { ...run.humanReview },
    ...(run.verification?.summary ? { verificationNote: run.verification.summary } : {}),
    ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
  };
}
