import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { keccak256, type Hex } from "viem";
import { parseVerifiedVeyraManifest, type VeyraDeploymentManifest } from "@/lib/config/veyra-deployment-manifest";
import { isSwapExecutionInactiveSlot, type VerifiedVeyraDeployment, type VerifiedVeyraStandaloneDeployment } from "@/lib/config/veyra-deployments";
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
type NetworkSelection = NetworkId | "all";

type SimulationOptions = {
  projectName?: string;
  color?: boolean;
  colorDepth?: "16" | "256" | "truecolor";
  columns?: number;
  fetchImpl?: typeof fetch;
  /** Manifest override for focused tests; production reads the checked-in files at runtime. */
  deploymentManifests?: Partial<Record<NetworkId, unknown>>;
  onProgress?: ProgressHandler;
};

type DeploymentStatus = "DEPLOYED · MANIFEST VERIFIED" | "DEPLOYED · INACTIVE" | "ADDRESS PRESENT · NOT VERIFIED" | "NOT DEPLOYED" | "REGISTRY UNAVAILABLE";

type ArchitectureRow = {
  slot: number;
  name: string;
  status: DeploymentStatus;
  readiness: string;
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
  liveChecks: Array<{ name: string; status: string }>;
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

function readinessLabel(value: unknown): string {
  if (value === "hard_no_go") return "SECURITY NO-GO";
  if (value === "blocked") return "PENDING REVIEW";
  if (typeof value !== "string" || !value.trim()) return "NOT ASSESSED";
  return value.trim().replaceAll("_", " ").toUpperCase();
}

function deploymentTone(status: DeploymentStatus): "good" | "warn" | "bad" {
  if (status === "DEPLOYED · MANIFEST VERIFIED" || status === "DEPLOYED · INACTIVE") return "good";
  if (status === "REGISTRY UNAVAILABLE") return "bad";
  return "warn";
}

function verifiedDeploymentStatusForSlot(slot: number): DeploymentStatus {
  // Swap infrastructure can be deployed while swap execution remains disabled.
  return isSwapExecutionInactiveSlot(slot) ? "DEPLOYED · INACTIVE" : "DEPLOYED · MANIFEST VERIFIED";
}

function readinessTone(readiness: string): "good" | "warn" | "bad" | "muted" {
  if (readiness === "SECURITY NO-GO") return "bad";
  if (readiness === "PENDING REVIEW" || readiness === "NOT DEPLOYED") return "warn";
  if (readiness === "NOT ASSESSED") return "muted";
  return "good";
}

function liveCheckTone(status: string): "good" | "warn" | "bad" | "muted" {
  if (status === "LIVE RECEIPT + BYTECODE MATCH") return "good";
  if (status.includes("MISMATCH")) return "bad";
  if (status.includes("UNAVAILABLE")) return "warn";
  return "muted";
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
  for (const candidate of Array.isArray(raw.architectureSlots) ? raw.architectureSlots : []) {
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
    const definition = Array.isArray(raw.architectureSlots)
      ? raw.architectureSlots.find((candidate) => isRecord(candidate)
        && candidate.slot === slotNumber && candidate.solidityName === name)
      : undefined;
    const readiness = readinessLabel(isRecord(definition) ? definition.readiness : undefined);
    if (!available) return { slot: slotNumber, name, status: "REGISTRY UNAVAILABLE", readiness };

    const candidate = recordForSlot(raw, slotNumber, name);
    const verified = parsed.roadmapContracts.find((record) => record.name === name && record.architectureSlot === slotNumber);
    if (verified) {
      return {
        slot: slotNumber,
        name,
        status: verifiedDeploymentStatusForSlot(slotNumber),
        readiness,
        address: verified.address,
        sourceVerification: sourceLabel(verified.sourceVerification),
        verifiedRecord: verified,
      };
    }

    const candidateAddress = safeAddress(isRecord(candidate) ? candidate.address : undefined)
      ?? safeAddress(isRecord(definition) ? definition.address : undefined);
    if (candidateAddress) return { slot: slotNumber, name, status: "ADDRESS PRESENT · NOT VERIFIED", readiness };

    return {
      slot: slotNumber,
      name,
      status: "NOT DEPLOYED",
      readiness,
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
      anchor = { status: "ADDRESS PRESENT · NOT VERIFIED" };
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
      liveChecks: [],
    };
  }
  const code = error instanceof ReadOnlyRpcError ? error.code : "rpc_unavailable";
  const status = error instanceof ReadOnlyRpcError && error.httpStatus
    ? `RPC UNAVAILABLE · HTTP ${error.httpStatus}`
    : `RPC UNAVAILABLE · ${code}`;
  return {
    status,
    observedChainId,
    latestBlock: "Unavailable",
    detail: "RPC preflight did not complete. No deployment or transaction action was attempted.",
    liveAnchorCheck: "NOT CHECKED",
    liveChecks: [],
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

function loadDeploymentManifest(networkId: NetworkId): unknown {
  try {
    const fileUrl = new URL(`../contracts/deployments/robinhood-${networkId}.json`, import.meta.url);
    return JSON.parse(readFileSync(fileUrl, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function networkIdsForSelection(selection: NetworkSelection): NetworkId[] {
  return selection === "all" ? ["testnet", "mainnet"] : [selection];
}

function formatRegistry(
  frame: ReturnType<typeof createFrame>,
  registry: RegistrySnapshot,
  sectionNumber: string,
  networkResult: NetworkResult,
): void {
  const { addBorder, section, row, note } = frame;
  section(sectionNumber, `${registry.network.label.toUpperCase()} 10-CONTRACT ARCHITECTURE REGISTRY · CHAIN ${registry.network.chainId}`);
  if (!registry.available) note("Deployment manifest failed schema, network, or chain identity checks.");
  row("Architecture slots", `${registry.verifiedDeployments.length}/10 manifest-verified`, "muted");
  for (const slot of registry.slots) {
    frame.boxLine(`SLOT ${String(slot.slot).padStart(2, "0")} · ${slot.name}`, "left", "plain");
    row("Deployment status", slot.status, deploymentTone(slot.status));
    if (slot.verifiedRecord) row("Manifest evidence", "VERIFIED", "good");
    row("Security readiness", slot.readiness, readinessTone(slot.readiness));
    if (slot.address) row("Verified address", slot.address, "good");
    if (slot.sourceVerification) row("Source verification", slot.sourceVerification, slot.sourceVerification === "VERIFIED" ? "good" : "warn");
    const liveCheck = networkResult.liveChecks.find((check) => check.name === slot.name);
    if (liveCheck) {
      row("Live RPC check", liveCheck.status, liveCheckTone(liveCheck.status));
      if (liveCheck.status.includes("LIVE CHECK UNAVAILABLE")) {
        note("Manifest evidence remains intact; live verification is temporarily unavailable.");
      }
    } else if (slot.verifiedRecord) {
      row("Live RPC check", "NOT RECHECKED THIS RUN", "muted");
    }
  }
  addBorder();

  section(`${Number(sectionNumber) + 1}`.padStart(2, "0"), `STANDALONE ${registry.networkId.toUpperCase()} EVIDENCE ANCHOR · CHAIN ${registry.network.chainId}`);
  row("Contract", "VeyraResearchEvidenceAnchor");
  row("Deployment status", registry.anchor.status, deploymentTone(registry.anchor.status));
  if (registry.anchor.address) row("Verified address", registry.anchor.address, "good");
  if (registry.anchor.transactionHash) row("Transaction", registry.anchor.transactionHash, "muted");
  if (registry.anchor.blockNumber) row("Deployment block", registry.anchor.blockNumber, "muted");
  if (registry.anchor.sourceVerification) {
    row("Source verification", registry.anchor.sourceVerification, registry.anchor.sourceVerification === "VERIFIED" ? "good" : "warn");
  }
  const liveAnchor = networkResult.liveChecks.find((check) => check.name === "VeyraResearchEvidenceAnchor");
  if (liveAnchor) {
    row("Live RPC check", liveAnchor.status, liveCheckTone(liveAnchor.status));
    if (liveAnchor.status.includes("LIVE CHECK UNAVAILABLE")) {
      note("Manifest evidence remains intact; live verification is temporarily unavailable.");
    }
  }
  note("This utility is separate from architecture slot 10.");
  addBorder();
}

function appendTerminalHeader(
  frame: ReturnType<typeof createFrame>,
  selection: NetworkSelection,
  projectName: string,
): void {
  const { addBorder, boxLine, centeredWordmark } = frame;
  const network = selection === "all" ? undefined : resolveRobinhoodNetwork(selection);
  addBorder("=");
  boxLine("");
  centeredWordmark(projectName);
  boxLine("");
  boxLine("VEYRA / ROBINHOOD NETWORK READINESS", "center", "plain");
  boxLine(network
    ? `${network.label.toUpperCase()}  |  EXPECTED CHAIN ${network.chainId}`
    : "ROBINHOOD TESTNET + MAINNET  |  CHAINS 46630 + 4663", "center", "brand");
  boxLine("READ-ONLY NETWORK AND DEPLOYMENT STATUS WALKTHROUGH", "center", "plain");
  boxLine(selection === "mainnet"
    ? "MAINNET READINESS ONLY — NO SIGNING, SPENDING OR BROADCAST"
    : selection === "all"
      ? "READ-ONLY RPC + MANIFEST CHECKS — MAINNET READINESS ONLY; NO DEPLOYMENT SIMULATED"
      : "RPC + MANIFEST READS ONLY — NO FOUNDRY DEPLOYMENT SIMULATED", "center", "muted");
  addBorder("=");
}

function formatTerminalHeader(
  selection: NetworkSelection,
  projectName: string,
  options: Required<Pick<SimulationOptions, "color" | "colorDepth" | "columns">>,
): string {
  const frame = createFrame(options.columns, options.color, options.colorDepth);
  appendTerminalHeader(frame, selection, projectName);
  return `${frame.rows.join("\n")}\n`;
}

function formatReadiness(
  selection: NetworkSelection,
  registries: Partial<Record<NetworkId, RegistrySnapshot>>,
  networkResults: Partial<Record<NetworkId, NetworkResult>>,
  projectName: string,
  options: Required<Pick<SimulationOptions, "color" | "colorDepth" | "columns">>,
): string {
  const frame = createFrame(options.columns, options.color, options.colorDepth);
  const { rows, addBorder, boxLine, section, row, note } = frame;
  const networkIds = networkIdsForSelection(selection);
  const selectedRegistries = networkIds.map((networkId) => registries[networkId]).filter((registry): registry is RegistrySnapshot => Boolean(registry));
  let sectionNumber = 1;

  appendTerminalHeader(frame, selection, projectName);

  for (const registry of selectedRegistries) {
    const network = registry.network;
    const result = networkResults[registry.networkId] ?? {
      status: "RPC UNAVAILABLE · rpc_unavailable",
      observedChainId: "Unavailable",
      latestBlock: "Unavailable",
      detail: "RPC preflight did not complete. No deployment or transaction action was attempted.",
      liveAnchorCheck: "NOT CHECKED",
      liveChecks: [],
    };
    section(String(sectionNumber).padStart(2, "0"), `${network.label.toUpperCase()} LIVE NETWORK VALIDATION`);
    const networkTone = result.status === "AVAILABLE" ? "good" : result.status === "CHAIN MISMATCH" ? "bad" : "warn";
    row("RPC connectivity", result.status, networkTone);
    row("Observed chain ID", result.observedChainId, result.observedChainId === String(network.chainId) ? "good" : "warn");
    row("Expected chain ID", String(network.chainId));
    row("Latest block", result.latestBlock, result.latestBlock === "Unavailable" ? "warn" : "good");
    if (result.detail) note(result.detail);
    addBorder();
    formatRegistry(frame, registry, String(sectionNumber + 1).padStart(2, "0"), result);
    sectionNumber += 3;
  }

  const verifiedByNetwork = new Map(selectedRegistries.map((registry) => [
    registry.networkId,
    registry.verifiedDeployments.length,
  ]));
  section(String(sectionNumber++).padStart(2, "0"), "THREE CORE PRODUCT PILLARS");
  row("A · Post-Quantum Smart Account", "BLOCKED — ML-DSA security remains NO-GO; the EVM wallet remains read-only.", "bad");
  row("B · Simple Swap + Intent Lock", "PARTIAL — input validation and intent comparison exist; no verified quote route or execution.", "warn");
  row("C · Autonomous Security Swarm", "HISTORICAL COMPLETE REPORT — current new-run readiness requires an authenticated capability check.", "warn");
  row("Historical three-agent report", "COMPLETED (historical evidence; not a new run)", "good");
  row("New research runs", "READINESS CHECK REQUIRED", "warn");
  addBorder();

  section(String(sectionNumber).padStart(2, "0"), "FINAL READINESS SUMMARY");
  for (const registry of selectedRegistries) {
    const verifiedSlots = verifiedByNetwork.get(registry.networkId) ?? 0;
    row(`${registry.network.short} architecture`, `${verifiedSlots}/10 manifest-verified`, verifiedSlots === 10 ? "good" : "warn");
    row(`${registry.network.short} Evidence Anchor`, registry.anchor.status, deploymentTone(registry.anchor.status));
  }
  row("Transaction signing", "NOT PERFORMED", "muted");
  row("Broadcast", "DISABLED", "muted");
  addBorder("=");
  boxLine("THIS IS A READ-ONLY STATUS DISPLAY; NO TRANSACTION IS SIMULATED.", "center", "plain");
  boxLine("NO PRIVATE KEY LOADED · NO SIGNATURE REQUESTED · NO TRANSACTION BROADCAST", "center", "muted");
  addBorder("=");

  return `${rows.join("\n")}\n`;
}

export function shouldAnimateTerminal(
  isTTY: boolean,
  env: Record<string, string | undefined>,
  structuredOutput = false,
  fast = false,
): boolean {
  const isTest = env.NODE_ENV === "test"
    || env.NODE_TEST_CONTEXT !== undefined
    || env.JEST_WORKER_ID !== undefined
    || env.VITEST !== undefined
    || env.BUN_TESTING !== undefined;
  return isTTY && !isTest && !structuredOutput && !fast && env.NO_COLOR === undefined && env.TERM !== "dumb";
}

export function parseDeploymentArgs(args: string[]): {
  networkId: NetworkSelection;
  mode: "show" | "simulate";
  fast: boolean;
  speed: number;
  json: boolean;
} {
  let networkId: NetworkSelection | undefined;
  let mode: "show" | "simulate" | undefined;
  let fast = false;
  let speed = 1;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--network") {
      if (networkId) throw new Error("Choose one network only; --network cannot be combined with another network flag.");
      const value = args[index + 1];
      if (value !== "testnet" && value !== "mainnet" && value !== "all") throw new Error("Network must be testnet, mainnet, or all.");
      networkId = value;
      mode = "simulate";
      index += 1;
      continue;
    }
    if (argument === "--testnet" || argument === "--mainnet") {
      if (networkId) throw new Error("--testnet, --mainnet, and --network are mutually exclusive.");
      networkId = argument === "--testnet" ? "testnet" : "mainnet";
      mode = "show";
      continue;
    }
    if (argument === "--fast") {
      fast = true;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--speed") {
      const value = args[index + 1];
      if (!value || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) throw new Error("Speed must be a number between 0.25 and 4.");
      speed = Number(value);
      if (speed < 0.25 || speed > 4) throw new Error("Speed must be between 0.25 and 4.");
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  if (!networkId || !mode) {
    throw new Error("Usage: bun run deploy:show --testnet | --mainnet; legacy: bun run deploy:simulate --network <testnet|mainnet|all> [--fast] [--speed <0.25-4>] [--json]");
  }
  return { networkId, mode, fast, speed, json };
}

function terminalProgressHandler(speed: number): ProgressHandler {
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
      }, Math.max(20, Math.round(90 / speed)));
      timer.unref();
      return;
    }
    clear();
    process.stdout.write(`\r[${event.state === "complete" ? "OK" : "FAIL"}] ${currentLabel}\n`);
  };
}

function revealDelay(line: string): number {
  if (/^[+=-]{20,}$/.test(line.trim())) return 36;
  if (/\b(?:LIVE NETWORK VALIDATION|ROBINHOOD .* REGISTRY|EVIDENCE ANCHOR|CORE PRODUCT PILLARS|FINAL READINESS SUMMARY)\b/.test(line)) return 145;
  if (/SLOT \d+|ADDRESS │|TRANSACTION │|DEPLOYMENT BLOCK │/.test(line)) return 34;
  if (line.includes("#")) return 42;
  return 22;
}

export async function revealTerminalOutput(
  value: string,
  options: {
    speed?: number;
    write?: (value: string) => void;
    wait?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<void> {
  const speed = Number.isFinite(options.speed) && options.speed! > 0 ? options.speed! : 1;
  const write = options.write ?? ((chunk: string) => { process.stdout.write(chunk); });
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const lines = value.split("\n");
  if (lines.at(-1) === "") lines.pop();
  for (const line of lines) {
    await wait(Math.max(4, Math.round(revealDelay(line) / speed)));
    write(`${line}\n`);
  }
}

export async function simulateDeployment(
  networkId: NetworkSelection,
  options: SimulationOptions = {},
): Promise<{ exitCode: number; output: string }> {
  const color = options.color ?? Boolean(process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb");
  const colorDepth = options.colorDepth ?? (process.env.COLORTERM === "truecolor" || process.env.COLORTERM === "24bit"
    ? "truecolor"
    : (process.env.TERM ?? "").includes("256color") ? "256" : "16");
  const projectName = options.projectName ?? process.env.NEXT_PUBLIC_PROJECT_NAME ?? "VEYRA";
  const columns = options.columns ?? process.stdout.columns ?? 100;
  const fetchImpl = options.fetchImpl ?? fetch;
  const selectedIds = networkIdsForSelection(networkId);
  const registries: Partial<Record<NetworkId, RegistrySnapshot>> = {};
  for (const id of selectedIds) {
    const manifest = options.deploymentManifests?.[id] ?? loadDeploymentManifest(id);
    registries[id] = buildRegistrySnapshot(id, manifest);
  }
  let exitCode = 0;
  const networkResults: Partial<Record<NetworkId, NetworkResult>> = {};

  for (const id of selectedIds) {
    const network = resolveRobinhoodNetwork(id);
    const registry = registries[id];
    let observedChainId = "Unavailable";
    try {
      const chainId = await withProgress(`Robinhood ${network.short} RPC chain ID`, options.onProgress, async () => {
        const rawChainId = await requestRpc(network, "eth_chainId", [], fetchImpl);
        const value = parseHexQuantity(rawChainId);
        if (value === undefined || value <= BigInt(0)) throw new ReadOnlyRpcError("rpc_invalid_response");
        observedChainId = value.toString();
        if (value !== BigInt(network.chainId)) throw new ReadOnlyRpcError("rpc_chain_id_mismatch", undefined, Number(value));
        return value;
      });
      const latestBlock = await withProgress(`Robinhood ${network.short} latest block`, options.onProgress, async () => {
        const rawBlock = await requestRpc(network, "eth_blockNumber", [], fetchImpl);
        const block = parseHexQuantity(rawBlock);
        if (block === undefined) throw new ReadOnlyRpcError("rpc_invalid_response");
        return block.toString();
      });

      const recordsToCheck = [
        ...(id === "mainnet" ? registry?.verifiedDeployments ?? [] : []),
        ...(id === "testnet" && registry?.anchor.verifiedRecord ? [registry.anchor.verifiedRecord] : []),
      ];
      const liveChecks: NetworkResult["liveChecks"] = [];
      for (const record of recordsToCheck) {
        const status = await withProgress(`Verify ${record.name} on ${network.short}`, options.onProgress, () =>
          verifyOnChain(record, network, fetchImpl));
        liveChecks.push({ name: record.name, status });
      }

      networkResults[id] = {
        status: "AVAILABLE",
        observedChainId: chainId.toString(),
        latestBlock,
        detail: `The Robinhood ${network.short} RPC returned the expected chain ID and latest block.`,
        liveAnchorCheck: liveChecks.find((check) => check.name === "VeyraResearchEvidenceAnchor")?.status ?? "NOT CHECKED",
        liveChecks,
      };
    } catch (error) {
      exitCode = 1;
      networkResults[id] = statusForRpcError(error, network, observedChainId);
    }
  }

  return {
    exitCode,
    output: formatReadiness(networkId, registries, networkResults, projectName, {
      color,
      colorDepth,
      columns,
    }),
  };
}

export async function main(args: string[]): Promise<number> {
  try {
    const parsed = parseDeploymentArgs(args);
    const animated = shouldAnimateTerminal(Boolean(process.stdout.isTTY), process.env, parsed.json, parsed.fast);
    const color = !parsed.json && Boolean(process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb");
    const colorDepth = process.env.COLORTERM === "truecolor" || process.env.COLORTERM === "24bit"
      ? "truecolor"
      : (process.env.TERM ?? "").includes("256color") ? "256" : "16";
    const columns = process.stdout.columns ?? 100;
    const projectName = process.env.NEXT_PUBLIC_PROJECT_NAME ?? "VEYRA";
    if (animated) {
      await revealTerminalOutput(formatTerminalHeader(parsed.networkId, projectName, { color, colorDepth, columns }), { speed: parsed.speed });
    }
    const result = await simulateDeployment(parsed.networkId, {
      projectName,
      color,
      colorDepth,
      columns,
      ...(animated ? { onProgress: terminalProgressHandler(parsed.speed) } : {}),
    });
    if (parsed.json) {
      const reportLines = result.output.trimEnd().split("\n");
      process.stdout.write(`${JSON.stringify({ networkId: parsed.networkId, exitCode: result.exitCode, reportLines })}\n`);
    } else if (animated) {
      const lines = result.output.split("\n");
      const validationIndex = lines.findIndex((line) => /01 \/ .*LIVE NETWORK VALIDATION/.test(line));
      const bodyStart = validationIndex >= 0 ? validationIndex - 1 : 0;
      await revealTerminalOutput(lines.slice(bodyStart).join("\n"), { speed: parsed.speed });
    } else {
      process.stdout.write(result.output);
    }
    return result.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Deployment readiness showcase failed."}\n`);
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
