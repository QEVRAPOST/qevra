"use client";

import type { NetworkId } from "@/types";
import type { AuthAccountProfile, AuthCapabilities, AuthCurrentSession, AuthContract, BuiltInWalletStatus, WalletLinkChallenge } from "./contracts";
import { requestWalletAuthChallenge } from "@/features/security/client";
import type { WalletAuthChallenge } from "@/features/security/client";
import { isWalletSmartAccountStatusResponse, type WalletSmartAccountStatusResponse } from "@/features/wallet/smart-account-contract";

export class AuthApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "AuthApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store" });
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new AuthApiError(response.status, "invalid_response", "The authentication service returned an invalid response.");
  }
  if (!response.ok) {
    const error = value && typeof value === "object" ? (value as { error?: { code?: unknown; message?: unknown } }).error : undefined;
    throw new AuthApiError(response.status,
      typeof error?.code === "string" ? error.code : "request_failed",
      typeof error?.message === "string" ? error.message : "The authentication request failed.");
  }
  return value as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function getAuthCapabilities(): Promise<AuthCapabilities> {
  return request("/api/auth/capabilities");
}

export function getCurrentAuthSession(): Promise<AuthCurrentSession> {
  return request("/api/auth/current");
}

export function registerPasswordAccount(input: { email: string; password: string }): Promise<AuthCurrentSession> {
  return post("/api/auth/register", input);
}

export function loginWithPassword(input: { email: string; password: string }): Promise<AuthCurrentSession> {
  return post("/api/auth/login", input);
}

export function getAccountProfile(): Promise<AuthAccountProfile> {
  return request<{ account: AuthAccountProfile }>("/api/auth/profile").then(({ account }) => account);
}

export function submitWalletLogin(input: { address: string; nonce: string; signature: string }): Promise<AuthCurrentSession> {
  return post("/api/auth/user/session", input);
}

export function requestWalletLoginChallenge(input: { networkId: NetworkId; address: string }): Promise<WalletAuthChallenge> {
  return requestWalletAuthChallenge(input);
}

export function logoutAuthSession(): Promise<void> {
  return post<void>("/api/auth/logout");
}

export function getBuiltInWalletStatus(): Promise<BuiltInWalletStatus> {
  return request("/api/auth/wallet/status");
}

export function provisionBuiltInWallet(consent: true): Promise<BuiltInWalletStatus> {
  return post("/api/auth/wallet/provision", { consent });
}

export function requestWalletLinkChallenge(input: { networkId: NetworkId; address: string }): Promise<WalletLinkChallenge> {
  return post("/api/auth/wallet/link/challenge", input);
}

export function verifyWalletLink(input: { nonce: string; signature: string }): Promise<{ linked: true; address: `0x${string}`; chainId: number }> {
  return post("/api/auth/wallet/link", input);
}

export async function getWalletSmartAccountStatus(networkId: NetworkId, ownerAddress?: string): Promise<WalletSmartAccountStatusResponse> {
  const query = new URLSearchParams({ networkId });
  if (ownerAddress) query.set("ownerAddress", ownerAddress);
  const response = await request<unknown>(`/api/auth/wallet/smart-account?${query.toString()}`);
  if (!isWalletSmartAccountStatusResponse(response)) {
    throw new AuthApiError(502, "invalid_smart_account_status", "The smart wallet service returned an invalid status response.");
  }
  return response;
}

export const authContract: AuthContract = {
  capabilities: getAuthCapabilities,
  current: getCurrentAuthSession,
  register: registerPasswordAccount,
  login: loginWithPassword,
  profile: getAccountProfile,
  requestWalletChallenge: requestWalletLoginChallenge,
  walletLogin: submitWalletLogin,
  logout: logoutAuthSession,
  builtInWalletStatus: getBuiltInWalletStatus,
  provisionBuiltInWallet,
  createWalletLinkChallenge: requestWalletLinkChallenge,
  verifyWalletLink,
};
