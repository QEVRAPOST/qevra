import { NETWORKS } from "./networks";
import type { NetworkId } from "@/types/network";
import {
  getVerifiedVeyraDeployments,
  type VerifiedVeyraDeployment,
  type VerifiedVeyraDeploymentEvidence,
  type VerifiedVeyraStandaloneDeployment,
} from "./veyra-deployments";

export interface VeyraArchitectureSlot {
  slot: number;
  solidityName: string;
  readiness?: string;
  reason?: string;
  address?: string;
}

export interface VeyraDeploymentManifest {
  schema: "veyra-contract-manifest-v1";
  project: "VEYRA";
  networkId: NetworkId;
  chainId: number;
  rpcAlias: string;
  explorerBaseUrl: string;
  deploymentStatus: string;
  sourceVerification: string;
  contracts: unknown[];
  architectureSlots: VeyraArchitectureSlot[];
  standaloneResearchEvidenceAnchor?: unknown;
  preflight?: unknown;
}

/** Candidate evidence fields written into a manifest after the read-only verifier succeeds. */
export interface VeyraDeploymentManifestContract {
  solidityName?: string;
  name?: string;
  purpose?: string;
  networkId?: NetworkId;
  chainId?: number;
  observedChainId?: number;
  address?: string;
  deploymentStatus?: string;
  deployerAddress?: string;
  transactionHash?: string;
  receiptStatus?: string;
  blockNumber?: string;
  runtimeBytecodeHash?: string;
  sourceVerification?: string;
  architectureSlot?: number;
  slot?: number;
}

export interface ParsedVeyraDeploymentManifest {
  /** Verified records mapped by Solidity name to one of the ten architecture slots. */
  roadmapContracts: VerifiedVeyraDeployment[];
  /** The standalone Testnet evidence anchor, kept outside roadmap progress. */
  standaloneResearchEvidenceAnchor?: VerifiedVeyraStandaloneDeployment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : undefined;
}

function evmAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value);
}

function evmHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);
}

function parseVerifiedEvidence(
  networkId: NetworkId,
  manifestChainId: number,
  value: unknown,
): VerifiedVeyraDeploymentEvidence | undefined {
  if (!isRecord(value)) return undefined;
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network || manifestChainId !== network.chainId) return undefined;

  const rowChainId = value.observedChainId ?? value.chainId;
  if ((value.networkId !== undefined && value.networkId !== networkId)
    || (value.chainId !== undefined && value.chainId !== network.chainId)
    || (value.observedChainId !== undefined && value.observedChainId !== network.chainId)
    || (rowChainId !== undefined && rowChainId !== network.chainId)
    || (value.receiptStatus !== undefined && value.receiptStatus !== "success")) {
    return undefined;
  }

  const name = nonEmptyText(value.solidityName, 120) ?? nonEmptyText(value.name, 120);
  const purpose = nonEmptyText(value.purpose, 1000);
  if (!name
    || !evmAddress(value.address)
    || !evmAddress(value.deployerAddress)
    || !evmHash(value.transactionHash)
    || !evmHash(value.runtimeBytecodeHash)
    || /^0x0{64}$/i.test(value.runtimeBytecodeHash)
    || value.deploymentStatus !== "verified"
    || typeof value.blockNumber !== "string"
    || !/^[1-9][0-9]*$/.test(value.blockNumber)) {
    return undefined;
  }

  return {
    name,
    ...(purpose ? { purpose } : {}),
    networkId,
    chainId: network.chainId,
    address: value.address,
    deploymentStatus: "verified",
    /* Verified manifest records may omit these because verification success is represented by deploymentStatus. */
    observedChainId: network.chainId,
    deployerAddress: value.deployerAddress,
    transactionHash: value.transactionHash,
    receiptStatus: "success",
    blockNumber: value.blockNumber,
    runtimeBytecodeHash: value.runtimeBytecodeHash,
    ...(value.sourceVerification === "verified" || value.sourceVerification === "not_verified"
      ? { sourceVerification: value.sourceVerification }
      : {}),
  };
}

function getArchitectureSlotByName(input: unknown): Map<string, number> {
  if (!Array.isArray(input)) return new Map();
  const slots = new Map<string, number>();
  const usedNumbers = new Set<number>();
  for (const raw of input) {
    if (!isRecord(raw)
      || !Number.isInteger(raw.slot)
      || (raw.slot as number) < 1
      || (raw.slot as number) > 10) continue;
    const name = nonEmptyText(raw.solidityName, 120);
    const slot = raw.slot as number;
    if (!name || usedNumbers.has(slot) || slots.has(name)) continue;
    usedNumbers.add(slot);
    slots.set(name, slot);
  }
  return slots;
}

/** Normalize verified deployments from the versioned manifest while keeping the standalone anchor separate. */
export function parseVerifiedVeyraManifest(networkId: NetworkId, input: unknown): ParsedVeyraDeploymentManifest {
  const empty: ParsedVeyraDeploymentManifest = { roadmapContracts: [] };
  if (!isRecord(input)) return empty;
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network
    || input.schema !== "veyra-contract-manifest-v1"
    || input.project !== "VEYRA"
    || input.networkId !== networkId
    || input.chainId !== network.chainId
    || !Array.isArray(input.contracts)
    || !Array.isArray(input.architectureSlots)) {
    return empty;
  }

  const slotByName = getArchitectureSlotByName(input.architectureSlots);
  const roadmapCandidates: VerifiedVeyraDeployment[] = [];
  for (const rawContract of input.contracts) {
    const evidence = parseVerifiedEvidence(networkId, network.chainId, rawContract);
    if (!evidence || !isRecord(rawContract)) continue;
    const slot = slotByName.get(evidence.name);
    const declaredSlot = rawContract.architectureSlot ?? rawContract.slot;
    if (!slot || (declaredSlot !== undefined && declaredSlot !== slot)) continue;
    roadmapCandidates.push({ ...evidence, architectureSlot: slot });
  }

  const standaloneResearchEvidenceAnchor = networkId === "testnet"
    ? parseVerifiedEvidence(networkId, network.chainId, input.standaloneResearchEvidenceAnchor)
    : undefined;
  const standalone = standaloneResearchEvidenceAnchor?.name === "VeyraResearchEvidenceAnchor"
    ? standaloneResearchEvidenceAnchor
    : undefined;

  return {
    roadmapContracts: getVerifiedVeyraDeployments(networkId, roadmapCandidates),
    ...(standalone ? { standaloneResearchEvidenceAnchor: standalone } : {}),
  };
}
