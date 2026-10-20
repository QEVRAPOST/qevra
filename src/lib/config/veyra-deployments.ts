import { NETWORKS } from "./networks";
import type { NetworkId } from "@/types/network";

export interface VerifiedVeyraDeployment {
  name: string;
  networkId: NetworkId;
  chainId: number;
  address: `0x${string}`;
  deploymentStatus: "verified";
  /** Present only when source verification was independently confirmed. */
  sourceVerification?: "verified";
}

/** No approved or verified VEYRA deployment records currently exist. */
export const VEYRA_DEPLOYMENTS: readonly VerifiedVeyraDeployment[] = [];

/** Require both a valid EVM address and a chain ID matching the selected network configuration. */
export function getVerifiedVeyraDeployments(
  networkId: NetworkId,
  records: readonly VerifiedVeyraDeployment[] = VEYRA_DEPLOYMENTS,
): VerifiedVeyraDeployment[] {
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network) return [];
  return records.filter((record) => record.networkId === networkId
    && record.chainId === network.chainId
    && record.deploymentStatus === "verified"
    && /^0x[0-9a-f]{40}$/i.test(record.address));
}
