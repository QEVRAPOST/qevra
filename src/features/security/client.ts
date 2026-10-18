"use client";

import type {
  ResearchRunDetail,
  ResearchRunSummary,
  SecurityResearchCapabilities,
} from "@/types/integrations";
import { createResearchRunRequestSchema, runIdSchema, runListQuerySchema } from "./schemas";
import type { z } from "zod";

export type CreateResearchRunInput = z.input<typeof createResearchRunRequestSchema>;

export class SecurityApiClientError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "SecurityApiClientError";
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json", ...init?.headers },
  });
  const body = await response.json() as unknown;
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body ? (body as { error?: { code?: string; message?: string } }).error : undefined;
    throw new SecurityApiClientError(response.status, error?.code ?? "request_failed", error?.message ?? "The security service request failed.");
  }
  return body as T;
}

export async function loginToSecurityService(accessToken: string): Promise<{ authenticated: true; expiresAt: string }> {
  return requestJson("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: accessToken }),
  });
}

export async function logoutFromSecurityService(): Promise<void> {
  await requestJson("/api/auth/session", { method: "DELETE" });
}

export async function getSecurityCapabilities(): Promise<SecurityResearchCapabilities> {
  return requestJson("/api/security/capabilities");
}

export async function listSecurityRuns(input: { cursor?: string; limit?: number } = {}): Promise<{
  runs: ResearchRunSummary[];
  nextCursor?: string;
}> {
  const query = runListQuerySchema.parse(input);
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) params.set("cursor", query.cursor);
  return requestJson(`/api/security/runs?${params.toString()}`);
}

export async function getSecurityRun(id: string): Promise<ResearchRunDetail> {
  const runId = runIdSchema.parse(id);
  const response = await requestJson<{ run: ResearchRunDetail }>(`/api/security/runs/${encodeURIComponent(runId)}`);
  return response.run;
}

export async function createSecurityRun(input: CreateResearchRunInput): Promise<ResearchRunSummary> {
  const parsed = createResearchRunRequestSchema.parse(input);
  const response = await requestJson<{ run: ResearchRunSummary }>("/api/security/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed),
  });
  return response.run;
}
