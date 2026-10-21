import assert from "node:assert/strict";
import { test } from "node:test";
import { walletResearchSessionAccountMismatch } from "@/features/dashboard/live-ui-state";

test("wallet connection loss does not expire a separate EIP-191 session, but a different authorized account does", () => {
  const sessionAddress = "0xabcdef0000000000000000000000000000000001";
  assert.equal(walletResearchSessionAccountMismatch("wallet", sessionAddress, undefined), false);
  assert.equal(walletResearchSessionAccountMismatch("wallet", sessionAddress, sessionAddress.toUpperCase().replace("0X", "0x")), false);
  assert.equal(walletResearchSessionAccountMismatch("wallet", sessionAddress, "0x0000000000000000000000000000000000000002"), true);
  assert.equal(walletResearchSessionAccountMismatch("operator", sessionAddress, "0x0000000000000000000000000000000000000002"), false);
});
