import type { ResearchRunSummary } from "@/types/integrations";
import { newestFirstResearchRuns } from "./live-model";

export type ResearchGateState =
  | "checking"
  | "not_configured"
  | "unauthenticated"
  | "authenticated"
  | "service_error"
  | "rate_limited";

export function canUseProtectedResearch(gate: ResearchGateState | string): boolean {
  return gate === "authenticated";
}

/** A 401 invalidates operator access. Other HTTP errors keep their existing access state and handling. */
export function gateAfterProtectedResponse(gate: ResearchGateState, status: number): ResearchGateState {
  return status === 401 && gate === "authenticated" ? "unauthenticated" : gate;
}

export function expireResearchSession<T extends Record<string, unknown>>(state: T): T {
  return {
    ...state,
    gate: "unauthenticated",
    summaries: null,
    details: {},
    detailErrors: {},
    capabilities: undefined,
    nextCursor: undefined,
    loadedPageCount: 0,
    isLoadingMore: false,
    historyError: undefined,
    dataError: undefined,
    actionMessage: undefined,
    preferredRunId: undefined,
  };
}

export interface ResearchHistoryPage {
  runs: ResearchRunSummary[];
  nextCursor?: string;
  loadedPageCount: number;
}

export interface ResearchHistoryResponse {
  runs: ResearchRunSummary[];
  nextCursor?: string;
}

/** Append one cursor page, with fresh copies replacing older copies of the same run. */
export function mergeHistoryPage(current: ResearchHistoryPage, page: ResearchHistoryResponse): ResearchHistoryPage {
  return {
    runs: newestFirstResearchRuns([...current.runs, ...page.runs]),
    nextCursor: page.nextCursor,
    loadedPageCount: current.loadedPageCount + 1,
  };
}

/** Refresh page one while retaining every older page already loaded in the current session. */
export function mergeFirstHistoryPage(current: ResearchHistoryPage, page: ResearchHistoryResponse): ResearchHistoryPage {
  const loadedPageCount = Math.max(current.loadedPageCount, 1);
  const merged = newestFirstResearchRuns([...(current.runs ?? []), ...page.runs]);
  return {
    runs: merged,
    nextCursor: current.loadedPageCount > 1 ? current.nextCursor : page.nextCursor,
    loadedPageCount,
  };
}
