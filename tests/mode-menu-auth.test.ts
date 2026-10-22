import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

interface SessionProps {
  gate: "checking" | "unauthenticated" | "authenticated" | "not_configured" | "service_error" | "rate_limited";
  authenticationMethod?: "wallet" | "operator";
  walletConnected: boolean;
  walletNetworkMismatch: boolean;
  message?: string;
  onSignOut: () => void;
}

async function renderResearchSession(props: SessionProps): Promise<string> {
  const menuExports = await import("@/components/dashboard/ModeMenu") as Record<string, unknown>;
  const component = menuExports.ModeMenuResearchSession;
  assert.equal(typeof component, "function", "ModeMenu should render research session state separately from app mode");
  return renderToStaticMarkup(createElement(component as ComponentType<SessionProps>, props));
}

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("signed-out mode menu guides the visitor to Security Swarm without showing Sign out", async () => {
  const markup = await renderResearchSession({
    gate: "unauthenticated",
    walletConnected: false,
    walletNetworkMismatch: false,
    onSignOut() {},
  });

  assert.match(markup, /No active research session/i);
  assert.match(markup, /href="\/app\/security"/);
  assert.match(markup, /Sign in to Security Swarm/);
  assert.doesNotMatch(markup, />Sign out</);
});

test("wallet connection with a network mismatch is not presented as research authentication", async () => {
  const markup = await renderResearchSession({
    gate: "unauthenticated",
    walletConnected: true,
    walletNetworkMismatch: true,
    onSignOut() {},
  });

  assert.match(markup, /wallet is connected/i);
  assert.match(markup, /network does not match/i);
  assert.match(markup, /sign in to Security Swarm/i);
  assert.doesNotMatch(markup, />Sign out</);
});

test("a restored wallet-user research session is labeled as a wallet session and can sign out", async () => {
  const markup = await renderResearchSession({
    gate: "authenticated",
    authenticationMethod: "wallet",
    walletConnected: true,
    walletNetworkMismatch: false,
    onSignOut() {},
  });

  assert.match(markup, /Wallet research session active/);
  assert.match(markup, />Sign out</);
});

test("a restored operator research session is labeled separately and can sign out", async () => {
  const markup = await renderResearchSession({
    gate: "authenticated",
    authenticationMethod: "operator",
    walletConnected: false,
    walletNetworkMismatch: false,
    onSignOut() {},
  });

  assert.match(markup, /Operator research session active/);
  assert.match(markup, />Sign out</);
  assert.doesNotMatch(markup, /Wallet research session active/);
});

test("session checking after refresh never presents a stale sign-out action", async () => {
  const markup = await renderResearchSession({
    gate: "checking",
    walletConnected: true,
    walletNetworkMismatch: true,
    onSignOut() {},
  });

  assert.match(markup, /Checking the Security Swarm session/);
  assert.doesNotMatch(markup, />Sign out</);
});

test("mode menu only wires Sign out to an authenticated research session", () => {
  const source = readFileSync("src/components/dashboard/ModeMenu.tsx", "utf8");
  assert.match(source, /useLiveResearchAccess/);
  assert.match(source, /ModeMenuResearchSession/);
  assert.match(source, /onSignOut=\{signOutResearch\}/);
  assert.match(source, /if \(canSignOutResearch\) actions\.logout\(\)/);
  assert.doesNotMatch(source, /\{live \? \([\s\S]*?Sign out/);
});

test("page refresh checks both session cookies and restores the corresponding research method", () => {
  const source = readFileSync("src/features/dashboard/LiveAppProvider.tsx", "utf8");
  const checkSession = sourceBetween(source, "const checkSession = useCallback(async () => {", "const applyWalletState = useCallback");

  assert.match(source, /void checkSession\(\)/);
  assert.match(checkSession, /getSecuritySessionStatus\(\)/);
  assert.match(checkSession, /getWalletSessionStatus\(\)/);
  assert.match(checkSession, /authenticationMethodRef\.current = "operator"/);
  assert.match(checkSession, /authenticationMethodRef\.current = "wallet"/);
  assert.match(checkSession, /authenticationMethodRef\.current = undefined/);
});

test("research sign-out does not disconnect the wallet, and wallet disconnect does not create or renew a session", () => {
  const source = readFileSync("src/features/dashboard/LiveAppProvider.tsx", "utf8");
  const signOut = sourceBetween(source, "const logout = useCallback(() => {", "const loadMoreRuns = useCallback");
  const disconnect = sourceBetween(source, "const disconnectWallet = useCallback(() => {", "const connectWallet = useCallback");

  assert.match(signOut, /logoutWalletSession\(\)/);
  assert.match(signOut, /logoutFromSecurityService\(\)/);
  assert.doesNotMatch(signOut, /disconnectWallet|clearPreferredWallet|providerRef\.current = undefined/);
  assert.match(disconnect, /clearPreferredWallet\(\)/);
  assert.doesNotMatch(disconnect, /logoutWalletSession|logoutFromSecurityService|requestWalletAuthChallenge|completeWalletAuthChallenge/);
});
