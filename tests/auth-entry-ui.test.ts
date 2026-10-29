import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthDialog, type AuthDialogProps } from "@/components/auth/AuthDialog";
import { LandingAuthAction, LandingNav } from "@/components/landing/LandingNav";
import { HERO } from "@/lib/content/landing";
import { getAccountProfile, loginWithPassword, registerPasswordAccount } from "@/features/auth/client";

const baseProps: AuthDialogProps = {
  open: true,
  onClose() {},
  onSetNetwork() {},
  authCapabilities: { password: false },
  accountSession: { authenticated: false, walletSession: { authenticated: false } },
  access: {
    gate: "unauthenticated",
    wallet: { status: "disconnected" },
    selectedNetwork: "testnet",
    walletAuthConfigured: false,
    signInBusy: false,
    connectWallet() {},
    requestWalletSignIn: async () => {},
    approveWalletSignIn: async () => {},
    cancelWalletSignIn() {},
    retry() {},
  },
};

test("primary sign-in is email and password, with no Google or OTP method", () => {
  const markup = renderToStaticMarkup(createElement(AuthDialog, baseProps));
  assert.match(markup, /Sign in to VEYRA/);
  assert.match(markup, /Email address/);
  assert.match(markup, /Password/);
  assert.match(markup, /Create account/);
  assert.match(markup, /Email\/password authentication is not configured on this server/i);
  assert.match(markup, /Sign in unavailable/);
  assert.match(markup, /Optional: use an external wallet for research access/i);
  assert.doesNotMatch(markup, /Continue with Google|Google sign-in|One-time code|verification code|Continue with Email/);
  assert.doesNotMatch(markup, /Request sign-in message|Choose an installed wallet/);
});

test("registration view is accessible and stays disabled when auth is not configured", () => {
  const markup = renderToStaticMarkup(createElement(AuthDialog, { ...baseProps, initialStep: "register" }));
  assert.match(markup, /Create your VEYRA account/);
  assert.match(markup, /Confirm password/);
  assert.match(markup, /Create account unavailable/);
  assert.match(markup, /will not submit or create an account or session/i);
  assert.match(markup, /type="password"/);
});

test("configured email/password auth enables real account routes and states the password policy", () => {
  const props = {
    ...baseProps,
    authCapabilities: { password: true },
    onPasswordLogin: async () => {},
    onPasswordRegister: async () => {},
  };
  const signIn = renderToStaticMarkup(createElement(AuthDialog, props));
  assert.match(signIn, />Sign in<\/button>/);
  assert.doesNotMatch(signIn, /Sign in unavailable/);

  const register = renderToStaticMarkup(createElement(AuthDialog, { ...props, initialStep: "register" }));
  assert.match(register, /Use 15–128 characters/);
  assert.match(register, /Create account<\/button>/);
  assert.doesNotMatch(register, /Create account unavailable/);
});

test("restored password account is distinct from a wallet and offers dashboard access", () => {
  const markup = renderToStaticMarkup(createElement(AuthDialog, {
    ...baseProps,
    accountSession: {
      authenticated: true,
      identity: { provider: "password", email: "owner@example.com", expiresAt: "2026-10-24T00:00:00.000Z" },
      walletSession: { authenticated: false },
    },
  }));
  assert.match(markup, /VEYRA account active/);
  assert.match(markup, /owner@example\.com/);
  assert.match(markup, /separate from a blockchain wallet/i);
  assert.match(markup, /Continue to dashboard/);
  assert.doesNotMatch(markup, /Wallet research session verified|0x[0-9a-fA-F]{40}/);
});

