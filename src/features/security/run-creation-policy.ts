import "server-only";
import { isAddress } from "viem";

export const RESEARCH_RUN_OWNER_ALLOWLIST_ENV = "QEVRA_RESEARCH_RUN_OWNER_ALLOWLIST";
export const RESEARCH_RUN_ACCESS_MODE_ENV = "QEVRA_RESEARCH_ACCESS_MODE";

const RUN_LIMIT_ENV = {
  walletCooldownSeconds: "QEVRA_RESEARCH_PER_WALLET_COOLDOWN_SECONDS",
  globalHourlyRunLimit: "QEVRA_RESEARCH_GLOBAL_HOURLY_RUN_LIMIT",
  globalDailyRunLimit: "QEVRA_RESEARCH_GLOBAL_DAILY_RUN_LIMIT",
  maxActiveRuns: "QEVRA_RESEARCH_MAX_ACTIVE_RUNS",
} as const;

export type ResearchRunAccessMode = "owner_only" | "public_limited";

export interface ResearchRunAdmissionLimits {
  walletCooldownSeconds: number;
  globalHourlyRunLimit: number;
  globalDailyRunLimit: number;
  maxActiveRuns: number;
}

export interface ResearchRunAdmissionSnapshot {
  walletCooldownRemainingSeconds: number;
  globalHourlyRuns: number;
  globalDailyRuns: number;
  activeRuns: number;
}

export type ResearchRunAdmissionBlocker =
  | "wallet_cooldown"
  | "global_hourly_quota"
  | "global_daily_quota"
  | "max_active_runs";

export type ResearchRunAdmissionResult =
  | { allowed: true }
  | { allowed: false; reason: ResearchRunAdmissionBlocker };

export type ResearchRunLimitsConfiguration =
  | { status: "available"; limits: ResearchRunAdmissionLimits }
  | { status: "not_configured"; reason: "research_run_limits_not_configured" }
  | { status: "invalid"; reason: "research_run_limits_invalid" };

export type ResearchRunCreationAccess =
  | { allowed: true; mode: ResearchRunAccessMode }
  | { allowed: false; reason: "wallet_authentication_required" | "access_mode_not_configured" | "access_mode_invalid" | "owner_allowlist_not_configured" | "wallet_not_allowed" };

export function resolveResearchRunAccessMode(env: NodeJS.ProcessEnv = process.env): ResearchRunAccessMode | "not_configured" | "invalid" {
  const configured = env[RESEARCH_RUN_ACCESS_MODE_ENV]?.trim();
  if (!configured) return "not_configured";
  if (configured === "owner_only" || configured === "public_limited") return configured;
  return "invalid";
}

export function resolveResearchRunCreationAccess(
  role: "user" | "operator",
  authenticatedWalletAddress: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ResearchRunCreationAccess {
  if (role !== "user" || !authenticatedWalletAddress || !isAddress(authenticatedWalletAddress)) {
    return { allowed: false, reason: "wallet_authentication_required" };
  }

  const mode = resolveResearchRunAccessMode(env);
  if (mode === "not_configured") return { allowed: false, reason: "access_mode_not_configured" };
  if (mode === "invalid") return { allowed: false, reason: "access_mode_invalid" };
  if (mode === "public_limited") return { allowed: true, mode };

  const configured = env[RESEARCH_RUN_OWNER_ALLOWLIST_ENV]?.trim();
  if (!configured) return { allowed: false, reason: "owner_allowlist_not_configured" };

  const addresses = configured.split(",").map((address) => address.trim());
  if (addresses.some((address) => !isAddress(address))) {
    return { allowed: false, reason: "owner_allowlist_not_configured" };
  }

  const isAllowed = addresses.some((address) => address.toLowerCase() === authenticatedWalletAddress.toLowerCase());
  return isAllowed ? { allowed: true, mode } : { allowed: false, reason: "wallet_not_allowed" };
}

export function resolveResearchRunLimits(env: NodeJS.ProcessEnv = process.env): ResearchRunLimitsConfiguration {
  const configured = Object.values(RUN_LIMIT_ENV).map((key) => env[key]?.trim());
  if (configured.some((value) => !value)) {
    return { status: "not_configured", reason: "research_run_limits_not_configured" };
  }
  const values = configured.map((value) => /^\d+$/.test(value ?? "") ? Number(value) : Number.NaN);
  const [walletCooldownSeconds, globalHourlyRunLimit, globalDailyRunLimit, maxActiveRuns] = values;
  if (!values.every(Number.isSafeInteger)
    || walletCooldownSeconds! < 60 || walletCooldownSeconds! > 86_400
    || globalHourlyRunLimit! < 1 || globalHourlyRunLimit! > 20
    || globalDailyRunLimit! < globalHourlyRunLimit! || globalDailyRunLimit! > 60
    || maxActiveRuns! < 1 || maxActiveRuns! > 4) {
    return { status: "invalid", reason: "research_run_limits_invalid" };
  }
  return {
    status: "available",
    limits: { walletCooldownSeconds: walletCooldownSeconds!, globalHourlyRunLimit: globalHourlyRunLimit!, globalDailyRunLimit: globalDailyRunLimit!, maxActiveRuns: maxActiveRuns! },
  };
}

export function evaluateResearchRunAdmission(
  snapshot: ResearchRunAdmissionSnapshot,
  limits: ResearchRunAdmissionLimits,
): ResearchRunAdmissionResult {
  if (snapshot.walletCooldownRemainingSeconds > 0) return { allowed: false, reason: "wallet_cooldown" };
  if (snapshot.globalDailyRuns >= limits.globalDailyRunLimit) return { allowed: false, reason: "global_daily_quota" };
  if (snapshot.globalHourlyRuns >= limits.globalHourlyRunLimit) return { allowed: false, reason: "global_hourly_quota" };
  if (snapshot.activeRuns >= limits.maxActiveRuns) return { allowed: false, reason: "max_active_runs" };
  return { allowed: true };
}
