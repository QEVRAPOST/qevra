import assert from "node:assert/strict";
import { test } from "node:test";
import { toLiveDashboardSnapshot, toLiveSecurityRun } from "@/features/dashboard/live-adapters";
import { createSecurityRun, getSecuritySessionStatus, saveSecurityRunReview, SecurityApiClientError } from "@/features/security/client";
import { buildLiveAppModel, newestFirstResearchRuns, reconcileResearchRunHistory, toLiveSwarmRun, withPersistedHumanReview } from "@/features/dashboard/live-model";
import { createResearchRunRequestSchema } from "@/features/security/schemas";
import { buildDemoModel } from "@/lib/demo/model";
import { pipelineFor } from "@/lib/swarm-view";
import type { ReadOnlyWalletState, ResearchRunDetail, ResearchRunSummary, SecurityResearchCapabilities } from "@/types/integrations";

test("live dashboard adapter keeps live provenance separate from demo fixtures and custody", () => {
  const wallet: ReadOnlyWalletState = {
    status: "connected",
    address: "0x0000000000000000000000000000000000000001",
    chainId: 46_630,
    networkName: "Robinhood Chain Testnet",
    isQevraTargetNetwork: true,
  };
  const capabilities: SecurityResearchCapabilities = {
    provider: "not_configured",
    authentication: "available",
    billing: "not_configured",
    persistence: "available",
    worker: "available",
    deterministicExperiments: "not_configured",
    sourceCount: 3,
  };
  const run: ResearchRunDetail = {
    id: "44444444-4444-4444-8444-444444444444",
    topicId: "security-evidence",
    topic: "How is evidence verified?",
    status: "completed",
    currentStage: "completed",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:01:00.000Z",
    completedAt: "2026-10-18T00:01:00.000Z",
    agents: [],
    sourceCount: 1,
    availableSourceCount: 1,
    findingCount: 1,
    events: [{ at: "2026-10-18T00:01:00.000Z", stage: "completed", message: "Run completed." }],
    summary: "One source-backed claim.",
    sources: [],
    findings: [],
    assumptions: [],
    limitations: ["No independent audit."],
    recommendations: [],
    deterministicTests: [],
    humanReview: {
      status: "reviewed",
      reviewer: "0x0000000000000000000000000000000000000001",
      reviewedAt: "2026-10-18T00:02:00.000Z",
      decision: "needs_investigation",
      notes: "Check the source context.",
      reviewKind: "owner_self_review",
      disclaimer: "Owner self-review, not an independent security audit.",
    },
  };

  const snapshot = toLiveDashboardSnapshot({ capabilities, wallet, runs: [run] });
  assert.equal(snapshot.origin, "live");
  assert.equal(snapshot.wallet.origin, "live");
  assert.equal(snapshot.wallet.connection.address, wallet.address);
  assert.deepEqual(snapshot.wallet.qevraAccount, { status: "not_built", address: null, custodyEnabled: false });
  assert.equal(snapshot.security.status, "ready");
  assert.equal(snapshot.security.runs[0]?.origin, "live");
  assert.equal(snapshot.security.runs[0]?.events[0]?.stage, "completed");
  assert.equal(snapshot.security.runs[0]?.sourceCount, 1);
  assert.deepEqual(toLiveSwarmRun(run, run).humanReview, {
    recorded: true,
    by: "0x0000000000000000000000000000000000000001",
    at: "2026-10-18T00:02:00.000Z",
    decision: "needs_investigation",
    notes: "Check the source context.",
    reviewKind: "owner_self_review",
    disclaimer: "Owner self-review, not an independent security audit.",
  });
  assert.equal("exampleTag" in (snapshot.security.runs[0] ?? {}), false);
  const detail = toLiveSecurityRun(run);
  assert.equal(detail.summary, "One source-backed claim.");
  assert.deepEqual(detail.limitations, ["No independent audit."]);
  assert.equal(detail.origin, "live");
});

