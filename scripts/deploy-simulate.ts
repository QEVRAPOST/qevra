import { pathToFileURL } from "node:url";
import { keccak256, type Hex } from "viem";
import testnetManifest from "../contracts/deployments/robinhood-testnet.json";
import mainnetManifest from "../contracts/deployments/robinhood-mainnet.json";
import { parseVerifiedVeyraManifest, type VeyraDeploymentManifest } from "@/lib/config/veyra-deployment-manifest";
import type { VerifiedVeyraDeployment, VerifiedVeyraStandaloneDeployment } from "@/lib/config/veyra-deployments";
import { resolveRobinhoodNetwork } from "./robinhood";
import type { NetworkId, NetworkOption } from "@/types/network";

const WORDMARK_GLYPHS: Record<string, string[]> = {
  Y: ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
  E: ["#####", "#    ", "#### ", "#    ", "#    ", "#    ", "#####"],
  V: ["#   #", "#   #", "#   #", "#   #", " # # ", " # # ", "  #  "],
  R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  A: [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
};

const ARCHITECTURE_NAMES = [
  "VeyraKeyRegistrationValidator",
  "VeyraKeyRegistry",
  "VeyraRecoveryPolicy",
  "VeyraAccount",
  "VeyraAccountFactory",
  "VeyraTokenPolicyRegistry",
  "VeyraRouterRegistry",
  "VeyraSwapIntentGuard",
  "VeyraSwapExecutor",
  "VeyraResearchAttestationRegistry",
] as const;

type ProgressState = "running" | "complete" | "failed";
type ProgressEvent = { label: string; state: ProgressState };
type ProgressHandler = (event: ProgressEvent) => void;

type SimulationOptions = {
  projectName?: string;
  color?: boolean;
  colorDepth?: "16" | "256" | "truecolor";
  columns?: number;
  fetchImpl?: typeof fetch;
  onProgress?: ProgressHandler;
};

type DeploymentStatus = "DEPLOYED · MANIFEST VERIFIED" | "ADDRESS PRESENT · NOT VERIFIED" | "NOT DEPLOYED · BLOCKED" | "NOT DEPLOYED · HARD NO-GO" | "NOT DEPLOYED" | "REGISTRY UNAVAILABLE";

type ArchitectureRow = {
  slot: number;
  name: string;
  status: DeploymentStatus;
  address?: string;
  sourceVerification?: string;
  verifiedRecord?: VerifiedVeyraDeployment;
};

type AnchorRow = {
  status: "DEPLOYED · MANIFEST VERIFIED" | "ADDRESS PRESENT · NOT VERIFIED" | "NOT DEPLOYED" | "REGISTRY UNAVAILABLE";
  address?: string;
  transactionHash?: string;
  blockNumber?: string;
  sourceVerification?: string;
  verifiedRecord?: VerifiedVeyraStandaloneDeployment;
};

type RegistrySnapshot = {
  networkId: NetworkId;
  network: NetworkOption;
  available: boolean;
  slots: ArchitectureRow[];
  anchor: AnchorRow;
  verifiedDeployments: VerifiedVeyraDeployment[];
};

type NetworkResult = {
  status: string;
  observedChainId: string;
  latestBlock: string;
  detail: string;
  liveAnchorCheck: string;
};

type RpcErrorCode = "rpc_timeout" | "rpc_unavailable" | "rpc_http_error" | "rpc_invalid_response" | "rpc_error" | "rpc_chain_id_mismatch";

class ReadOnlyRpcError extends Error {
  constructor(
    readonly code: RpcErrorCode,
    readonly httpStatus?: number,
    readonly observedChainId?: number,
  ) {
    super(code);
  }
}

function wrapText(value: string, maxWidth: number): string[] {
  const width = Math.max(1, maxWidth);
  const rows: string[] = [];
  let row = "";
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    if (word.length > width) {
      if (row) rows.push(row);
      row = "";
      for (let offset = 0; offset < word.length; offset += width) rows.push(word.slice(offset, offset + width));
    } else if (!row) {
      row = word;
    } else if (row.length + word.length + 1 <= width) {
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
  return Array.from({ length: 7 }, (_, row) => glyphs.map((glyph) => glyph![row]).join(" "));
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
  return { rows, addBorder, boxLine, centeredWordmark, section, row, note };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeAddress(value: unknown): string | undefined {
  return typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value) ? value : undefined;
}

function sourceLabel(value: unknown): string {
  return value === "verified" ? "VERIFIED" : value === "not_verified" ? "NOT VERIFIED" : "UNKNOWN";
}

function contractName(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const name = value.solidityName ?? value.name;
  return typeof name === "string" ? name : undefined;
}

function recordForSlot(raw: VeyraDeploymentManifest, slot: number, name: string): unknown {
  return raw.contracts.find((candidate) => {
    if (!isRecord(candidate) || contractName(candidate) !== name) return false;
    const declaredSlot = candidate.architectureSlot ?? candidate.slot;
    return declaredSlot === undefined || declaredSlot === slot;
  });
}

function isRegistryAvailable(networkId: NetworkId, raw: VeyraDeploymentManifest, network: NetworkOption): boolean {
  return raw.schema === "veyra-contract-manifest-v1"
    && raw.project === "VEYRA"
    && raw.networkId === networkId
    && raw.chainId === network.chainId
    && Array.isArray(raw.contracts)
    && Array.isArray(raw.architectureSlots);
}

function architectureNames(raw: VeyraDeploymentManifest): string[] {
  const declared = new Map<number, string>();
  for (const candidate of raw.architectureSlots) {
    if (!isRecord(candidate) || !Number.isInteger(candidate.slot) || typeof candidate.solidityName !== "string") continue;
    const slot = candidate.slot as number;
    if (slot >= 1 && slot <= ARCHITECTURE_NAMES.length && candidate.solidityName.trim()) {
      declared.set(slot, candidate.solidityName.trim());
    }
  }
  return ARCHITECTURE_NAMES.map((fallback, index) => declared.get(index + 1) ?? fallback);
}

function buildRegistrySnapshot(networkId: NetworkId, input: unknown): RegistrySnapshot {
  const network = resolveRobinhoodNetwork(networkId);
  const raw = isRecord(input) ? input as unknown as VeyraDeploymentManifest : {} as VeyraDeploymentManifest;
  const available = isRegistryAvailable(networkId, raw, network);
  const parsed = parseVerifiedVeyraManifest(networkId, input);
  const names = architectureNames(raw);
  const slots = names.map((name, index): ArchitectureRow => {
    const slotNumber = index + 1;
    if (!available) return { slot: slotNumber, name, status: "REGISTRY UNAVAILABLE" };

    const definition = raw.architectureSlots.find((candidate) => isRecord(candidate)
      && candidate.slot === slotNumber && candidate.solidityName === name);
    const candidate = recordForSlot(raw, slotNumber, name);
    const verified = parsed.roadmapContracts.find((record) => record.name === name && record.architectureSlot === slotNumber);
    if (verified) {
      return {
        slot: slotNumber,
        name,
        status: "DEPLOYED · MANIFEST VERIFIED",
        address: verified.address,
        sourceVerification: sourceLabel(verified.sourceVerification),
        verifiedRecord: verified,
      };
    }

    const candidateAddress = safeAddress(isRecord(candidate) ? candidate.address : undefined)
      ?? safeAddress(isRecord(definition) ? definition.address : undefined);
    if (candidateAddress) return { slot: slotNumber, name, status: "ADDRESS PRESENT · NOT VERIFIED", address: candidateAddress };

    const readiness = isRecord(definition) && typeof definition.readiness === "string" ? definition.readiness : "";
    return {
      slot: slotNumber,
      name,
      status: readiness === "hard_no_go" ? "NOT DEPLOYED · HARD NO-GO" : readiness === "blocked" ? "NOT DEPLOYED · BLOCKED" : "NOT DEPLOYED",
    };
  });

  let anchor: AnchorRow;
  if (!available) {
    anchor = { status: "REGISTRY UNAVAILABLE" };
  } else {
    const rawAnchor = raw.standaloneResearchEvidenceAnchor;
    const verifiedAnchor = parsed.standaloneResearchEvidenceAnchor;
    if (verifiedAnchor) {
      anchor = {
        status: "DEPLOYED · MANIFEST VERIFIED",
        address: verifiedAnchor.address,
        transactionHash: verifiedAnchor.transactionHash,
        blockNumber: verifiedAnchor.blockNumber,
        sourceVerification: sourceLabel(verifiedAnchor.sourceVerification),
        verifiedRecord: verifiedAnchor,
      };
    } else if (isRecord(rawAnchor) && safeAddress(rawAnchor.address)) {
      anchor = { status: "ADDRESS PRESENT · NOT VERIFIED", address: safeAddress(rawAnchor.address) };
    } else {
      anchor = { status: "NOT DEPLOYED" };
    }
  }

  return {
    networkId,
    network,
    available,
    slots,
    anchor,
    verifiedDeployments: parsed.roadmapContracts,
  };
}

function emitProgress(progress: ProgressHandler | undefined, label: string, state: ProgressState): void {
  progress?.({ label, state });
}

async function withProgress<T>(label: string, progress: ProgressHandler | undefined, action: () => Promise<T>): Promise<T> {
  emitProgress(progress, label, "running");
  try {
    const result = await action();
    emitProgress(progress, label, "complete");
    return result;
  } catch (error) {
    emitProgress(progress, label, "failed");
    throw error;
  }
}

async function requestRpc(
  network: NetworkOption,
  method: string,
  params: unknown[],
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(network.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(9_000),
    });
  } catch (error) {
    const code = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
      ? "rpc_timeout"
      : "rpc_unavailable";
    throw new ReadOnlyRpcError(code);
  }

  if (!response.ok) throw new ReadOnlyRpcError("rpc_http_error", response.status);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ReadOnlyRpcError("rpc_invalid_response");
  }
  if (!isRecord(payload) || payload.jsonrpc !== "2.0" || payload.id !== 1 || "error" in payload) {
    throw new ReadOnlyRpcError("rpc_error");
  }
  if (!("result" in payload)) throw new ReadOnlyRpcError("rpc_invalid_response");
  return payload.result;
}

