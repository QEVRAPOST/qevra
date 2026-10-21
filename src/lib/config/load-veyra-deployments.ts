import "server-only";
import mainnetManifest from "../../../contracts/deployments/robinhood-mainnet.json";
import testnetManifest from "../../../contracts/deployments/robinhood-testnet.json";
import { parseVerifiedVeyraManifest } from "./veyra-deployment-manifest";
import type { VerifiedVeyraDeployment, VerifiedVeyraStandaloneDeployment } from "./veyra-deployments";

export interface LoadedVeyraDeploymentRegistry {
  roadmapContracts: VerifiedVeyraDeployment[];
  standaloneResearchEvidenceAnchors: VerifiedVeyraStandaloneDeployment[];
}

/**
 * Read the chain-specific manifests bundled with the server build. Manifest additions
 * require no UI source edits and are revalidated before records are sent to the client.
 * The standalone Evidence Anchor is returned separately and never affects roadmap counts.
 */
export function loadVerifiedVeyraDeployments(): LoadedVeyraDeploymentRegistry {
  const testnet = parseVerifiedVeyraManifest("testnet", testnetManifest);
  const mainnet = parseVerifiedVeyraManifest("mainnet", mainnetManifest);
  return {
    roadmapContracts: [...testnet.roadmapContracts, ...mainnet.roadmapContracts],
    standaloneResearchEvidenceAnchors: [
      testnet.standaloneResearchEvidenceAnchor,
      mainnet.standaloneResearchEvidenceAnchor,
    ].filter((record): record is NonNullable<typeof record> => Boolean(record)),
  };
}
