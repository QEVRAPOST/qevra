import type { ResearchRunDetail, ResearchRunSummary } from "@/types/integrations";
import type { ResearchRunRecord } from "./model";

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

export function toResearchRunDetail(run: ResearchRunRecord): ResearchRunDetail {
  return {
    ...toResearchRunSummary(run),
    ...(run.analysis?.summary ? { summary: run.analysis.summary } : run.research?.summary ? { summary: run.research.summary } : {}),
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
    humanReview: { ...run.humanReview },
    ...(run.verification?.summary ? { verificationNote: run.verification.summary } : {}),
    ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
  };
}
