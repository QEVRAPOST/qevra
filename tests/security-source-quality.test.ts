import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createQueuedRun, type StoredSource } from "@/features/security/model";
import { processResearchRun } from "@/features/security/orchestrator";
import { OpenAICompatibleProvider, type ModelProvider, type StructuredModelRequest } from "@/features/security/provider";
import { fetchApprovedSource, selectSourceExcerpt } from "@/features/security/sources";
import { approvedSources, resolveResearchTopic } from "@/features/security/topics";

const sourceDefinition = approvedSources["nist-fips-204"]!;
const longEvidenceQuote = "FIPS 204 specifies ML-DSA as a set of algorithms that generate and verify digital signatures.";

function robinhoodExcerptFixture() {
  const topic = resolveResearchTopic("robinhood-readonly-wallet");
  const chainIdEvidence = "Network Configuration Property Robinhood Chain Robinhood Chain Testnet Chain ID 4663 46630";
  const jsonRpcEvidence = "Node API Access standard JSON-RPC and Websocket endpoints for reading and writing to Robinhood Chain.";
  const lowerRankedContext = "Robinhood Chain public network details are documented for wallet integrations.";
  const fullText = [
    "Connecting to Robinhood Chain",
    ...Array(35).fill(lowerRankedContext),
    chainIdEvidence,
    jsonRpcEvidence,
  ].join("\n");
  const excerpt = selectSourceExcerpt(fullText, `${topic.label} ${topic.question} ${topic.sources[0]!.title}`, 1_200);
  return { fullText, excerpt, chainIdEvidence, jsonRpcEvidence };
}

test("Robinhood excerpts prioritize chain ID and JSON-RPC evidence within the source limit", () => {
  const { fullText, excerpt } = robinhoodExcerptFixture();
  assert.ok(fullText.length > 1_200);
  assert.ok(excerpt.length <= 1_200);
  assert.ok(excerpt.includes("46630"), "the Testnet chain ID passage should rank in the model excerpt");
  assert.ok(excerpt.includes("JSON-RPC"), "the JSON-RPC passage should remain in the model excerpt");
});

test("every Robinhood excerpt passage remains an exact substring of the approved source", () => {
  const { fullText, excerpt, chainIdEvidence, jsonRpcEvidence } = robinhoodExcerptFixture();
  assert.ok(fullText.includes(chainIdEvidence));
  assert.ok(fullText.includes(jsonRpcEvidence));
  assert.ok(excerpt.split("\n").filter(Boolean).every((passage) => fullText.includes(passage)));
});

