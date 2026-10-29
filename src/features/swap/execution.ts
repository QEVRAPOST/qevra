import { formatEther } from "viem";
import type { MainnetFirmQuote } from "./client";
import { computeQuoteDigest, NATIVE_ETH_ADDRESS, ROBINHOOD_MAINNET_CHAIN_ID, ZEROX_ALLOWANCE_HOLDER, ZEROX_SETTLER_REGISTRY } from "./mainnet";
import type { ReadOnlyEip1193Provider, WalletProviderMethod } from "@/features/wallet/read-only";

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const HEX_QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const HEX_BYTES = /^0x(?:[0-9a-f]{2})*$/i;
const REGISTRY_OWNER_OF_2 = `0x6352211e${"0".repeat(63)}2`;
export const MINIMUM_WALLET_QUOTE_LIFETIME_MS = 10_000;

export class SwapExecutionError extends Error {
  constructor(readonly code: string, message: string, readonly diagnosticCategory?: string) {
    super(message);
    this.name = "SwapExecutionError";
  }
}

export interface SwapExecutionOptions {
  /** Test injection; production uses the same-origin endpoint backed by the configured fixed Mainnet RPC. */
  fetch?: typeof fetch;
  /** Invalidated by UI input, quote, provider, account, or network changes while preflight is running. */
  isContextCurrent?: () => boolean;
  /** Server-clock estimate advanced by a monotonic browser timer. */
  now?: () => number;
  onTiming?: (event: { phase: "wallet_rpc" | "trusted_nonce_rpc" | "validation"; operation: string; durationMs: number; outcome: "success" | "failure"; category?: string }) => void;
  /** Called synchronously immediately before the explicit EIP-1193 transaction request. */
  onWalletRequest?: () => void;
}

function monotonicNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function currentTime(options: SwapExecutionOptions): number {
  return options.now?.() ?? Date.now();
}

function reportTiming(options: SwapExecutionOptions, phase: "wallet_rpc" | "trusted_nonce_rpc" | "validation", operation: string, startedAt: number, outcome: "success" | "failure", category?: string): void {
  options.onTiming?.({ phase, operation, durationMs: Math.max(0, Math.round(monotonicNow() - startedAt)), outcome, ...(category ? { category } : {}) });
}

export type WalletNonceFailureCategory = "method_unsupported" | "invalid_parameters" | "invalid_response" | "timeout" | "provider_error";

function assertContextCurrent(options: SwapExecutionOptions): void {
  if (options.isContextCurrent && !options.isContextCurrent()) {
    throw new SwapExecutionError("swap_context_changed", "The wallet, network, or reviewed quote changed during preflight. Review the current quote and run preflight again.");
  }
}

function providerErrorCode(error: unknown): unknown {
  return error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
}

function walletNonceFailureCategory(error: unknown): WalletNonceFailureCategory {
  if (error instanceof Error && error.name === "NonceRequestTimeout") return "timeout";
  const code = providerErrorCode(error);
  if (code === 4200 || code === -32601) return "method_unsupported";
  if (code === -32602) return "invalid_parameters";
  return "provider_error";
}

const RPC_DIAGNOSTIC_CATEGORIES = new Set([
  "network_not_available", "rpc_timeout", "rpc_unavailable", "rpc_http_error", "rpc_error",
  "rpc_invalid_response", "rpc_chain_id_mismatch", "rpc_invalid_nonce", "rpc_stale_response",
]);

class PendingNonceReadError extends Error {
  constructor(readonly category: string) { super("pending_nonce_read_failed"); }
}

