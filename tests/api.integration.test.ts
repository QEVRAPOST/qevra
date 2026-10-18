import assert from "node:assert/strict";
import { test } from "node:test";
import { toLiveDashboardSnapshot } from "@/features/dashboard/live-adapters";
import type { ReadOnlyWalletState, ResearchRunDetail, SecurityResearchCapabilities } from "@/types/integrations";

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

test("local authenticated API creates, processes, and retrieves a failed no-provider run safely", { skip: !enabled }, async () => {
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

  const invalid = await postJson("/api/security/runs", { topicId: "security-evidence", command: "not allowed" }, cookie);
  assert.equal(invalid.status, 400);

  const created = await postJson("/api/security/runs", { topicId: "security-evidence" }, cookie);
  assert.equal(created.status, 202);
  const createdBody = await created.json() as { run: { id: string; status: string } };
  assert.equal(createdBody.run.status, "queued");
  assert.match(createdBody.run.id, /^[0-9a-f-]{36}$/i);

  for (let index = 0; index < 6; index++) {
    const malformed = await postJson("/api/security/runs", { topicId: "unknown-topic" }, cookie);
    assert.equal(malformed.status, 400);
  }
  const overQuota = await postJson("/api/security/runs", { topicId: "security-evidence" }, cookie);
  assert.equal(overQuota.status, 429);

  let finalRun: ResearchRunDetail | undefined;
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const detail = await fetch(`${baseUrl}/api/security/runs/${createdBody.run.id}`, {
      headers: { cookie },
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(detail.status, 200);
    const body = await detail.json() as { run: ResearchRunDetail };
    finalRun = body.run;
    if (finalRun?.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(finalRun?.status, "failed", "worker must persist the missing-provider failure");
  assert.equal(finalRun?.errorCode, "model_provider_credentials_missing");
  assert.ok(finalRun?.agents.every((agent) => agent.status === "blocked"));

  const wallet: ReadOnlyWalletState = { status: "disconnected" };
  const liveSnapshot = toLiveDashboardSnapshot({ capabilities, wallet, runs: [finalRun!] });
  assert.equal(liveSnapshot.origin, "live");
  assert.equal(liveSnapshot.security.runs[0]?.status, "failed");
  assert.equal("exampleTag" in (liveSnapshot.security.runs[0] ?? {}), false);
  assert.equal(liveSnapshot.wallet.qevraAccount.status, "not_built");

  const historyResponse = await fetch(`${baseUrl}/api/security/runs?limit=50`, {
    headers: { cookie },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json() as { runs: Array<{ id: string }> };
  assert.ok(history.runs.some((run) => run.id === createdBody.run.id));
  process.stdout.write(`verified local run ${createdBody.run.id}: queued -> failed without provider call\n`);
});
