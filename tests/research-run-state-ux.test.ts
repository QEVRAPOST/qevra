import assert from "node:assert/strict";
import { test } from "node:test";
import { startBlocker } from "@/components/dashboard/SwarmLaunch";
import { toLiveSwarmRun } from "@/features/dashboard/live-model";
import { pipelineFor } from "@/lib/swarm-view";
import type { ResearchAgentStatus, ResearchRunStatus, ResearchRunSummary, SecurityResearchCapabilities } from "@/types/integrations";

const states: Array<{
  run: ResearchRunStatus;
  agents: [ResearchAgentStatus, ResearchAgentStatus, ResearchAgentStatus];
  label: string;
}> = [
  { run: "queued", agents: ["pending", "pending", "pending"], label: "Research queued" },
  { run: "running", agents: ["completed", "running", "pending"], label: "Research running" },
  { run: "completed", agents: ["completed", "completed", "completed"], label: "Research completed" },
  { run: "failed", agents: ["completed", "failed", "blocked"], label: "Research failed" },
];

test("live Research, Analysis, and Verification stages mirror persisted run states and events", () => {
  for (const [index, state] of states.entries()) {
    const roleNames = ["research", "analysis", "verification"] as const;
    const summary: ResearchRunSummary = {
      id: `55555555-5555-4555-8555-${String(index + 1).padStart(12, "0")}`,
      topicId: "security-evidence",
      topic: "Recorded run state",
      status: state.run,
      currentStage: state.run === "failed" ? "analysis" : state.run,
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:01:00.000Z",
      agents: roleNames.map((role, roleIndex) => ({
        role,
        status: state.agents[roleIndex]!,
        ...(state.agents[roleIndex] === "running" ? { startedAt: "2026-10-21T00:00:30.000Z" } : {}),
      })),
      sourceCount: 2,
      availableSourceCount: 1,
      findingCount: 0,
      events: [{ at: "2026-10-21T00:00:30.000Z", stage: roleNames[index % roleNames.length]!, message: `Persisted ${state.run} event.` }],
    };

    const run = toLiveSwarmRun(summary);
    const pipeline = pipelineFor(run);
    assert.ok(pipeline);
    assert.equal(pipeline.example, false);
    assert.equal(pipeline.runState, state.run);
    assert.deepEqual(pipeline.stages.map((stage) => stage.status), state.agents);
    assert.deepEqual(pipeline.stages.flatMap((stage) => stage.events), summary.events);
    assert.equal(run.status.label, state.label);
  }
});

test("a historical completed run cannot make a new run ready when current capabilities are blocked", () => {
  const capabilities: SecurityResearchCapabilities = {
    provider: "not_configured",
    providerName: "Awaiting authorization",
    authentication: "available",
    billing: "not_configured",
    persistence: "available",
    worker: "available",
    deterministicExperiments: "not_configured",
    sourceCount: 2,
    unavailableReason: "ai_billing_not_approved",
  };

  assert.notEqual(startBlocker(capabilities), null);
  assert.equal(startBlocker({
    ...capabilities,
    provider: "available",
    billing: "available",
    unavailableReason: undefined,
  }), null);
});
