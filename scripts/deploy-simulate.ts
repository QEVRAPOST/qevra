import { pathToFileURL } from "node:url";
import { deploymentReadiness, resolveRobinhoodNetwork } from "./robinhood";
import { readRobinhoodNetwork, RobinhoodRpcError } from "@/features/wallet/public-rpc";
import type { NetworkId } from "@/types/network";

const WORDMARK_GLYPHS: Record<string, string[]> = {
  Y: ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
  E: ["#####", "#    ", "#### ", "#    ", "#    ", "#    ", "#####"],
  V: ["#   #", "#   #", "#   #", "#   #", " # # ", " # # ", "  #  "],
  R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  A: [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
};

type SimulationOptions = {
  projectName?: string;
  color?: boolean;
  colorDepth?: "16" | "256" | "truecolor";
  columns?: number;
  fetchImpl?: typeof fetch;
};

function wrapText(value: string, maxWidth: number): string[] {
  const rows: string[] = [];
  let row = "";
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    if (word.length > maxWidth) {
      if (row) rows.push(row);
      row = "";
      for (let offset = 0; offset < word.length; offset += maxWidth) {
        rows.push(word.slice(offset, offset + maxWidth));
      }
    } else if (!row) {
      row = word;
    } else if (row.length + word.length + 1 <= maxWidth) {
      row += ` ${word}`;
    } else {
      rows.push(row);
      row = word;
    }
  }
  if (row) rows.push(row);
  return rows.length ? rows : [""];
}

function paint(value: string, tone: "brand" | "good" | "bad" | "warn" | "muted" | "plain", enabled: boolean, depth: "16" | "256" | "truecolor"): string {
  if (!enabled || tone === "plain") return value;
  const palette = {
    brand: { rgb: [198, 56, 96], ansi256: 168, ansi16: 91 },
    good: { rgb: [99, 207, 163], ansi256: 79, ansi16: 32 },
    bad: { rgb: [255, 115, 124], ansi256: 210, ansi16: 31 },
    warn: { rgb: [244, 190, 113], ansi256: 221, ansi16: 33 },
    muted: { rgb: [163, 177, 191], ansi256: 145, ansi16: 90 },
    plain: { rgb: [238, 242, 247], ansi256: 255, ansi16: 97 },
  }[tone];
  const code = depth === "truecolor"
    ? `38;2;${palette.rgb.join(";")}`
    : depth === "16"
      ? String(palette.ansi16)
      : `38;5;${palette.ansi256}`;
  return `\u001b[${code}m${value}\u001b[0m`;
}

function cleanBrand(value: string): string {
  const clean = value.trim().toLocaleUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return clean || "VEYRA";
}

function asciiWordmark(projectName: string): string[] {
  const name = cleanBrand(projectName);
  const glyphs = Array.from(name, (letter) => WORDMARK_GLYPHS[letter]);
  if (glyphs.some((glyph) => !glyph)) return [name];
  return Array.from({ length: 7 }, (_, row) =>
    glyphs.map((glyph) => glyph![row]).join(" "));
}

function createFrame(columns: number, color: boolean, colorDepth: "16" | "256" | "truecolor") {
  const width = Math.max(34, Math.min(108, Math.floor(columns) - 2));
  const innerWidth = width - 4;
  const rows: string[] = [];
  const border = (glyph = "-") => `+${glyph.repeat(width - 2)}+`;
  const addBorder = (glyph = "-") => rows.push(paint(border(glyph), "brand", color, colorDepth));
  const boxLine = (value = "", align: "left" | "center" = "left", tone: Parameters<typeof paint>[1] = "plain") => {
    for (const wrapped of wrapText(value, innerWidth)) {
      const padding = align === "center" ? Math.floor((innerWidth - wrapped.length) / 2) : 0;
      const content = `${" ".repeat(padding)}${wrapped}${" ".repeat(innerWidth - padding - wrapped.length)}`;
      rows.push(`| ${paint(content, tone, color, colorDepth)} |`);
    }
  };
  const centeredWordmark = (projectName: string) => {
    const art = asciiWordmark(projectName);
    if (art[0]!.length > innerWidth) {
      boxLine(cleanBrand(projectName), "center", "brand");
      return;
    }
    for (const artRow of art) {
      const padding = Math.floor((innerWidth - artRow.length) / 2);
      const content = `${" ".repeat(padding)}${artRow}${" ".repeat(innerWidth - padding - artRow.length)}`;
      rows.push(`| ${paint(content, "brand", color, colorDepth)} |`);
    }
  };
  const section = (number: string, title: string) => {
    addBorder();
    boxLine(`${number}  /  ${title}`, "left", "brand");
    addBorder();
  };
  const row = (label: string, value: string, tone: Parameters<typeof paint>[1] = "plain") => {
    const labelWidth = Math.min(23, Math.max(12, Math.floor(innerWidth / 3)));
    const valueWidth = Math.max(8, innerWidth - labelWidth - 3);
    const wrapped = wrapText(value, valueWidth);
    boxLine(`${label.toUpperCase().padEnd(labelWidth)} │ ${wrapped[0] ?? ""}`, "left", tone);
    for (const continuation of wrapped.slice(1)) boxLine(`${" ".repeat(labelWidth)} │ ${continuation}`, "left", tone);
  };
  const note = (value: string) => boxLine(value, "left", "muted");

  return { rows, width, innerWidth, border, addBorder, boxLine, centeredWordmark, section, row, note };
}

