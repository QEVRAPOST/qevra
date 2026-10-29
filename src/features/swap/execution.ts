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
  /** Called synchronously immediately before the explicit EIP-1193 transaction request. */
  onWalletRequest?: () => void;
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
    throw new PendingNonceReadError(category);
  }

  let payload: unknown;
  try { payload = await response.json(); } catch { throw new PendingNonceReadError("rpc_invalid_response"); }
  if (!response.ok) {
    const errorRecord = payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { code?: unknown } }).error
      : undefined;
    const category = typeof errorRecord?.code === "string" && RPC_DIAGNOSTIC_CATEGORIES.has(errorRecord.code)
      ? errorRecord.code
      : "rpc_unavailable";
    throw new PendingNonceReadError(category);
  }
  if (!payload || typeof payload !== "object") throw new PendingNonceReadError("rpc_invalid_response");
  const snapshot = payload as { networkId?: unknown; chainId?: unknown; address?: unknown; pendingNonce?: unknown; observedAt?: unknown };
  const observedAt = typeof snapshot.observedAt === "string" ? Date.parse(snapshot.observedAt) : Number.NaN;
  if (snapshot.networkId !== "mainnet" || snapshot.chainId !== ROBINHOOD_MAINNET_CHAIN_ID
    || typeof snapshot.address !== "string" || snapshot.address.toLowerCase() !== account.toLowerCase()
    || typeof snapshot.pendingNonce !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(snapshot.pendingNonce)
    || !Number.isFinite(observedAt)) {
    throw new PendingNonceReadError("rpc_invalid_response");
  }
  if (Date.now() - observedAt > 30_000 || observedAt - Date.now() > 30_000) throw new PendingNonceReadError("rpc_stale_response");
  return BigInt(snapshot.pendingNonce);
}

async function requestWalletPendingNonce(provider: ReadOnlyEip1193Provider, account: string): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      provider.request({ method: "eth_getTransactionCount", params: [account, "pending"] }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error("wallet_nonce_timeout"), { name: "NonceRequestTimeout" })), 5_000);
      }),
    ]);
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
  const account = await getAccountAndChain(provider, expectedAccount);
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
    const raw = await requestWalletPendingNonce(provider, account);
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

async function request(provider: ReadOnlyEip1193Provider, method: WalletProviderMethod, params?: readonly unknown[]): Promise<unknown> {
  try { return await provider.request({ method, ...(params ? { params } : {}) }); } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code === 4001) throw new SwapExecutionError("wallet_rejected", "The wallet request was rejected. No transaction was sent.");
    if (method === "eth_sendTransaction" && code === -32002) {
      throw new SwapExecutionError("wallet_request_pending", "The wallet already has a request pending. Check the wallet popup before trying again.");
    }
    if (method === "eth_sendTransaction") {
      throw new SwapExecutionError("transaction_submission_unknown", "The wallet did not confirm whether it submitted this transaction. Check wallet activity before retrying.");
    }
    throw new SwapExecutionError("wallet_rpc_failed", "The wallet RPC request failed. No transaction was sent.");
  }
}

function assertQuoteLifetime(quote: MainnetFirmQuote, minimumLifetimeMs: number): void {
  const expiry = Date.parse(quote.expiresAt);
  const remaining = expiry - Date.now();
  if (!Number.isFinite(expiry) || remaining <= 0) {
    throw new SwapExecutionError("quote_expired", "The firm quote expired before wallet confirmation. Refresh it and review the new terms.");
  }
  if (remaining < minimumLifetimeMs) {
    throw new SwapExecutionError("quote_expiring", "Too little time remains on this firm quote to safely open the wallet. Refresh it, review the new terms, and run preflight again.");
  }
}

async function call(provider: ReadOnlyEip1193Provider, to: string, data: string, from?: string): Promise<string> {
  const raw = await request(provider, "eth_call", [{ to, data, ...(from ? { from } : {}) }, "latest"]);
  if (typeof raw !== "string" || !/^0x[0-9a-f]+$/i.test(raw)) throw new SwapExecutionError("invalid_rpc_response", "The wallet returned malformed on-chain read data.");
  return raw;
}

async function requireCode(provider: ReadOnlyEip1193Provider, address: string, reason: string): Promise<void> {
  const code = await request(provider, "eth_getCode", [address, "latest"]);
  if (typeof code !== "string" || !HEX_BYTES.test(code)) throw new SwapExecutionError("invalid_rpc_response", "The wallet returned malformed contract bytecode.");
  if (code === "0x") throw new SwapExecutionError(reason, "A required Robinhood Mainnet contract has no deployed bytecode.");
}

