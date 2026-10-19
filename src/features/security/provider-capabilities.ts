import type { ProviderConfiguration } from "./provider";
import type { SecurityResearchCapabilities } from "@/types/integrations";

export function describeProviderState(
  provider: ProviderConfiguration,
): Pick<SecurityResearchCapabilities, "provider" | "providerName" | "unavailableReason"> {
  if (provider.status === "available") {
    return { provider: "available", providerName: `Ready · ${provider.model}` };
  }
  const providerName = provider.reason === "model_provider_credentials_missing"
    ? "Credentials missing"
    : provider.reason === "ai_billing_not_approved"
      ? "Awaiting authorization"
      : "Provider not ready";
  return { provider: "not_configured", providerName, unavailableReason: provider.reason };
}
