import assert from "node:assert/strict";
import { test } from "node:test";
import { deploymentReadiness, explorerReadiness, resolveRobinhoodNetwork } from "../scripts/robinhood";

test("Robinhood CLI resolves only the configured official read-only networks", () => {
  assert.equal(resolveRobinhoodNetwork("testnet").chainId, 46_630);
  assert.equal(resolveRobinhoodNetwork("mainnet").chainId, 4_663);
  assert.throws(() => resolveRobinhoodNetwork("ethereum"), /unsupported Robinhood network/i);
});

test("deployment readiness always blocks the vulnerable Phase 0 harness and gates Mainnet", () => {
  const testnet = deploymentReadiness("testnet");
  const mainnet = deploymentReadiness("mainnet");
  assert.equal(testnet.ready, false);
  assert.match(testnet.reason, /no approved deployment artifact/i);
  assert.equal(mainnet.ready, false);
  assert.match(mainnet.reason, /security review and owner approval/i);
});

test("Explorer readiness requires HTTPS and remains blocked without an approved artifact", () => {
  assert.equal(explorerReadiness("testnet").ready, false);
  assert.match(explorerReadiness("testnet").reason, /no approved deployment artifact/i);
  assert.match(explorerReadiness("mainnet", "http://explorer.example").reason, /HTTPS/i);
});
