import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import * as reportUiModule from "@/components/dashboard/SwarmRunDetail";
import type { SwarmRun } from "@/types/security";

const reportUi = reportUiModule as unknown as Record<string, unknown>;

function render(componentFile: string, exportName: string, propsLiteral: string): string {
  return execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import * as module from "./${componentFile}.tsx"; const component = module.${exportName}; const props = ${propsLiteral}; process.stdout.write(renderToStaticMarkup(createElement(component, props)))`,
  ], { cwd: process.cwd(), encoding: "utf8" });
}

test("report limits render as separate limitations, assumptions, and recommendations", () => {
  const Component = reportUi.ReportLimitSections;
  assert.equal(typeof Component, "function", "report should expose structured limit sections");
  if (typeof Component !== "function") return;
  const markup = render("src/components/dashboard/SwarmRunDetail", "ReportLimitSections", JSON.stringify({
    limitations: ["No independent audit."],
    assumptions: ["The network configuration applies to public networks."],
    recommendations: ["Verify the explorer against official documentation."],
  }));

  assert.match(markup, /Limitations/);
  assert.match(markup, /Assumptions/);
  assert.match(markup, /Recommendations/);
  assert.match(markup, /No independent audit\./);
  assert.match(markup, /The network configuration applies to public networks\./);
  assert.match(markup, /Verify the explorer against official documentation\./);
});

test("an empty limits section says nothing was recorded instead of implying none exist", () => {
  const Component = reportUi.ReportLimitSections;
  assert.equal(typeof Component, "function");
  if (typeof Component !== "function") return;
  const markup = render("src/components/dashboard/SwarmRunDetail", "ReportLimitSections", JSON.stringify({
    limitations: [],
    assumptions: [],
    recommendations: [],
  }));
  assert.match(markup, /No limitations, assumptions, or recommendations were recorded/i);
});

test("recorded event timeline preserves event text and machine-readable UTC timestamps", () => {
  const Component = reportUi.RecordedEventTimeline;
  assert.equal(typeof Component, "function", "report should expose a recorded event timeline");
  if (typeof Component !== "function") return;

  const markup = render("src/components/dashboard/SwarmRunDetail", "RecordedEventTimeline", JSON.stringify({
    events: [{ at: "2026-10-20T20:12:16.753Z", stage: "source_retrieval", message: "Fetching only approved source URLs." }],
  }));

  assert.match(markup, /<time dateTime="2026-10-20T20:12:16\.753Z">2026-10-20 20:12:16 UTC<\/time>/);
  assert.match(markup, /Source retrieval/);
  assert.match(markup, /source_retrieval/);
  assert.match(markup, /Fetching only approved source URLs\./);
  assert.match(markup, /historical|recorded/i);
});

test("an empty event timeline is identified as unrecorded", () => {
  const Component = reportUi.RecordedEventTimeline;
  assert.equal(typeof Component, "function");
  if (typeof Component !== "function") return;
  const markup = render("src/components/dashboard/SwarmRunDetail", "RecordedEventTimeline", JSON.stringify({ events: [] }));
  assert.match(markup, /No run events were recorded/i);
});

test("ambiguous Testnet findings that cite the Mainnet explorer receive a local caveat", () => {
  const check = reportUi.hasRobinhoodExplorerMismatch as ((finding: {
    claim: string;
    modelAssessment: string;
    evidence: Array<{ quote: string }>;
  }) => boolean);
  assert.equal(typeof check, "function", "report should recognize the known explorer/network mismatch from finding content");
  if (typeof check !== "function") return;

  assert.equal(check({
    claim: "The public testnet network for Robinhood Chain uses chain ID 46630 and is accessible via robinhoodchain.blockscout.com.",
    modelAssessment: "unclear",
    evidence: [{ quote: "Robinhood Chain Testnet Chain ID 46630 Block Explorer robinhoodchain.blockscout.com" }],
  }), true);
  assert.equal(check({
    claim: "Robinhood Chain Testnet uses explorer.testnet.chain.robinhood.com.",
    modelAssessment: "unclear",
    evidence: [{ quote: "Block Explorer explorer.testnet.chain.robinhood.com" }],
  }), false);
  assert.equal(check({
    claim: "Robinhood Chain Mainnet uses robinhoodchain.blockscout.com.",
    modelAssessment: "unclear",
    evidence: [{ quote: "Mainnet explorer robinhoodchain.blockscout.com" }],
  }), false);
});

test("the explorer caveat appears beside the unchanged saved finding", () => {
  const run: SwarmRun = {
    origin: "live",
    id: "55555555-5555-4555-8555-555555555555",
    role: "Research",
    goal: "Review Robinhood Testnet network configuration.",
    status: { label: "Run completed", tone: "neutral", material: "outline" },
    shows: "One saved network claim.",
    how: "One approved source was checked.",
    notShown: "No independent audit.",
    limitation: "Human review has not been recorded.",
    evidence: "One source-backed finding.",
    humanReview: { recorded: false },
    liveDetail: {
      id: "55555555-5555-4555-8555-555555555555",
      topicId: "robinhood-readonly-wallet",
      topic: "Robinhood network configuration",
      status: "completed",
      currentStage: "completed",
      createdAt: "2026-10-20T20:12:16.753Z",
      updatedAt: "2026-10-20T20:14:21.174Z",
      agents: [
        { role: "research", status: "completed" },
        { role: "analysis", status: "completed" },
        { role: "verification", status: "completed" },
      ],
      sourceCount: 1,
      availableSourceCount: 1,
      findingCount: 1,
      events: [{ at: "2026-10-20T20:14:21.174Z", stage: "completed", message: "All three agents completed." }],
      sources: [{
        id: "robinhood-chain-docs",
        title: "Robinhood Chain developer documentation",
        url: "https://docs.robinhood.com/chain/connecting/",
        retrievedAt: "2026-10-20T20:12:16.000Z",
        status: "available",
        excerpt: "Robinhood Chain Testnet and Mainnet network configuration.",
      }],
      findings: [{
        id: "network-configuration",
        claim: "The public testnet network uses chain ID 46630 and is accessible via the block explorer robinhoodchain.blockscout.com.",
        modelAssessment: "unclear",
        evidenceStatus: "not_verified",
        evidence: [{
          sourceId: "robinhood-chain-docs",
          quote: "Robinhood Chain Testnet Chain ID 46630 Block Explorer robinhoodchain.blockscout.com",
          exactQuoteMatched: true,
        }],
        rationale: "The source lists both network configurations.",
      }],
      assumptions: [],
      limitations: ["No independent security validation was performed."],
      recommendations: [],
      deterministicTests: [],
      humanReview: { status: "not_reviewed" },
    },
  };

  const markup = render("src/components/dashboard/SwarmRunDetail", "SwarmRunDetail", JSON.stringify({ run, headingId: "report-heading" }));
  assert.match(markup, /The public testnet network uses chain ID 46630 and is accessible via the block explorer robinhoodchain\.blockscout\.com\./);
  assert.match(markup, /Network association to verify/);
  assert.match(markup, /Robinhood Mainnet explorer/);
  assert.match(markup, /Recorded stage status/);
  assert.match(markup, /Research<\/span><span>Completed/);
  assert.match(markup, /Analysis<\/span><span>Completed/);
  assert.match(markup, /Verification<\/span><span>Completed/);
  assert.match(markup, /not independent security validation/i);
  assert.match(markup, /Summary<\/button>[\s\S]*Findings \(1\)<\/button>[\s\S]*Sources \(1\)<\/button>[\s\S]*Limits<\/button>[\s\S]*Events \(1\)<\/button>/);
});

test("a completed zero-finding report says no substantiated findings without implying safety", () => {
  const run: SwarmRun = {
    origin: "live",
    id: "77777777-7777-4777-8777-777777777777",
    role: "Research",
    goal: "Review the approved source evidence.",
    status: { label: "Run completed", tone: "neutral", material: "outline" },
    shows: "The persisted research workflow completed.",
    how: "Three recorded stages processed approved sources.",
    notShown: "No independent security assessment.",
    limitation: "Only one approved source was available.",
    evidence: "One of two sources.",
    zeroFindings: true,
    humanReview: { recorded: false },
    liveDetail: {
      id: "77777777-7777-4777-8777-777777777777",
      topicId: "security-evidence",
      topic: "Approved source evidence",
      status: "completed",
      currentStage: "completed",
      createdAt: "2026-10-22T05:18:35.044Z",
      updatedAt: "2026-10-22T05:20:45.818Z",
      agents: [
        { role: "research", status: "completed" },
        { role: "analysis", status: "completed" },
        { role: "verification", status: "completed" },
      ],
      sourceCount: 2,
      availableSourceCount: 1,
      findingCount: 0,
      events: [],
      sources: [],
      findings: [],
      assumptions: [],
      limitations: ["Only one of two approved sources was available."],
      recommendations: [],
      deterministicTests: [],
      humanReview: { status: "not_reviewed" },
    },
  };

  const markup = render("src/components/dashboard/SwarmRunDetail", "SwarmRunDetail", JSON.stringify({ run, headingId: "report-heading" }));
  assert.match(markup, /Completed with no substantiated findings/);
  assert.match(markup, /does not establish that the subject is secure or that no issues exist/i);
  assert.match(markup, /Summary<\/button>[\s\S]*Findings \(0\)<\/button>[\s\S]*Sources \(0\)<\/button>[\s\S]*Limits<\/button>[\s\S]*Events \(0\)<\/button>/);
  assert.doesNotMatch(markup, /assessment passed|proves the system is secure/i);
});

test("saved run history truncates the selectable row and discloses complete question and metadata on demand", async () => {
  const historyUiModule = await import("@/components/dashboard/RunHistoryItem").catch(() => ({}));
  const historyUi = historyUiModule as unknown as Record<string, unknown>;
  const Component = historyUi.RunHistoryItem;
  assert.equal(typeof Component, "function", "Security history should use a compact progressive-disclosure item");
  if (typeof Component !== "function") return;

  const question = "Can the Robinhood Testnet explorer prove a read-only wallet balance without implying a verified deployment?";
  const run: SwarmRun = {
    origin: "live",
    id: "44444444-4444-4444-8444-444444444444",
    role: "Research",
    goal: question,
    status: { label: "Completed", tone: "neutral", material: "outline" },
    shows: "The saved report records a completed research pipeline.",
    how: "Approved sources were read.",
    notShown: "No independent audit.",
    limitation: "No human review was recorded.",
    evidence: "One source.",
    humanReview: { recorded: false },
    liveSummary: {
      id: "44444444-4444-4444-8444-444444444444",
      topicId: "robinhood-readonly-wallet",
      topic: "Robinhood read-only wallet",
      status: "completed",
      currentStage: "completed",
      createdAt: "2026-10-20T20:12:16.753Z",
      updatedAt: "2026-10-20T20:14:21.174Z",
      agents: [
        { role: "research", status: "completed" },
        { role: "analysis", status: "completed" },
        { role: "verification", status: "completed" },
      ],
      sourceCount: 1,
      availableSourceCount: 1,
      findingCount: 1,
      events: [],
    },
  };
  const markup = execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { RunHistoryItem } from "./src/components/dashboard/RunHistoryItem.tsx"; const run = ${JSON.stringify(run)}; process.stdout.write(renderToStaticMarkup(createElement(RunHistoryItem, { run, selected: true, illustrating: false, detailId: "report", onSelect() {} })))`,
  ], { cwd: process.cwd(), encoding: "utf8" });

  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /Run details/);
  assert.match(markup, new RegExp(question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(markup, /Run ID/);
  assert.match(markup, /Robinhood read-only wallet/);
  assert.match(markup, /Completed/);
});