function formatReadiness(
  network: ReturnType<typeof resolveRobinhoodNetwork>,
  readiness: ReturnType<typeof deploymentReadiness>,
  networkResult: { status: string; observedChainId: string; latestBlock: string; detail: string },
  projectName: string,
  options: Required<Pick<SimulationOptions, "color" | "colorDepth" | "columns">>,
): string {
  const frame = createFrame(options.columns, options.color, options.colorDepth);
  const { rows, addBorder, boxLine, centeredWordmark, section, row, note } = frame;

  addBorder("=");
  boxLine("");
  centeredWordmark(projectName);
  boxLine("");
  boxLine(`${cleanBrand(projectName)}  /  ROBINHOOD NETWORK READINESS`, "center", "plain");
  boxLine(`${network.label.toUpperCase()}  |  EXPECTED CHAIN ${network.chainId}`, "center", "brand");
  boxLine("READ-ONLY DEPLOYMENT READINESS", "center", "plain");
  boxLine("NO TRANSACTION BROADCAST", "center", "muted");
  addBorder("=");

  section("01", "LIVE NETWORK VALIDATION");
  row("RPC connectivity", networkResult.status, networkResult.status === "AVAILABLE" ? "good" : "bad");
  row("Observed chain ID", networkResult.observedChainId, networkResult.observedChainId === String(network.chainId) ? "good" : "warn");
  row("Expected chain ID", String(network.chainId));
  row("Latest block", networkResult.latestBlock, networkResult.latestBlock === "Unavailable" ? "warn" : "good");
  if (networkResult.detail) note(networkResult.detail);
  addBorder();

  section("02", "SMART ACCOUNT DEPLOYMENT READINESS");
  row("Contract", "Post-Quantum Smart Account");
  row("Readiness", "BLOCKED — no authorized custody deployment", "bad");
  row("Verified address", "NONE — No verified deployment address exists", "muted");
  row("On-chain bytecode", "NOT VERIFIED — no verified deployment address to inspect", "muted");
  row("Source verification", "NOT AVAILABLE — no deployed contract evidence", "muted");
  row("Deployment artifact", "NO APPROVED ARTIFACT", "bad");
  row("Phase 0B gate", "BLOCKED — ML-DSA verifier remains unresolved", "bad");
  note(readiness.reason);
  addBorder();

  section("03", "THREE CORE PRODUCT PILLARS");
  row("A · Smart Account", "BLOCKED — PQ custody deployment is not authorized", "bad");
  row("  Evidence", "No verified deployed PQ Smart Account; ML-DSA verifier remains unresolved", "muted");
  row("B · Simple Swap + Intent Lock", "DISABLED — no verified router or executable quote", "bad");
  row("  Execution", "Transaction execution is disabled", "muted");
  row("C · Security Swarm", "API and worker implementation present", "good");
  row("  Research", "Research Agent succeeded in a prior live attempt (historical)", "warn");
  row("  Three-agent run", "UNVERIFIED — no successful complete live execution demonstrated", "warn");
  addBorder();

  section("04", "SECURITY AND EXECUTION GATES");
  row("Phase 0B", "BLOCKED", "bad");
  row("PQ custody deployment", "DISABLED", "bad");
  row("Swap execution", "DISABLED", "bad");
  row("Private key loading", "NOT PERFORMED", "muted");
  row("Transaction signing", "NOT PERFORMED", "muted");
  row("Broadcast", "DISABLED", "bad");
  addBorder();

  addBorder("=");
  boxLine("");
  centeredWordmark(projectName);
  boxLine(`${network.label.toUpperCase()}  |  CHAIN ${network.chainId}  |  ${networkResult.status}`, "center", networkResult.status === "AVAILABLE" ? "good" : "warn");
  boxLine(`SMART ACCOUNT  ${"BLOCKED"}  ·  SWAP  DISABLED  ·  SWARM  LIVE STATUS UNVERIFIED`, "center", "muted");
  boxLine("");
  boxLine("READ ONLY — NO TRANSACTIONS SIGNED OR BROADCAST", "center", "plain");
  addBorder("=");

  const output = rows.join("\n");
  return `${output}\n`;
}

