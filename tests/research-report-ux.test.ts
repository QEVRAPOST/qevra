import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import * as reportUiModule from "@/components/dashboard/SwarmRunDetail";
import { SecurityApiClientError } from "@/features/security/client";
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
    analysis: {
      summary: "The research source does not establish the implementation's security.",
      assumptions: ["The network configuration applies to public networks."],
      risks: [{ id: "source-scope", title: "Source scope is limited", severity: "medium", analysis: "The source does not describe application-level protections.", sourceIds: ["official-docs"] }],
      unknowns: ["Application-level protections remain unassessed."],
      recommendations: ["Verify the explorer against official documentation."],
    },
    sources: [{ id: "official-docs", title: "Official network docs", url: "https://example.test/network", retrievedAt: "2026-10-20T00:00:00.000Z", status: "available" }],
  }));

  assert.match(markup, /Limitations/);
  assert.match(markup, /Assumptions/);
  assert.match(markup, /Recommended next steps/);
  assert.match(markup, /Source scope is limited/);
  assert.match(markup, /medium severity/);
  assert.match(markup, /Application-level protections remain unassessed\./);
  assert.match(markup, /Evidence sources: <span><a href="https:\/\/example\.test\/network" target="_blank" rel="noopener noreferrer">Official network docs<\/a><\/span>/);
  assert.match(markup, /not independent security validation/i);
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
  assert.match(markup, /Risk assessments are not available in the report data returned by the service\. Older reports may not include the Analysis fields\./);
});

test("human review presents a saved personal assessment without implying an audit", () => {
  const Component = reportUi.HumanReviewStatus;
  assert.equal(typeof Component, "function", "the report should clearly present its persisted human-review status");
  if (typeof Component !== "function") return;
  const markup = render("src/components/dashboard/SwarmRunDetail", "HumanReviewStatus", JSON.stringify({
    review: {
      recorded: true,
      by: "0x0000000000000000000000000000000000000001",
      at: "2026-10-22T05:20:45.818Z",
      decision: "needs_investigation",
      notes: "Confirm the source context.",
      reviewKind: "owner_self_review",
      disclaimer: "This is the report owner's self-review, not an independent audit.",
    },
  }));

  assert.match(markup, /Personal evidence assessment/);
  assert.match(markup, /Needs investigation/);
  assert.match(markup, /0x0000000000000000000000000000000000000001/);
  assert.match(markup, /Confirm the source context\./);
  assert.match(markup, /2026-10-22 05:20:45 UTC/);
  assert.match(markup, /not an independent audit/i);
  assert.doesNotMatch(markup, /<button|<form|<textarea|<select/);
});

test("unreviewed reports explain that no personal review is saved or submitted", () => {
  const Component = reportUi.HumanReviewStatus;
  assert.equal(typeof Component, "function");
  if (typeof Component !== "function") return;
  const markup = render("src/components/dashboard/SwarmRunDetail", "HumanReviewStatus", JSON.stringify({ review: { recorded: false } }));

  assert.match(markup, /Illustrative reports do not contain live personal evidence assessments\./);
  assert.doesNotMatch(markup, /saved successfully|submit review/i);
});

test("a completed live report offers an explicit wallet-owner evidence review", () => {
  const markup = render("src/components/dashboard/SwarmRunDetail", "HumanReviewStatus", JSON.stringify({
    review: { recorded: false },
    runId: "55555555-5555-4555-8555-555555555555",
    live: true,
    completed: true,
    canSubmit: true,
    sessionRole: "wallet",
  }));

  assert.match(markup, /Assess the saved evidence/);
  assert.match(markup, /Evidence supported/);
  assert.match(markup, /Needs investigation/);
  assert.match(markup, /Insufficient evidence/);
  assert.match(markup, /name="review-55555555-5555-4555-8555-555555555555"/);
  assert.match(markup, /Optional note/);
  assert.match(markup, /maxLength="1000"/);
  assert.match(markup, /Save assessment/);
  assert.match(markup, /Only the verified report owner can save this self-review/);
});

test("operator sessions cannot submit or view a wallet owner's personal review", () => {
  const markup = render("src/components/dashboard/SwarmRunDetail", "HumanReviewStatus", JSON.stringify({
    review: { recorded: false },
    runId: "55555555-5555-4555-8555-555555555555",
    live: true,
    completed: true,
    canSubmit: false,
    sessionRole: "operator",
  }));

  assert.match(markup, /Owner review not shown/);
  assert.match(markup, /Operator sessions are read-only/);
  assert.doesNotMatch(markup, /<form|<input|<textarea|Save assessment/);
});

test("human review shows distinct session, ownership, completion, rate-limit, and persistence errors", () => {
  const message = reportUi.humanReviewErrorMessage as ((error: unknown) => string);
  assert.equal(typeof message, "function");
  if (typeof message !== "function") return;

  assert.match(message(new SecurityApiClientError(401, "session_expired", "Unauthorized")), /session has expired/i);
  assert.match(message(new SecurityApiClientError(403, "wallet_user_authentication_required", "Forbidden")), /Operator sessions are read-only/i);
  assert.match(message(new SecurityApiClientError(404, "run_not_found", "Not found")), /not available to the currently authenticated wallet/i);
  assert.match(message(new SecurityApiClientError(409, "research_run_not_completed", "Conflict")), /must finish all three stages/i);
  assert.match(message(new SecurityApiClientError(429, "rate_limit_exceeded", "Limited", 30_000)), /30 seconds/);
  assert.match(message(new SecurityApiClientError(503, "persistence_unavailable", "Unavailable")), /persistence is unavailable/i);
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
      summary: "The source lists the Testnet chain ID, but its explorer association needs confirmation.",
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
      analysis: {
        summary: "The source lists the Testnet chain ID, but its explorer association needs confirmation.",
        assumptions: [],
        risks: [],
        unknowns: [],
        recommendations: [],
      },
      verification: {
        summary: "The finding has a quotation matched against the fetched source text.",
        claimChecks: [{
          claimId: "network-configuration",
          assessment: "unclear",
          evidence: [{ sourceId: "robinhood-chain-docs", quote: "Robinhood Chain Testnet Chain ID 46630 Block Explorer robinhoodchain.blockscout.com" }],
          rationale: "The source lists both network configurations.",
        }],
        testArtifactChecks: [],
        limitations: ["Quotation matching is not independent security validation."],
      },
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
  assert.match(markup, /Research question/);
  assert.match(markup, /Outcome/);
  assert.match(markup, /The source lists the Testnet chain ID, but its explorer association needs confirmation\./);
  assert.match(markup, /The finding has a quotation matched against the fetched source text\./);
  assert.match(markup, /<b>Next step\.<\/b> Compare each finding with its saved quotation and source/);
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
