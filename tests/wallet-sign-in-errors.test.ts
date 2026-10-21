import assert from "node:assert/strict";
import { test } from "node:test";
import { walletSignInErrorMessage } from "@/features/dashboard/LiveAppProvider";
import { SecurityApiClientError } from "@/features/security/client";

test("wallet sign-in distinguishes rejected signatures, expired challenges, origin mismatch, and missing configuration", () => {
  assert.match(walletSignInErrorMessage({ code: 4001 }), /rejected/i);
  assert.match(walletSignInErrorMessage(new SecurityApiClientError(401, "wallet_signature_invalid", "invalid")), /signature.*did not match/i);
  assert.match(walletSignInErrorMessage(new SecurityApiClientError(401, "wallet_challenge_expired", "expired")), /expired or (?:was )?already used/i);
  assert.match(walletSignInErrorMessage(new SecurityApiClientError(403, "origin_not_allowed", "origin")), /configured VEYRA site origin/i);
  assert.match(walletSignInErrorMessage(new SecurityApiClientError(503, "wallet_auth_not_configured", "missing")), /not configured on the server/i);
});