test("a server-confirmed Human Review updates the selected run cache immutably for later reopening", () => {
  const run: ResearchRunDetail = {
    id: "55555555-5555-4555-8555-555555555555",
    topicId: "security-evidence",
    topic: "Saved evidence review",
    status: "completed",
    currentStage: "completed",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:01:00.000Z",
    completedAt: "2026-10-18T00:01:00.000Z",
    agents: [],
    sourceCount: 0,
    availableSourceCount: 0,
    findingCount: 0,
    events: [],
    sources: [],
    findings: [],
    assumptions: [],
    limitations: [],
    recommendations: [],
    deterministicTests: [],
    humanReview: { status: "not_reviewed" },
  };
  const saved = {
    runId: run.id,
    reviewerId: "0x0000000000000000000000000000000000000001",
    decision: "needs_investigation" as const,
    notes: "Check source context again.",
    reviewedAt: "2026-10-18T00:02:00.000Z",
    reviewKind: "owner_self_review" as const,
    disclaimer: "Owner self-review, not an independent security audit.",
  };

  const updated = withPersistedHumanReview(run, saved);
  assert.deepEqual(updated.humanReview, {
    status: "reviewed",
    reviewer: saved.reviewerId,
    reviewedAt: saved.reviewedAt,
    decision: "needs_investigation",
    notes: "Check source context again.",
    reviewKind: "owner_self_review",
    disclaimer: "Owner self-review, not an independent security audit.",
  });
  assert.equal(run.humanReview.status, "not_reviewed");
  assert.equal(withPersistedHumanReview(run, { ...saved, runId: "66666666-6666-4666-8666-666666666666" }), run);
});

