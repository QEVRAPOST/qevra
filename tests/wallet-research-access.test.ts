import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LiveAccessGate } from "@/features/dashboard/LiveAppProvider";

test("research access leads with explicit wallet sign-in and keeps operator administration separate", () => {
  const markup = renderToStaticMarkup(createElement(LiveAccessGate, {
    gate: "unauthenticated",
    onLogin: async () => {},
    onRetry() {},
  }));
  assert.match(markup, /Sign in to Research/);
  assert.match(markup, /EIP-191/i);
  assert.match(markup, /wallet connection.*remain read-only/i);
  assert.match(markup, /Operator administration/);
  assert.match(markup, /configured operator access token/i);
  assert.match(markup, /Run ID is not an authentication token/i);
});

test("wallet challenge approval is shown as a distinct user action", () => {
  const markup = renderToStaticMarkup(createElement(LiveAccessGate, {
    gate: "unauthenticated",
    wallet: {
      status: "connected",
      address: "0x0000000000000000000000000000000000000001",
      providerName: "MetaMask",
      chainId: 46_630,
      networkName: "Robinhood Chain Testnet",
    },
    selectedNetwork: "testnet",
    signInChallenge: {
      nonce: "a".repeat(32),
      message: "Login to this-site wants you to sign in with your Ethereum account:\n0x0000000000000000000000000000000000000001\n\nSign in to VEYRA. This request will not approve tokens or authorize transactions.\n\nChain ID: 46630",
      expiresAt: "2026-10-21T12:00:00.000Z",
    },
    onLogin: async () => {},
    onRetry() {},
  }));
  assert.match(markup, /Review the one-time sign-in message/);
  assert.match(markup, /Approve EIP-191 sign-in message/);
  assert.match(markup, /personal_sign/i);
  assert.match(markup, /No transaction or token approval is requested/);
});
