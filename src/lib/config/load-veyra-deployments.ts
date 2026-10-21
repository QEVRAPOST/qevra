import "server-only";
import mainnetManifest from "../../../contracts/deployments/robinhood-mainnet.json";
import testnetManifest from "../../../contracts/deployments/robinhood-testnet.json";
import { parseVerifiedVeyraManifest } from "./veyra-deployment-manifest";
import type { VerifiedVeyraDeployment } from "./veyra-deployments";

/**
 * Read the chain-specific manifests bundled with the server build. Manifest additions
 * require no UI source edits and are revalidated before records are sent to the client.
 */
export function loadVerifiedVeyraDeployments(): VerifiedVeyraDeployment[] {
  return [
    ...parseVerifiedVeyraManifest("testnet", testnetManifest),
    ...parseVerifiedVeyraManifest("mainnet", mainnetManifest),
  ];
}
