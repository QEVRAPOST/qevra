import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityResearchAccess, ActivityView } from "@/components/dashboard/ActivityView";
import { ModelContext } from "@/components/dashboard/AppModelContext";
import { CopyAddressButton, copyAddressFeedback } from "@/components/dashboard/CopyAddressButton";
import { PublicAddressInspectionMessage, PublicAddressInspector, PublicAddressResult, publicAddressActionLabel } from "@/components/dashboard/PublicAddressInspector";
import { SecurityResearchAccess, researchCreationBlockerFromAction, researchSessionBlocker } from "@/components/dashboard/SecurityView";
import { LiveAccessGate, operatorAccessErrorMessage } from "@/features/dashboard/LiveAppProvider";
import { SecurityApiClientError } from "@/features/security/client";
import { startBlocker, SwarmLaunch } from "@/components/dashboard/SwarmLaunch";
import { SwapView } from "@/components/dashboard/SwapView";
import { buildLiveAppModel } from "@/features/dashboard/live-model";
import { DEFAULT_RESEARCH_TOPIC_ID } from "@/features/security/topics";
import type { AppModelValue } from "@/types";

function renderWithLiveModel(Component: ComponentType): string {
  const model = buildLiveAppModel({
    wallet: { status: "disconnected" },
    accessState: "unauthenticated",
    runs: null,
    isRefreshing: false,
    isCreating: false,
  });
  const value = {
    model,
    actions: {
      setNetwork() {}, setAmount() {}, pressSwapButton() {}, pressWalletButton() {}, pressLedgerAction() {},
      refreshWallet() {}, refreshNetwork() {}, createSecurityRun() {}, logout() {},
    },
  } as unknown as AppModelValue;
  return renderToStaticMarkup(createElement(ModelContext.Provider, { value }, createElement(Component)));
}

test("Security Swarm starts with the read-only Robinhood research topic selected", () => {
  assert.equal(DEFAULT_RESEARCH_TOPIC_ID, "robinhood-readonly-wallet");
});

test("Security Swarm keeps the workspace visible and asks for wallet proof only at protected research actions", () => {
  const markup = renderToStaticMarkup(createElement(SecurityResearchAccess, {
    gate: "unauthenticated",
    walletAuthConfigured: true,
    onRetry() {},
  }));

  assert.match(markup, /Protected research access/);
  assert.match(markup, /Wallet-owned saved reports and creating a research run require a wallet research session/i);
  assert.match(markup, /does not sign out your VEYRA Account/i);
  assert.match(markup, /Verify wallet for research/);
  assert.match(markup, /EIP-191/);
  assert.doesNotMatch(markup, /Sign in to the Security Swarm|Operator administration|type="password"|<form/);
});

test("research authorization failures keep reports private and provide a precise disabled-run reason", () => {
  const gated = renderToStaticMarkup(createElement(SecurityResearchAccess, {
    gate: "not_configured",
    walletAuthConfigured: false,
    onRetry() {},
  }));

  assert.match(gated, /Wallet-owned research history remains protected/i);
  assert.doesNotMatch(gated, /Verify wallet for research/);
  assert.match(researchSessionBlocker("unauthenticated") ?? "", /email\/password sign-in.*does not grant wallet research access/i);
  assert.match(researchSessionBlocker("checking") ?? "", /checking for a server-verified research session/i);
  assert.match(researchSessionBlocker("service_error") ?? "", /research session check failed/i);
  assert.match(researchCreationBlockerFromAction("research_run_owner_allowlist_not_configured: disabled" ) ?? "", /server-side wallet owner allowlist is not configured/i);
  assert.match(researchCreationBlockerFromAction("research_run_wallet_not_allowed: denied") ?? "", /not on the server-side research owner allowlist/i);
  assert.equal(researchCreationBlockerFromAction(undefined), null);
});

test("operator administration sign-in reports friendly invalid-token and expired-session messages", () => {
  assert.equal(
    operatorAccessErrorMessage(new SecurityApiClientError(401, "invalid_access_token", "The access token is invalid.")),
    "That operator access token was not accepted. Check the configured token and try again.",
  );
  const markup = renderToStaticMarkup(createElement(LiveAccessGate, {
    gate: "unauthenticated",
    message: "Your operator session expired. Sign in again to continue using research history and run details.",
    onLogin: async () => {},
    onRetry() {},
  }));
  assert.match(markup, /role="status"/);
  assert.match(markup, /operator session expired/i);
});

test("Activity sends signed-out research users to Security Swarm without another login form", () => {
  const markup = renderToStaticMarkup(createElement(ActivityResearchAccess, {
    live: true,
    gate: "unauthenticated",
  }, createElement("div", null, "Protected saved runs")));

  assert.match(markup, /same wallet or operator session/i);
  assert.match(markup, /href="\/app\/security"/);
  assert.match(markup, /Research sign-in in Security Swarm/);
  assert.doesNotMatch(markup, /<form|type="password"|Protected saved runs/);
});