export function parseDeploymentArgs(args: string[]): { networkId: NetworkId; mode: "show" | "simulate" } {
  const showFlags = args.filter((arg) => arg === "--testnet" || arg === "--mainnet");
  if (showFlags.length > 1) throw new Error("--testnet and --mainnet are mutually exclusive.");
  if (showFlags.length === 1) {
    if (args.length !== 1) throw new Error(`Unknown option: ${args.find((arg) => arg !== showFlags[0])}`);
    return { networkId: showFlags[0] === "--testnet" ? "testnet" : "mainnet", mode: "show" };
  }

  if (args[0] === "--network") {
    if (args.length !== 2) throw new Error("Usage: bun run deploy:simulate --network <testnet|mainnet>");
    if (args[1] !== "testnet" && args[1] !== "mainnet") throw new Error("Network must be testnet or mainnet.");
    return { networkId: args[1], mode: "simulate" };
  }

  if (args.length > 0) throw new Error(`Unknown option: ${args[0]}`);
  throw new Error("Usage: bun run deploy:show --testnet | --mainnet; legacy: bun run deploy:simulate --network <testnet|mainnet>");
}

export async function simulateDeployment(
  networkId: NetworkId,
  options: SimulationOptions = {},
): Promise<{ exitCode: number; output: string }> {
  const network = resolveRobinhoodNetwork(networkId);
  const readiness = deploymentReadiness(network.id);
  const color = options.color ?? Boolean(process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb");
  const colorDepth = options.colorDepth ?? (process.env.COLORTERM === "truecolor" || process.env.COLORTERM === "24bit"
    ? "truecolor"
    : (process.env.TERM ?? "").includes("256color") ? "256" : "16");
  const projectName = options.projectName ?? process.env.NEXT_PUBLIC_PROJECT_NAME ?? "VEYRA";
  const columns = options.columns ?? process.stdout.columns ?? 100;
  let exitCode = 0;
  let networkResult = {
    status: "AVAILABLE",
    observedChainId: "Unavailable",
    latestBlock: "Unavailable",
    detail: "",
  };

  try {
    const snapshot = await readRobinhoodNetwork(network.id, options.fetchImpl);
    networkResult = {
      status: "AVAILABLE",
      observedChainId: String(snapshot.chainId),
      latestBlock: snapshot.latestBlock,
      detail: "Observed chain ID matches the selected network; latest block read completed.",
    };
  } catch (error) {
    exitCode = 1;
    if (error instanceof RobinhoodRpcError && error.code === "rpc_chain_id_mismatch") {
      networkResult = {
        status: "CHAIN MISMATCH",
        observedChainId: String(error.observedChainId ?? "Unavailable"),
        latestBlock: "Unavailable",
        detail: `Expected chain ${network.chainId}; observed ${error.observedChainId ?? "unknown"}. No block read followed the mismatch.`,
      };
    } else {
      const code = error instanceof RobinhoodRpcError ? error.code : "rpc_unavailable";
      const httpStatus = error instanceof RobinhoodRpcError ? error.message.match(/HTTP (\d{3})/)?.[1] : undefined;
      networkResult = {
        status: `ACCESS FAILURE${httpStatus ? ` · HTTP ${httpStatus}` : ` · ${code}`}`,
        observedChainId: "Unavailable",
        latestBlock: "Unavailable",
        detail: "RPC preflight did not complete. No deployment or transaction action was attempted.",
      };
    }
  }

  return {
    exitCode,
    output: formatReadiness(network, readiness, networkResult, projectName, { color, colorDepth, columns }),
  };
}

export async function main(args: string[]): Promise<number> {
  try {
    const { networkId } = parseDeploymentArgs(args);
    const result = await simulateDeployment(networkId);
    process.stdout.write(result.output);
    return result.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Deployment readiness showcase failed."}\n`);
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
