import { pathToFileURL } from "node:url";
import { deploymentReadiness, resolveRobinhoodNetwork } from "./robinhood";
import { readRobinhoodNetwork, RobinhoodRpcError } from "@/features/wallet/public-rpc";
import type { NetworkId } from "@/types/network";

const BAR = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

type SimulationOptions = {
  projectName?: string;
  color?: boolean;
  fetchImpl?: typeof fetch;
};

function paint(value: string, code: string, enabled: boolean): string {
  return enabled ? `\u001b[${code}m${value}\u001b[0m` : value;
}

function status(value: string, tone: "good" | "bad" | "neutral", enabled: boolean): string {
  const code = tone === "good" ? "32;1" : tone === "bad" ? "31;1" : "36;1";
  return paint(value, code, enabled);
}

function line(label: string, value: string): string {
  return `${label.padEnd(18)} ${value}`;
}

function wordmark(projectName: string): string {
  const name = projectName.trim() || "YEVRA";
  return Array.from(name.toLocaleUpperCase()).join(" ");
}

export async function simulateDeployment(
  networkId: NetworkId,
  options: SimulationOptions = {},
): Promise<{ exitCode: number; output: string }> {
  const network = resolveRobinhoodNetwork(networkId);
  const readiness = deploymentReadiness(network.id);
  const color = options.color ?? Boolean(process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb");
  const projectName = options.projectName ?? process.env.NEXT_PUBLIC_PROJECT_NAME ?? "YEVRA";
  const rows = [
    paint(wordmark(projectName), "36;1", color),
    BAR,
    paint("DEPLOYMENT SIMULATION", "1", color),
    line("Environment", network.label),
    line("Chain ID", String(network.chainId)),
    line("RPC", network.rpcUrl),
  ];
  let exitCode = 0;

  try {
    const snapshot = await readRobinhoodNetwork(network.id, options.fetchImpl);
    rows.push(line("RPC status", status("AVAILABLE · chain ID verified", "good", color)));
    rows.push(line("Observed ID", String(snapshot.chainId)));
    rows.push(line("Latest block", snapshot.latestBlock));
  } catch (error) {
    exitCode = 1;
    if (error instanceof RobinhoodRpcError && error.code === "rpc_chain_id_mismatch") {
      rows.push(line("RPC status", status("CHAIN MISMATCH", "bad", color)));
      rows.push(line("Chain check", `expected ${network.chainId}; observed ${error.observedChainId ?? "unknown"}`));
    } else {
      const code = error instanceof RobinhoodRpcError ? error.code : "rpc_unavailable";
      rows.push(line("RPC status", status(`PREFLIGHT BLOCKED (${code})`, "bad", color)));
    }
    rows.push(line("Latest block", "Unavailable"));
  }

  rows.push(line("Contract", "Post-Quantum Smart Account"));
  rows.push(line("Readiness", status("BLOCKED", "bad", color)));
  rows.push(line("Verified address", "No verified deployment address configured"));
  rows.push(line("Security gate", status("BLOCKED — Phase 0B NO-GO", "bad", color)));
  rows.push("             ML-DSA verifier remains unresolved; deployment is not authorized.");
  rows.push(line("Readiness detail", readiness.reason));
  rows.push(line("Broadcast", status("DISABLED", "bad", color)));
  rows.push(BAR);
  rows.push(paint("SIMULATION ONLY — NO TRANSACTION SENT", "1;33", color));
  rows.push("No key loaded · No signing · No funding · No contract deployment");

  return { exitCode, output: `${rows.join("\n")}\n` };
}

function parseNetwork(args: string[]): NetworkId {
  if (args.length !== 2 || args[0] !== "--network" || (args[1] !== "testnet" && args[1] !== "mainnet")) {
    throw new Error("Usage: bun run deploy:simulate --network <testnet|mainnet>");
  }
  return args[1];
}

export async function main(args: string[]): Promise<number> {
  try {
    const result = await simulateDeployment(parseNetwork(args));
    process.stdout.write(result.output);
    return result.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Deployment simulation failed."}\n`);
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