function parseHexQuantity(value: unknown): bigint | undefined {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function statusForRpcError(error: unknown, network: NetworkOption, observedChainId: string): NetworkResult {
  if (error instanceof ReadOnlyRpcError && error.code === "rpc_chain_id_mismatch") {
    return {
      status: "CHAIN MISMATCH",
      observedChainId: String(error.observedChainId ?? "Unavailable"),
      latestBlock: "Unavailable",
      detail: `Expected chain ${network.chainId}; observed ${error.observedChainId ?? "unknown"}. No block or deployment checks followed.`,
      liveAnchorCheck: "NOT CHECKED",
    };
  }
  const code = error instanceof ReadOnlyRpcError ? error.code : "rpc_unavailable";
  const status = error instanceof ReadOnlyRpcError && error.httpStatus
    ? `ACCESS FAILURE · HTTP ${error.httpStatus}`
    : `ACCESS FAILURE · ${code}`;
  return {
    status,
    observedChainId,
    latestBlock: "Unavailable",
    detail: "RPC preflight did not complete. No deployment or transaction action was attempted.",
    liveAnchorCheck: "NOT CHECKED",
  };
}

async function verifyOnChain(
  record: VerifiedVeyraDeployment | VerifiedVeyraStandaloneDeployment,
  network: NetworkOption,
  fetchImpl: typeof fetch,
): Promise<string> {
  try {
    const receiptValue = await requestRpc(network, "eth_getTransactionReceipt", [record.transactionHash], fetchImpl);
    if (!isRecord(receiptValue)) return "LIVE CHECK UNAVAILABLE · RECEIPT NOT RETURNED";
    const transactionHash = typeof receiptValue.transactionHash === "string" ? receiptValue.transactionHash : "";
    const contractAddress = safeAddress(receiptValue.contractAddress);
    const receiptBlock = parseHexQuantity(receiptValue.blockNumber);
    if (receiptValue.status !== "0x1" || transactionHash.toLowerCase() !== record.transactionHash.toLowerCase()
      || contractAddress?.toLowerCase() !== record.address.toLowerCase() || receiptBlock === undefined
      || receiptBlock !== BigInt(record.blockNumber)) {
      return "LIVE CHECK MISMATCH · RECEIPT";
    }

    const codeValue = await requestRpc(network, "eth_getCode", [record.address, `0x${receiptBlock.toString(16)}`], fetchImpl);
    if (typeof codeValue !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(codeValue) || codeValue === "0x") {
      return "LIVE CHECK MISMATCH · BYTECODE UNAVAILABLE";
    }
    if (keccak256(codeValue as Hex).toLowerCase() !== record.runtimeBytecodeHash.toLowerCase()) {
      return "LIVE CHECK MISMATCH · BYTECODE HASH";
    }
    return "LIVE RECEIPT + BYTECODE MATCH";
  } catch (error) {
    const code = error instanceof ReadOnlyRpcError ? error.code : "rpc_unavailable";
    return `LIVE CHECK UNAVAILABLE · ${code.toUpperCase()}`;
  }
}

function formatRegistry(
  frame: ReturnType<typeof createFrame>,
  registry: RegistrySnapshot,
  sectionNumber: string,
  liveAnchorCheck: string,
): void {
  const { addBorder, section, row, note } = frame;
  section(sectionNumber, `${registry.network.label.toUpperCase()} 10-CONTRACT ARCHITECTURE REGISTRY · CHAIN ${registry.network.chainId}`);
  if (!registry.available) note("Deployment manifest failed schema, network, or chain identity checks.");
  row("Architecture slots", `${registry.slots.filter((slot) => slot.status === "DEPLOYED · MANIFEST VERIFIED").length}/10 manifest-verified`, "muted");
  for (const slot of registry.slots) {
    const tone = slot.status.startsWith("DEPLOYED") ? "good" : slot.status.startsWith("NOT DEPLOYED") ? "warn" : "bad";
    frame.boxLine(`SLOT ${String(slot.slot).padStart(2, "0")} · ${slot.name} · ${slot.status}`, "left", tone);
    if (slot.address) row("  Registry address", slot.address, "muted");
    if (slot.sourceVerification) row("  Source verification", slot.sourceVerification, slot.sourceVerification === "VERIFIED" ? "good" : "warn");
  }
  addBorder();

  section(`${Number(sectionNumber) + 1}`.padStart(2, "0"), `STANDALONE ${registry.networkId.toUpperCase()} EVIDENCE ANCHOR · CHAIN ${registry.network.chainId}`);
  row("Contract", "VeyraResearchEvidenceAnchor");
  const anchorTone = registry.anchor.status.startsWith("DEPLOYED") ? "good" : registry.anchor.status === "NOT DEPLOYED" ? "warn" : "bad";
  row("Deployment status", registry.anchor.status, anchorTone);
  if (registry.anchor.address) row("Address", registry.anchor.address, "good");
  if (registry.anchor.transactionHash) row("Transaction", registry.anchor.transactionHash, "muted");
  if (registry.anchor.blockNumber) row("Deployment block", registry.anchor.blockNumber, "muted");
  if (registry.anchor.sourceVerification) {
    row("Source verification", registry.anchor.sourceVerification, registry.anchor.sourceVerification === "VERIFIED" ? "good" : "warn");
  }
  if (registry.networkId === "testnet" && registry.anchor.verifiedRecord) row("Current RPC evidence", liveAnchorCheck, liveAnchorCheck === "LIVE RECEIPT + BYTECODE MATCH" ? "good" : "warn");
  note("This utility is separate from architecture slot 10.");
  addBorder();
}

function formatReadiness(
  network: NetworkOption,
  registries: Record<NetworkId, RegistrySnapshot>,
  networkResult: NetworkResult,
  projectName: string,
  options: Required<Pick<SimulationOptions, "color" | "colorDepth" | "columns">>,
): string {
  const frame = createFrame(options.columns, options.color, options.colorDepth);
  const { rows, addBorder, boxLine, centeredWordmark, section, row, note } = frame;
  const testnet = registries.testnet;
  const mainnet = registries.mainnet;
  const verifiedTestnetSlots = testnet.slots.filter((slot) => slot.status === "DEPLOYED · MANIFEST VERIFIED").length;
  const verifiedMainnetSlots = mainnet.slots.filter((slot) => slot.status === "DEPLOYED · MANIFEST VERIFIED").length;

  addBorder("=");
  boxLine("");
  centeredWordmark(projectName);
  boxLine("");
  boxLine("VEYRA / ROBINHOOD NETWORK READINESS", "center", "plain");
  boxLine(`${network.label.toUpperCase()}  |  EXPECTED CHAIN ${network.chainId}`, "center", "brand");
  boxLine("READ-ONLY NETWORK AND DEPLOYMENT STATUS", "center", "plain");
  boxLine("STATUS DISPLAY ONLY — NO TRANSACTION IS SIMULATED", "center", "muted");
  addBorder("=");

  section("01", "LIVE NETWORK VALIDATION");
  row("RPC connectivity", networkResult.status, networkResult.status === "AVAILABLE" ? "good" : "bad");
  row("Observed chain ID", networkResult.observedChainId, networkResult.observedChainId === String(network.chainId) ? "good" : "warn");
  row("Expected chain ID", String(network.chainId));
  row("Latest block", networkResult.latestBlock, networkResult.latestBlock === "Unavailable" ? "warn" : "good");
  if (networkResult.detail) note(networkResult.detail);
  addBorder();

  formatRegistry(frame, testnet, "02", networkResult.liveAnchorCheck);
  formatRegistry(frame, mainnet, "04", "NOT CHECKED");

  section("06", "THREE CORE PRODUCT PILLARS");
  row("A · Post-Quantum Smart Account", "BLOCKED — ML-DSA security remains NO-GO; the EVM wallet remains read-only.", "bad");
  row("B · Simple Swap + Intent Lock", "PARTIAL — input validation and intent comparison exist; no verified quote route or execution.", "warn");
  row("C · Autonomous Security Swarm", "HISTORICAL COMPLETE REPORT — current new-run readiness requires an authenticated capability check.", "warn");
  row("Historical three-agent report", "COMPLETED (historical evidence; not a new run)", "good");
  row("New research runs", "READINESS CHECK REQUIRED", "warn");
  addBorder();

  section("07", "FINAL READINESS SUMMARY");
  row("Testnet architecture", `${verifiedTestnetSlots}/10 manifest-verified`, verifiedTestnetSlots === 10 ? "good" : "warn");
  row("Mainnet architecture", `${verifiedMainnetSlots}/10 manifest-verified`, verifiedMainnetSlots === 10 ? "good" : "warn");
  row("Testnet Evidence Anchor", testnet.anchor.status, testnet.anchor.status.startsWith("DEPLOYED") ? "good" : "warn");
  row("Mainnet Evidence Anchor", mainnet.anchor.status, mainnet.anchor.status === "NOT DEPLOYED" ? "warn" : "good");
  row("Transaction signing", "NOT PERFORMED", "muted");
  row("Broadcast", "DISABLED", "bad");
  addBorder("=");
  boxLine("THIS IS A READ-ONLY STATUS DISPLAY; NO TRANSACTION IS SIMULATED.", "center", "plain");
  boxLine("NO PRIVATE KEY LOADED · NO SIGNATURE REQUESTED · NO TRANSACTION BROADCAST", "center", "muted");
  addBorder("=");

  return `${rows.join("\n")}\n`;
}

export function shouldAnimateTerminal(isTTY: boolean, env: Record<string, string | undefined>): boolean {
  return isTTY && env.NO_COLOR === undefined && env.TERM !== "dumb";
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

function terminalProgressHandler(): ProgressHandler {
  const frames = ["|", "/", "-", "\\"];
  let timer: ReturnType<typeof setInterval> | undefined;
  let currentLabel = "";
  let frame = 0;
  const clear = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };
  return (event) => {
    if (event.state === "running") {
      clear();
      currentLabel = event.label;
      frame = 0;
      process.stdout.write(`\r[${frames[frame]}] ${currentLabel}`);
      timer = setInterval(() => {
        frame = (frame + 1) % frames.length;
        process.stdout.write(`\r[${frames[frame]}] ${currentLabel}`);
      }, 90);
      timer.unref();
      return;
    }
    clear();
    process.stdout.write(`\r[${event.state === "complete" ? "OK" : "FAIL"}] ${currentLabel}\n`);
  };
}

export async function simulateDeployment(
  networkId: NetworkId,
  options: SimulationOptions = {},
): Promise<{ exitCode: number; output: string }> {
  const network = resolveRobinhoodNetwork(networkId);
  const color = options.color ?? Boolean(process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb");
  const colorDepth = options.colorDepth ?? (process.env.COLORTERM === "truecolor" || process.env.COLORTERM === "24bit"
    ? "truecolor"
    : (process.env.TERM ?? "").includes("256color") ? "256" : "16");
  const projectName = options.projectName ?? process.env.NEXT_PUBLIC_PROJECT_NAME ?? "VEYRA";
  const columns = options.columns ?? process.stdout.columns ?? 100;
  const fetchImpl = options.fetchImpl ?? fetch;
  let exitCode = 0;
  let networkResult: NetworkResult = {
    status: "ACCESS FAILURE · rpc_unavailable",
    observedChainId: "Unavailable",
    latestBlock: "Unavailable",
    detail: "RPC preflight did not complete. No deployment or transaction action was attempted.",
    liveAnchorCheck: "NOT CHECKED",
  };
  let observedChainId = "Unavailable";

  try {
    const chainId = await withProgress("Robinhood RPC chain ID", options.onProgress, async () => {
      const rawChainId = await requestRpc(network, "eth_chainId", [], fetchImpl);
      const value = parseHexQuantity(rawChainId);
      if (value === undefined || value <= BigInt(0)) throw new ReadOnlyRpcError("rpc_invalid_response");
      observedChainId = value.toString();
      if (value !== BigInt(network.chainId)) throw new ReadOnlyRpcError("rpc_chain_id_mismatch", undefined, Number(value));
      return value;
    });
    const latestBlock = await withProgress("Latest block", options.onProgress, async () => {
      const rawBlock = await requestRpc(network, "eth_blockNumber", [], fetchImpl);
      const block = parseHexQuantity(rawBlock);
      if (block === undefined) throw new ReadOnlyRpcError("rpc_invalid_response");
      return block.toString();
    });
    const registries = await withProgress("Inspect Testnet and Mainnet registries", options.onProgress, async () => ({
      testnet: buildRegistrySnapshot("testnet", testnetManifest),
      mainnet: buildRegistrySnapshot("mainnet", mainnetManifest),
    }));

    let liveAnchorCheck = "NOT CHECKED";
    if (networkId === "testnet" && registries.testnet.anchor.verifiedRecord) {
      liveAnchorCheck = await withProgress("Verify Testnet Evidence Anchor", options.onProgress, () =>
        verifyOnChain(registries.testnet.anchor.verifiedRecord!, network, fetchImpl));
    } else if (networkId === "mainnet") {
      for (const record of registries.mainnet.verifiedDeployments) {
        await withProgress(`Verify ${record.name}`, options.onProgress, () => verifyOnChain(record, network, fetchImpl));
      }
    }

    networkResult = {
      status: "AVAILABLE",
      observedChainId: chainId.toString(),
      latestBlock,
      detail: "The selected Robinhood RPC returned the expected chain ID and latest block.",
      liveAnchorCheck,
    };
  } catch (error) {
    exitCode = 1;
    networkResult = statusForRpcError(error, network, observedChainId);
  }

  const registries = {
    testnet: buildRegistrySnapshot("testnet", testnetManifest),
    mainnet: buildRegistrySnapshot("mainnet", mainnetManifest),
  };
  return {
    exitCode,
    output: formatReadiness(network, registries, networkResult, projectName, {
      color,
      colorDepth,
      columns,
    }),
  };
}

export async function main(args: string[]): Promise<number> {
  try {
    const { networkId } = parseDeploymentArgs(args);
    const onProgress = shouldAnimateTerminal(Boolean(process.stdout.isTTY), process.env) ? terminalProgressHandler() : undefined;
    const result = await simulateDeployment(networkId, { onProgress });
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
