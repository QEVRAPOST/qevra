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
  /** an example run: nothing ran and nothing moves (unless `illustration`) */
  example: boolean;
  /**
   * A walkthrough the visitor started themselves, to see the order of a run. It is still an example (nothing ran), but it
   * may move, because the visitor asked to watch it.
   */
  illustration?: boolean;
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

/** One live interpretation for the API run state, independent of whether the summary or detail is displayed. */
export function liveRunBadge(run: Pick<ResearchRunSummary, "status" | "errorCode" | "agents">): StatusBadge {
  const agents = STAGE_ORDER.map((role) => run.agents.find((agent) => agent.role === role)?.status);
  if (run.status === "failed") {
    return run.errorCode === "provider_rate_limited"
      ? { label: "Rate-limited", tone: "bad", material: "solid" }
      : { label: "Research failed", tone: "bad", material: "solid" };
  }
  if (agents.some((status) => status === "failed" || status === "blocked")) {
    return { label: "Stopped with errors", tone: "bad", material: "solid" };
  }
  if (run.status === "completed") {
    return agents.every((status) => status === "completed")
      ? { label: "Research completed", tone: "neutral", material: "outline" }
      : { label: "Finished with gaps", tone: "bad", material: "outline" };
  }
  if (run.status === "running") return { label: "Research running", tone: "exp", material: "outline" };
  return { label: "Research queued", tone: "unk", material: "dotted" };
}

/** Keep the concise live summary aligned with the three stages rendered in the pipeline. */
export function summarizeAgentStatuses(agents: readonly AgentExecutionState[]): string {
  return STAGE_ORDER.map((role) => {
    const agent = agents.find((candidate) => candidate.role === role);
    return `${STAGE_META[role].title}: ${agent ? STATUS_TEXT[agent.status].toLowerCase() : "not reported"}`;
  }).join(" · ");
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
  return liveRunBadge(s);
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

/** The steps of the illustrative walkthrough: nothing running, then each agent in turn, then all done. */
const ILLUSTRATION_STEPS: ReadonlyArray<readonly [ResearchAgentStatus, ResearchAgentStatus, ResearchAgentStatus]> = [
  ["pending", "pending", "pending"],
  ["running", "pending", "pending"],
  ["completed", "running", "pending"],
  ["completed", "completed", "running"],
  ["completed", "completed", "completed"],
];
export const ILLUSTRATION_LAST = ILLUSTRATION_STEPS.length - 1;

/** The pipeline of the walkthrough at a step. It shows the order of a run and nothing else: no times, counts or sources. */
export function illustrationModel(step: number): PipelineModel {
  const states = ILLUSTRATION_STEPS[Math.max(0, Math.min(ILLUSTRATION_LAST, step))]!;
  return {
    example: true,
    illustration: true,
    runState: "example",
    stages: STAGE_ORDER.map((role, i) => stageOf(role, { role, status: states[i]! }, [])),
    sources: null,
    findings: null,
    quotes: null,
    tests: null,
    review: { recorded: false },
  };
}

/** The phases of one research run, as the visitor lives them. */
export const JOURNEY: readonly string[] = ["Choose a topic", "Start a run", "Watch the agents", "Read the evidence"];

/** Where the visitor is in that journey: 0 to 3. A finished or stopped run means the evidence is the thing to read. */
export function journeyPhase(model: PipelineModel | null, selected: SwarmRun | undefined, canStart: boolean): number {
  if (model?.illustration) {
    const done = model.stages.every((s) => s.status === "completed");
    const started = model.stages.some((s) => s.status !== "pending");
    return done ? 3 : started ? 2 : 1;
  }
  if (!selected || !model) return canStart ? 0 : 3;
  if (model.example) return 3;
  return model.runState === "queued" || model.runState === "running" ? 2 : 3;
}
