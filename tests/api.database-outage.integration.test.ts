import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "@/features/security/auth";

const baseUrl = process.env.QEVRA_API_INTEGRATION_URL?.replace(/\/+$/, "");
const enabled = process.env.QEVRA_API_DATABASE_OUTAGE_TEST === "1" && Boolean(baseUrl);

test("authenticated run creation returns sanitized 503 while PostgreSQL is unavailable", { skip: !enabled }, async () => {
  const session = createSession();
  assert.ok(session);
  const response = await fetch(`${baseUrl}/api/security/runs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl!,
      cookie: `qevra_session=${session.value}`,
    },
    body: JSON.stringify({ topicId: "security-evidence" }),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 503);
  const body = await response.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, "persistence_unavailable");
  assert.equal(body.error.message.includes("postgresql://"), false);

  const capabilities = await fetch(`${baseUrl}/api/security/capabilities`, {
    headers: { cookie: `qevra_session=${session.value}` },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(capabilities.status, 200);
  const capabilityState = await capabilities.json() as { persistence: string; worker: string };
  assert.equal(capabilityState.persistence, "unavailable");
  assert.equal(capabilityState.worker, "unavailable");
});
