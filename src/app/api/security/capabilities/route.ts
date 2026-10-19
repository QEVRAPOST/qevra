import { apiError } from "@/features/security/api";
import { hashRateLimitKey, hasSessionConfiguration, readCookie, verifySessionCookie } from "@/features/security/auth";
import { isExperimentSandboxConfigured } from "@/features/security/approved-experiment";
import { getModelProvider } from "@/features/security/provider";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import { approvedSources } from "@/features/security/topics";
import { getProjectName } from "@/lib/project-brand";
import type { SecurityResearchCapabilities } from "@/types/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionKey = verifySessionCookie(readCookie(request, "qevra_session"));
  if (!sessionKey) {
    return apiError(401, "authentication_required", `A valid ${getProjectName()} session is required.`);
  }

  const provider = getModelProvider();
  const capabilities: SecurityResearchCapabilities = {
    provider: provider.status === "available" ? "available" : "not_configured",
    ...(provider.status === "available" ? { providerName: provider.model } : { unavailableReason: provider.reason }),
    authentication: hasSessionConfiguration() ? "available" : "not_configured",
    persistence: process.env.DATABASE_URL ? "available" : "not_configured",
    worker: "unavailable",
    deterministicExperiments: isExperimentSandboxConfigured() ? "available" : "not_configured",
    sourceCount: Object.keys(approvedSources).length,
  };

  try {
    const store = getResearchStore();
    const rate = await store.takeRateLimit(hashRateLimitKey(`capabilities:${sessionKey}`), 60, 60_000);
    if (!rate.allowed) return apiError(429, "rate_limit_exceeded", "Too many requests. Try again later.", { "retry-after": "60" });
    const workerCount = await store.countLiveWorkers();
    capabilities.worker = workerCount > 0 ? "available" : "unavailable";
    if (workerCount === 0 && !capabilities.unavailableReason) capabilities.unavailableReason = "security_worker_not_running";
  } catch (error) {
    capabilities.persistence = error instanceof StoreNotConfiguredError ? "not_configured" : "unavailable";
    capabilities.worker = "unavailable";
    if (!capabilities.unavailableReason) {
      capabilities.unavailableReason = error instanceof StoreNotConfiguredError ? "database_url_missing" : "database_unavailable";
    }
  }

  return Response.json(capabilities, { headers: { "cache-control": "no-store" } });
}
