import type {
  ReadOnlyWalletState,
  ResearchRunDetail,
  ResearchRunSummary,
  SecurityResearchCapabilities,
} from "@/types/integrations";
import type { SwapQuoteRequest } from "@/features/swap/validation";
import { NETWORKS } from "@/lib/config/networks";

export interface LiveSwapQuoteUnavailable {
  status: "unavailable";
  reason: "no_verified_route";
  networkId: SwapQuoteRequest["networkId"];
  chainId: number;
  quote: null;
  signingEnabled: false;
  executionEnabled: false;
  /** Retained so the UI can distinguish an API no-route result from a local preview state. */
  transportStatus: 503;
}

export class SwapQuoteClientError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "SwapQuoteClientError";
  }
}

/** Sends only a fully typed token/network request and accepts the API's current explicit no-route response. */
export async function requestLiveSwapQuote(request: SwapQuoteRequest): Promise<LiveSwapQuoteUnavailable> {
  const response = await fetch("/api/swap/quote", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  let body: unknown;
  try {
    body = await response.json() as unknown;
  } catch {
    throw new SwapQuoteClientError(502, "invalid_quote_response", "The quote API returned an unreadable response.");
  }
  if (!body || typeof body !== "object") {
    throw new SwapQuoteClientError(502, "invalid_quote_response", "The quote API returned an invalid response.");
  }
  const value = body as Partial<LiveSwapQuoteUnavailable> & { error?: { code?: string; message?: string } };
  if (value.status === "unavailable" && value.reason === "no_verified_route") {
    const expectedChainId = NETWORKS.find((network) => network.id === request.networkId)?.chainId;
    if (expectedChainId === undefined) {
      throw new SwapQuoteClientError(400, "unsupported_network", "The quote request selected a network that is not supported.");
    }
    if (response.status !== 503 || value.networkId !== request.networkId || value.chainId !== expectedChainId
      || value.quote !== null || value.signingEnabled !== false || value.executionEnabled !== false) {
      throw new SwapQuoteClientError(502, "invalid_quote_response", "The quote API returned a no-route result with inconsistent network or execution flags.");
    }
    return { ...value, status: "unavailable", reason: "no_verified_route", networkId: request.networkId, chainId: expectedChainId, quote: null, signingEnabled: false, executionEnabled: false, transportStatus: 503 };
  }
  const error = value.error;
  throw new SwapQuoteClientError(response.status, error?.code ?? "quote_request_failed", error?.message ?? "The quote API could not process this request.");
}

/**
 * This is deliberately not an AppModelValue yet: AppModel.mode is demo-only and
 * the current SecurityView renders its sourceTag as DemoChip. The UI owner must
 * add an explicit live origin before these records can be passed to components.
 */

export interface LiveSecurityRun {
  origin: "live";
  id: string;
  topicId: ResearchRunDetail["topicId"];
  topic: string;
  status: ResearchRunDetail["status"];
  currentStage: string;
  summary?: string;
  agents: ResearchRunDetail["agents"];
  events: ResearchRunDetail["events"];
  sourceCount: number;
  availableSourceCount: number;
  findingCount: number;
  sources: ResearchRunDetail["sources"];
  findings: ResearchRunDetail["findings"];
  deterministicTests: ResearchRunDetail["deterministicTests"];
  assumptions: string[];
  limitations: string[];
  recommendations: string[];
  humanReview: ResearchRunDetail["humanReview"];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  verificationNote?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface LiveSecurityRunSummary {
  origin: "live";
  id: string;
  topicId: ResearchRunSummary["topicId"];
  topic: string;
  status: ResearchRunSummary["status"];
  currentStage: string;
  agents: ResearchRunSummary["agents"];
  events: ResearchRunSummary["events"];
  sourceCount: number;
  availableSourceCount: number;
  findingCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  errorCode?: string;
}

export interface LiveDashboardSnapshot {
  origin: "live";
  capabilities: SecurityResearchCapabilities;
  wallet: {
    origin: "live";
    connection: ReadOnlyWalletState;
    qevraAccount: { status: "not_built"; address: null; custodyEnabled: false };
  };
  security: {
    origin: "live";
    status: "ready" | "empty";
    runs: LiveSecurityRunSummary[];
  };
}

export function toLiveSecurityRunSummary(run: ResearchRunSummary): LiveSecurityRunSummary {
  return {
    origin: "live",
    id: run.id,
    topicId: run.topicId,
    topic: run.topic,
    status: run.status,
    currentStage: run.currentStage,
    agents: run.agents,
    events: run.events,
    sourceCount: run.sourceCount,
    availableSourceCount: run.availableSourceCount,
    findingCount: run.findingCount,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.errorCode ? { errorCode: run.errorCode } : {}),
  };
}

export function toLiveSecurityRun(run: ResearchRunDetail): LiveSecurityRun {
  return {
    origin: "live",
    id: run.id,
    topicId: run.topicId,
    topic: run.topic,
    status: run.status,
    currentStage: run.currentStage,
    ...(run.summary ? { summary: run.summary } : {}),
    agents: run.agents,
    events: run.events,
    sourceCount: run.sourceCount,
    availableSourceCount: run.availableSourceCount,
    findingCount: run.findingCount,
    sources: run.sources,
    findings: run.findings,
    deterministicTests: run.deterministicTests,
    assumptions: run.assumptions,
    limitations: run.limitations,
    recommendations: run.recommendations,
    humanReview: run.humanReview,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.verificationNote ? { verificationNote: run.verificationNote } : {}),
    ...(run.errorCode ? { errorCode: run.errorCode } : {}),
    ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
  };
}

export function toLiveDashboardSnapshot(input: {
  capabilities: SecurityResearchCapabilities;
  wallet: ReadOnlyWalletState;
  runs: ResearchRunSummary[];
}): LiveDashboardSnapshot {
  return {
    origin: "live",
    capabilities: input.capabilities,
    wallet: {
      origin: "live",
      connection: input.wallet,
      qevraAccount: { status: "not_built", address: null, custodyEnabled: false },
    },
    security: {
      origin: "live",
      status: input.runs.length > 0 ? "ready" : "empty",
      runs: input.runs.map(toLiveSecurityRunSummary),
    },
  };
}
