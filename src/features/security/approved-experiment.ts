import "server-only";

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { StoredTestArtifact } from "./model";

const TEST_ID = "phase0-ml-dsa-local" as const;
const TEST_NAME = "Pinned ML-DSA registration regression experiment";
const TEST_TIMEOUT_MS = 8 * 60_000;
const OUTPUT_LIMIT_BYTES = 128_000;
const REPO_ROOT = process.cwd();
const CONTRACTS_PATH = resolve(REPO_ROOT, "contracts");
const SANDBOX_IMAGE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/:+-]*@sha256:[a-f0-9]{64}$/;

export function isExperimentSandboxConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.QEVRA_EXPERIMENT_IMAGE && SANDBOX_IMAGE_PATTERN.test(env.QEVRA_EXPERIMENT_IMAGE.trim()));
}

function sanitizeOutput(value: string): string {
  return value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "[redacted-private-key]")
    .replace(/\b0x[a-f0-9]{64}\b/gi, "[redacted-32-byte-value]")
    .replace(/\b(token|api[_-]?key|authorization|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

function blockedArtifact(reason: string, startedAt: string): StoredTestArtifact {
  return {
    id: TEST_ID,
    name: TEST_NAME,
    status: "blocked",
    command: "Fixed ML-DSA regression test inside the configured Docker sandbox",
    startedAt,
    completedAt: new Date().toISOString(),
    limitations: [reason, "No host-side or API-supplied command was executed."],
  };
}

/**
 * Runs one hard-coded experiment in a read-only, resource-limited Docker container.
 * The request cannot select an executable, image, path, argument, or network mode.
 */
export async function runApprovedExperiment(testId: string, env: NodeJS.ProcessEnv = process.env): Promise<StoredTestArtifact> {
  const startedAt = new Date().toISOString();
  if (testId !== TEST_ID) return blockedArtifact("The requested test is not in the approved experiment allowlist.", startedAt);
  const image = env.QEVRA_EXPERIMENT_IMAGE?.trim();
  if (!image || !isExperimentSandboxConfigured(env)) {
    return blockedArtifact("A sandbox image pinned by immutable SHA-256 digest is not configured.", startedAt);
  }

  const args = [
    "run", "--rm", "--pull=never", "--network=bridge",
    "--read-only", "--no-new-privileges", "--cap-drop=ALL",
    "--memory=2g", "--cpus=2", "--pids-limit=128", "--ulimit", "core=0",
    "--tmpfs", "/tmp:rw,nosuid,nodev,mode=1777,size=1g",
    "--mount", `type=bind,src=${CONTRACTS_PATH},dst=/workspace/contracts,readonly`,
    "--workdir", "/workspace",
    "--env", "HOME=/tmp",
    "--env", "TMPDIR=/tmp",
    "--env", "RUN_FULL_VERIFIER_SUITE=0",
    image,
    "/bin/bash", "/workspace/contracts/scripts/run-ml-dsa-poc.sh",
  ];

  let rawOutput = Buffer.alloc(0);
  let truncated = false;
  const append = (chunk: Buffer) => {
    const remaining = OUTPUT_LIMIT_BYTES - rawOutput.length;
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    rawOutput = Buffer.concat([rawOutput, chunk.subarray(0, remaining)]);
    if (chunk.length > remaining) truncated = true;
  };

  const result = await new Promise<{ exitCode?: number; timedOut: boolean; spawnFailed: boolean }>((resolve) => {
    let done = false;
    let timedOut = false;
    let spawnFailed = false;
    const child = spawn("docker", args, {
      cwd: REPO_ROOT,
      env: { PATH: env.PATH ?? "/usr/bin:/bin", HOME: "/tmp", NODE_ENV: env.NODE_ENV ?? "production" },
      stdio: ["ignore", "pipe", "pipe"] as const,
      detached: true,
    });
    const finish = (value: { exitCode?: number; timedOut: boolean; spawnFailed: boolean }) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      resolve(value);
    };
    child.stdout.on("data", (chunk: Buffer) => append(chunk));
    child.stderr.on("data", (chunk: Buffer) => append(chunk));
    child.once("error", () => {
      spawnFailed = true;
      finish({ timedOut, spawnFailed });
    });
    child.once("close", (code) => finish({ exitCode: code ?? undefined, timedOut, spawnFailed }));
    const timeout = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        try { process.kill(-child.pid, "SIGTERM"); } catch { /* Process may already have exited. */ }
        setTimeout(() => {
          if (child.pid) {
            try { process.kill(-child.pid, "SIGKILL"); } catch { /* Process may already have exited. */ }
          }
        }, 5_000).unref();
      }
    }, TEST_TIMEOUT_MS);
    timeout.unref();
  });

  const completedAt = new Date().toISOString();
  const excerpt = sanitizeOutput(rawOutput.toString("utf8")).slice(-6_000);
  const limitations = [
    "The experiment ran in a Docker container with a read-only project mount, no host credentials, and fixed resource limits.",
    "The container used bridge networking to fetch the verifier at its pinned commit and install its declared Python dependencies.",
    "A passing reproduction is not a production-chain audit, and does not authorize custody, key registration, or transactions.",
  ];
  if (truncated) limitations.push("Captured output was truncated; the artifact hash covers captured bytes only, not the full process output.");
  if (result.timedOut) limitations.push("The experiment exceeded its eight-minute execution limit.");
  if (result.spawnFailed) limitations.push("Docker could not be started; verify that the worker has Docker access and the pinned image is available.");

  const status = result.spawnFailed ? "blocked" : result.timedOut || result.exitCode !== 0 ? "failed" : "passed";
  return {
    id: TEST_ID,
    name: TEST_NAME,
    status,
    command: "Fixed ML-DSA regression test inside the configured Docker sandbox",
    startedAt,
    completedAt,
    ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
    artifactSha256: createHash("sha256").update(rawOutput).digest("hex"),
    ...(excerpt ? { outputExcerpt: excerpt } : {}),
    limitations,
  };
}
