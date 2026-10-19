import assert from "node:assert/strict";
import { test } from "node:test";
import { toLiveDashboardSnapshot, toLiveSecurityRun } from "@/features/dashboard/live-adapters";
import { createSecurityRun } from "@/features/security/client";
import { buildLiveAppModel } from "@/features/dashboard/live-model";
import { createResearchRunRequestSchema } from "@/features/security/schemas";
import { buildDemoModel } from "@/lib/demo/model";
import type { ReadOnlyWalletState, ResearchRunDetail, SecurityResearchCapabilities } from "@/types/integrations";

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
    humanReview: { status: "not_reviewed" },
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
  assert.equal("exampleTag" in (snapshot.security.runs[0] ?? {}), false);
  const detail = toLiveSecurityRun(run);
  assert.equal(detail.summary, "One source-backed claim.");
  assert.deepEqual(detail.limitations, ["No independent audit."]);
  assert.equal(detail.origin, "live");
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

test("live model shows backend failures honestly without demo fallback or executable swap actions", () => {
  const model = buildLiveAppModel({
    wallet: { status: "disconnected" },
    capabilities: {
      provider: "not_configured",
      authentication: "available",
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
  assert.deepEqual(model.security.runs, []);
  assert.equal(model.activity.origin, "live");
  assert.equal(model.activity.status, "unavailable");
  assert.equal(model.swap.button.disabled, true);
  assert.equal(model.swap.button.key, "route");
  assert.equal(model.wallet.qevra.address, undefined);
  assert.equal(model.wallet.qevra.actions.length, 0);
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
