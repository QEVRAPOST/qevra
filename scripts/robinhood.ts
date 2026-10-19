import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NETWORKS } from "@/lib/config/networks";
import { readRobinhoodNetwork, RobinhoodRpcError } from "@/features/wallet/public-rpc";
import type { NetworkId, NetworkOption } from "@/types/network";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS_ROOT = resolve(ROOT, "contracts");

export function resolveRobinhoodNetwork(value: string): NetworkOption {
  const network = NETWORKS.find((candidate) => candidate.id === value && candidate.available);
  if (!network) throw new Error(`Unsupported Robinhood network: ${value}`);
  return network;
}

export function deploymentReadiness(networkId: NetworkId): { ready: false; reason: string } {
  resolveRobinhoodNetwork(networkId);
  return networkId === "mainnet"
    ? { ready: false, reason: "Mainnet deployment is blocked pending independent security review and owner approval." }
    : { ready: false, reason: "No approved deployment artifact exists; the Phase 0 research harness and verifier are excluded." };
}

export function explorerReadiness(networkId: NetworkId, explorerUrl?: string): { ready: false; reason: string } {
  resolveRobinhoodNetwork(networkId);
  if (explorerUrl) {
    try {
      const url = new URL(explorerUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
        return { ready: false, reason: "Explorer URL must be a plain HTTPS URL without credentials, query, or fragment." };
      }
    } catch {
      return { ready: false, reason: "Explorer URL is invalid." };
    }
  }
  return { ready: false, reason: "No approved deployment artifact or verified Robinhood explorer API is configured." };
}

function printUsage(): void {
  process.stdout.write([
    "Robinhood read-only tooling:",
    "  bun scripts/robinhood.ts rpc <testnet|mainnet>",
    "  bun scripts/robinhood.ts contracts <build|size|gas>",
    "  bun scripts/robinhood.ts deploy <validate|dry-run> <testnet|mainnet>",
    "  bun scripts/robinhood.ts explorer readiness <testnet|mainnet> [https://explorer.example]",
    "",
  ].join("\n"));
}

function runForge(args: string[]): number {
  process.stdout.write(`forge ${args.join(" ")} (contracts/; offline; no broadcast)\n`);
  const result = spawnSync("forge", args, { cwd: CONTRACTS_ROOT, stdio: "inherit", shell: false });
  if (result.error) {
    process.stderr.write("Foundry command could not be started. Install Foundry and retry.\n");
    return 1;
  }
  return result.status ?? 1;
}

async function runRpc(networkValue: string): Promise<number> {
  const network = resolveRobinhoodNetwork(networkValue);
  try {
    const snapshot = await readRobinhoodNetwork(network.id);
    process.stdout.write(`${network.label}: RPC healthy · chain ${snapshot.chainId} verified · block ${snapshot.latestBlock} · ${snapshot.observedAt}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof RobinhoodRpcError ? error.code : "rpc_unavailable";
    process.stderr.write(`${network.label}: RPC unavailable (${code}). No write request was made.\n`);
    return 1;
  }
}

function runContracts(action: string): number {
  if (action === "build") return runForge(["build", "--offline"]);
  if (action === "size") return runForge(["build", "--offline", "--sizes"]);
  if (action === "gas") {
    process.stdout.write("Static compiler estimates only; dynamic/external-call paths may report infinite. No transaction is simulated or sent.\n");
    return runForge(["inspect", "--offline", "QevraAuthorizationHarness", "gasEstimates"]);
  }
  printUsage();
  return 2;
}

function runDeployment(action: string, networkValue: string): number {
  const network = resolveRobinhoodNetwork(networkValue);
  const result = deploymentReadiness(network.id);
  if (action === "validate") {
    process.stdout.write(`BLOCKED · ${network.label}: ${result.reason}\n`);
    return 2;
  }
  if (action === "dry-run") {
    process.stdout.write(`DRY-RUN BLOCKED · ${network.label}: ${result.reason}\nNo deployment transaction was constructed or broadcast.\n`);
    return 2;
  }
  printUsage();
  return 2;
}

function runExplorer(action: string, networkValue: string, explorerUrl?: string): number {
  if (action !== "readiness") {
    printUsage();
    return 2;
  }
  const network = resolveRobinhoodNetwork(networkValue);
  const result = explorerReadiness(network.id, explorerUrl);
  process.stdout.write(`EXPLORER NOT READY · ${network.label}: ${result.reason}\n`);
  return 2;
}

export async function main(args: string[]): Promise<number> {
  try {
    const [group, action, value, extra] = args;
    if (group === "rpc" && action) return await runRpc(action);
    if (group === "contracts" && action) return runContracts(action);
    if (group === "deploy" && action && value) return runDeployment(action, value);
    if (group === "explorer" && action && value) return runExplorer(action, value, extra);
    printUsage();
    return 2;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Robinhood command failed."}\n`);
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