test("typed security client sends same-origin cookie requests and rejects invalid inputs before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  let fetchCount = 0;
  globalThis.fetch = async (input, init) => {
    fetchCount += 1;
    capturedUrl = String(input);
    capturedInit = init;
    return Response.json({ run: { id: "66666666-6666-4666-8666-666666666666", status: "queued" } });
  };
  try {
    const run = await createSecurityRun({ topicId: "security-evidence" });
    assert.equal(run.id, "66666666-6666-4666-8666-666666666666");
    assert.equal(capturedUrl, "/api/security/runs");
    assert.equal(capturedInit?.credentials, "same-origin");
    assert.equal(capturedInit?.cache, "no-store");
    assert.equal(capturedInit?.method, "POST");
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), { topicId: "security-evidence", testIds: [] });
    assert.equal(createResearchRunRequestSchema.safeParse({ topicId: "not-an-approved-topic" }).success, false);
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("security client preserves bounded Retry-After metadata for a rate-limited session request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(
    { error: { code: "rate_limit_exceeded", message: "Too many requests. Try again later." } },
    { status: 429, headers: { "retry-after": "30" } },
  );
  try {
    await assert.rejects(
      getSecuritySessionStatus(),
      (error: unknown) => error instanceof SecurityApiClientError && error.status === 429 && error.retryAfterMs === 30_000,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wallet owner review client submits the declared decision contract and validates the persisted response", async () => {
  const originalFetch = globalThis.fetch;
  const runId = "55555555-5555-4555-8555-555555555555";
  const reviewerId = "0x0000000000000000000000000000000000000001";
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return Response.json({
      review: {
        runId,
        reviewerId,
        decision: "needs_investigation",
        notes: "Check the source context.",
        reviewedAt: "2026-10-18T00:02:00.000Z",
        reviewKind: "owner_self_review",
        disclaimer: "Owner self-review, not an independent security audit.",
      },
    });
  };
  try {
    const result = await saveSecurityRunReview(runId, { decision: "needs_investigation", notes: "Check the source context." });
    assert.equal(capturedUrl, `/api/security/runs/${runId}/review`);
    assert.equal(capturedInit?.method, "POST");
    assert.equal(capturedInit?.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), { decision: "needs_investigation", notes: "Check the source context." });
    assert.equal(result.review.reviewerId, reviewerId);
    assert.equal(result.review.reviewKind, "owner_self_review");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("live model shows backend failures honestly without demo fallback or executable swap actions", () => {
  const model = buildLiveAppModel({
    wallet: { status: "disconnected" },
    capabilities: {
      provider: "not_configured",
      providerName: "Credentials missing",
      unavailableReason: "model_provider_credentials_missing",
      authentication: "available",
      billing: "available",
      persistence: "unavailable",
      worker: "unavailable",
      deterministicExperiments: "not_configured",
      sourceCount: 3,
    },
    runs: null,
    dataError: "persistence_unavailable: Database is currently unreachable.",
    isRefreshing: false,
    isCreating: false,
  });
  assert.equal(model.mode, "live");
  assert.equal(model.security.origin, "live");
  assert.equal(model.security.status, "unavailable");
  assert.equal(model.security.capabilities?.providerName, "Credentials missing");
  assert.equal(model.statusBar.find((item) => item.id === "swarm-live")?.text, "Live service · error");
  assert.deepEqual(model.security.runs, []);
  assert.equal(model.activity.origin, "live");
  assert.equal(model.activity.status, "unavailable");
  assert.equal(model.swap.button.disabled, true);
  assert.equal(model.swap.button.key, "route");
  assert.equal(model.wallet.qevra.address, undefined);
  assert.equal(model.wallet.qevra.actions.length, 0);
});

test("live status bar distinguishes provider configuration, provider availability, and persistence", () => {
  const makeModel = (capabilities: SecurityResearchCapabilities) => buildLiveAppModel({
    wallet: { status: "disconnected" },
    capabilities,
    runs: [],
    isRefreshing: false,
    isCreating: false,
  });
  const capabilities: SecurityResearchCapabilities = {
    provider: "not_configured",
    authentication: "available",
    billing: "not_configured",
    persistence: "available",
    worker: "available",
    deterministicExperiments: "not_configured",
    sourceCount: 2,
  };

  assert.equal(makeModel(capabilities).statusBar.find((item) => item.id === "swarm-live")?.text, "AI provider · not configured");
  assert.equal(makeModel({ ...capabilities, provider: "unavailable" }).statusBar.find((item) => item.id === "swarm-live")?.text, "AI provider · unavailable");
  assert.equal(makeModel({ ...capabilities, provider: "available", persistence: "unavailable" }).statusBar.find((item) => item.id === "swarm-live")?.text, "Run history · unavailable");
  assert.equal(makeModel({ ...capabilities, provider: "available", persistence: "available", worker: "unavailable" }).statusBar.find((item) => item.id === "swarm-live")?.text, "Research worker · unavailable");
});

test("research run history is newest-first, stable for invalid dates, and reconciles optimistic rows without duplicates", () => {
  const older: ResearchRunSummary = {
    id: "11111111-1111-4111-8111-111111111111",
    topicId: "security-evidence",
    topic: "Older run",
    status: "completed",
    currentStage: "completed",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:01:00.000Z",
    agents: [],
    sourceCount: 0,
    availableSourceCount: 0,
    findingCount: 0,
    events: [],
  };
  const newest: ResearchRunSummary = {
    ...older,
    id: "22222222-2222-4222-8222-222222222222",
    topic: "Newest run",
    createdAt: "2026-10-19T00:00:00.000Z",
    updatedAt: "2026-10-19T00:00:00.000Z",
  };
  const invalidTimestamp: ResearchRunSummary = {
    ...older,
    id: "33333333-3333-4333-8333-333333333333",
    topic: "Timestamp unavailable",
    createdAt: "not-a-timestamp",
  };

  const ordered = newestFirstResearchRuns([older, invalidTimestamp, newest, { ...older, topic: "duplicate payload" }]);
  assert.deepEqual(ordered.map((run) => run.id), [newest.id, older.id, invalidTimestamp.id]);
  assert.equal(ordered[1]?.topic, "duplicate payload");
  assert.equal(ordered[2]?.createdAt, "not-a-timestamp");

  const reconciled = reconcileResearchRunHistory([older, newest], [newest, invalidTimestamp]);
  assert.deepEqual(reconciled.map((run) => run.id), [newest.id, older.id, invalidTimestamp.id]);
  const justCreated: ResearchRunSummary = {
    ...newest,
    id: "44444444-4444-4444-8444-444444444444",
    topic: "Just created",
    createdAt: newest.createdAt,
    updatedAt: newest.updatedAt,
  };
  const optimistic = reconcileResearchRunHistory([older, newest], [justCreated]);
  assert.equal(optimistic[0]?.id, justCreated.id);
  assert.equal(optimistic[0]?.createdAt, justCreated.createdAt);
  const model = buildLiveAppModel({
    wallet: { status: "disconnected" },
    runs: optimistic,
    preferredRunId: justCreated.id,
    isRefreshing: false,
    isCreating: false,
  });
  assert.equal(model.security.runs[0]?.id, justCreated.id);
  assert.equal(model.security.preferredRunId, justCreated.id);
});

test("live model keeps the app network independent from the connected wallet chain", () => {
  const model = buildLiveAppModel({
    wallet: {
      status: "connected",
      address: "0x0000000000000000000000000000000000000001",
      chainId: 46_630,
      networkName: "Robinhood Chain Testnet",
      isQevraTargetNetwork: true,
    },
    selectedNetwork: "mainnet",
    networkRpc: {
      status: "available",
      chainId: 4_663,
      latestBlock: "123",
      observedAt: "2026-10-19T00:00:00.000Z",
    },
    runs: [],
    isRefreshing: false,
    isCreating: false,
  });

  assert.equal(model.network.selected, "mainnet");
  assert.equal(model.network.rpc.chainId, 4_663);
  assert.equal(model.network.walletMismatch, true);
  assert.equal(model.wallet.connection?.chainId, 46_630);
});

test("live run labels distinguish rate limits and explicit research lifecycle states", () => {
  const baseRun: ResearchRunSummary = {
    id: "77777777-7777-4777-8777-777777777777",
    topicId: "robinhood-readonly-wallet",
    topic: "Read-only wallet evidence",
    status: "failed",
    currentStage: "failed",
    createdAt: "2026-10-19T00:00:00.000Z",
    updatedAt: "2026-10-19T00:01:00.000Z",
    agents: [],
    sourceCount: 1,
    availableSourceCount: 1,
    findingCount: 0,
    events: [],
  };
  const labels = [
    { status: "queued" as const, expected: "Research queued" },
    { status: "running" as const, expected: "Research running" },
    {
      status: "completed" as const,
      agents: ["research", "analysis", "verification"].map((role) => ({ role: role as "research" | "analysis" | "verification", status: "completed" as const })),
      expected: "Run completed",
    },
    { status: "failed" as const, errorCode: "provider_http_error", expected: "Research failed" },
    { status: "failed" as const, errorCode: "provider_rate_limited", expected: "Rate-limited" },
  ];
  for (const entry of labels) {
    const model = buildLiveAppModel({
      wallet: { status: "disconnected" },
      runs: [{ ...baseRun, status: entry.status, ...(entry.errorCode ? { errorCode: entry.errorCode } : {}), ...(entry.agents ? { agents: entry.agents } : {}) }],
      isRefreshing: false,
      isCreating: false,
    });
    assert.equal(model.security.runs[0]?.status.label, entry.expected);
    if (entry.status === "completed") assert.equal(model.security.runs[0]?.status.material, "outline");
  }
});

test("summary and detail use the same non-verifying run status and preserve per-agent gaps", () => {
  const rateLimited: ResearchRunSummary = {
    id: "77777778-7777-4777-8777-777777777777",
    topicId: "security-evidence",
    topic: "Public-source evidence",
    status: "failed",
    currentStage: "research",
    createdAt: "2026-10-19T00:00:00.000Z",
    updatedAt: "2026-10-19T00:01:00.000Z",
    agents: [
      { role: "research", status: "failed", errorCode: "provider_rate_limited" },
      { role: "analysis", status: "blocked", errorCode: "prior_stage_failed" },
      { role: "verification", status: "blocked", errorCode: "prior_stage_failed" },
    ],
    sourceCount: 2,
    availableSourceCount: 2,
    findingCount: 0,
    errorCode: "provider_rate_limited",
    events: [],
  };
  const detail: ResearchRunDetail = {
    ...rateLimited,
    sources: [],
    findings: [],
    assumptions: [],
    limitations: ["Research stopped before analysis and verification."],
    recommendations: [],
    deterministicTests: [],
    humanReview: { status: "not_reviewed" },
  };
  const summaryRun = toLiveSwarmRun(rateLimited);
  const detailedRun = toLiveSwarmRun(rateLimited, detail);
  assert.equal(summaryRun.status.label, "Rate-limited");
  assert.equal(detailedRun.status.label, "Rate-limited");
  assert.equal(summaryRun.status.material, "solid");
  assert.equal(detailedRun.status.material, "solid");
  assert.match(detailedRun.how, /Research: failed · Analysis: blocked · Verification: blocked/);

  const diagnosticDetail: ResearchRunDetail = {
    ...detail,
    errorCode: "provider_output_invalid",
    errorMessage: "The model response did not match the required output schema.",
    sources: [{
      id: "nist-source",
      title: "NIST publication",
      url: "https://csrc.nist.gov/pubs/fips/204/final",
      retrievedAt: "2026-10-19T00:00:00.000Z",
      status: "available",
      sha256: "a".repeat(64),
    }],
    findings: [{
      id: "claim-1",
      claim: "A source-backed claim.",
      modelAssessment: "supported",
      evidenceStatus: "quote_matched",
      evidence: [{ sourceId: "nist-source", quote: "Exact source text.", exactQuoteMatched: true }],
      rationale: "The quote matches the captured source.",
    }],
    deterministicTests: [{ id: "test-1", name: "Offline parser test", status: "passed", command: "bun test", limitations: [] }],
    agents: [{
      role: "research",
      status: "failed",
      errorCode: "provider_output_invalid",
      providerReportedUsage: {
        promptTokens: 200,
        completionTokens: 100,
        outputDiagnostics: {
          finishReason: "stop",
          validationCategory: "schema_validation",
          validationIssueCount: 1,
          validationIssues: [{ code: "invalid_type", path: ["claims", 0, "id"] }],
        },
      },
    }],
  };
  const diagnosticRun = toLiveSwarmRun(diagnosticDetail, diagnosticDetail);
  assert.match(diagnosticRun.liveDetail?.errorMessage ?? "", /schema_validation/);
  assert.match(diagnosticRun.liveDetail?.errorMessage ?? "", /claims\.\[0\]\.id \(invalid_type\)/);
  assert.doesNotMatch(diagnosticRun.liveDetail?.errorMessage ?? "", /raw model response/i);
  const pipeline = pipelineFor(diagnosticRun);
  assert.deepEqual(pipeline?.quotes, { matched: 1, total: 1 });
  assert.deepEqual(pipeline?.tests, { total: 1, passed: 1, failed: 0 });

  const completedWithMissingAgent = toLiveSwarmRun({
    ...rateLimited,
    status: "completed",
    currentStage: "completed",
    errorCode: undefined,
    agents: [{ role: "research", status: "completed" }, { role: "analysis", status: "completed" }],
  });
  assert.equal(completedWithMissingAgent.status.label, "Finished with gaps");
  assert.equal(completedWithMissingAgent.status.material, "outline");
  assert.match(completedWithMissingAgent.how, /Verification: not reported/);
});

test("live dashboard adapter preserves unverified evidence status", () => {
  const detail: ResearchRunDetail = {
    id: "99999999-9999-4999-8999-999999999999",
    topicId: "robinhood-readonly-wallet",
    topic: "Read-only wallet evidence",
    status: "completed",
    currentStage: "completed",
    createdAt: "2026-10-19T00:00:00.000Z",
    updatedAt: "2026-10-19T00:01:00.000Z",
    agents: [],
    sourceCount: 1,
    availableSourceCount: 1,
    findingCount: 1,
    events: [],
    summary: "An unverified claim.",
    sources: [],
    findings: [{
      id: "claim-1",
      claim: "The source does not support this claim.",
      modelAssessment: "unclear",
      evidenceStatus: "not_verified",
      evidence: [{ sourceId: "robinhood-chain-docs", quote: "Unsupported quote.", exactQuoteMatched: false }],
      rationale: "The quote was not present in the supplied excerpt.",
    }],
    assumptions: [],
    limitations: ["Evidence not verified."],
    recommendations: [],
    deterministicTests: [],
    humanReview: { status: "not_reviewed" },
  };

  const adapted = toLiveSecurityRun(detail);
  assert.equal(adapted.findings[0]?.evidenceStatus, "not_verified");
  assert.equal(adapted.findings[0]?.evidence[0]?.exactQuoteMatched, false);
});

test("demo model remains explicitly fixture-backed and separate from live origin", () => {
  const model = buildDemoModel({
    stage: 0,
    forced: null,
    reviewed: null,
    amount: "100",
    runsMode: "examples",
    actsMode: "examples",
    network: "testnet",
  });
  assert.equal(model.mode, "demo");
  assert.equal(model.security.origin, "demo");
  assert.equal(model.activity.origin, "demo");
  assert.ok(model.security.runs.every((run) => run.exampleTag));
  assert.ok(model.activity.rows.every((row) => row.exampleTag));
});