async function readCurrentSettler(provider: ReadOnlyEip1193Provider): Promise<string> {
  await requireCode(provider, ZEROX_SETTLER_REGISTRY, "settler_registry_not_deployed");
  const word = await call(provider, ZEROX_SETTLER_REGISTRY, REGISTRY_OWNER_OF_2);
  if (!/^0x[0-9a-f]{64}$/i.test(word)) throw new SwapExecutionError("invalid_rpc_response", "The 0x Settler registry returned malformed data.");
  const address = `0x${word.slice(-40)}`;
  if (!asAddress(address)) throw new SwapExecutionError("invalid_rpc_response", "The 0x Settler registry returned an invalid address.");
  await requireCode(provider, address, "settler_not_deployed");
  return address;
}

async function getAccountAndChain(provider: ReadOnlyEip1193Provider, expectedAccount: string): Promise<string> {
  const [accounts, chain] = await Promise.all([
    request(provider, "eth_accounts"),
    request(provider, "eth_chainId"),
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
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  if (Date.parse(quote.expiresAt) <= now) throw new SwapExecutionError("quote_expired", "The quote expired. Request a fresh quote before signing.");
  const account = await verifyWalletContext(provider, quote.taker, options);
  await Promise.all([
    requireCode(provider, quote.transaction.to, "execution_target_not_deployed"),
    ...(quote.allowance.spender ? [requireCode(provider, quote.allowance.spender, "allowance_spender_not_deployed")] : []),
    ...(quote.tokenIn.native ? [] : [requireCode(provider, quote.tokenIn.address, "sell_token_not_deployed")]),
    requireCode(provider, quote.tokenOut.address === NATIVE_ETH_ADDRESS ? quote.tokenIn.address : quote.tokenOut.address, "buy_token_not_deployed"),
  ]);
  const currentSettler = await readCurrentSettler(provider);
  if (currentSettler.toLowerCase() !== quote.settlerAddress.toLowerCase()) {
    throw new SwapExecutionError("settler_registry_changed", "The 0x Settler registry changed since this quote. Request a fresh quote before continuing.");
  }
  if (quote.allowance.spender && quote.allowance.spender.toLowerCase() === currentSettler.toLowerCase()) {
    throw new SwapExecutionError("forbidden_settler_approval", "The quote names Settler as an approval target. No token approval is permitted.");
  }

  let currentAllowance = BigInt(quote.allowance.requiredAmount);
  let tokenBalance = BigInt(0);
  if (!quote.tokenIn.native) {
    const decimalsWord = await call(provider, quote.tokenIn.address, "0x313ce567");
    if (!/^0x[0-9a-f]{64}$/i.test(decimalsWord) || BigInt(decimalsWord) !== BigInt(quote.tokenIn.decimals)) {
      throw new SwapExecutionError("sell_token_metadata_changed", "The sell token decimals changed or could not be confirmed. No transaction was requested.");
    }
    const accountWord = account.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    const balanceWord = await call(provider, quote.tokenIn.address, `0x70a08231${accountWord}`);
    const spender = quote.allowance.spender;
    if (!spender) throw new SwapExecutionError("allowance_target_missing", "0x did not return an approval target for this ERC-20 quote.");
    const allowanceWord = await call(provider, quote.tokenIn.address, `0xdd62ed3e${accountWord}${spender.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`);
    if (!/^0x[0-9a-f]{64}$/i.test(balanceWord) || !/^0x[0-9a-f]{64}$/i.test(allowanceWord)) {
      throw new SwapExecutionError("invalid_rpc_response", "The wallet returned malformed sell-token balance or allowance data.");
    }
    tokenBalance = BigInt(balanceWord);
    currentAllowance = BigInt(allowanceWord);
    if (tokenBalance < BigInt(quote.amountIn)) throw new SwapExecutionError("insufficient_token_balance", `Insufficient ${quote.tokenIn.symbol} balance for this quote.`);
  }
  const nativeBalanceResult = await request(provider, "eth_getBalance", [account, "latest"]);
  const nativeBalance = asQuantity(nativeBalanceResult);
  if (nativeBalance === undefined) throw new SwapExecutionError("invalid_rpc_response", "The wallet returned a malformed Robinhood ETH balance.");
  const gasPriceResult = await request(provider, "eth_gasPrice");
  const gasPrice = asQuantity(gasPriceResult) ?? (quote.gasPrice ? BigInt(quote.gasPrice) : undefined);
  if (gasPrice === undefined) throw new SwapExecutionError("gas_estimate_unavailable", "The wallet could not provide a current Mainnet gas price.");
  const feeRequirement = BigInt(quote.transaction.gas) * gasPrice;
  const executionValue = BigInt(quote.transaction.value);
  if (nativeBalance < feeRequirement + executionValue) {
    throw new SwapExecutionError("insufficient_native_balance", `The wallet needs ETH for the quoted transaction value and estimated gas (${formatEther(feeRequirement)} ETH gas estimate).`);
  }
  if (!quote.tokenIn.native && currentAllowance < BigInt(quote.amountIn)) {
    const nonce = await readVerifiedPendingNonce(provider, account, options);
    assertContextCurrent(options);
    assertQuoteIntegrity(quote);
    if (Date.parse(quote.expiresAt) <= Date.now()) throw new SwapExecutionError("quote_expired", "The quote expired during preflight. Request a fresh quote before signing.");
    return { status: "approval_required", account, currentAllowance, tokenBalance, nativeBalance, estimatedGas: BigInt(quote.transaction.gas), gasPrice, feeRequirement, transactionNonce: nonce.nonce, nonceSource: nonce.source, ...(nonce.walletFailureCategory ? { walletNonceFailureCategory: nonce.walletFailureCategory } : {}) };
  }
  const estimateResult = await request(provider, "eth_estimateGas", [{
    from: account,
    to: quote.transaction.to,
    data: quote.transaction.data,
    value: `0x${executionValue.toString(16)}`,
  }]);
  const estimatedGas = asQuantity(estimateResult);
  if (estimatedGas === undefined || estimatedGas > BigInt(quote.transaction.gas)) {
    throw new SwapExecutionError("quote_gas_changed", "The wallet gas estimate exceeds the firm quote. Refresh and review a new quote.");
  }
  const nonce = await readVerifiedPendingNonce(provider, account, options);
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  if (Date.parse(quote.expiresAt) <= Date.now()) throw new SwapExecutionError("quote_expired", "The quote expired during preflight. Request a fresh quote before signing.");
  await verifyWalletContext(provider, account, options);
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  if (Date.parse(quote.expiresAt) <= Date.now()) throw new SwapExecutionError("quote_expired", "The quote expired during preflight. Request a fresh quote before signing.");
  return { status: "ready", account, currentAllowance, tokenBalance, nativeBalance, estimatedGas, gasPrice, feeRequirement, transactionNonce: nonce.nonce, nonceSource: nonce.source, ...(nonce.walletFailureCategory ? { walletNonceFailureCategory: nonce.walletFailureCategory } : {}) };
}

export async function approveExactSwapAmount(provider: ReadOnlyEip1193Provider, quote: MainnetFirmQuote, options: SwapExecutionOptions = {}): Promise<{ hash: string; amount: string; spender: string }> {
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  assertQuoteLifetime(quote, MINIMUM_WALLET_QUOTE_LIFETIME_MS);
  const spender = quote.allowance.spender;
  if (quote.tokenIn.native || !spender || spender.toLowerCase() !== ZEROX_ALLOWANCE_HOLDER.toLowerCase() || spender.toLowerCase() === quote.settlerAddress.toLowerCase()) {
    throw new SwapExecutionError("approval_target_not_allowed", "Only the 0x API-reported allowance target can receive a bounded token approval; Settler is never an approval target.");
  }
  if (Date.parse(quote.expiresAt) <= Date.now()) throw new SwapExecutionError("quote_expired", "The quote expired. Request a new quote before approving tokens.");
  const account = await verifyWalletContext(provider, quote.taker, options);
  await requireCode(provider, quote.tokenIn.address, "sell_token_not_deployed");
  await requireCode(provider, spender, "allowance_spender_not_deployed");
  const currentSettler = await readCurrentSettler(provider);
  if (currentSettler.toLowerCase() !== quote.settlerAddress.toLowerCase() || spender.toLowerCase() === currentSettler.toLowerCase()) {
    throw new SwapExecutionError("approval_target_not_allowed", "The 0x Settler identity changed or matches the reported approval target. No approval was requested.");
  }
  const ownerWord = account.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const spenderWord = spender.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const allowanceWord = await call(provider, quote.tokenIn.address, `0xdd62ed3e${ownerWord}${spenderWord}`);
  if (!/^0x[0-9a-f]{64}$/i.test(allowanceWord)) throw new SwapExecutionError("invalid_rpc_response", "Token allowance could not be checked.");
  if (BigInt(allowanceWord) >= BigInt(quote.amountIn)) return { hash: "", amount: quote.amountIn, spender };
  const amountWord = BigInt(quote.amountIn).toString(16).padStart(64, "0");
  const data = `0x095ea7b3${spenderWord}${amountWord}`;
  const estimate = asQuantity(await request(provider, "eth_estimateGas", [{ from: account, to: quote.tokenIn.address, data, value: "0x0" }]));
  const gasPrice = asQuantity(await request(provider, "eth_gasPrice"));
  const nativeBalance = asQuantity(await request(provider, "eth_getBalance", [account, "latest"]));
  if (estimate === undefined || gasPrice === undefined || nativeBalance === undefined || nativeBalance < estimate * gasPrice) {
    throw new SwapExecutionError("approval_gas_unavailable", "The wallet cannot confirm enough ETH for the approval gas. No transaction was requested.");
  }
  const nonce = await readVerifiedPendingNonce(provider, account, options);
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  if (Date.parse(quote.expiresAt) <= Date.now()) throw new SwapExecutionError("quote_expired", "The quote expired during approval preflight. Request a fresh quote before approving tokens.");
  await verifyWalletContext(provider, account, options);
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  assertQuoteLifetime(quote, MINIMUM_WALLET_QUOTE_LIFETIME_MS);
  options.onWalletRequest?.();
  const hash = await request(provider, "eth_sendTransaction", [{
    from: account,
    to: quote.tokenIn.address,
    data,
    value: "0x0",
    gas: `0x${estimate.toString(16)}`,
    nonce: `0x${nonce.nonce.toString(16)}`,
  }]);
  if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) {
    throw new SwapExecutionError("transaction_submission_unknown", "The wallet did not return a valid approval transaction hash. Check wallet activity before retrying.");
  }
  return { hash, amount: quote.amountIn, spender };
}

export async function sendReviewedSwap(provider: ReadOnlyEip1193Provider, quote: MainnetFirmQuote, expectedNonce: string, options: SwapExecutionOptions = {}): Promise<string> {
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  assertQuoteLifetime(quote, MINIMUM_WALLET_QUOTE_LIFETIME_MS);
  const preflight = await preflightRobinhoodSwap(provider, quote, Date.now(), options);
  if (preflight.status !== "ready") throw new SwapExecutionError("approval_required", "Approve exactly the sell amount to AllowanceHolder before executing this swap.");
  if (preflight.transactionNonce.toString() !== expectedNonce) throw new SwapExecutionError("transaction_nonce_changed", "The pending wallet nonce changed after intent review. Review and attest the updated intent again.");
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  const value = BigInt(quote.transaction.value);
  const nativeBalance = asQuantity(await request(provider, "eth_getBalance", [preflight.account, "latest"]));
  const currentGasPrice = asQuantity(await request(provider, "eth_gasPrice"));
  if (nativeBalance === undefined || currentGasPrice === undefined
    || nativeBalance < value + BigInt(quote.transaction.gas) * currentGasPrice) {
    throw new SwapExecutionError("insufficient_native_balance", "The wallet no longer has enough ETH for this quote's transaction value and gas reserve.");
  }
  const finalNonce = await readVerifiedPendingNonce(provider, preflight.account, options);
  if (finalNonce.nonce !== preflight.transactionNonce || finalNonce.nonce.toString() !== expectedNonce) {
    throw new SwapExecutionError("transaction_nonce_changed", "The pending nonce changed during final wallet preflight. Review and attest the updated intent again.");
  }
  await verifyWalletContext(provider, quote.taker, options);
  assertContextCurrent(options);
  assertQuoteIntegrity(quote);
  assertQuoteLifetime(quote, MINIMUM_WALLET_QUOTE_LIFETIME_MS);
  options.onWalletRequest?.();
  const hash = await request(provider, "eth_sendTransaction", [{
    from: preflight.account,
    to: quote.transaction.to,
    data: quote.transaction.data,
    value: `0x${value.toString(16)}`,
    gas: `0x${BigInt(quote.transaction.gas).toString(16)}`,
    nonce: `0x${finalNonce.nonce.toString(16)}`,
  }]);
  if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) {
    throw new SwapExecutionError("transaction_submission_unknown", "The wallet did not return a valid transaction hash. Check wallet activity before retrying.");
  }
  return hash;
}
