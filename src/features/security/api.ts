import "server-only";

import { hashRateLimitKey, readCookie, verifySessionCookie } from "./auth";
import { getResearchStore, StoreNotConfiguredError } from "./store";
import { getProjectName } from "@/lib/project-brand";

export function apiError(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

export async function requireResearchAccess(request: Request, limit = 60, windowMs = 60_000, bucket = "general") {
  const sessionKey = verifySessionCookie(readCookie(request, "qevra_session"));
  if (!sessionKey) {
    return { response: apiError(401, "authentication_required", `A valid ${getProjectName()} session is required.`) } as const;
  }

  try {
    const store = getResearchStore();
    const rate = await store.takeRateLimit(hashRateLimitKey(`${bucket}:${sessionKey}`), limit, windowMs);
    if (!rate.allowed) {
      return {
        response: apiError(429, "rate_limit_exceeded", "Too many requests. Try again later.", {
          "retry-after": String(Math.ceil(windowMs / 1_000)),
        }),
      } as const;
    }
    return { store, sessionKey } as const;
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    const message = error instanceof StoreNotConfiguredError
      ? "Security research persistence is not configured."
      : "Security research persistence is currently unavailable.";
    return { response: apiError(503, code, message) } as const;
  }
}
