import "server-only";
import { isAddress } from "viem";

export const RESEARCH_RUN_OWNER_ALLOWLIST_ENV = "QEVRA_RESEARCH_RUN_OWNER_ALLOWLIST";

export type ResearchRunCreationAccess =
  | { allowed: true }
  | { allowed: false; reason: "wallet_authentication_required" | "owner_allowlist_not_configured" | "wallet_not_allowed" };

export function resolveResearchRunCreationAccess(
  role: "user" | "operator",
  authenticatedWalletAddress: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ResearchRunCreationAccess {
  if (role !== "user" || !authenticatedWalletAddress || !isAddress(authenticatedWalletAddress)) {
    return { allowed: false, reason: "wallet_authentication_required" };
  }

  const configured = env[RESEARCH_RUN_OWNER_ALLOWLIST_ENV]?.trim();
  if (!configured) return { allowed: false, reason: "owner_allowlist_not_configured" };

  const addresses = configured.split(",").map((address) => address.trim());
  if (addresses.some((address) => !isAddress(address))) {
    return { allowed: false, reason: "owner_allowlist_not_configured" };
  }

  const isAllowed = addresses.some((address) => address.toLowerCase() === authenticatedWalletAddress.toLowerCase());
  return isAllowed ? { allowed: true } : { allowed: false, reason: "wallet_not_allowed" };
}