test("Activity keeps authenticated history and demo history available in its own view", () => {
  const authenticated = renderToStaticMarkup(createElement(ActivityResearchAccess, {
    live: true,
    gate: "authenticated",
  }, createElement("div", null, "Persisted saved runs")));
  const demo = renderToStaticMarkup(createElement(ActivityResearchAccess, {
    live: false,
    gate: "unauthenticated",
  }, createElement("div", null, "Example runs")));

  assert.match(authenticated, /Persisted saved runs/);
  assert.match(demo, /Example runs/);
  assert.doesNotMatch(authenticated, /Operator Access in Security Swarm/);
});

test("live Security launch puts provider and worker availability before the create action", () => {
  const markup = renderToStaticMarkup(createElement(SwarmLaunch, {
    live: true,
    topicId: "security-evidence",
    onTopic() {},
    onStart() {},
    canStart: true,
    isCreating: false,
    blocker: null,
    capabilities: {
      provider: "available",
      providerName: "Groq",
      worker: "available",
      persistence: "available",
      sourceCount: 3,
    } as never,
    step: null,
    onIllustrate() {},
    onNext() {},
    onStop() {},
  }));

  assert.ok(markup.indexOf("Choose a topic") < markup.indexOf("Research service availability"));
  assert.ok(markup.indexOf("Research service availability") < markup.indexOf("Create research run"));
  assert.match(markup, /Provider/);
  assert.match(markup, /Worker/);
});

test("billing-disabled execution is explained while saved reports remain available", () => {
  const blocker = startBlocker({
    provider: "not_configured",
    providerName: "Awaiting authorization",
    authentication: "available",
    billing: "not_configured",
    persistence: "available",
    worker: "available",
    deterministicExperiments: "available",
    sourceCount: 3,
    unavailableReason: "ai_billing_not_approved",
  });

  assert.match(blocker ?? "", /billing has not been approved/i);
  assert.match(blocker ?? "", /saved reports remain available/i);
});

test("Activity distinguishes authenticated persisted research from unavailable live transactions", () => {
  const markup = renderWithLiveModel(ActivityView);

  assert.match(markup, /Research History/);
  assert.match(markup, /persisted Security Swarm runs/i);
  assert.match(markup, /wallet or operator research session/i);
  assert.match(markup, /Transactions.*unavailable/i);
  assert.match(markup, /transaction-history integration/i);
});

test("Simple Swap explains its intended review journey and why live execution is unavailable", () => {
  const markup = renderWithLiveModel(SwapView);

  assert.match(markup, /select tokens.*enter an amount.*review/i);
  assert.match(markup, /preview only/i);
  assert.match(markup, /No reviewed swap route is configured\./);
  assert.match(markup, /illustrative.*not.*on-chain/i);
  assert.match(markup, /No transaction was requested or sent\./);
});

test("watch-only address inspection names its controls and keeps copy feedback accessible", () => {
  const inspector = renderToStaticMarkup(createElement(PublicAddressInspector));
  const copy = renderToStaticMarkup(createElement(CopyAddressButton, {
    address: "0x0000000000000000000000000000000000000001",
    label: "Copy Address",
  }));

  assert.match(inspector, /Inspect Address/);
  assert.match(inspector, /No wallet connection or account permission is used/);
  assert.equal(publicAddressActionLabel({ status: "available", snapshot: {
    networkId: "testnet", chainId: 46_630, address: "0x0000000000000000000000000000000000000001",
    balanceWei: "10000000000000000", observedBlock: "139672517", observedAt: "2026-10-21T00:00:00.000Z",
  } }), "Refresh public balance");
  assert.match(copy, /role="status"/);
  assert.match(copy, /Copy Address/);
  assert.deepEqual(copyAddressFeedback("copied", "Copy Address"), {
    label: "Copied", announcement: "Address copied to clipboard.",
  });
  assert.deepEqual(copyAddressFeedback("unavailable", "Copy Address"), {
    label: "Copy unavailable", announcement: "Address could not be copied.",
  });
});

test("watch-only result is chain-specific and exposes actual read metadata with accessible loading and errors", () => {
  const snapshot = {
    networkId: "testnet" as const,
    chainId: 46_630,
    address: "0x0000000000000000000000000000000000000001",
    balanceWei: "10000000000000000",
    observedBlock: "139672517",
    observedAt: "2026-10-21T00:00:00.000Z",
  };
  const result = renderToStaticMarkup(createElement(PublicAddressResult, { snapshot }));
  const loading = renderToStaticMarkup(createElement(PublicAddressInspectionMessage, { state: { status: "loading" } }));
  const error = renderToStaticMarkup(createElement(PublicAddressInspectionMessage, { state: { status: "error", message: "Public RPC unavailable." } }));

  assert.match(result, /0\.01 ETH/);
  assert.match(result, /Robinhood Testnet/);
  assert.match(result, /RPC chain ID<\/dt><dd>46630/);
  assert.match(result, /139672517/);
  assert.match(result, /Watch-only address/);
  assert.match(result, /Open in Explorer/);
  assert.match(result, /explorer\.testnet\.chain\.robinhood\.com\/address\/0x0000000000000000000000000000000000000001/);
  assert.match(loading, /role="status"/);
  assert.match(error, /role="alert"/);
  assert.match(error, /Public RPC unavailable/);
});
