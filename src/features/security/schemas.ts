import { z } from "zod";

export const researchTopicIdSchema = z.enum([
  "mldsa-key-registration",
  "robinhood-readonly-wallet",
  "security-evidence",
]);

export const researchQuestionSchema = z
  .string()
  .trim()
  .min(12)
  .max(500)
  .refine((value) => !/https?:\/\//i.test(value), "Provide a research question, not a URL.")
  .refine((value) => !/0x[a-f0-9]{64}\b/i.test(value), "Do not submit keys or secret material.")
  .refine((value) => !/-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(value), "Do not submit keys or secret material.");

export const approvedTestIdSchema = z.enum(["phase0-ml-dsa-local"]);

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/i);
const sourceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export const researchAgentOutputSchema = z
  .object({
    summary: boundedText(2_000),
    claims: z
      .array(
        z.object({
          id: idSchema,
          claim: boundedText(600),
          evidence: z
            .array(
              z.object({
                sourceId: sourceIdSchema,
                quote: boundedText(800),
              }).strict(),
            )
            .min(1)
            .max(2),
        }).strict(),
      )
      .max(2),
    scopeLimitations: z.array(boundedText(500)).max(8),
  })
  .strict();

export const analysisAgentOutputSchema = z
  .object({
    summary: boundedText(2_000),
    assumptions: z.array(boundedText(500)).max(8),
    risks: z
      .array(
        z.object({
          id: idSchema,
          title: boundedText(180),
          severity: z.enum(["critical", "high", "medium", "low", "unknown"]),
          analysis: boundedText(900),
          sourceIds: z.array(sourceIdSchema).max(5),
        }).strict(),
      )
      .max(10),
    unknowns: z.array(boundedText(500)).max(10),
    recommendations: z.array(boundedText(500)).max(8),
  })
  .strict();

export const verificationAgentOutputSchema = z
  .object({
    summary: boundedText(1_500),
    claimChecks: z
      .array(
        z.object({
          claimId: idSchema,
          assessment: z.enum(["supported", "contradicted", "unclear"]),
          evidence: z
            .array(
              z.object({
                sourceId: sourceIdSchema,
                quote: boundedText(800),
              }).strict(),
            )
            .max(4),
          rationale: boundedText(700),
        }).strict(),
      )
      .max(20),
    testArtifactChecks: z
      .array(
        z.object({
          artifactId: idSchema,
          assessment: z.enum(["supports", "contradicts", "inconclusive"]),
          rationale: boundedText(700),
        }).strict(),
      )
      .max(10),
    limitations: z.array(boundedText(500)).max(10),
  })
  .strict();

export type ResearchAgentOutput = z.infer<typeof researchAgentOutputSchema>;
export type AnalysisAgentOutput = z.infer<typeof analysisAgentOutputSchema>;
export type VerificationAgentOutput = z.infer<typeof verificationAgentOutputSchema>;

export const createResearchRunRequestSchema = z
  .object({
    topicId: researchTopicIdSchema,
    question: researchQuestionSchema.optional(),
    testIds: z.array(approvedTestIdSchema).max(1).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.testIds.length > 0 && value.topicId !== "mldsa-key-registration") {
      context.addIssue({ code: "custom", path: ["testIds"], message: "The approved ML-DSA experiment only applies to ML-DSA research." });
    }
  });

export const runListQuerySchema = z.object({
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const runIdSchema = z.string().uuid();

export const sessionRequestSchema = z
  .object({ token: z.string().min(32).max(512) })
  .strict();
