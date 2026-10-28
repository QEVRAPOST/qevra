import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getModelProvider } from "@/features/security/provider";
import { claimNextRunWhenProviderReady } from "@/features/security/worker-policy";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

test("the Railway worker start command resolves its loader from production dependencies", () => {
  assert.match(packageJson.scripts?.["security:worker"] ?? "", /--import\s+tsx/);
  assert.equal(typeof packageJson.dependencies?.tsx, "string", "tsx must be installed in production for the worker entrypoint");
  assert.equal(packageJson.devDependencies?.tsx, undefined, "tsx must not be available only in development builds");
});

test("the local worker command explicitly loads the private phase-2 environment file", () => {
  assert.equal(packageJson.scripts?.["security:worker:local"], "bun --env-file=.qevra-data/phase2.env run security:worker");
});

test("the worker queue claims queued or expired running records, never historical failed runs", () => {
  const storeSource = readFileSync(new URL("../src/features/security/store.ts", import.meta.url), "utf8");
  assert.match(storeSource, /WHERE status = 'queued' OR \(status = 'running' AND lease_until < now\(\)\)/);
  assert.doesNotMatch(storeSource, /WHERE status = 'failed'/);
});

test("a billing-disabled worker heartbeat does not claim queued research runs", async () => {
  const provider = getModelProvider({
    NODE_ENV: "test",
    QEVRA_AI_API_KEY: "test-key",
    QEVRA_AI_MODEL: "openai/gpt-oss-20b",
    QEVRA_AI_BASE_URL: "https://api.groq.com/openai/v1",
    QEVRA_AI_BILLING_APPROVED: "false",
  } as NodeJS.ProcessEnv);
  let claimCount = 0;

  const claimed = await claimNextRunWhenProviderReady(provider, async () => {
    claimCount += 1;
    return { id: "queued-run" };
  });

  assert.equal(provider.status, "not_configured");
  assert.equal(claimed, undefined);
  assert.equal(claimCount, 0);
});
