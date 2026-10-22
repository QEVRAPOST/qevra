import assert from "node:assert/strict";
import { test } from "node:test";
import type { SecurityResearchCapabilities } from "@/types/integrations";

const baseUrl = process.env.QEVRA_API_INTEGRATION_URL?.replace(/\/+$/, "");
const accessToken = process.env.QEVRA_ACCESS_TOKEN;
const enabled = Boolean(baseUrl && accessToken);

async function postJson(path: string, body: unknown, cookie?: string) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl!,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

test("local authenticated API refuses new research runs while provider execution is unavailable", { skip: !enabled }, async () => {
  const unauthorized = await postJson("/api/security/runs", { topicId: "security-evidence" });
  assert.equal(unauthorized.status, 401);
  const unauthorizedCapabilities = await fetch(`${baseUrl}/api/security/capabilities`);
  assert.equal(unauthorizedCapabilities.status, 401);
  const crossOrigin = await fetch(`${baseUrl}/api/security/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://untrusted.example" },
    body: JSON.stringify({ topicId: "security-evidence" }),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(crossOrigin.status, 403);

  const invalidLogin = await postJson("/api/auth/session", { token: "x".repeat(40) });
  assert.equal(invalidLogin.status, 401);

  const login = await postJson("/api/auth/session", { token: accessToken });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.ok(setCookie, "login must set an HTTP-only session cookie");
  assert.match(setCookie, /httponly/i);
  assert.match(setCookie, /samesite=strict/i);
  const cookie = setCookie.split(";")[0]!;

  const capabilitiesResponse = await fetch(`${baseUrl}/api/security/capabilities`, {
    headers: { cookie },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(capabilitiesResponse.status, 200);
  const capabilities = await capabilitiesResponse.json() as SecurityResearchCapabilities;
  assert.equal(capabilities.persistence, "available");
  assert.equal(capabilities.worker, "available");
  assert.equal(capabilities.provider, "not_configured");
  assert.notEqual(capabilities.unavailableReason, undefined);

  const historyBeforeResponse = await fetch(`${baseUrl}/api/security/runs?limit=50`, {
    headers: { cookie },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(historyBeforeResponse.status, 200);
  const historyBefore = await historyBeforeResponse.json() as { runs: Array<{ id: string }> };

  const invalid = await postJson("/api/security/runs", { topicId: "security-evidence", command: "not allowed" }, cookie);
  assert.equal(invalid.status, 400);

  const unavailable = await postJson("/api/security/runs", { topicId: "security-evidence" }, cookie);
  assert.equal(unavailable.status, 503);
  const unavailableBody = await unavailable.json() as { error: { code: string } };
  assert.equal(unavailableBody.error.code, capabilities.unavailableReason);
  assert.equal(unavailable.headers.get("location"), null, "an unavailable run must not be queued");

  for (let index = 0; index < 6; index++) {
    const malformed = await postJson("/api/security/runs", { topicId: "unknown-topic" }, cookie);
    assert.equal(malformed.status, 400);
  }
  const overQuota = await postJson("/api/security/runs", { topicId: "security-evidence" }, cookie);
  assert.equal(overQuota.status, 429);

  const historyResponse = await fetch(`${baseUrl}/api/security/runs?limit=50`, {
    headers: { cookie },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json() as { runs: Array<{ id: string }> };
  assert.deepEqual(history.runs.map((run) => run.id), historyBefore.runs.map((run) => run.id), "no new history row is created when live execution prerequisites are absent");
  process.stdout.write("verified authenticated API reports unavailable and does not queue a run\n");
});
