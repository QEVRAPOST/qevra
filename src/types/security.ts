import type { StatusBadge } from "./status";

/** A Security Swarm run as the UI needs it. Engineering owns the real run events. */
export interface SwarmRun {
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
}

export interface SecurityView {
  /** "unavailable" means the run feed is not connected, which says nothing about whether the system is safe */
  status: "ready" | "empty" | "unavailable";
  runs: SwarmRun[];
  sourceTag?: string;
}
