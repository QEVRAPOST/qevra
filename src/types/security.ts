import type { StatusBadge } from "./status";
import type { ResearchAgentRole, ResearchAgentStatus, ResearchRunDetail, ResearchRunSummary, SecurityResearchCapabilities } from "./integrations";

/** The state of one of the three pipeline agents in an EXAMPLE run. Live runs carry the real thing in `liveSummary` / `liveDetail`. */
export interface ExampleAgent {
  role: ResearchAgentRole;
  status: ResearchAgentStatus;
  errorCode?: string;
}

/** A Security Swarm run as the UI needs it. Engineering owns the real run events. */
export interface SwarmRun {
  origin?: "demo" | "live";
  id: string;
  role: string;
  goal: string;
  status: StatusBadge;
  shows: string;
  how: string;
  notShown: string;
  limitation: string;
  evidence: string;
  /** a finding whose detail is withheld until its responsible disclosure path exists */
  withheld?: boolean;
  /** a completed run that recorded no findings */
  zeroFindings?: boolean;
  /** an evidence source that could not be read; the claim is not verified */
  unavailableSource?: boolean;
  humanReview: { recorded: false } | { recorded: true; by: string; at: string };
  /** fixture runs carry EXAMPLE; real runs leave this undefined */
  exampleTag?: string;
  /** what the pipeline shows for a fixture run: Research, Analysis and Verification, in that order. Nothing ran. */
  exampleAgents?: ExampleAgent[];
  liveSummary?: ResearchRunSummary;
  liveDetail?: ResearchRunDetail;
  detailUnavailable?: string;
}

export interface SecurityView {
  origin: "demo" | "live";
  /** Operator access is independent from public wallet and network reads. */
  accessState?: "checking" | "not_configured" | "unauthenticated" | "authenticated" | "service_error" | "rate_limited";
  /** "unavailable" means the run feed is not connected, which says nothing about whether the system is safe */
  status: "loading" | "ready" | "empty" | "unavailable";
  runs: SwarmRun[];
  sourceTag?: string;
  capabilities?: SecurityResearchCapabilities;
  isRefreshing?: boolean;
  isCreating?: boolean;
  hasMoreRuns?: boolean;
  /** A newly persisted run that the presentation may select immediately. */
  preferredRunId?: string;
  actionMessage?: string;
  unavailableMessage?: string;
}
