export type SwapQuoteBalanceState = "native_preflight_required" | "unknown" | "insufficient" | "sufficient";
export const MAX_MAINNET_RECEIPT_POLLS = 20;

export interface MonotonicQuoteLifetime {
  expiresAtMs: number;
  serverNowMs: number;
  receivedAtMonotonicMs: number;
}

/** Quote freshness is measured from the API clock and monotonic elapsed browser time, not wall-clock changes. */
export function getQuoteRemainingMs(sample: MonotonicQuoteLifetime, monotonicNow = typeof performance !== "undefined" ? performance.now() : Date.now()): number {
  if (![sample.expiresAtMs, sample.serverNowMs, sample.receivedAtMonotonicMs, monotonicNow].every(Number.isFinite)) return 0;
  return Math.max(0, sample.expiresAtMs - sample.serverNowMs - Math.max(0, monotonicNow - sample.receivedAtMonotonicMs));
}

export function shouldContinueMainnetReceiptPolling(attempts: number): boolean {
  return Number.isSafeInteger(attempts) && attempts >= 0 && attempts < MAX_MAINNET_RECEIPT_POLLS;
}

/** A small generation guard prevents delayed quote or price responses from restoring edited intent data. */
export function createSwapRequestGuard() {
  let generation = 0;
  return {
    begin() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
      return generation;
    },
    isCurrent(requestGeneration: number) {
      return requestGeneration === generation;
    },
  };
}

export function isFirmQuoteExpired(expiresAt: string, now = Date.now()): boolean {
  const expiration = Date.parse(expiresAt);
  return !Number.isFinite(expiration) || expiration <= now;
}

export function getSwapQuoteBalanceState(input: {
  native: boolean;
  actual?: string | null;
  sufficient: boolean;
  amountIn: string;
}): SwapQuoteBalanceState {
  if (input.native) return "native_preflight_required";
  if (!input.sufficient) return "insufficient";
  if (input.actual == null) return "unknown";
  try {
    return BigInt(input.actual) < BigInt(input.amountIn) ? "insufficient" : "sufficient";
  } catch {
    return "unknown";
  }
}

export function canReviewSwapQuote(input: {
  balanceState: SwapQuoteBalanceState;
  expired: boolean;
  contextMatches: boolean;
}): boolean {
  return input.contextMatches && !input.expired && input.balanceState !== "insufficient";
}
