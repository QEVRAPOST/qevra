import { NETWORKS } from "./networks";
import type { NetworkId } from "@/types/network";

export interface VerifiedVeyraDeployment {
  name: string;
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
  /** Present only when source verification was independently confirmed. */
  sourceVerification?: "verified";
}

/** No approved or verified VEYRA deployment records currently exist. */
export const VEYRA_DEPLOYMENTS: readonly VerifiedVeyraDeployment[] = [];

/** Require a successful deployment receipt and matching on-chain identity/code observations. */
export function getVerifiedVeyraDeployments(
  networkId: NetworkId,
  records: readonly VerifiedVeyraDeployment[] = VEYRA_DEPLOYMENTS,
): VerifiedVeyraDeployment[] {
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network) return [];
  return records.filter((record) => record.networkId === networkId
    && record.chainId === network.chainId
    && record.observedChainId === network.chainId
    && record.deploymentStatus === "verified"
    && record.receiptStatus === "success"
    && /^0x[0-9a-f]{40}$/i.test(record.address)
    && /^0x[0-9a-f]{40}$/i.test(record.deployerAddress)
    && /^0x[0-9a-f]{64}$/i.test(record.transactionHash)
    && /^0x[0-9a-f]{64}$/i.test(record.runtimeBytecodeHash)
    && !/^0x0{64}$/i.test(record.runtimeBytecodeHash)
    && /^[1-9][0-9]*$/.test(record.blockNumber));
}
