import { apiError } from "@/features/security/api";
import { NextResponse } from "next/server";
import { readCookie, verifySessionCookie } from "@/features/security/auth";
import { getResearchStore, StoreNotConfiguredError } from "@/features/security/store";
import { AUTH_SESSION_COOKIE, clearAuthSessionCookie, hashAuthSessionToken } from "@/features/auth/session";
import { USER_SESSION_COOKIE, verifyUserSessionCookie } from "@/features/security/wallet-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const operatorAuthenticated = Boolean(verifySessionCookie(readCookie(request, "qevra_session")));
  const walletCookie = readCookie(request, USER_SESSION_COOKIE);
  const wallet = verifyUserSessionCookie(walletCookie);
  const token = readCookie(request, AUTH_SESSION_COOKIE);
  const tokenHash = token ? hashAuthSessionToken(token) : undefined;
  let walletAuthenticated = Boolean(wallet) && !operatorAuthenticated;

  if (wallet && !operatorAuthenticated) {
    try {
      walletAuthenticated = !(await getResearchStore().walletAuthSessionIsRevoked(wallet.sessionKey));
    } catch {
      return apiError(503, "persistence_unavailable", "The wallet session could not be checked.", { "cache-control": "no-store" });
    }
  }

  if (tokenHash) {
    try {
      const session = await getResearchStore().getAuthSession(tokenHash);
      if (session) {
        const walletAddress = session.provider === "wallet"
          ? session.subject as `0x${string}`
          : undefined;
        return Response.json({
          authenticated: true,
          identity: {
            provider: session.provider,
            ...(session.email ? { email: session.email } : {}),
            ...(walletAddress ? { walletAddress } : {}),
            expiresAt: session.expiresAt,
          },
          ...(operatorAuthenticated ? { operatorAuthenticated: true } : {}),
          walletSession: {
            authenticated: walletAuthenticated,
            ...(wallet && walletAuthenticated ? { address: wallet.address, expiresAt: new Date(wallet.expiresAt * 1_000).toISOString() } : {}),
          },
        }, { headers: { "cache-control": "no-store" } });
      }
    } catch (error) {
      if (operatorAuthenticated) {
        return Response.json({ authenticated: true, operatorAuthenticated: true, walletSession: { authenticated: false } }, {
          headers: { "cache-control": "no-store" },
        });
      }
      const code = error instanceof StoreNotConfiguredError ? "persistence_not_configured" : "persistence_unavailable";
      return apiError(503, code, "The authentication session could not be checked.", { "cache-control": "no-store" });
    }
  }

  if (operatorAuthenticated) {
    const response = NextResponse.json({ authenticated: true, operatorAuthenticated: true, walletSession: { authenticated: walletAuthenticated } }, {
      headers: { "cache-control": "no-store" },
    });
    if (token) clearAuthSessionCookie(response);
    return response;
  }
  if (wallet && walletAuthenticated) {
    const response = NextResponse.json({
      authenticated: true,
      identity: { provider: "wallet", walletAddress: wallet.address, expiresAt: new Date(wallet.expiresAt * 1_000).toISOString() },
      walletSession: { authenticated: true, address: wallet.address, expiresAt: new Date(wallet.expiresAt * 1_000).toISOString() },
    }, { headers: { "cache-control": "no-store" } });
    if (token) clearAuthSessionCookie(response);
    return response;
  }
  const response = NextResponse.json({ authenticated: false, expired: Boolean(token || walletCookie), walletSession: { authenticated: false } }, {
    headers: { "cache-control": "no-store" },
  });
  if (token) clearAuthSessionCookie(response);
  return response;
}