async function readTrustedPendingNonce(
  account: string,
  options: SwapExecutionOptions,
  beforeNonceRead: () => Promise<void>,
): Promise<bigint> {
  await beforeNonceRead();
  const startedAt = monotonicNow();
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(`/api/swap/pending-nonce?address=${encodeURIComponent(account)}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    const category = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "rpc_timeout" : "rpc_unavailable";
    reportTiming(options, "trusted_nonce_rpc", "pending_nonce", startedAt, "failure", category);
    throw new PendingNonceReadError(category);
  }

  let payload: unknown;
  try { payload = await response.json(); } catch { reportTiming(options, "trusted_nonce_rpc", "pending_nonce", startedAt, "failure", "rpc_invalid_response"); throw new PendingNonceReadError("rpc_invalid_response"); }
  if (!response.ok) {
    const errorRecord = payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { code?: unknown } }).error
      : undefined;
    const category = typeof errorRecord?.code === "string" && RPC_DIAGNOSTIC_CATEGORIES.has(errorRecord.code)
      ? errorRecord.code
      : "rpc_unavailable";
    reportTiming(options, "trusted_nonce_rpc", "pending_nonce", startedAt, "failure", category);
    throw new PendingNonceReadError(category);
  }
  if (!payload || typeof payload !== "object") throw new PendingNonceReadError("rpc_invalid_response");
  const snapshot = payload as { networkId?: unknown; chainId?: unknown; address?: unknown; pendingNonce?: unknown; observedAt?: unknown };
  const observedAt = typeof snapshot.observedAt === "string" ? Date.parse(snapshot.observedAt) : Number.NaN;
  if (snapshot.networkId !== "mainnet" || snapshot.chainId !== ROBINHOOD_MAINNET_CHAIN_ID
    || typeof snapshot.address !== "string" || snapshot.address.toLowerCase() !== account.toLowerCase()
    || typeof snapshot.pendingNonce !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(snapshot.pendingNonce)
    || !Number.isFinite(observedAt)) {
    reportTiming(options, "trusted_nonce_rpc", "pending_nonce", startedAt, "failure", "rpc_invalid_response");
    throw new PendingNonceReadError("rpc_invalid_response");
  }
  if (Date.now() - observedAt > 30_000 || observedAt - Date.now() > 30_000) {
    reportTiming(options, "trusted_nonce_rpc", "pending_nonce", startedAt, "failure", "rpc_stale_response");
    throw new PendingNonceReadError("rpc_stale_response");
  }
  reportTiming(options, "trusted_nonce_rpc", "pending_nonce", startedAt, "success");
  return BigInt(snapshot.pendingNonce);
}

async function requestWalletPendingNonce(provider: ReadOnlyEip1193Provider, account: string, options: SwapExecutionOptions): Promise<unknown> {
  const startedAt = monotonicNow();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      provider.request({ method: "eth_getTransactionCount", params: [account, "pending"] }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error("wallet_nonce_timeout"), { name: "NonceRequestTimeout" })), 5_000);
      }),
    ]);
    reportTiming(options, "wallet_rpc", "eth_getTransactionCount", startedAt, "success");
    return result;
  } catch (error) {
    const category = error instanceof Error && error.name === "NonceRequestTimeout" ? "timeout" : providerErrorCode(error) === 4200 || providerErrorCode(error) === -32601 ? "unsupported" : "provider_error";
    reportTiming(options, "wallet_rpc", "eth_getTransactionCount", startedAt, "failure", category);
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function verifyWalletContext(
  provider: ReadOnlyEip1193Provider,
  expectedAccount: string,
  options: SwapExecutionOptions,
): Promise<string> {
  assertContextCurrent(options);
  const account = await getAccountAndChain(provider, expectedAccount, options);
  assertContextCurrent(options);
  return account;
}

async function readVerifiedPendingNonce(
  provider: ReadOnlyEip1193Provider,
  expectedAccount: string,
  options: SwapExecutionOptions,
): Promise<{ nonce: bigint; source: "wallet_and_rpc" | "trusted_rpc_fallback"; walletFailureCategory?: WalletNonceFailureCategory }> {
  const account = await verifyWalletContext(provider, expectedAccount, options);
  let walletNonce: bigint | undefined;
  let walletFailureCategory: WalletNonceFailureCategory | undefined;
  let walletRequestError: unknown;
  try {
    const raw = await requestWalletPendingNonce(provider, account, options);
    walletNonce = asQuantity(raw);
    if (walletNonce === undefined) walletFailureCategory = "invalid_response";
  } catch (error) {
    walletRequestError = error;
    const code = providerErrorCode(error);
    if (code === 4001) throw new SwapExecutionError("wallet_rejected", "The wallet rejected the pending nonce read. No transaction was sent.");
    if (code === 4900 || code === 4901) throw new SwapExecutionError("wallet_disconnected", "The wallet disconnected during nonce verification. Reconnect and review the quote again.");
    if (code === 4100) throw new SwapExecutionError("wallet_not_authorized", "The selected wallet no longer authorizes this account. Reconnect and review the quote again.");
    walletFailureCategory = walletNonceFailureCategory(error);
  }

  // Recheck immediately after the wallet request, including rejected or malformed responses.
  await verifyWalletContext(provider, account, options);
  if (walletRequestError === undefined && walletNonce === undefined && !walletFailureCategory) {
    walletFailureCategory = "invalid_response";
  }

  let rpcNonce: bigint;
  try {
    rpcNonce = await readTrustedPendingNonce(account, options, async () => {
      // The public endpoint independently verifies the fixed RPC reports chain 4663 before reading its nonce.
      await verifyWalletContext(provider, account, options);
    });
  } catch (error) {
    if (error instanceof SwapExecutionError) throw error;
    const category = error instanceof PendingNonceReadError ? error.category : "rpc_unavailable";
    throw new SwapExecutionError(
      "pending_nonce_verification_failed",
      `Pending nonce verification failed against the Robinhood Mainnet RPC (${category}). No transaction was requested.`,
      category,
    );
  }
  await verifyWalletContext(provider, account, options);

  if (walletNonce !== undefined) {
    if (walletNonce !== rpcNonce) {
      throw new SwapExecutionError("pending_nonce_mismatch", "The selected wallet and Robinhood Mainnet RPC report different pending nonces. Refresh the wallet, quote, and intent review before continuing.");
    }
    return { nonce: walletNonce, source: "wallet_and_rpc" };
  }

  return { nonce: rpcNonce, source: "trusted_rpc_fallback", walletFailureCategory: walletFailureCategory ?? "provider_error" };
}

function asAddress(value: unknown): string | undefined {
  return typeof value === "string" && ADDRESS.test(value) ? value : undefined;
}

function asQuantity(value: unknown): bigint | undefined {
  if (typeof value !== "string" || !HEX_QUANTITY.test(value)) return undefined;
  try { return BigInt(value); } catch { return undefined; }
}

function assertQuoteIntegrity(quote: MainnetFirmQuote): void {
  const expectedDigest = computeQuoteDigest({
    chainId: quote.chainId,
    taker: quote.taker,
    sellToken: quote.tokenIn.address,
    buyToken: quote.tokenOut.address,
    sellAmount: quote.amountIn,
    buyAmount: quote.amountOut,
    minimumReceived: quote.minimumReceived,
    slippageBps: quote.slippageBps,
    recipient: quote.recipient,
    allowanceSpender: quote.allowance.spender,
    settlerAddress: quote.settlerAddress,
    quotedAt: quote.quotedAt,
    expiresAt: quote.expiresAt,
    estimatedGas: quote.estimatedGas,
    gasPrice: quote.gasPrice,
    totalNetworkFee: quote.totalNetworkFee,
    fees: quote.fees,
    route: quote.route,
    transaction: quote.transaction,
  });
  if (quote.networkId !== "mainnet" || quote.chainId !== ROBINHOOD_MAINNET_CHAIN_ID
    || quote.taker.toLowerCase() !== quote.recipient.toLowerCase()
    || quote.allowance.requiredAmount !== quote.amountIn
    || quote.transaction.to.toLowerCase() !== quote.execution.to.toLowerCase()
    || quote.transaction.data.toLowerCase() !== quote.execution.data.toLowerCase()
    || quote.transaction.value !== quote.execution.value || quote.transaction.gas !== quote.execution.gas
    || expectedDigest.toLowerCase() !== quote.quoteDigest.toLowerCase()
    || (quote.transaction.to.toLowerCase() !== quote.settlerAddress.toLowerCase()
      && quote.transaction.to.toLowerCase() !== ZEROX_ALLOWANCE_HOLDER.toLowerCase())
    || quote.settlerAddress.toLowerCase() === ZEROX_ALLOWANCE_HOLDER.toLowerCase()
    || (quote.tokenIn.native ? quote.allowance.spender !== null : !quote.allowance.spender || quote.allowance.spender.toLowerCase() !== ZEROX_ALLOWANCE_HOLDER.toLowerCase())
    || (quote.allowance.spender && quote.allowance.spender.toLowerCase() === quote.settlerAddress.toLowerCase())) {
    throw new SwapExecutionError("quote_integrity_failed", "The quote or executable transaction changed after validation. Request and review a fresh quote.");
  }
}

async function request(provider: ReadOnlyEip1193Provider, method: WalletProviderMethod, params?: readonly unknown[], options: SwapExecutionOptions = {}): Promise<unknown> {
  const startedAt = monotonicNow();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const requestPromise = provider.request({ method, ...(params ? { params } : {}) });
    // A send request is never timed out: its outcome may be uncertain and must not be retried.
    const result = method === "eth_sendTransaction" ? await requestPromise : await Promise.race([
      requestPromise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error("wallet_rpc_timeout"), { name: "WalletRpcTimeout" })), 5_000);
      }),
    ]);
    reportTiming(options, "wallet_rpc", method, startedAt, "success");
    return result;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
    const category = error instanceof Error && error.name === "WalletRpcTimeout" ? "timeout" : code === 4001 ? "wallet_rejected" : method === "eth_sendTransaction" ? "submission_unknown" : "provider_error";
    reportTiming(options, "wallet_rpc", method, startedAt, "failure", category);
    if (code === 4001) throw new SwapExecutionError("wallet_rejected", "The wallet request was rejected. No transaction was sent.");
    if (method === "eth_sendTransaction" && code === -32002) {
      throw new SwapExecutionError("wallet_request_pending", "The wallet already has a request pending. Check the wallet popup before trying again.");
    }
    if (method === "eth_sendTransaction") {
      throw new SwapExecutionError("transaction_submission_unknown", "The wallet did not confirm whether it submitted this transaction. Check wallet activity before retrying.");
    }
    throw new SwapExecutionError("wallet_rpc_failed", "The wallet RPC request failed. No transaction was sent.");
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function assertQuoteLifetime(quote: MainnetFirmQuote, minimumLifetimeMs: number, options: SwapExecutionOptions = {}): void {
  const expiry = Date.parse(quote.expiresAt);
  const remaining = expiry - currentTime(options);
  if (!Number.isFinite(expiry) || remaining <= 0) {
    throw new SwapExecutionError("quote_expired", "VEYRA's quote freshness window elapsed before wallet confirmation. Refresh the quote and review the new terms.");
  }
  if (remaining < minimumLifetimeMs) {
    throw new SwapExecutionError("quote_expiring", "Too little time remains on this firm quote to safely open the wallet. Refresh it, review the new terms, and run preflight again.");
  }
}

async function call(provider: ReadOnlyEip1193Provider, to: string, data: string, from?: string, options: SwapExecutionOptions = {}): Promise<string> {
  const raw = await request(provider, "eth_call", [{ to, data, ...(from ? { from } : {}) }, "latest"], options);
  if (typeof raw !== "string" || !/^0x[0-9a-f]+$/i.test(raw)) throw new SwapExecutionError("invalid_rpc_response", "The wallet returned malformed on-chain read data.");
  return raw;
}

async function requireCode(provider: ReadOnlyEip1193Provider, address: string, reason: string, options: SwapExecutionOptions = {}): Promise<void> {
  const code = await request(provider, "eth_getCode", [address, "latest"], options);
  if (typeof code !== "string" || !HEX_BYTES.test(code)) throw new SwapExecutionError("invalid_rpc_response", "The wallet returned malformed contract bytecode.");
  if (code === "0x") throw new SwapExecutionError(reason, "A required Robinhood Mainnet contract has no deployed bytecode.");
}

async function readCurrentSettler(provider: ReadOnlyEip1193Provider, options: SwapExecutionOptions = {}): Promise<string> {
  const [, word] = await Promise.all([
    requireCode(provider, ZEROX_SETTLER_REGISTRY, "settler_registry_not_deployed", options),
    call(provider, ZEROX_SETTLER_REGISTRY, REGISTRY_OWNER_OF_2, undefined, options),
  ]);
  if (!/^0x[0-9a-f]{64}$/i.test(word)) throw new SwapExecutionError("invalid_rpc_response", "The 0x Settler registry returned malformed data.");
  const address = `0x${word.slice(-40)}`;
  if (!asAddress(address)) throw new SwapExecutionError("invalid_rpc_response", "The 0x Settler registry returned an invalid address.");
  await requireCode(provider, address, "settler_not_deployed", options);
  return address;
}

async function getAccountAndChain(provider: ReadOnlyEip1193Provider, expectedAccount: string, options: SwapExecutionOptions = {}): Promise<string> {
  const [accounts, chain] = await Promise.all([
    request(provider, "eth_accounts", undefined, options),
    request(provider, "eth_chainId", undefined, options),
  ]);
  if (!Array.isArray(accounts) || !asAddress(accounts[0]) || accounts[0].toLowerCase() !== expectedAccount.toLowerCase()) {
    throw new SwapExecutionError("wallet_account_changed", "The connected wallet account changed. Review the quote again before signing.");
  }
  if (typeof chain !== "string" || !/^0x[0-9a-f]+$/i.test(chain) || Number.parseInt(chain, 16) !== ROBINHOOD_MAINNET_CHAIN_ID) {
    throw new SwapExecutionError("wallet_chain_mismatch", "Select Robinhood Mainnet (4663) in the wallet before continuing. VEYRA will not switch networks automatically.");
  }
  return accounts[0];
}

export async function switchWalletToRobinhoodMainnet(provider: ReadOnlyEip1193Provider): Promise<void> {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code === 4001) throw new SwapExecutionError("wallet_rejected", "The wallet network switch was rejected. No transaction was sent.");
    if (code !== 4902) throw new SwapExecutionError("network_switch_failed", "The wallet could not switch to Robinhood Mainnet. No transaction was sent.");
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x1237",
          chainName: "Robinhood Chain",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
          blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
        }],
      });
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] });
    } catch (addError) {
      const addCode = addError && typeof addError === "object" && "code" in addError ? (addError as { code?: unknown }).code : undefined;
      throw new SwapExecutionError(addCode === 4001 ? "wallet_rejected" : "network_switch_failed", "Robinhood Mainnet was not selected. No transaction was sent.");
    }
  }
}

export interface SwapPreflightResult {
  status: "ready" | "approval_required";
  quoteDigest: string;
  account: string;
  currentAllowance: bigint;
  tokenBalance: bigint;
  nativeBalance: bigint;
  estimatedGas: bigint;
  gasPrice: bigint;
  feeRequirement: bigint;
  transactionNonce: bigint;
  nonceSource: "wallet_and_rpc" | "trusted_rpc_fallback";
  walletNonceFailureCategory?: WalletNonceFailureCategory;
}

export async function preflightRobinhoodSwap(
  provider: ReadOnlyEip1193Provider,
  quote: MainnetFirmQuote,
  now = Date.now(),
  options: SwapExecutionOptions = {},
): Promise<SwapPreflightResult> {
  const validationStartedAt = monotonicNow();
  let validationOutcome: "success" | "failure" = "success";
  let validationCategory: string | undefined;
  try {
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  if (Date.parse(quote.expiresAt) <= Math.max(now, currentTime(options))) throw new SwapExecutionError("quote_expired", "The quote expired. Request a fresh quote before signing.");
  const account = await verifyWalletContext(provider, quote.taker, options);
  const codeChecks = [
    requireCode(provider, quote.transaction.to, "execution_target_not_deployed", options),
    ...(quote.allowance.spender ? [requireCode(provider, quote.allowance.spender, "allowance_spender_not_deployed", options)] : []),
    ...(quote.tokenIn.native ? [] : [requireCode(provider, quote.tokenIn.address, "sell_token_not_deployed", options)]),
    requireCode(provider, quote.tokenOut.address === NATIVE_ETH_ADDRESS ? quote.tokenIn.address : quote.tokenOut.address, "buy_token_not_deployed", options),
  ];
  const contractStatePromise = Promise.all(codeChecks).then(() => readCurrentSettler(provider, options));
  const nativeBalancePromise = request(provider, "eth_getBalance", [account, "latest"], options);
  const gasPricePromise = request(provider, "eth_gasPrice", undefined, options);
  const tokenStatePromise = (async () => {
    if (quote.tokenIn.native) return { tokenBalance: BigInt(0), currentAllowance: BigInt(quote.allowance.requiredAmount) };
    const spender = quote.allowance.spender;
    if (!spender) throw new SwapExecutionError("allowance_target_missing", "0x did not return an approval target for this ERC-20 quote.");
    const accountWord = account.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    const [decimalsWord, balanceWord, allowanceWord] = await Promise.all([
      call(provider, quote.tokenIn.address, "0x313ce567", undefined, options),
      call(provider, quote.tokenIn.address, `0x70a08231${accountWord}`, undefined, options),
      call(provider, quote.tokenIn.address, `0xdd62ed3e${accountWord}${spender.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`, undefined, options),
    ]);
    if (!/^0x[0-9a-f]{64}$/i.test(decimalsWord) || BigInt(decimalsWord) !== BigInt(quote.tokenIn.decimals)) {
      throw new SwapExecutionError("sell_token_metadata_changed", "The sell token decimals changed or could not be confirmed. No transaction was requested.");
    }
    if (!/^0x[0-9a-f]{64}$/i.test(balanceWord) || !/^0x[0-9a-f]{64}$/i.test(allowanceWord)) {
      throw new SwapExecutionError("invalid_rpc_response", "The wallet returned malformed sell-token balance or allowance data.");
    }
    return { tokenBalance: BigInt(balanceWord), currentAllowance: BigInt(allowanceWord) };
  })();
  const [currentSettler, nativeBalanceResult, gasPriceResult, tokenState] = await Promise.all([
    contractStatePromise, nativeBalancePromise, gasPricePromise, tokenStatePromise,
  ]);
  if (currentSettler.toLowerCase() !== quote.settlerAddress.toLowerCase()) {
    throw new SwapExecutionError("settler_registry_changed", "The 0x Settler registry changed since this quote. Request a fresh quote before continuing.");
  }
  if (quote.allowance.spender && quote.allowance.spender.toLowerCase() === currentSettler.toLowerCase()) {
    throw new SwapExecutionError("forbidden_settler_approval", "The quote names Settler as an approval target. No token approval is permitted.");
  }

  const nativeBalance = asQuantity(nativeBalanceResult);
  if (nativeBalance === undefined) throw new SwapExecutionError("invalid_rpc_response", "The wallet returned a malformed Robinhood ETH balance.");
  const gasPrice = asQuantity(gasPriceResult) ?? (quote.gasPrice ? BigInt(quote.gasPrice) : undefined);
  if (gasPrice === undefined) throw new SwapExecutionError("gas_estimate_unavailable", "The wallet could not provide a current Mainnet gas price.");
  const { currentAllowance, tokenBalance } = tokenState;
  if (!quote.tokenIn.native && tokenBalance < BigInt(quote.amountIn)) throw new SwapExecutionError("insufficient_token_balance", `Insufficient ${quote.tokenIn.symbol} balance for this quote.`);
  const feeRequirement = BigInt(quote.transaction.gas) * gasPrice;
  const executionValue = BigInt(quote.transaction.value);
  if (nativeBalance < feeRequirement + executionValue) {
    throw new SwapExecutionError("insufficient_native_balance", `The wallet needs ETH for the quoted transaction value and estimated gas (${formatEther(feeRequirement)} ETH gas estimate).`);
  }
  if (!quote.tokenIn.native && currentAllowance < BigInt(quote.amountIn)) {
    const nonce = await readVerifiedPendingNonce(provider, account, options);
    assertContextCurrent(options);
    assertQuoteIntegrity(quote);
    if (Date.parse(quote.expiresAt) <= currentTime(options)) throw new SwapExecutionError("quote_expired", "The quote expired during preflight. Request a fresh quote before signing.");
    return { status: "approval_required", quoteDigest: quote.quoteDigest, account, currentAllowance, tokenBalance, nativeBalance, estimatedGas: BigInt(quote.transaction.gas), gasPrice, feeRequirement, transactionNonce: nonce.nonce, nonceSource: nonce.source, ...(nonce.walletFailureCategory ? { walletNonceFailureCategory: nonce.walletFailureCategory } : {}) };
  }
  const [estimateResult, nonce] = await Promise.all([
    request(provider, "eth_estimateGas", [{ from: account, to: quote.transaction.to, data: quote.transaction.data, value: `0x${executionValue.toString(16)}` }], options),
    readVerifiedPendingNonce(provider, account, options),
  ]);
  const estimatedGas = asQuantity(estimateResult);
  if (estimatedGas === undefined || estimatedGas > BigInt(quote.transaction.gas)) {
    throw new SwapExecutionError("quote_gas_changed", "The wallet gas estimate exceeds the firm quote. Refresh and review a new quote.");
  }
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  if (Date.parse(quote.expiresAt) <= currentTime(options)) throw new SwapExecutionError("quote_expired", "The quote expired during preflight. Request a fresh quote before signing.");
  await verifyWalletContext(provider, account, options);
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  if (Date.parse(quote.expiresAt) <= currentTime(options)) throw new SwapExecutionError("quote_expired", "The quote expired during preflight. Request a fresh quote before signing.");
  return { status: "ready", quoteDigest: quote.quoteDigest, account, currentAllowance, tokenBalance, nativeBalance, estimatedGas, gasPrice, feeRequirement, transactionNonce: nonce.nonce, nonceSource: nonce.source, ...(nonce.walletFailureCategory ? { walletNonceFailureCategory: nonce.walletFailureCategory } : {}) };
  } catch (error) {
    validationOutcome = "failure";
    validationCategory = error instanceof SwapExecutionError ? error.code : "unexpected_validation_error";
    throw error;
  } finally {
    reportTiming(options, "validation", "wallet_preflight", validationStartedAt, validationOutcome, validationCategory);
  }
}

export async function approveExactSwapAmount(provider: ReadOnlyEip1193Provider, quote: MainnetFirmQuote, options: SwapExecutionOptions = {}): Promise<{ hash: string; amount: string; spender: string }> {
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  assertQuoteLifetime(quote, MINIMUM_WALLET_QUOTE_LIFETIME_MS, options);
  const spender = quote.allowance.spender;
  if (quote.tokenIn.native || !spender || spender.toLowerCase() !== ZEROX_ALLOWANCE_HOLDER.toLowerCase() || spender.toLowerCase() === quote.settlerAddress.toLowerCase()) {
    throw new SwapExecutionError("approval_target_not_allowed", "Only the 0x API-reported allowance target can receive a bounded token approval; Settler is never an approval target.");
  }
  if (Date.parse(quote.expiresAt) <= currentTime(options)) throw new SwapExecutionError("quote_expired", "The quote expired. Request a new quote before approving tokens.");
  const account = await verifyWalletContext(provider, quote.taker, options);
  await Promise.all([
    requireCode(provider, quote.tokenIn.address, "sell_token_not_deployed", options),
    requireCode(provider, spender, "allowance_spender_not_deployed", options),
  ]);
  const currentSettler = await readCurrentSettler(provider, options);
  if (currentSettler.toLowerCase() !== quote.settlerAddress.toLowerCase() || spender.toLowerCase() === currentSettler.toLowerCase()) {
    throw new SwapExecutionError("approval_target_not_allowed", "The 0x Settler identity changed or matches the reported approval target. No approval was requested.");
  }
  const ownerWord = account.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const spenderWord = spender.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const allowanceWord = await call(provider, quote.tokenIn.address, `0xdd62ed3e${ownerWord}${spenderWord}`, undefined, options);
  if (!/^0x[0-9a-f]{64}$/i.test(allowanceWord)) throw new SwapExecutionError("invalid_rpc_response", "Token allowance could not be checked.");
  if (BigInt(allowanceWord) >= BigInt(quote.amountIn)) return { hash: "", amount: quote.amountIn, spender };
  const amountWord = BigInt(quote.amountIn).toString(16).padStart(64, "0");
  const data = `0x095ea7b3${spenderWord}${amountWord}`;
  const [estimateResult, gasPriceResult, nativeBalanceResult] = await Promise.all([
    request(provider, "eth_estimateGas", [{ from: account, to: quote.tokenIn.address, data, value: "0x0" }], options),
    request(provider, "eth_gasPrice", undefined, options),
    request(provider, "eth_getBalance", [account, "latest"], options),
  ]);
  const estimate = asQuantity(estimateResult);
  const gasPrice = asQuantity(gasPriceResult);
  const nativeBalance = asQuantity(nativeBalanceResult);
  if (estimate === undefined || gasPrice === undefined || nativeBalance === undefined || nativeBalance < estimate * gasPrice) {
    throw new SwapExecutionError("approval_gas_unavailable", "The wallet cannot confirm enough ETH for the approval gas. No transaction was requested.");
  }
  const nonce = await readVerifiedPendingNonce(provider, account, options);
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  if (Date.parse(quote.expiresAt) <= currentTime(options)) throw new SwapExecutionError("quote_expired", "The quote expired during approval preflight. Request a fresh quote before approving tokens.");
  await verifyWalletContext(provider, account, options);
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  assertQuoteLifetime(quote, MINIMUM_WALLET_QUOTE_LIFETIME_MS, options);
  options.onWalletRequest?.();
  const hash = await request(provider, "eth_sendTransaction", [{
    from: account,
    to: quote.tokenIn.address,
    data,
    value: "0x0",
    gas: `0x${estimate.toString(16)}`,
    nonce: `0x${nonce.nonce.toString(16)}`,
  }], options);
  if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) {
    throw new SwapExecutionError("transaction_submission_unknown", "The wallet did not return a valid approval transaction hash. Check wallet activity before retrying.");
  }
  return { hash, amount: quote.amountIn, spender };
}

export async function sendReviewedSwap(provider: ReadOnlyEip1193Provider, quote: MainnetFirmQuote, reviewedPreflight: SwapPreflightResult, options: SwapExecutionOptions = {}): Promise<string> {
  const validationStartedAt = monotonicNow();
  let validationOutcome: "success" | "failure" = "success";
  let validationCategory: string | undefined;
  try {
    assertContextCurrent(options);
    assertQuoteIntegrity(quote);
    assertQuoteLifetime(quote, MINIMUM_WALLET_QUOTE_LIFETIME_MS, options);
    if (reviewedPreflight.status !== "ready" || reviewedPreflight.quoteDigest.toLowerCase() !== quote.quoteDigest.toLowerCase()
      || reviewedPreflight.account.toLowerCase() !== quote.taker.toLowerCase()) {
      throw new SwapExecutionError("preflight_missing", "Run wallet preflight again for this exact quote before confirming the swap.");
    }

    // Preflight already gathered the full read set. Confirm performs one compact, parallel freshness pass,
    // instead of serially repeating preflight and then reading balance, gas, and nonce a second time.
    const account = await verifyWalletContext(provider, quote.taker, options);
    const accountWord = account.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    const spender = quote.allowance.spender;
    const codeChecks = [
      requireCode(provider, quote.transaction.to, "execution_target_not_deployed", options),
      ...(spender ? [requireCode(provider, spender, "allowance_spender_not_deployed", options)] : []),
      ...(quote.tokenIn.native ? [] : [requireCode(provider, quote.tokenIn.address, "sell_token_not_deployed", options)]),
      requireCode(provider, quote.tokenOut.address === NATIVE_ETH_ADDRESS ? quote.tokenIn.address : quote.tokenOut.address, "buy_token_not_deployed", options),
      readCurrentSettler(provider, options),
    ];
    const tokenStatePromise = (async () => {
      if (quote.tokenIn.native) return { tokenBalance: BigInt(0), allowance: BigInt(quote.amountIn) };
      if (!spender) throw new SwapExecutionError("allowance_target_missing", "0x did not return an approval target for this ERC-20 quote.");
      const [decimalsWord, balanceWord, allowanceWord] = await Promise.all([
        call(provider, quote.tokenIn.address, "0x313ce567", undefined, options),
        call(provider, quote.tokenIn.address, `0x70a08231${accountWord}`, undefined, options),
        call(provider, quote.tokenIn.address, `0xdd62ed3e${accountWord}${spender.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`, undefined, options),
      ]);
      if (!/^0x[0-9a-f]{64}$/i.test(decimalsWord) || BigInt(decimalsWord) !== BigInt(quote.tokenIn.decimals)) {
        throw new SwapExecutionError("sell_token_metadata_changed", "The sell token decimals changed or could not be confirmed. No transaction was requested.");
      }
      if (!/^0x[0-9a-f]{64}$/i.test(balanceWord) || !/^0x[0-9a-f]{64}$/i.test(allowanceWord)) {
        throw new SwapExecutionError("invalid_rpc_response", "The wallet returned malformed sell-token balance or allowance data.");
      }
      return { tokenBalance: BigInt(balanceWord), allowance: BigInt(allowanceWord) };
    })();
    const value = BigInt(quote.transaction.value);
    const [currentSettler, nativeBalanceResult, gasPriceResult, estimateResult, finalNonce, tokenState] = await Promise.all([
      Promise.all(codeChecks).then((values) => values[values.length - 1] as string),
      request(provider, "eth_getBalance", [account, "latest"], options),
      request(provider, "eth_gasPrice", undefined, options),
      request(provider, "eth_estimateGas", [{ from: account, to: quote.transaction.to, data: quote.transaction.data, value: `0x${value.toString(16)}` }], options),
      readVerifiedPendingNonce(provider, account, options),
      tokenStatePromise,
    ]);
    const nativeBalance = asQuantity(nativeBalanceResult);
    const currentGasPrice = asQuantity(gasPriceResult);
    const estimatedGas = asQuantity(estimateResult);
    if (currentSettler.toLowerCase() !== quote.settlerAddress.toLowerCase()
      || (spender && spender.toLowerCase() === currentSettler.toLowerCase())) {
      throw new SwapExecutionError("settler_registry_changed", "The 0x Settler registry changed since this quote. Request a fresh quote before continuing.");
    }
    if (nativeBalance === undefined || currentGasPrice === undefined || estimatedGas === undefined) {
      throw new SwapExecutionError("invalid_rpc_response", "The wallet returned incomplete final balance, gas, or simulation data. No transaction was requested.");
    }
    if (estimatedGas > BigInt(quote.transaction.gas)) {
      throw new SwapExecutionError("quote_gas_changed", "The wallet gas estimate exceeds the firm quote. Refresh and review a new quote.");
    }
    if (nativeBalance < value + BigInt(quote.transaction.gas) * currentGasPrice) {
      throw new SwapExecutionError("insufficient_native_balance", "The wallet no longer has enough ETH for this quote's transaction value and gas reserve.");
    }
    if (!quote.tokenIn.native && tokenState.tokenBalance < BigInt(quote.amountIn)) {
      throw new SwapExecutionError("insufficient_token_balance", `Insufficient ${quote.tokenIn.symbol} balance for this quote.`);
    }
    if (!quote.tokenIn.native && tokenState.allowance < BigInt(quote.amountIn)) {
      throw new SwapExecutionError("approval_required", "Approve exactly the sell amount to the verified AllowanceHolder before executing this swap.");
    }
    if (finalNonce.nonce !== reviewedPreflight.transactionNonce) {
      throw new SwapExecutionError("transaction_nonce_changed", "The pending nonce changed during final wallet checks. Review and attest the updated intent again.");
    }
    await verifyWalletContext(provider, quote.taker, options);
    assertContextCurrent(options);
    assertQuoteIntegrity(quote);
    assertQuoteLifetime(quote, MINIMUM_WALLET_QUOTE_LIFETIME_MS, options);
    options.onWalletRequest?.();
    const hash = await request(provider, "eth_sendTransaction", [{
      from: account,
      to: quote.transaction.to,
      data: quote.transaction.data,
      value: `0x${value.toString(16)}`,
      gas: `0x${BigInt(quote.transaction.gas).toString(16)}`,
      nonce: `0x${finalNonce.nonce.toString(16)}`,
    }], options);
    if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) {
      throw new SwapExecutionError("transaction_submission_unknown", "The wallet did not return a valid transaction hash. Check wallet activity before retrying.");
    }
    return hash;
  } catch (error) {
    validationOutcome = "failure";
    validationCategory = error instanceof SwapExecutionError ? error.code : "unexpected_validation_error";
    throw error;
  } finally {
    reportTiming(options, "validation", "final_preflight", validationStartedAt, validationOutcome, validationCategory);
  }
}
