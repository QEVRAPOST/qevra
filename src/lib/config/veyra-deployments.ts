import { NETWORKS } from "./networks";
import type { NetworkId } from "@/types/network";

export interface VerifiedVeyraDeploymentEvidence {
  name: string;
  /** Plain-language purpose supplied by the deployment manifest, when available. */
  purpose?: string;
  networkId: NetworkId;
  chainId: number;
  address: `0x${string}`;
  deploymentStatus: "verified";
  /** Chain ID read from the network used for receipt and bytecode verification. */
  observedChainId: number;
  deployerAddress: `0x${string}`;
  transactionHash: `0x${string}`;
  receiptStatus: "success";
  blockNumber: string;
  /** keccak256 hash of the runtime bytecode observed at address after confirmation. */
  runtimeBytecodeHash: `0x${string}`;
  /** Present when the manifest reports the explorer/source verification result. */
  sourceVerification?: "verified" | "not_verified";
}

export interface VerifiedVeyraDeployment extends VerifiedVeyraDeploymentEvidence {
  /** One of the ten names listed by the chain manifest's architectureSlots. */
  architectureSlot: number;
}

/** Separately listed research utility; it does not consume one of the ten architecture slots. */
export type VerifiedVeyraStandaloneDeployment = VerifiedVeyraDeploymentEvidence;

/** Require a successful deployment receipt and matching on-chain identity/code observations. */
export function getVerifiedVeyraDeployments(
  networkId: NetworkId,
  records: readonly VerifiedVeyraDeployment[] = [],
): VerifiedVeyraDeployment[] {
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network) return [];
  const seenAddresses = new Set<string>();
  const seenSlots = new Set<number>();
  return records.filter((record) => {
    const isVerified = record.networkId === networkId
      && record.chainId === network.chainId
      && Number.isInteger(record.architectureSlot)
      && record.architectureSlot >= 1
      && record.architectureSlot <= 10
      && record.observedChainId === network.chainId
      && record.deploymentStatus === "verified"
      && record.receiptStatus === "success"
      && /^0x[0-9a-f]{40}$/i.test(record.address)
      && /^0x[0-9a-f]{40}$/i.test(record.deployerAddress)
      && /^0x[0-9a-f]{64}$/i.test(record.transactionHash)
      && /^0x[0-9a-f]{64}$/i.test(record.runtimeBytecodeHash)
      && !/^0x0{64}$/i.test(record.runtimeBytecodeHash)
      && /^[1-9][0-9]*$/.test(record.blockNumber);
    if (!isVerified) return false;
    const address = record.address.toLowerCase();
    if (seenAddresses.has(address) || seenSlots.has(record.architectureSlot)) return false;
    seenAddresses.add(address);
    seenSlots.add(record.architectureSlot);
    return true;
  });
}
