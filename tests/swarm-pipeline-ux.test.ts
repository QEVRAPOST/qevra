import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

function renderOrbit(model: unknown): string {
  return execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { OrbitCanvas } from "./src/components/dashboard/OrbitCanvas.tsx"; const model = ${JSON.stringify(model)}; process.stdout.write(renderToStaticMarkup(createElement(OrbitCanvas, { model })))`,
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
  assert.match(markup, /<code>analysis_error<\/code>/);
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
});
