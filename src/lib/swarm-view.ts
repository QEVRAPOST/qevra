/*
 * How the Security Swarm pipeline is shown. This is presentation only: it reads the run records the app already has
 * (live ones carry the API's agent states; example ones carry a fixture) and decides how they look. It never decides
 * whether anything is verified: completing a model run is not an audit, a passed test or a human review.
 */
import type {
  AgentExecutionState,
  ResearchAgentRole,
  ResearchAgentStatus,
  ResearchRunDetail,
  ResearchRunStatus,
  ResearchRunSummary,
  StatusBadge,
  SwarmRun,
} from "@/types";

/** The three agents the backend runs, in the order it runs them. Nothing else is shown as an agent. */
export const STAGE_ORDER: readonly ResearchAgentRole[] = ["research", "analysis", "verification"];

export const STAGE_META: Readonly<Record<ResearchAgentRole, { title: string; does: string }>> = {
  research: { title: "Research", does: "Reads the approved public sources and pulls out claims that quote them." },
  analysis: { title: "Analysis", does: "Weighs those claims: the risks, the assumptions, and what is still unknown." },
  verification: { title: "Verification", does: "Checks each quote against the text that was fetched. It is not an audit." },
};

export const STATUS_TEXT: Readonly<Record<ResearchAgentStatus, string>> = {
  pending: "Waiting",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  blocked: "Blocked",
};

export interface PipelineEvent {
  at: string;
  stage: string;
  message: string;
}

export interface PipelineStage {
  role: ResearchAgentRole;
  title: string;
  does: string;
  status: ResearchAgentStatus;
  /** the agent was not reported at all (a summary without it): shown as waiting */
  unreported?: boolean;
  errorCode?: string;
  startedAt?: string;
  completedAt?: string;
  tokens?: number;
  events: PipelineEvent[];
}

export interface PipelineModel {
  /** an example run: nothing ran and nothing moves */
  example: boolean;
  runState: ResearchRunStatus | "example";
  stages: PipelineStage[];
  sources: { total: number; available: number } | null;
  findings: number | null;
  quotes: { matched: number; total: number } | null;
  tests: { total: number; passed: number; failed: number } | null;
  review: { recorded: boolean; by?: string; at?: string };
  error?: { code?: string; message?: string };
  /** the verification agent's own note, when the run recorded one */
  verificationNote?: string;
}

function stageOf(role: ResearchAgentRole, agent: AgentExecutionState | undefined, events: PipelineEvent[]): PipelineStage {
  return {
    role,
    ...STAGE_META[role],
    status: agent?.status ?? "pending",
    ...(agent ? {} : { unreported: true }),
    ...(agent?.errorCode ? { errorCode: agent.errorCode } : {}),
    ...(agent?.startedAt ? { startedAt: agent.startedAt } : {}),
    ...(agent?.completedAt ? { completedAt: agent.completedAt } : {}),
    ...(agent?.providerReportedUsage?.totalTokens !== undefined ? { tokens: agent.providerReportedUsage.totalTokens } : {}),
    events: events.filter((e) => e.stage === role),
  };
}

/** The pipeline for a run, or null when the run has nothing to draw. */
export function pipelineFor(run: SwarmRun): PipelineModel | null {
  const detail: ResearchRunDetail | undefined = run.liveDetail;
  const summary: ResearchRunSummary | undefined = detail ?? run.liveSummary;
  if (run.origin === "live" && summary) {
    const events = summary.events ?? [];
    const stages = STAGE_ORDER.map((role) =>
      stageOf(role, summary.agents.find((a) => a.role === role), events),
    );
    const allQuotes = detail ? detail.findings.flatMap((f) => f.evidence) : null;
    return {
      example: false,
      runState: summary.status,
      stages,
      sources: { total: summary.sourceCount, available: summary.availableSourceCount },
      findings: summary.findingCount,
      quotes: allQuotes ? { matched: allQuotes.filter((q) => q.exactQuoteMatched).length, total: allQuotes.length } : null,
      tests: detail
        ? {
            total: detail.deterministicTests.length,
            passed: detail.deterministicTests.filter((t) => t.status === "passed").length,
            failed: detail.deterministicTests.filter((t) => t.status === "failed").length,
          }
        : null,
      review: run.humanReview.recorded ? { recorded: true, by: run.humanReview.by, at: run.humanReview.at } : { recorded: false },
      ...(summary.errorCode || detail?.errorMessage ? { error: { code: summary.errorCode, message: detail?.errorMessage } } : {}),
      ...(detail?.verificationNote ? { verificationNote: detail.verificationNote } : {}),
    };
  }
  if (run.exampleAgents) {
    return {
      example: true,
      runState: "example",
      stages: STAGE_ORDER.map((role) => stageOf(role, run.exampleAgents!.find((a) => a.role === role), [])),
      sources: null,
      findings: null,
      quotes: null,
      tests: null,
      review: { recorded: false },
    };
  }
  return null;
}

/**
 * How a run's badge looks. For a live run this is decided here, from the API's own states, so that:
 *  - finishing a model run is shown as an outline (a recorded event), never a solid circle that reads as verified;
 *  - a run whose agents did not all complete is never labelled completed.
 * An example run keeps its fixture badge.
 */
export function runBadge(run: SwarmRun): StatusBadge {
  const s = run.liveDetail ?? run.liveSummary;
  if (run.origin !== "live" || !s) return run.status;
  const agents = STAGE_ORDER.map((role) => s.agents.find((a) => a.role === role)?.status);
  if (s.status === "failed") {
    return s.errorCode === "provider_rate_limited"
      ? { label: "Rate-limited", tone: "bad", material: "solid" }
      : { label: "Research failed", tone: "bad", material: "solid" };
  }
  if (agents.some((a) => a === "failed" || a === "blocked")) return { label: "Stopped with errors", tone: "bad", material: "solid" };
  if (s.status === "completed") {
    return agents.every((a) => a === "completed")
      ? { label: "Research completed", tone: "neutral", material: "outline" }
      : { label: "Finished with gaps", tone: "bad", material: "outline" };
  }
  if (s.status === "running") return { label: "Research running", tone: "exp", material: "outline" };
  return { label: "Research queued", tone: "unk", material: "dotted" };
}

/** One short sentence for a screen reader: the only live-region text of the pipeline. */
export function pipelineAnnouncement(model: PipelineModel): string {
  const parts = model.stages.map((s) => `${s.title} ${STATUS_TEXT[s.status].toLowerCase()}`);
  const review = model.review.recorded ? "Human review recorded." : "No human review recorded.";
  return `${model.example ? "Example run, nothing ran. " : ""}${parts.join(", ")}. ${review}`;
}

/** The stage to open first: the one running, else the one that failed, else the last that completed, else the first. */
export function defaultStage(model: PipelineModel): ResearchAgentRole {
  const running = model.stages.find((s) => s.status === "running");
  if (running) return running.role;
  const failed = model.stages.find((s) => s.status === "failed");
  if (failed) return failed.role;
  const done = [...model.stages].reverse().find((s) => s.status === "completed");
  return done?.role ?? "research";
}
