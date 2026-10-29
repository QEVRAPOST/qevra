import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MainnetSwapPanel, swapRequestStateText } from "../src/components/dashboard/MainnetSwapPanel.tsx";
import { ModelContext } from "../src/components/dashboard/AppModelContext.tsx";
import { buildLiveAppModel } from "../src/features/dashboard/live-model.ts";
import type { AppModelValue } from "../src/types/index.ts";
import { canReviewSwapQuote, createSwapRequestGuard, getSwapQuoteBalanceState, isFirmQuoteExpired, MAX_MAINNET_RECEIPT_POLLS, shouldContinueMainnetReceiptPolling } from "../src/features/swap/ui-state.ts";

test("Mainnet swap server-rendered entry explains its explicit wallet, quote, review, and receipt steps", () => {
  const model = buildLiveAppModel({ wallet: { status: "connected", address: "0x1111111111111111111111111111111111111111", chainId: 4_663, networkName: "Robinhood Chain", providerName: "MetaMask" }, selectedNetwork: "mainnet", runs: null, accessState: "unauthenticated", isRefreshing: false, isCreating: false });
  const value = {
    model,
    actions: { setNetwork() {}, setAmount() {}, pressSwapButton() {}, pressWalletButton() {}, pressLedgerAction() {}, refreshWallet() {}, refreshNetwork() {}, createSecurityRun() {}, logout() {} },
  } as unknown as AppModelValue;
  const markup = renderToStaticMarkup(createElement(ModelContext.Provider, { value }, createElement(MainnetSwapPanel)));

  assert.match(markup, /External wallet/);
  assert.match(markup, /MetaMask/);
  assert.match(markup, /Get firm quote/);
  assert.match(markup, /Swap flow/);
  assert.match(markup, /Requires explicit wallet approval/);
  assert.match(markup, /wallet preflight rechecks balance, gas, allowance/i);
  assert.doesNotMatch(markup, /Confirm swap in wallet/);
});

test("Mainnet swap hides a wallet balance when the selected app network differs from the wallet chain", () => {
  const model = buildLiveAppModel({
    wallet: {
      status: "connected",
      address: "0x1111111111111111111111111111111111111111",
      chainId: 4_663,
      networkName: "Robinhood Chain",
      providerName: "MetaMask",
      balance: { symbol: "ETH", amount: "1", wei: "1000000000000000000", blockNumber: "123", blockHash: `0x${"1".repeat(64)}`, provider: "connected_wallet_rpc", observedAt: "2026-10-30T00:00:00.000Z" },
    },
    selectedNetwork: "testnet",
    runs: null,
    accessState: "unauthenticated",
    isRefreshing: false,
    isCreating: false,
  });
  const value = {
    model,
    actions: { setNetwork() {}, setAmount() {}, pressSwapButton() {}, pressWalletButton() {}, pressLedgerAction() {}, refreshWallet() {}, refreshNetwork() {}, createSecurityRun() {}, logout() {} },
  } as unknown as AppModelValue;
  const markup = renderToStaticMarkup(createElement(ModelContext.Provider, { value }, createElement(MainnetSwapPanel)));

  assert.match(markup, /Current application chain: 46630; wallet chain: 4663/);
  assert.doesNotMatch(markup, /Public native balance/);
  assert.doesNotMatch(markup, /Get firm quote/);
});

test("a form edit invalidates pending quote responses and only the newest request remains current", () => {
  const guard = createSwapRequestGuard();
  const oldQuoteRequest = guard.begin();

  guard.invalidate();
  assert.equal(guard.isCurrent(oldQuoteRequest), false);

  const latestQuoteRequest = guard.begin();
  assert.equal(guard.isCurrent(oldQuoteRequest), false);
  assert.equal(guard.isCurrent(latestQuoteRequest), true);
});

test("firm quote expiration is explicit at and after its deadline", () => {
  const expiresAt = "2026-10-30T12:00:00.000Z";
  assert.equal(isFirmQuoteExpired(expiresAt, Date.parse("2026-10-30T11:59:59.999Z")), false);
  assert.equal(isFirmQuoteExpired(expiresAt, Date.parse(expiresAt)), true);
  assert.equal(isFirmQuoteExpired("invalid", Date.now()), true);
});

test("Mainnet swap exposes each wallet and receipt transition with actionable status text", () => {
  assert.equal(swapRequestStateText("awaiting_wallet", false), "Awaiting wallet confirmation");
  assert.match(swapRequestStateText("awaiting_wallet", true) ?? "", /quote expired.*reject/i);
  assert.match(swapRequestStateText("wallet_rejected", false) ?? "", /Wallet rejected/);
  assert.match(swapRequestStateText("wallet_request_pending", false) ?? "", /inspect the wallet popup/);
  assert.match(swapRequestStateText("quote_expired", false) ?? "", /refresh and review/);
  assert.match(swapRequestStateText("context_changed", false) ?? "", /Network or account changed/);
  assert.match(swapRequestStateText("submitted", false) ?? "", /awaiting Mainnet receipt/);
  assert.match(swapRequestStateText("confirmed", false) ?? "", /confirmed by Mainnet receipt/);
  assert.match(swapRequestStateText("reverted", false) ?? "", /reverted/);
  assert.match(swapRequestStateText("receipt_verification_failed", false) ?? "", /Receipt verification failed/);
});

test("receipt polling has a finite retry limit", () => {
  assert.equal(shouldContinueMainnetReceiptPolling(0), true);
  assert.equal(shouldContinueMainnetReceiptPolling(MAX_MAINNET_RECEIPT_POLLS - 1), true);
  assert.equal(shouldContinueMainnetReceiptPolling(MAX_MAINNET_RECEIPT_POLLS), false);
  assert.equal(shouldContinueMainnetReceiptPolling(-1), false);
});

test("zero WETH balance is not actionable while native ETH always waits for wallet preflight", () => {
  assert.equal(getSwapQuoteBalanceState({ native: false, actual: "0", sufficient: false, amountIn: "100" }), "insufficient");
  assert.equal(getSwapQuoteBalanceState({ native: false, actual: "99", sufficient: true, amountIn: "100" }), "insufficient");
  assert.equal(getSwapQuoteBalanceState({ native: false, actual: null, sufficient: true, amountIn: "100" }), "unknown");
  assert.equal(getSwapQuoteBalanceState({ native: false, actual: "100", sufficient: true, amountIn: "100" }), "sufficient");
  assert.equal(getSwapQuoteBalanceState({ native: true, actual: "0", sufficient: false, amountIn: "100" }), "native_preflight_required");
  assert.equal(canReviewSwapQuote({ balanceState: "insufficient", expired: false, contextMatches: true }), false);
  assert.equal(canReviewSwapQuote({ balanceState: "sufficient", expired: true, contextMatches: true }), false);
  assert.equal(canReviewSwapQuote({ balanceState: "sufficient", expired: false, contextMatches: false }), false);
  assert.equal(canReviewSwapQuote({ balanceState: "native_preflight_required", expired: false, contextMatches: true }), true);
});
