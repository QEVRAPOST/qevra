"use client";

import type {
  ResearchRunDetail,
  ResearchRunSummary,
  SecurityResearchCapabilities,
} from "@/types/integrations";
import type { NetworkId } from "@/types/network";
import { isAddress } from "viem";
import type { ReadOnlyEip1193Provider } from "@/features/wallet/read-only";
import { createResearchRunRequestSchema, runIdSchema, runListQuerySchema } from "./schemas";
import type { z } from "zod";

export type CreateResearchRunInput = z.input<typeof createResearchRunRequestSchema>;

export interface SecuritySessionStatus {
  configured: boolean;
  authenticated: boolean;
}

export interface WalletSessionStatus extends SecuritySessionStatus {
  address?: `0x${string}`;
  expiresAt?: string;
}

export interface WalletAuthChallenge {
  nonce: string;
  message: string;
  expiresAt: string;
}

export class SecurityApiClientError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryAfterMs?: number) {
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
    const retryAfterSeconds = response.headers.get("retry-after");
    const retryAfter = retryAfterSeconds && /^\d+$/.test(retryAfterSeconds) ? Number(retryAfterSeconds) : undefined;
    const retryAfterMs = retryAfter !== undefined && Number.isSafeInteger(retryAfter) && retryAfter <= 86_400
      ? retryAfter * 1_000
      : undefined;
    throw new SecurityApiClientError(
      response.status,
      error?.code ?? "request_failed",
      error?.message ?? "The security service request failed.",
      retryAfterMs,
    );
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

export async function getSecuritySessionStatus(): Promise<SecuritySessionStatus> {
  return requestJson("/api/auth/session");
}

function isWalletAuthChallenge(value: unknown): value is WalletAuthChallenge {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WalletAuthChallenge>;
  return typeof candidate.nonce === "string" && /^[a-f0-9]{32}$/i.test(candidate.nonce)
    && typeof candidate.message === "string" && candidate.message.length > 0 && candidate.message.length <= 2_048
    && typeof candidate.expiresAt === "string" && Number.isFinite(Date.parse(candidate.expiresAt));
}

function isWalletSessionStatus(value: unknown): value is WalletSessionStatus {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WalletSessionStatus>;
  if (typeof candidate.configured !== "boolean" || typeof candidate.authenticated !== "boolean") return false;
  if (candidate.address !== undefined && (typeof candidate.address !== "string" || !isAddress(candidate.address))) return false;
  if (candidate.expiresAt !== undefined && (typeof candidate.expiresAt !== "string" || !Number.isFinite(Date.parse(candidate.expiresAt)))) return false;
  return !candidate.authenticated || (typeof candidate.address === "string" && isAddress(candidate.address) && typeof candidate.expiresAt === "string");
}

function invalidWalletAuthResponse(): SecurityApiClientError {
  return new SecurityApiClientError(502, "invalid_wallet_auth_response", "The wallet sign-in service returned an invalid response.");
}

const INTEGRATION_AVAILABILITY = new Set(["available", "unavailable", "not_configured", "unsupported"]);

function isSecurityResearchCapabilities(value: unknown): value is SecurityResearchCapabilities {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SecurityResearchCapabilities>;
  const requiredStatuses = [candidate.provider, candidate.authentication, candidate.billing, candidate.persistence,
    candidate.worker, candidate.deterministicExperiments];
  return requiredStatuses.every((status) => typeof status === "string" && INTEGRATION_AVAILABILITY.has(status))
    && Number.isSafeInteger(candidate.sourceCount) && (candidate.sourceCount ?? -1) >= 0
    && (candidate.providerName === undefined || (typeof candidate.providerName === "string" && candidate.providerName.length <= 160))
    && (candidate.providerVendor === undefined || (typeof candidate.providerVendor === "string" && candidate.providerVendor.length <= 80))
    && (candidate.providerModel === undefined || (typeof candidate.providerModel === "string" && candidate.providerModel.length <= 160))
    && (candidate.unavailableReason === undefined || (typeof candidate.unavailableReason === "string" && candidate.unavailableReason.length <= 160))
    && (candidate.runCreation === undefined || (() => {
      const admission = candidate.runCreation;
      if (!admission || typeof admission !== "object" || typeof admission.allowed !== "boolean"
        || !["owner_only", "public_limited", "not_configured", "invalid"].includes(admission.accessMode)) return false;
      if (admission.blocker !== undefined && typeof admission.blocker !== "string") return false;
      for (const record of [admission.limits, admission.usage]) {
        if (record !== undefined && (!record || typeof record !== "object"
          || Object.values(record).some((number) => !Number.isSafeInteger(number) || number < 0))) return false;
      }
      return true;
    })());
}

export async function getWalletSessionStatus(): Promise<WalletSessionStatus> {
  const response = await requestJson<unknown>("/api/auth/user/session");
  if (!isWalletSessionStatus(response)) throw invalidWalletAuthResponse();
  return response;
}

export async function requestWalletAuthChallenge(input: { networkId: NetworkId; address: string }): Promise<WalletAuthChallenge> {
  if ((input.networkId !== "testnet" && input.networkId !== "mainnet") || !isAddress(input.address)) {
    throw new SecurityApiClientError(400, "invalid_wallet_challenge", "Connect a valid wallet account on a supported Robinhood network.");
  }
  const response = await requestJson<unknown>("/api/auth/user/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!isWalletAuthChallenge(response)) throw invalidWalletAuthResponse();
  return response;
}

export async function completeWalletAuthChallenge(input: { address: string; nonce: string; signature: string }): Promise<WalletSessionStatus> {
  if (!isAddress(input.address) || !/^[a-f0-9]{32}$/i.test(input.nonce) || !/^0x[0-9a-f]{130}$/i.test(input.signature)) {
    throw new SecurityApiClientError(400, "invalid_wallet_signature", "The wallet sign-in response is invalid. Request a new sign-in message.");
  }
  const response = await requestJson<unknown>("/api/auth/user/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response || typeof response !== "object") throw invalidWalletAuthResponse();
  const session = response as { authenticated?: unknown; address?: unknown; expiresAt?: unknown };
  if (session.authenticated !== true || typeof session.address !== "string" || !isAddress(session.address)
    || session.address.toLowerCase() !== input.address.toLowerCase()
    || typeof session.expiresAt !== "string" || !Number.isFinite(Date.parse(session.expiresAt))) {
    throw invalidWalletAuthResponse();
  }
  return { configured: true, authenticated: true, address: session.address as `0x${string}`, expiresAt: session.expiresAt };
}

export async function logoutWalletSession(): Promise<void> {
  await requestJson("/api/auth/user/session", { method: "DELETE" });
}

/** The only wallet signature requested by this client is the server-issued EIP-191 login challenge. */
export async function signWalletAuthenticationMessage(
  provider: ReadOnlyEip1193Provider,
  address: string,
  message: string,
): Promise<`0x${string}`> {
  if (!isAddress(address) || !message.trim() || message.length > 2_048) {
    throw new SecurityApiClientError(400, "invalid_wallet_challenge", "The wallet sign-in message is invalid. Request a new challenge.");
  }
  const signRequest = provider.request as unknown as (args: { method: "personal_sign"; params: readonly [string, string] }) => Promise<unknown>;
  const signature = await signRequest.call(provider, { method: "personal_sign", params: [message, address] });
  if (typeof signature !== "string" || !/^0x[0-9a-f]{130}$/i.test(signature)) {
    throw new SecurityApiClientError(400, "invalid_wallet_signature", "The wallet did not return a valid EIP-191 sign-in signature.");
  }
  return signature as `0x${string}`;
}

export async function getSecurityCapabilities(): Promise<SecurityResearchCapabilities> {
  const response = await requestJson<unknown>("/api/security/capabilities");
  if (!isSecurityResearchCapabilities(response)) {
    throw new SecurityApiClientError(502, "invalid_capabilities_response", "The research capabilities service returned incomplete readiness information.");
  }
  return response;
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