test("approved-source retrieval follows bounded same-host redirects and removes page chrome", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; redirect?: RequestRedirect }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, redirect: init?.redirect as RequestRedirect | undefined });
    if (calls.length === 1) return new Response(null, { status: 302, headers: { location: "/pubs/fips/204/final" } });
    return new Response(
      `<html><body><nav>MENU_ONLY_NAVIGATION ${"menu item ".repeat(30)}</nav><main><h1>FIPS 204</h1><p>${longEvidenceQuote}</p><p>Applications can use the standard for digital signatures.</p></main><footer>MENU_ONLY_FOOTER</footer></body></html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  };
  try {
    const result = await fetchApprovedSource(sourceDefinition);
    assert.equal(result.status, "available");
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.redirect === "manual"));
    assert.ok(result.text?.includes(longEvidenceQuote));
    assert.doesNotMatch(result.text ?? "", /MENU_ONLY_NAVIGATION|MENU_ONLY_FOOTER/);
    assert.equal(result.url, sourceDefinition.url);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("approved-source retrieval retries one transient server failure but rejects cross-host redirects", async () => {
  const originalFetch = globalThis.fetch;
  let transientCalls = 0;
  globalThis.fetch = async () => {
    transientCalls += 1;
    if (transientCalls === 1) return new Response("temporarily unavailable", { status: 503 });
    return new Response(`${longEvidenceQuote} ${"More approved standards context. ".repeat(4)}`, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  };
  try {
    const retried = await fetchApprovedSource(sourceDefinition);
    assert.equal(retried.status, "available");
    assert.equal(transientCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }

  let redirectCalls = 0;
  globalThis.fetch = async () => {
    redirectCalls += 1;
    return new Response(null, { status: 302, headers: { location: "https://attacker.example/collect" } });
  };
  try {
    const rejected = await fetchApprovedSource(sourceDefinition);
    assert.equal(rejected.status, "unavailable");
    assert.equal(rejected.errorCode, "source_redirect_not_allowlisted");
    assert.equal(redirectCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  let loopingRedirectCalls = 0;
  globalThis.fetch = async () => {
    loopingRedirectCalls += 1;
    return new Response(null, { status: 302, headers: { location: `/redirect-${loopingRedirectCalls}` } });
  };
  try {
    const limited = await fetchApprovedSource(sourceDefinition);
    assert.equal(limited.status, "unavailable");
    assert.equal(limited.errorCode, "source_redirect_limit");
    assert.equal(loopingRedirectCalls, 4, "three redirects are followed and the next redirect is rejected");
  } finally {
    globalThis.fetch = originalFetch;
  }

  let permanentFailureCalls = 0;
  globalThis.fetch = async () => {
    permanentFailureCalls += 1;
    return new Response("not found", { status: 404 });
  };
  try {
    const notFound = await fetchApprovedSource(sourceDefinition);
    assert.equal(notFound.status, "unavailable");
    assert.equal(notFound.errorCode, "source_http_error");
    assert.equal(notFound.httpStatus, 404);
    assert.equal(permanentFailureCalls, 1, "permanent 4xx source failures are not retried");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Research selects relevant evidence beyond the page prefix and downstream stages preserve source-to-claim provenance", async () => {
  const unrelatedPrefix = `${"This page lists general publication and organization information.\n".repeat(45)}`;
  const unrelatedStoredPassage = "The page lists a mailing address and office phone number.";
  const fullText = `${unrelatedPrefix}${longEvidenceQuote}\n${unrelatedStoredPassage}`;
  assert.ok(fullText.indexOf(longEvidenceQuote) > 1_200);
  const storedSource: StoredSource = {
    ...sourceDefinition,
    retrievedAt: "2026-10-22T00:00:00.000Z",
    status: "available",
    text: fullText,
    excerpt: fullText.slice(0, 1_200),
    sha256: createHash("sha256").update(fullText).digest("hex"),
  };
  const acceptedClaim = {
    id: "mldsa-signature-scope",
    claim: "FIPS 204 defines ML-DSA algorithms for digital signatures.",
    evidence: [{ sourceId: storedSource.id, quote: longEvidenceQuote }],
  };
  const outputs = {
    research: {
      summary: "FIPS 204 describes ML-DSA signature algorithms.",
      claims: [
        acceptedClaim,
        {
          id: "unseen-passage",
          claim: "The source proves unrelated implementation behavior.",
          evidence: [{ sourceId: storedSource.id, quote: unrelatedStoredPassage }],
        },
      ],
      scopeLimitations: ["Only supplied approved source passages were reviewed."],
    },
    analysis: {
      summary: "Analysis is limited to the accepted standards claim.",
      assumptions: [],
      risks: [],
      unknowns: ["Application implementation behavior is not established by this source."],
      recommendations: [],
    },
    verification: {
      summary: "The exact standards quotation is present in the supplied source passage.",
      claimChecks: [{
        claimId: acceptedClaim.id,
        assessment: "supported" as const,
        evidence: acceptedClaim.evidence,
        rationale: "The exact quotation supports the bounded standards statement.",
      }],
      testArtifactChecks: [],
      limitations: ["This check is not an independent application audit."],
    },
  };
  const seenRequests: Array<{ agent: string; input: unknown }> = [];
  const provider: ModelProvider = {
    name: "offline-source-quality-fixture",
    async completeJson<T>(request: StructuredModelRequest<T>) {
      seenRequests.push({ agent: request.agent, input: request.input });
      return { output: outputs[request.agent] as T };
    },
  };
  const run = createQueuedRun("99999991-9999-4999-8999-999999999991", "mldsa-key-registration", "FIPS 204 ML-DSA signature evidence");
  await processResearchRun(run, {
    provider,
    fetchSources: async () => [storedSource],
    runExperiment: async (id) => ({ id, name: id, status: "blocked", command: "fixed", limitations: [] }),
    persist: async () => undefined,
    maxSourceTextChars: 1_200,
  });

  assert.equal(run.status, "completed");
  assert.deepEqual(seenRequests.map((entry) => entry.agent), ["research", "analysis", "verification"]);
  const researchInput = seenRequests[0]?.input as { sources: Array<{ text: string; textIsExcerpt?: boolean }> };
  assert.ok(researchInput.sources[0]?.text.includes(longEvidenceQuote));
  assert.equal(researchInput.sources[0]?.text.includes(unrelatedStoredPassage), false);
  assert.ok(researchInput.sources[0]?.text.length <= 1_200);
  const analysisInput = seenRequests[1]?.input as {
    researchClaims: Array<{ id: string }>;
    approvedSources: Array<{ id: string; text: string }>;
  };
  assert.deepEqual(analysisInput.researchClaims.map((claim) => claim.id), [acceptedClaim.id]);
  assert.ok(analysisInput.approvedSources[0]?.text.includes(longEvidenceQuote));
  assert.equal(analysisInput.approvedSources[0]?.text.includes(unrelatedStoredPassage), false);
  const verificationInput = seenRequests[2]?.input as { approvedSources: Array<{ text: string; textIsExcerpt?: boolean }> };
  assert.ok(verificationInput.approvedSources[0]?.text.includes(longEvidenceQuote));
  assert.ok(verificationInput.approvedSources[0]?.text.length <= 1_200);
  assert.equal(run.sources[0]?.text, fullText, "the full fetched source remains persisted");
  assert.deepEqual(run.research?.claims.map((claim) => claim.id), [acceptedClaim.id]);
  assert.equal(run.findings[0]?.evidenceStatus, "quote_matched");
  assert.equal(run.findings[0]?.evidence[0]?.exactQuoteMatched, true);
});

test("a legitimate empty result stays empty, and malformed provider output fails without invented claims", async () => {
  const emptySourceText = `${longEvidenceQuote} ${"Approved standards context. ".repeat(5)}`;
  const storedSource: StoredSource = {
    ...sourceDefinition,
    retrievedAt: new Date().toISOString(),
    status: "available",
    text: emptySourceText,
    sha256: createHash("sha256").update(emptySourceText).digest("hex"),
  };
  const emptyProvider: ModelProvider = {
    name: "offline-empty-result-fixture",
    async completeJson<T>(request: StructuredModelRequest<T>) {
      const output = request.agent === "research"
        ? { summary: "The available source does not support a claim for this question.", claims: [], scopeLimitations: ["No substantiated claim was extracted."] }
        : request.agent === "analysis"
          ? { summary: "There are no Research claims to evaluate.", assumptions: [], risks: [], unknowns: ["The question remains unresolved by the source."], recommendations: [] }
          : { summary: "There are no Research claims to verify.", claimChecks: [], testArtifactChecks: [], limitations: [] };
      return { output: output as T };
    },
  };
  const emptyRun = createQueuedRun("99999992-9999-4999-8999-999999999992", "mldsa-key-registration", "A question with no supported answer");
  await processResearchRun(emptyRun, {
    provider: emptyProvider,
    fetchSources: async () => [storedSource],
    runExperiment: async (id) => ({ id, name: id, status: "blocked", command: "fixed", limitations: [] }),
    persist: async () => undefined,
    maxSourceTextChars: 1_200,
  });
  assert.equal(emptyRun.status, "completed");
  assert.deepEqual(emptyRun.research?.claims, []);
  assert.deepEqual(emptyRun.findings, []);
  assert.deepEqual(emptyRun.verification?.claimChecks, []);

  let providerCalls = 0;
  const malformedProvider = new OpenAICompatibleProvider({
    apiKey: "offline-fixture-key",
    model: "fixture-model",
    baseUrl: "https://api.example.test/v1",
    maxOutputTokens: 128,
    timeoutMs: 1_000,
    fetchImpl: async () => {
      providerCalls += 1;
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ summary: 42, claims: [], scopeLimitations: [] }) } }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      });
    },
  });
  const malformedRun = createQueuedRun("99999993-9999-4999-8999-999999999993", "mldsa-key-registration", "Malformed structured output check");
  await processResearchRun(malformedRun, {
    provider: malformedProvider,
    fetchSources: async () => [storedSource],
    runExperiment: async (id) => ({ id, name: id, status: "blocked", command: "fixed", limitations: [] }),
    persist: async () => undefined,
    maxSourceTextChars: 1_200,
  });
  assert.equal(providerCalls, 1);
  assert.equal(malformedRun.status, "failed");
  assert.equal(malformedRun.errorCode, "provider_output_invalid");
  assert.equal(malformedRun.research, undefined);
  assert.deepEqual(malformedRun.findings, []);
  assert.ok(malformedRun.agents.filter((agent) => agent.role !== "research").every((agent) => agent.status === "blocked"));
});