test("successful password authentication closes the dialog and routes to the dashboard", () => {
  const source = readFileSync("src/components/auth/AuthDialog.tsx", "utf8");
  const entry = readFileSync("src/components/auth/AuthEntryControl.tsx", "utf8");
  assert.match(source, /await submit\(email\.trim\(\), password\)[\s\S]*onPasswordSuccess\?\.\(\)/);
  assert.match(entry, /onPasswordSuccess=\{\(\) => \{ close\(\); router\.push\("\/app"\); \}\}/);
  assert.match(entry, /setOpen\(false\)/);
  assert.match(entry, /const showDialog = open && !\(dialogStep === "wallet" && access\?\.gate === "authenticated"\)/);
  assert.match(entry, /if \(!pendingAuthOpen \|\| sessionRestoring \|\| access\?\.gate === "checking"\) return/);
  assert.match(entry, /requestAnimationFrame\(\(\) => \{[\s\S]*if \(!authenticated\) \{[\s\S]*setOpen\(true\)/);
});

test("authenticated account navigation remains a menu and does not reopen a welcome dialog", () => {
  const source = readFileSync("src/components/auth/AuthEntryControl.tsx", "utf8");
  assert.match(source, /<details ref=\{accountMenuRef\} className="auth-account-menu">/);
  assert.match(source, /Open Security Swarm/);
  assert.match(source, /setPendingAuthOpen\(shouldOpen \|\| Boolean\(authError\)\)/);
  assert.match(source, /key=\{dialogStep\}/);
});

test("email/password form actions call only the real register and login endpoints", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", ...(typeof init?.body === "string" ? { body: init.body } : {}) });
    return Response.json({ authenticated: true, identity: { provider: "password", email: "owner@example.com", expiresAt: "2026-10-24T00:00:00.000Z" }, walletSession: { authenticated: false } });
  };
  try {
    assert.equal((await registerPasswordAccount({ email: "owner@example.com", password: "a sufficiently strong password" })).identity?.provider, "password");
    assert.equal((await loginWithPassword({ email: "owner@example.com", password: "a sufficiently strong password" })).identity?.provider, "password");
    assert.deepEqual(calls, [
      { url: "/api/auth/register", method: "POST", body: JSON.stringify({ email: "owner@example.com", password: "a sufficiently strong password" }) },
      { url: "/api/auth/login", method: "POST", body: JSON.stringify({ email: "owner@example.com", password: "a sufficiently strong password" }) },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("account profile client unwraps the API account envelope", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "/api/auth/profile");
    return Response.json({ account: {
      userId: "11111111-1111-4111-8111-111111111111",
      email: "owner@example.com",
      emailVerified: false,
      createdAt: "2026-10-23T00:00:00.000Z",
    } });
  };
  try {
    assert.deepEqual(await getAccountProfile(), {
      userId: "11111111-1111-4111-8111-111111111111",
      email: "owner@example.com",
      emailVerified: false,
      createdAt: "2026-10-23T00:00:00.000Z",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expired account sessions offer an immediate sign-in path", () => {
  const markup = renderToStaticMarkup(createElement(AuthDialog, {
    ...baseProps,
    accountSession: { authenticated: false, expired: true, walletSession: { authenticated: false } },
    authCapabilities: { password: true },
    onPasswordLogin: async () => {},
    onPasswordRegister: async () => {},
  }));
  assert.match(markup, /Your previous session expired\. Sign in again to continue\./);
  assert.doesNotMatch(markup, /when account authentication is available/i);

  const entrySource = readFileSync("src/components/auth/AuthEntryControl.tsx", "utf8");
  assert.match(entrySource, /Your previous sign-in could not be restored\. Sign in again\./);
  assert.doesNotMatch(entrySource, /when account authentication is available/i);
});

test("password login copy accurately says a wallet is not required for app access", () => {
  const markup = renderToStaticMarkup(createElement(AuthDialog, {
    ...baseProps,
    authCapabilities: { password: true },
    onPasswordLogin: async () => {},
    onPasswordRegister: async () => {},
  }));
  assert.match(markup, /No wallet connection, signature, or blockchain permission is required to enter the app\./);
  assert.doesNotMatch(markup, /once account authentication is available/i);
});

test("external wallet sign-in remains an explicit optional EIP-191 action", () => {
  const markup = renderToStaticMarkup(createElement(AuthDialog, {
    ...baseProps,
    initialStep: "wallet",
    access: {
      ...baseProps.access!,
      wallet: {
        status: "connected",
        address: "0x0000000000000000000000000000000000000001",
        chainId: 46_630,
        networkName: "Robinhood Chain Testnet",
        providerName: "MetaMask",
        isQevraTargetNetwork: true,
      },
      walletAuthConfigured: true,
      signInChallenge: {
        nonce: "a".repeat(32),
        message: "Sign in to VEYRA\nAddress: 0x0000000000000000000000000000000000000001\nChain ID: 46630",
        expiresAt: "2026-10-23T00:05:00.000Z",
      },
    },
  }));
  assert.match(markup, /MetaMask/);
  assert.match(markup, /Review the one-time sign-in message/);
  assert.match(markup, /EIP-191 signature confirms a login message/i);
  assert.match(markup, /not a blockchain transaction signature/i);
  assert.match(markup, /No transaction or token approval is requested/i);
  assert.match(markup, /Approve sign-in message/);
});

test("landing account menu identifies VEYRA accounts without Google-specific login copy", () => {
  const markup = renderToStaticMarkup(createElement(LandingAuthAction, {
    session: { status: "signed_in", method: "account", email: "owner@example.com" },
    onSignOut() {},
  }));
  assert.match(markup, /VEYRA account active/);
  assert.match(markup, /owner@example\.com/);
  assert.match(markup, /Open dashboard/);
  assert.match(markup, /Open wallet overview/);
  assert.match(markup, /does not disconnect your browser wallet/);
  assert.doesNotMatch(markup, /Google/);
});

test("landing exposes sign-in and ambitious but accurate product copy", () => {
  const markup = renderToStaticMarkup(createElement(LandingNav, { projectName: "VEYRA" }));
  assert.match(markup, /href="\/app\?auth=1"/);
  assert.match(markup, /Sign in/);
  assert.match(`${HERO.eyebrow} ${HERO.headline} ${HERO.lede}`, /POST-QUANTUM DEFI · ROBINHOOD CHAIN.*The Next Era of DeFi.*Built for Robinhood Chain/);
  assert.doesNotMatch(`${HERO.eyebrow} ${HERO.headline} ${HERO.lede}`, /first post-quantum/i);
});

test("wallet overview separates the Phantom EVM owner from a chain-verified VEYRA smart account", () => {
  const view = readFileSync("src/components/dashboard/WalletView.tsx", "utf8");
  const source = readFileSync("src/components/dashboard/SmartAccountPanel.tsx", "utf8");
  const signing = readFileSync("src/features/wallet/owner-link.ts", "utf8");
  assert.match(view, /<SmartAccountPanel/);
  assert.match(view, /External wallet · read-only/);
  assert.match(source, /VEYRA Smart Wallet/);
  assert.match(source, /linkEip1193OwnerWallet/);
  assert.match(signing, /personal_sign/);
  assert.match(source, /Alchemy Light Account v2.0.0/);
  assert.match(source, /Review zero-value Testnet operation/);
  assert.match(source, /Smart Account UserOperation and 0x swap execution are not enabled on Robinhood Mainnet/);
  assert.match(source, /will not fall back to an EOA transaction/);
  assert.match(source, /not post-quantum protected/);
});

test("security workspace retains operator access and does not make account login a wallet bypass", () => {
  const source = readFileSync("src/components/dashboard/SecurityView.tsx", "utf8");
  assert.match(source, /AUTH_ENTRY_OPEN_EVENT/);
  assert.match(source, /<SecurityResearchView accessNotice=/);
  assert.match(source, /createSecurityRun\(topicId\)/);
  assert.match(source, /canStart = live && researchAccess\?\.gate === "authenticated"/);
  assert.match(source, /walletLoginEnabled=\{false\}/);
  assert.match(source, /operatorAuthConfigured/);
  assert.match(source, /<Trail phase=\{phase\}/);
  assert.match(source, /<SwarmPipeline[^>]*model=\{pipeline\}/);
  assert.match(source, /<SwarmRunDetail/);
  assert.match(source, /<h2 className="ov-h">Evidence<\/h2>/);
});
