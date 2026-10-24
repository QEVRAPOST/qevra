import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function renderOrbit(model: unknown): string {
  return execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { OrbitCanvas } from "./src/components/dashboard/OrbitCanvas.tsx"; const model = ${JSON.stringify(model)}; process.stdout.write(renderToStaticMarkup(createElement(OrbitCanvas, { model })))`,
  ], { cwd: process.cwd(), encoding: "utf8" });
}

function renderPipeline(model: unknown): string {
  return execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { SwarmPipeline } from "./src/components/dashboard/SwarmPipeline.tsx"; const model = ${JSON.stringify(model)}; process.stdout.write(renderToStaticMarkup(createElement(SwarmPipeline, { model })))`,
  ], { cwd: process.cwd(), encoding: "utf8" });
}

const stages = [
  { role: "research", title: "Research", does: "Reads approved public sources and extracts claims.", status: "completed", events: [] },
  { role: "analysis", title: "Analysis", does: "Weighs risks, assumptions, and unknowns.", status: "failed", errorCode: "analysis_error", events: [] },
  { role: "verification", title: "Verification", does: "Checks quoted text against fetched sources.", status: "blocked", errorCode: "prior_stage_failed", events: [] },
];

test("the pipeline keeps all three stage states and descriptions visible in its ordered workflow", () => {
  const markup = renderOrbit({
    example: false,
    runState: "failed",
    stages,
    sources: { total: 2, available: 2 },
    findings: 1,
    quotes: null,
    tests: null,
    review: { recorded: false },
  });

  assert.match(markup, /aria-label="Agents, in the order they run"/);
  assert.match(markup, /Step 01/);
  assert.match(markup, /Step 02/);
  assert.match(markup, /Step 03/);
  assert.match(markup, /Reads approved public sources and extracts claims\./);
  assert.match(markup, /Weighs risks, assumptions, and unknowns\./);
  assert.match(markup, /Checks quoted text against fetched sources\./);
  assert.match(markup, /class="pn s-failed"/);
  assert.match(markup, /class="pn s-blocked"/);
  assert.match(markup, /class="pn s-completed"/);
  assert.match(markup, /Technical error code analysis_error\. Select this stage for details\./);
});

test("pending and running stages retain their actual state labels", () => {
  const markup = renderOrbit({
    example: false,
    runState: "running",
    stages: [
      { ...stages[0], status: "pending" },
      { ...stages[1], status: "running", errorCode: undefined },
      { ...stages[2], status: "pending", errorCode: undefined },
    ],
    sources: { total: 2, available: 1 },
    findings: 0,
    quotes: null,
    tests: null,
    review: { recorded: false },
  });

  assert.match(markup, /class="pn s-pending"/);
  assert.match(markup, /class="pn s-running"/);
  assert.match(markup, />Waiting<\/span>/);
  assert.match(markup, />Running<\/span>/);
  assert.match(markup, /Weighing the claims/);
});

test("rapid snapshots preserve only the backend-recorded stage states", () => {
  const base = {
    example: false,
    runState: "running",
    sources: { total: 2, available: 2 },
    findings: 1,
    quotes: null,
    tests: null,
    review: { recorded: false },
  };
  const researchDone = renderOrbit({
    ...base,
    stages: [
      { ...stages[0], status: "completed" },
      { ...stages[1], status: "running" },
      { ...stages[2], status: "pending" },
    ],
  });
  assert.match(researchDone, /class="pn s-completed"/);
  assert.match(researchDone, /class="pn s-running"/);
  assert.match(researchDone, /class="pn s-pending"/);
  assert.match(researchDone, /<span class="pn-title">Analysis<\/span>/);
  assert.match(researchDone, />Running<\/span>/);

  const analysisDone = renderOrbit({
    ...base,
    stages: [
      { ...stages[0], status: "completed" },
      { ...stages[1], status: "completed", errorCode: undefined },
      { ...stages[2], status: "running", errorCode: undefined },
    ],
  });
  assert.match(analysisDone, /<span class="pn-title">Verification<\/span>/);
  assert.equal((analysisDone.match(/class="pn s-running"/g) ?? []).length, 1);

  const analysisFailed = renderOrbit({
    ...base,
    runState: "failed",
    stages: [
      { ...stages[0], status: "completed" },
      { ...stages[1], status: "failed", errorCode: "provider_output_invalid" },
      { ...stages[2], status: "blocked", errorCode: "prior_stage_failed" },
    ],
  });
  assert.match(analysisFailed, /class="pn s-failed"/);
  assert.match(analysisFailed, /class="pn s-blocked"/);
  assert.doesNotMatch(analysisFailed, /class="pn s-running"/);
});

