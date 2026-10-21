import { NETWORKS } from "./networks";
import type { NetworkId } from "@/types/network";
import { getVerifiedVeyraDeployments, type VerifiedVeyraDeployment } from "./veyra-deployments";

export interface VeyraDeploymentManifest {
  schema: "veyra-contract-manifest-v1";
  project: "VEYRA";
  networkId: NetworkId;
  chainId: number;
  rpcAlias: string;
  explorerBaseUrl: string;
  deploymentStatus: string;
  sourceVerification: string;
  contracts: VeyraDeploymentManifestContract[];
}

/** Candidate manifest entry fields understood by the frontend validator. */
export interface VeyraDeploymentManifestContract {
  solidityName?: string;
  name?: string;
  purpose?: string;
  networkId?: NetworkId;
  chainId?: number;
  address?: string;
  deploymentStatus?: string;
  observedChainId?: number;
  deployerAddress?: string;
  transactionHash?: string;
  receiptStatus?: string;
  blockNumber?: string;
  runtimeBytecodeHash?: string;
  sourceVerification?: string;
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

function parseContract(networkId: NetworkId, value: unknown): VerifiedVeyraDeployment | undefined {
  if (!isRecord(value)) return undefined;
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network) return undefined;
  if (value.networkId !== undefined && value.networkId !== networkId) return undefined;
  if (value.chainId !== undefined && value.chainId !== network.chainId) return undefined;

  const name = nonEmptyText(value.solidityName, 120) ?? nonEmptyText(value.name, 120);
  const purpose = nonEmptyText(value.purpose, 1000);
  if (!name
    || !evmAddress(value.address)
    || !evmAddress(value.deployerAddress)
    || !evmHash(value.transactionHash)
    || !evmHash(value.runtimeBytecodeHash)
    || /^0x0{64}$/i.test(value.runtimeBytecodeHash)
    || value.deploymentStatus !== "verified"
    || value.observedChainId !== network.chainId
    || value.receiptStatus !== "success"
    || typeof value.blockNumber !== "string"
    || !/^[1-9][0-9]*$/.test(value.blockNumber)) {
    return undefined;
  }

  const candidate: VerifiedVeyraDeployment = {
    name,
    ...(purpose ? { purpose } : {}),
    networkId,
    chainId: network.chainId,
    address: value.address,
    deploymentStatus: "verified",
    observedChainId: value.observedChainId,
    deployerAddress: value.deployerAddress,
    transactionHash: value.transactionHash,
    receiptStatus: "success",
    blockNumber: value.blockNumber,
    runtimeBytecodeHash: value.runtimeBytecodeHash,
    ...(value.sourceVerification === "verified" || value.sourceVerification === "not_verified"
      ? { sourceVerification: value.sourceVerification }
      : {}),
  };
  return getVerifiedVeyraDeployments(networkId, [candidate])[0];
}

/** Normalize only verified records from the matching versioned, chain-specific manifest. */
export function parseVerifiedVeyraManifest(networkId: NetworkId, input: unknown): VerifiedVeyraDeployment[] {
  if (!isRecord(input)) return [];
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network
    || input.schema !== "veyra-contract-manifest-v1"
    || input.project !== "VEYRA"
    || input.networkId !== networkId
    || input.chainId !== network.chainId
    || !Array.isArray(input.contracts)) {
    return [];
  }

  const records: VerifiedVeyraDeployment[] = [];
  const seenAddresses = new Set<string>();
  for (const rawContract of input.contracts) {
    const deployment = parseContract(networkId, rawContract);
    if (!deployment) continue;
    const addressKey = deployment.address.toLowerCase();
    if (seenAddresses.has(addressKey)) continue;
    seenAddresses.add(addressKey);
    records.push(deployment);
  }
  return records;
}
