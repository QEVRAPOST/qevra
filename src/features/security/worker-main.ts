import { randomUUID } from "node:crypto";
import { hashRateLimitKey } from "./auth";
import { addRunEvent, type ResearchRunRecord } from "./model";
import { runApprovedExperiment } from "./approved-experiment";
import { processResearchRun } from "./orchestrator";
import { getModelProvider, ModelProviderError, type ModelProvider } from "./provider";
import { fetchApprovedSources } from "./sources";
import { getResearchStore } from "./store";
import { isGroqGptOssProfile, resolveMaxConcurrentRuns } from "./groq-profile";

const workerId = randomUUID();
const pollMs = boundedInteger(process.env.QEVRA_WORKER_POLL_MS, 1_000, 250, 10_000);
const maxConcurrentRuns = resolveMaxConcurrentRuns(process.env);
let stopping = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const store = getResearchStore();
  const groqGptOssProfile = isGroqGptOssProfile(process.env.QEVRA_AI_MODEL, process.env.QEVRA_AI_BASE_URL);
  const providerConfig = getModelProvider(process.env, groqGptOssProfile ? {
    beforeRequest: async () => {
      const callSlot = await store.takeRateLimit(hashRateLimitKey("qevra:groq-free-call-window"), 1, 61_000);
      if (!callSlot.allowed) {
        throw new ModelProviderError("provider_rate_limited", "A shared Groq Free Plan call slot is unavailable; this run will not retry.");
      }
    },
  } : {});
  let databaseUnavailable = false;
  await store.heartbeatWorker(workerId);
  const workerHeartbeat = setInterval(() => {
    void store.heartbeatWorker(workerId).catch(() => undefined);
  }, 25_000);
  workerHeartbeat.unref();
  if (providerConfig.status === "not_configured") {
    console.warn("[qevra-security-worker] model provider is not configured; queued runs will be marked unavailable.");
  }

  try {
    while (!stopping) {
      let run: ResearchRunRecord | undefined;
      try {
        run = await store.claimNextRun(workerId, maxConcurrentRuns);
      } catch {
        if (!databaseUnavailable) console.warn("[qevra-security-worker] database unavailable; polling will retry.");
        databaseUnavailable = true;
        await wait(pollMs);
        continue;
      }
      if (databaseUnavailable) {
        console.info("[qevra-security-worker] database connection restored; polling resumed.");
        databaseUnavailable = false;
      }
      if (!run) {
        await wait(pollMs);
        continue;
      }

      const heartbeat = setInterval(() => {
        void store.extendLease(run.id, workerId).catch(() => undefined);
      }, 25_000);
      heartbeat.unref();
      try {
        if (providerConfig.status === "not_configured") {
          const now = new Date().toISOString();
          run.status = "failed";
          run.currentStage = "failed";
          run.errorCode = providerConfig.reason;
          run.errorMessage = "No model provider is configured. Contact the service operator.";
          run.completedAt = now;
          for (const agent of run.agents) {
            agent.status = "blocked";
            agent.completedAt = now;
            agent.errorCode = "provider_not_configured";
          }
          for (const test of run.tests) {
            if (test.status === "queued" || test.status === "running") {
              test.status = "blocked";
              test.completedAt = now;
              test.limitations.push("The research workflow did not run because the model provider is not configured.");
            }
          }
          addRunEvent(run, "failed", "Run stopped because no model provider is configured.");
          await store.saveRun(run);
          continue;
        }

        const provider: ModelProvider = {
          name: providerConfig.provider.name,
          async completeJson(request, signal) {
            const budget = await store.takeRateLimit(hashRateLimitKey("qevra:model-calls-global"), 60, 60 * 60_000);
            if (!budget.allowed) {
              throw new ModelProviderError("provider_budget_exhausted", "The hourly global model-call budget has been reached.");
            }
            return providerConfig.provider.completeJson(request, signal);
          },
        };

        await processResearchRun(run, {
          provider,
          fetchSources: fetchApprovedSources,
          runExperiment: runApprovedExperiment,
          persist: (current) => store.saveRun(current),
          maxSourceTextChars: providerConfig.profile.maxModelSourceChars,
        });
      } catch (error) {
        console.error("[qevra-security-worker] run processing failed", error instanceof Error ? error.name : "unknown_error");
      } finally {
        clearInterval(heartbeat);
        await store.releaseLease(run.id, workerId).catch(() => undefined);
      }
    }
  } finally {
    clearInterval(workerHeartbeat);
    await store.stopWorker(workerId).catch(() => undefined);
    await store.close();
  }
}

void main().catch((error: unknown) => {
  console.error("[qevra-security-worker] startup failed", error instanceof Error ? error.name : "unknown_error");
  process.exitCode = 1;
});
