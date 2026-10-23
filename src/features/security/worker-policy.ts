import type { ProviderConfiguration } from "./provider";

/** Leave queued rows untouched while provider execution is disabled or misconfigured. */
export async function claimNextRunWhenProviderReady<T>(
  provider: ProviderConfiguration,
  claimNextRun: () => Promise<T | undefined>,
): Promise<T | undefined> {
  if (provider.status !== "available") return undefined;
  return claimNextRun();
}
