import type { ResearchTopicId } from "@/types";

/**
 * The approved research topics a run can be started on. The ids are the service's own; the words are the app's.
 * A topic is only a subject: which sources are read for it is decided by the service, never by this list.
 */
export const RESEARCH_TOPICS: ReadonlyArray<{ id: ResearchTopicId; label: string; about: string }> = [
  { id: "security-evidence", label: "Security evidence", about: "Which public security claims have evidence behind them, and which do not." },
  { id: "mldsa-key-registration", label: "ML-DSA key registration", about: "What public sources say about registering an ML-DSA key for an account." },
  { id: "robinhood-readonly-wallet", label: "Robinhood read-only wallet", about: "What public sources say about reading a wallet without custody or signing." },
];
