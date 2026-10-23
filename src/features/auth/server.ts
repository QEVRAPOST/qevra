import "server-only";

import { hashAuthSessionToken, createNewAuthSession } from "./session";
import { readCookie } from "@/features/security/auth";
import { USER_SESSION_SECONDS } from "@/features/security/wallet-auth";
import type { AuthIdentityRecord, AuthSessionRecord, PostgresResearchStore } from "@/features/security/store";

export async function persistAuthSession(store: PostgresResearchStore, identity: AuthIdentityRecord, walletSessionHash?: string) {
  const created = createNewAuthSession(Date.now(), walletSessionHash ? USER_SESSION_SECONDS : undefined);
  await store.createAuthSession({
    sessionHash: created.tokenHash,
    userId: identity.userId,
    provider: identity.provider,
    subject: identity.subject,
    email: identity.email,
    walletSessionHash,
    expiresAt: created.expiresAt,
  });
  return { ...created, provider: identity.provider, email: identity.email };
}

export async function getAuthSession(request: Request, store: PostgresResearchStore): Promise<AuthSessionRecord | undefined> {
  const token = readCookie(request, "veyra_auth_session");
  const hash = token ? hashAuthSessionToken(token) : undefined;
  return hash ? store.getAuthSession(hash) : undefined;
}