test("failed stages use a concise label and retain the technical error in the Inspector", () => {
  const model = {
    example: false,
    runState: "failed",
    stages: [
      { ...stages[0], status: "completed" },
      { ...stages[1], status: "failed", errorCode: "provider_output_invalid" },
      { ...stages[2], status: "blocked", errorCode: "prior_stage_failed" },
    ],
    sources: { total: 2, available: 2 },
    findings: 0,
    quotes: null,
    tests: null,
    review: { recorded: false },
  };
  const canvas = renderOrbit(model);
  const failedNode = canvas.match(/<button[^>]*class="pn s-failed"[\s\S]*?<\/button>/)?.[0] ?? "";
  assert.match(failedNode, /Analysis failed/);
  assert.doesNotMatch(failedNode, /<code>provider_output_invalid<\/code>/);
  assert.match(failedNode, /aria-describedby="[^"]+-error-analysis"/);
  assert.match(canvas, /Technical error code provider_output_invalid\. Select this stage for details\./);

  const pipeline = renderPipeline(model);
  assert.match(pipeline, /<div class="pipe-detail"[^>]*role="group" aria-label="Analysis detail">/);
  assert.match(pipeline, /<dt>Technical error code<\/dt><dd><code>provider_output_invalid<\/code><\/dd>/);
  assert.match(pipeline, /Verification blocked/);
});

test("mobile stage progression connects Sources to Research and keeps Human Review separate", () => {
  const markup = renderOrbit({
    example: false,
    runState: "completed",
    stages: stages.map((stage) => ({ ...stage, status: "completed", errorCode: undefined })),
    sources: { total: 2, available: 2 },
    findings: 1,
    quotes: null,
    tests: null,
    review: {
      recorded: true,
      by: "0x1234567890abcdef1234567890abcdef12345678",
      at: "2026-10-22T05:20:45.818Z",
    },
  });

  assert.equal((markup.match(/class="plink/g) ?? []).length, 3, "each AI stage should have an incoming connector, including Research from Sources");
  assert.match(markup, /class="plink pipe-entry s-completed"/);
  assert.match(markup, /role="group" aria-label="Human review, separate from AI stages"/);
  assert.match(markup, /Human Review/);
  assert.match(markup, /personal assessment/);
  assert.match(markup, /0x123456…345678/);
  assert.match(markup, /title="0x1234567890abcdef1234567890abcdef12345678"/);
  assert.match(markup, /<span class="sr">Reviewer wallet 0x1234567890abcdef1234567890abcdef12345678<\/span>/);
  assert.match(markup, /class="pipe-track om has-recorded-review"/);
});

test("unrecorded Human Review stays distinct from completed agent work", () => {
  const markup = renderOrbit({
    example: false,
    runState: "completed",
    stages: stages.map((stage) => ({ ...stage, status: "completed", errorCode: undefined })),
    sources: { total: 1, available: 1 },
    findings: 0,
    quotes: null,
    tests: null,
    review: { recorded: false },
  });

  assert.match(markup, /role="group" aria-label="Human review, separate from AI stages"/);
  assert.match(markup, /Not recorded\. A finished run is not a review\./);
  assert.match(markup, /Not a fourth AI stage, independent security audit, or certification\./);
});

test("stage transitions are CSS-smoothed and all transition motion is disabled for reduced motion", () => {
  const css = readFileSync("src/styles/workspace.css", "utf8");
  assert.match(css, /\.om-line\s*\{[^}]*transition:\s*stroke/);
  assert.match(css, /\.pn\s*\{[^}]*transition:\s*color/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.om-line[\s\S]*?transition:\s*none/);
  assert.match(css, /\.om\.has-recorded-review\s*\{[^}]*margin-bottom:/);
  assert.ok(css.includes(".om-dock {\n  width: clamp(132px, 18cqw, 210px);"));
  assert.match(css, /@container pipe \(max-width: 679px\)/);
});
