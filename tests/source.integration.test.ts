import assert from "node:assert/strict";
import { test } from "node:test";
import { createQueuedRun } from "@/features/security/model";
import { processResearchRun } from "@/features/security/orchestrator";
import type { ModelProvider, StructuredModelRequest } from "@/features/security/provider";
import {
  analysisAgentOutputSchema,
  researchAgentOutputSchema,
  verificationAgentOutputSchema,
} from "@/features/security/schemas";
import { fetchApprovedSource } from "@/features/security/sources";
import { approvedSources } from "@/features/security/topics";

const enabled = process.env.QEVRA_SOURCE_INTEGRATION === "1";

test("fetches the approved NIST FIPS 204 source and records provenance", { skip: !enabled }, async () => {
  const source = await fetchApprovedSource(approvedSources["nist-fips-204"]!);
  assert.equal(source.status, "available", `approved public source unavailable: ${source.errorCode ?? source.httpStatus ?? "unknown"}`);
  assert.equal(source.url, "https://csrc.nist.gov/pubs/fips/204/final");
  assert.ok(source.retrievedAt && Number.isFinite(Date.parse(source.retrievedAt)));
  assert.match(source.sha256 ?? "", /^[a-f0-9]{64}$/);
  assert.ok(source.text?.toLowerCase().includes("ml-dsa") || source.text?.toLowerCase().includes("digital signature"));

  const quote = "This standard specifies ML-DSA, a set of algorithms that can be used to generate and verify digital signatures.";
  assert.ok(source.text?.includes(quote), "the NIST quotation must exactly match the fetched page text");
  const provider: ModelProvider = {
    name: "mock-live-source-verification",
    async completeJson<T>(request: StructuredModelRequest<T>) {
      assert.match(request.systemPrompt, /untrusted data/i);
      assert.match(request.systemPrompt, /never (follow instructions|as instructions)/i);
      const output = request.agent === "research"
        ? researchAgentOutputSchema.parse({
            summary: "The fetched NIST page defines the subject of FIPS 204.",
            claims: [{ id: "nist-scope", claim: "FIPS 204 specifies ML-DSA for digital signatures.", evidence: [{ sourceId: source.id, quote }] }],
            scopeLimitations: ["This mock agent only used one fetched NIST page."],
          })
        : request.agent === "analysis"
          ? analysisAgentOutputSchema.parse({ summary: "The claim is bounded to the cited page.", assumptions: [], risks: [], unknowns: [], recommendations: [] })
          : verificationAgentOutputSchema.parse({
              summary: "The source quote matches the fetched text.",
              claimChecks: [{ claimId: "nist-scope", assessment: "supported", evidence: [{ sourceId: source.id, quote }], rationale: "Exact substring match in the fetched source text." }],
              testArtifactChecks: [],
              limitations: ["Mock agents are not live AI verification."],
            });
      return { output: output as T };
    },
  };
  const run = createQueuedRun("55555555-5555-4555-8555-555555555555", "security-evidence", "Live source evidence check");
  await processResearchRun(run, {
    provider,
    fetchSources: async () => [source],
    runExperiment: async (id) => ({ id, name: id, status: "blocked", command: "fixed", limitations: [] }),
    persist: async () => undefined,
  });
  assert.equal(run.status, "completed");
  assert.equal(run.findings[0]?.evidenceStatus, "quote_matched");
  assert.equal(run.sources[0]?.sha256, source.sha256);
});
