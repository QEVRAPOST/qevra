import "server-only";

import { hashRateLimitKey, readCookie, verifySessionCookie } from "./auth";
import { USER_SESSION_COOKIE, verifyUserSessionCookie } from "./wallet-auth";
import { getResearchStore, StoreNotConfiguredError } from "./store";
import { resolveResearchRateLimit } from "./rate-limit-policy";
import { getProjectName } from "@/lib/project-brand";

export function apiError(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

export async function requireResearchAccess(
  request: Request,
  limit = 60,
  windowMs = 60_000,
  bucket = "general",
  options: { deferWalletRateLimit?: boolean } = {},
) {
  const operatorSession = verifySessionCookie(readCookie(request, "qevra_session"));
  const userSession = verifyUserSessionCookie(readCookie(request, USER_SESSION_COOKIE));
  const role = operatorSession ? "operator" as const : userSession ? "user" as const : undefined;
  if (!role) {
    return { response: apiError(401, "authentication_required", `A valid ${getProjectName()} session is required.`) } as const;
  }
  const sessionKey = operatorSession ?? userSession?.sessionKey;
  if (!sessionKey) return { response: apiError(401, "authentication_required", `A valid ${getProjectName()} session is required.`) } as const;
  const principalKey = role === "user" ? userSession?.address.toLowerCase() ?? sessionKey : sessionKey;
  const effectiveLimit = resolveResearchRateLimit(role, bucket, limit);

  try {
    const store = getResearchStore();
    if (!options.deferWalletRateLimit || role === "operator") {
      const rate = await store.takeRateLimit(hashRateLimitKey(`${bucket}:${principalKey}`), effectiveLimit, windowMs);
      if (!rate.allowed) {
        return {
          response: apiError(429, "rate_limit_exceeded", role === "user" && bucket === "create-run"
            ? "Only one research run per wallet may be created in a 60-minute window."
            : "Too many requests. Try again later.", {
            "retry-after": String(Math.ceil(windowMs / 1_000)),
          }),
        } as const;
      }
    }
    return {
      store,
      sessionKey,
      role,
      ...(userSession ? { ownerId: userSession.address.toLowerCase() } : {}),
    } as const;
  } catch (error) {
    const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
    const message = error instanceof StoreNotConfiguredError
      ? "Security research persistence is not configured."
      : "Security research persistence is currently unavailable.";
    return { response: apiError(503, code, message) } as const;
  }
}
