"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAppModel } from "./DemoAppProvider";
import { useLiveWalletExecutionProvider } from "@/features/dashboard/LiveAppProvider";
import { requestRobinhoodSwapQuote, MainnetSwapClientError, type MainnetFirmQuote, type MainnetIndicativePrice } from "@/features/swap/client";
import { amountToBaseUnits, DEFAULT_ROBINHOOD_SWAP_SELL_TOKEN, ROBINHOOD_MAINNET_TOKENS, type RobinhoodSwapRequest, type RobinhoodSwapTokenId } from "@/features/swap/mainnet";
import { approveExactSwapAmount, preflightRobinhoodSwap, sendReviewedSwap, SwapExecutionError, switchWalletToRobinhoodMainnet, type SwapPreflightResult } from "@/features/swap/execution";
import { createMldsa44IntentAttestation, createPqIntentNonce, verifyMldsa44IntentAttestation, type Mldsa44Implementation, type Mldsa44IntentAttestation } from "@/features/swap/pq-attestation";
import { saveSwapTransaction } from "@/features/swap/activity";
import { getExplorerTransactionUrl } from "@/lib/config/networks";
import { formatMainnetPreflightBalances, formatMainnetTokenAmount, getMainnetSwapNetworkReadiness, getMldsa44PublicKeyFingerprint, hasMainnetSwapContextChanged, isWalletRequestRejection } from "@/features/swap/presentation";
import { canReviewSwapQuote, createSwapRequestGuard, getSwapQuoteBalanceState, isFirmQuoteExpired } from "@/features/swap/ui-state";

const SWAP_TOKENS: RobinhoodSwapTokenId[] = ["ETH", "WETH", "USDG"];

function currentEpochMilliseconds(): number {
  return Date.now();
}

function displayAmount(value: string, decimals: number): string {
  const integer = BigInt(value);
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = (integer / scale).toString();
  const fraction = (integer % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function shortError(error: unknown): string {
  if (isWalletRequestRejection(error)) {
    return "The wallet request was rejected. No approval or swap transaction was submitted.";
  }
  if (error instanceof MainnetSwapClientError || error instanceof SwapExecutionError) return error.message;
  if (error instanceof Error && error.name === "PqAttestationError") {
    const code = "code" in error ? String(error.code) : "crypto_operation_failed";
    return code === "mldsa44_unavailable"
      ? "ML-DSA-44 is not available in this browser. The swap remains an EVM wallet transaction and no PQ attestation was created."
      : "The ML-DSA intent attestation could not be created or verified.";
  }
  return "The request failed. No transaction was submitted.";
}

type SwapReceiptState = "pending" | "confirmed" | "reverted" | "unavailable";

export function MainnetSwapPanel() {
  const { model, actions } = useAppModel();
  const provider = useLiveWalletExecutionProvider();
  const wallet = model.wallet.connection ?? { status: "disconnected" as const };
  const [tokenIn, setTokenIn] = useState<RobinhoodSwapTokenId>(DEFAULT_ROBINHOOD_SWAP_SELL_TOKEN);
  const [tokenOut, setTokenOut] = useState<RobinhoodSwapTokenId>("USDG");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("50");
  const [price, setPrice] = useState<MainnetIndicativePrice>();
  const [quote, setQuote] = useState<MainnetFirmQuote>();
  const [reviewedDigest, setReviewedDigest] = useState<string>();
  const [attestation, setAttestation] = useState<Mldsa44IntentAttestation>();
  const [attestationImplementation, setAttestationImplementation] = useState<Mldsa44Implementation>();
  const [publicKeyFingerprint, setPublicKeyFingerprint] = useState<string>();
  const [attestedIntent, setAttestedIntent] = useState<ReturnType<typeof buildPqIntent>>();
  const [executionNonce, setExecutionNonce] = useState<string>();
  const [preflight, setPreflight] = useState<SwapPreflightResult>();
  const [lastTransaction, setLastTransaction] = useState<{ kind: "swap" | "approval"; hash: `0x${string}`; account: `0x${string}` }>();
  const [busy, setBusy] = useState<"price" | "quote" | "preflight" | "approval" | "send" | "attest" | "switch">();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [approvalNeeded, setApprovalNeeded] = useState(false);
  const [preflightReady, setPreflightReady] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [receiptState, setReceiptState] = useState<{ state: SwapReceiptState; blockNumber?: string }>();
  const requestGuard = useRef(createSwapRequestGuard());
  const selectedChainId = model.network.options.find((network) => network.id === model.network.selected)?.chainId;
  const taker = wallet.address;
  const networkReadiness = getMainnetSwapNetworkReadiness(selectedChainId, wallet.chainId);
  const currentWalletContext = useMemo(() => ({
    account: taker,
    applicationChainId: selectedChainId,
    walletChainId: wallet.chainId,
    provider,
  }), [provider, selectedChainId, taker, wallet.chainId]);
  const previousWalletContext = useRef(currentWalletContext);
  useEffect(() => {
    if (!hasMainnetSwapContextChanged(previousWalletContext.current, currentWalletContext)) return;
    previousWalletContext.current = currentWalletContext;
    requestGuard.current.invalidate();
    setBusy(undefined);
    setError(undefined);
    setQuote(undefined);
    setPrice(undefined);
    setReviewedDigest(undefined);
    setAttestation(undefined);
    setAttestationImplementation(undefined);
    setPublicKeyFingerprint(undefined);
    setAttestedIntent(undefined);
    setExecutionNonce(undefined);
    setPreflight(undefined);
    setApprovalNeeded(false);
    setPreflightReady(false);
    setStatus("The wallet account or network changed. The previous quote, preflight, and intent review were cleared.");
  }, [currentWalletContext]);
  const currentRequest = useMemo<RobinhoodSwapRequest | undefined>(() => {
    const slippageBps = Number(slippage);
    if (!taker || !amount || !Number.isInteger(slippageBps)) return undefined;
    return { networkId: "mainnet", chainId: 4_663, tokenIn, tokenOut, amount, slippageBps, taker };
  }, [taker, amount, slippage, tokenIn, tokenOut]);
  const quoteInputMatches = Boolean(quote && currentRequest
    && quote.taker.toLowerCase() === currentRequest.taker.toLowerCase()
    && quote.tokenIn.id === currentRequest.tokenIn
    && quote.tokenOut.id === currentRequest.tokenOut
    && quote.slippageBps === currentRequest.slippageBps
    && amountToBaseUnits(currentRequest.amount, quote.tokenIn.decimals) === quote.amountIn);
  const quoteContextMatches = Boolean(quoteInputMatches && taker && quote?.taker.toLowerCase() === taker.toLowerCase() && networkReadiness.ready);
  const quoteExpired = Boolean(quote && isFirmQuoteExpired(quote.expiresAt, clock));
  const quoteBalanceState = quote ? getSwapQuoteBalanceState({
    native: quote.tokenIn.native,
    actual: quote.walletBalance.actual,
    sufficient: quote.walletBalance.sufficient,
    amountIn: quote.amountIn,
  }) : undefined;
  const quoteBalanceInsufficient = quoteBalanceState === "insufficient";
  const quoteCanReview = canReviewSwapQuote({
    balanceState: quoteBalanceState ?? "unknown",
    expired: quoteExpired,
    contextMatches: quoteContextMatches,
  });
  const networkReady = networkReadiness.ready;
  const matchingQuote = quoteCanReview && reviewedDigest === quote?.quoteDigest;

  useEffect(() => {
    if (!quote) return;
    const tick = () => setClock(Date.now());
    tick();
    const interval = window.setInterval(tick, 1_000);
    return () => window.clearInterval(interval);
  }, [quote]);

  useEffect(() => {
    if (!lastTransaction) return;
    let cancelled = false;
    let inFlight = false;
    const refreshReceipt = async () => {
      if (cancelled || inFlight) return false;
      inFlight = true;
      try {
        const response = await fetch("/api/swap/receipt", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ hash: lastTransaction.hash, account: lastTransaction.account }),
        });
        if (!response.ok) {
          if (!cancelled) setReceiptState({ state: "unavailable" });
          return false;
        }
        const result = await response.json() as { status?: unknown; blockNumber?: unknown };
        if (result.status === "confirmed" || result.status === "reverted") {
          if (!cancelled) setReceiptState({ state: result.status, ...(typeof result.blockNumber === "string" ? { blockNumber: result.blockNumber } : {}) });
          return true;
        }
        if (!cancelled) setReceiptState({ state: "pending" });
        return false;
      } catch {
        if (!cancelled) setReceiptState({ state: "unavailable" });
        return false;
      } finally {
        inFlight = false;
      }
    };
    const poll = () => { void refreshReceipt().then((terminal) => { if (terminal) window.clearInterval(interval); }); };
    const interval = window.setInterval(poll, 8_000);
    poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [lastTransaction]);

  function clearReviewedState() {
    requestGuard.current.invalidate();
    setBusy(undefined);
    setQuote(undefined);
    setReviewedDigest(undefined);
    setAttestation(undefined);
    setPublicKeyFingerprint(undefined);
    setAttestedIntent(undefined);
    setExecutionNonce(undefined);
    setPreflight(undefined);
    setApprovalNeeded(false);
    setPreflightReady(false);
    setPrice(undefined);
    setError(undefined);
    setStatus(undefined);
  }

  async function loadPrice() {
    const request = currentRequest;
    if (!request || tokenIn === tokenOut) return;
    const generation = requestGuard.current.begin();
    setBusy("price"); setError(undefined); setStatus(undefined);
    try {
      const result = await requestRobinhoodSwapQuote({ ...request, mode: "price" });
      if (!requestGuard.current.isCurrent(generation)) return;
      if (result.mode !== "price") throw new Error("wrong_price_response");
      setPrice(result);
      setStatus("Indicative price only. It is not executable and cannot be signed.");
    } catch (cause) {
      if (requestGuard.current.isCurrent(generation)) setError(shortError(cause));
    } finally {
      if (requestGuard.current.isCurrent(generation)) setBusy(undefined);
    }
  }

  async function getFirmQuote() {
    const request = currentRequest;
    if (!request || tokenIn === tokenOut) return;
    const generation = requestGuard.current.begin();
    setBusy("quote"); setError(undefined); setStatus(undefined); setPreflightReady(false); setApprovalNeeded(false); setAttestation(undefined); setAttestationImplementation(undefined); setPublicKeyFingerprint(undefined); setAttestedIntent(undefined); setExecutionNonce(undefined); setPreflight(undefined); setPrice(undefined); setReviewedDigest(undefined); setQuote(undefined);
    try {
      const result = await requestRobinhoodSwapQuote({ ...request, mode: "quote" });
      if (!requestGuard.current.isCurrent(generation)) return;
      if (result.mode !== "quote") throw new Error("wrong_quote_response");
      setQuote(result);
      const balanceState = getSwapQuoteBalanceState({ native: result.tokenIn.native, actual: result.walletBalance.actual, sufficient: result.walletBalance.sufficient, amountIn: result.amountIn });
      setStatus(balanceState === "insufficient"
        ? `0x reports insufficient ${result.tokenIn.symbol} balance. The quote is informational and cannot advance to review or wallet preflight.`
        : "Firm quote received from 0x and checked against Robinhood Mainnet deployment reads. Review every field before any wallet transaction.");
    } catch (cause) {
      if (requestGuard.current.isCurrent(generation)) { setQuote(undefined); setError(shortError(cause)); }
    } finally {
      if (requestGuard.current.isCurrent(generation)) setBusy(undefined);
    }
  }

  async function switchNetwork() {
    if (!provider) { actions.pressWalletButton(); return; }
    const generation = requestGuard.current.begin();
    setBusy("switch"); setError(undefined);
    try {
      await switchWalletToRobinhoodMainnet(provider);
      if (requestGuard.current.isCurrent(generation)) setStatus("Network switch requested and accepted by the wallet. Refresh the wallet state before requesting a quote.");
    } catch (cause) {
      if (requestGuard.current.isCurrent(generation)) setError(shortError(cause));
    } finally {
      if (requestGuard.current.isCurrent(generation)) setBusy(undefined);
    }
  }

  async function checkSwap() {
    if (!provider || !quote || !matchingQuote) return;
    const generation = requestGuard.current.begin();
    setBusy("preflight"); setError(undefined); setStatus(undefined); setPreflightReady(false); setApprovalNeeded(false); setPreflight(undefined);
    try {
      const result = await preflightRobinhoodSwap(provider, quote);
      if (!requestGuard.current.isCurrent(generation)) return;
      setPreflight(result);
      if (result.status === "approval_required") {
        setApprovalNeeded(true);
        setExecutionNonce(undefined);
        setStatus(`Current allowance is below the exact sell amount. The next action would approve ${displayAmount(quote.amountIn, quote.tokenIn.decimals)} ${quote.tokenIn.symbol} to the verified AllowanceHolder only.`);
      } else {
        setPreflightReady(true);
        setExecutionNonce(result.transactionNonce.toString());
        setStatus(`Mainnet preflight passed: account, chain, token balance, allowance, bytecode, current Settler registry, gas estimate, and quote expiry match this review.`);
      }
    } catch (cause) {
      if (requestGuard.current.isCurrent(generation)) setError(shortError(cause));
    } finally {
      if (requestGuard.current.isCurrent(generation)) setBusy(undefined);
    }
  }

  async function approveAmount() {
    if (!provider || !quote || !matchingQuote) return;
    setBusy("approval"); setError(undefined); setStatus(undefined);
    try {
      const result = await approveExactSwapAmount(provider, quote);
      if (!result.hash) { setStatus("The exact required allowance is already present. Recheck the quote and wallet state."); setApprovalNeeded(false); return; }
      const saved = saveSwapTransaction({
        hash: result.hash as `0x${string}`,
        account: quote.taker as `0x${string}`,
        kind: "approval",
        tokenInSymbol: quote.tokenIn.symbol,
        tokenOutSymbol: "AllowanceHolder",
        amountIn: displayAmount(result.amount, quote.tokenIn.decimals),
        createdAt: new Date().toISOString(),
      });
      setReceiptState({ state: "pending" });
      setLastTransaction({ kind: "approval", hash: result.hash as `0x${string}`, account: quote.taker as `0x${string}` });
      setStatus(`Wallet returned approval transaction ${result.hash}. ${saved ? "Saved to this browser's Activity." : "Browser storage was unavailable; copy the hash before leaving."} Wait for confirmation, then request a fresh quote.`);
      setApprovalNeeded(false); setPreflightReady(false); setExecutionNonce(undefined); setPreflight(undefined); setQuote(undefined); setReviewedDigest(undefined); setAttestation(undefined); setAttestationImplementation(undefined); setPublicKeyFingerprint(undefined); setAttestedIntent(undefined);
    } catch (cause) { setError(shortError(cause)); }
    finally { setBusy(undefined); }
  }

  async function sendSwap() {
    if (!provider || !quote || !matchingQuote || !preflightReady) return;
    setBusy("send"); setError(undefined); setStatus(undefined); setPreflight(undefined);
    try {
      // Reconfirm quote validity and all wallet/on-chain prerequisites immediately before opening the wallet prompt.
      const preflight = await preflightRobinhoodSwap(provider, quote);
      setPreflight(preflight);
      if (preflight.status !== "ready") { setApprovalNeeded(true); setPreflightReady(false); throw new SwapExecutionError("approval_required", "The allowance changed. Approve the exact amount and request a fresh quote."); }
      if (executionNonce !== preflight.transactionNonce.toString()) {
        setPreflightReady(false); setExecutionNonce(undefined); setAttestation(undefined); setAttestedIntent(undefined);
        throw new SwapExecutionError("transaction_nonce_changed", "The pending wallet nonce changed. Recheck the intent and create a new PQ attestation before sending.");
      }
      if (attestation && (!attestedIntent || attestedIntent.nonce !== executionNonce
        || attestedIntent.quoteDigest !== quote.quoteDigest
        || !await verifyMldsa44IntentAttestation(attestation, attestedIntent))) {
        setAttestation(undefined); setAttestedIntent(undefined);
        throw new SwapExecutionError("pq_attestation_mismatch", "The saved PQ attestation no longer matches this exact Mainnet swap intent.");
      }
      const hash = await sendReviewedSwap(provider, quote, executionNonce);
      const saved = saveSwapTransaction({
        hash: hash as `0x${string}`,
        account: quote.taker as `0x${string}`,
        kind: "swap",
        tokenInSymbol: quote.tokenIn.symbol,
        tokenOutSymbol: quote.tokenOut.symbol,
        amountIn: displayAmount(quote.amountIn, quote.tokenIn.decimals),
        createdAt: new Date().toISOString(),
      });
      setReceiptState({ state: "pending" });
      setLastTransaction({ kind: "swap", hash: hash as `0x${string}`, account: quote.taker as `0x${string}` });
      setStatus(`Wallet returned transaction ${hash}. ${saved ? "Saved to this browser's Activity; receipt status is checked against Mainnet RPC." : "Browser storage was unavailable; copy the hash before leaving."} This EVM transaction is not post-quantum protected.`);
      setQuote(undefined); setReviewedDigest(undefined); setAttestation(undefined); setAttestationImplementation(undefined); setPublicKeyFingerprint(undefined); setAttestedIntent(undefined); setExecutionNonce(undefined); setPreflight(undefined); setPreflightReady(false);
    } catch (cause) { setError(shortError(cause)); }
    finally { setBusy(undefined); }
  }

  async function createAttestation() {
    if (!quote || !matchingQuote || !taker || !executionNonce || !preflightReady) return;
    const generation = requestGuard.current.begin();
    setBusy("attest"); setError(undefined); setAttestation(undefined); setAttestationImplementation(undefined);
    try {
      const now = currentEpochMilliseconds();
      const intent = buildPqIntent({
        domain: window.location.host,
        quote,
        nonce: executionNonce,
        now,
      });
      const result = await createMldsa44IntentAttestation(intent);
      if (!await verifyMldsa44IntentAttestation(result.attestation, intent)) throw new Error("attestation_verification_failed");
      const fingerprint = await getMldsa44PublicKeyFingerprint(result.attestation);
      if (!requestGuard.current.isCurrent(generation)) return;
      setAttestedIntent(intent);
      setAttestation(result.attestation);
      setAttestationImplementation(result.implementation);
      setPublicKeyFingerprint(fingerprint);
      setStatus(`The exact Mainnet intent and pending EVM nonce were signed and verified locally with the ${result.implementation === "webcrypto-native" ? "browser WebCrypto implementation" : "JavaScript fallback"}. No private key was persisted or sent to VEYRA. This off-chain attestation does not authorize or quantum-protect the EVM transaction.`);
    } catch (cause) {
      if (requestGuard.current.isCurrent(generation)) setError(shortError(cause));
    } finally {
      if (requestGuard.current.isCurrent(generation)) setBusy(undefined);
    }
  }

  function buildPqIntent(input: { domain: string; quote: MainnetFirmQuote; nonce: string; now: number }) {
      const { quote: currentQuote, nonce, now } = input;
      const expiresAt = Math.min(Math.floor(Date.parse(currentQuote.expiresAt) / 1_000), Math.floor(now / 1_000) + 60);
      return {
        domain: input.domain,
        chainId: 4_663 as const,
        account: currentQuote.taker,
        tokenIn: currentQuote.tokenIn.address,
        tokenOut: currentQuote.tokenOut.address,
        amountIn: currentQuote.amountIn,
        minimumAmountOut: currentQuote.minimumReceived,
        slippageBps: currentQuote.slippageBps,
        allowanceSpender: currentQuote.allowance.spender,
        settlerAddress: currentQuote.settlerAddress,
        recipient: currentQuote.recipient,
        nonce,
        intentNonce: createPqIntentNonce(),
        issuedAt: Math.floor(now / 1_000),
        expiresAt,
        quoteDigest: currentQuote.quoteDigest,
        transaction: { to: currentQuote.transaction.to, data: currentQuote.transaction.data, value: currentQuote.transaction.value },
      };
  }

  function editTokenIn(value: RobinhoodSwapTokenId) { setTokenIn(value); clearReviewedState(); }
  function editTokenOut(value: RobinhoodSwapTokenId) { setTokenOut(value); clearReviewedState(); }
  function editAmount(value: string) { setAmount(value); clearReviewedState(); }
  function editSlippage(value: string) { setSlippage(value); clearReviewedState(); }

  const transactionPending = busy === "approval" || busy === "send";
  const nativeBalance = !model.network.walletMismatch && selectedChainId === 4_663 && wallet.chainId === 4_663 ? wallet.balance : undefined;
  const flowSteps = [
    { title: "Wallet and network", state: !taker ? "Connect a wallet" : !networkReady ? "Select Robinhood Mainnet · 4663" : `${wallet.providerName ?? "External wallet"} connected on 4663` },
    { title: "Live quote", state: busy === "price" ? "Fetching indicative price" : busy === "quote" ? "Requesting firm quote" : quote && !quoteContextMatches ? "Invalidated · request a fresh quote" : quoteExpired ? "Expired · refresh required" : quoteBalanceInsufficient ? "Insufficient sell-token balance" : quoteCanReview ? "Firm quote available" : price ? "Indicative price only" : "Not requested" },
    { title: "Intent review", state: matchingQuote ? "Exact quote reviewed" : quote ? "Review required" : "Waiting for firm quote" },
    { title: "Wallet preflight", state: preflightReady && matchingQuote ? "Ready for wallet confirmation" : approvalNeeded && !quoteExpired ? "Exact token approval required" : preflight && !quoteExpired ? "Preflight did not pass" : "Not checked" },
    { title: "Transaction receipt", state: receiptState?.state === "confirmed" ? "Receipt confirmed by Mainnet RPC" : receiptState?.state === "reverted" ? "Reverted on Mainnet" : receiptState?.state === "unavailable" ? "Receipt check unavailable" : lastTransaction ? "Submitted · waiting for receipt" : "Requires explicit wallet approval" },
  ];

  return (
    <div className="sp-grid sp-mainnet-grid">
      <div className="sp-form sp-mainnet-form">
        <section className="sp-mainnet-context" aria-label="Connected wallet and network">
          <div>
            <span className="sp-context-label">External wallet</span>
            <strong>{taker ? wallet.providerName ?? "Connected EVM wallet" : "Not connected"}</strong>
            {taker ? <code>{taker}</code> : <small>Connect an EVM wallet to read balances and request a Mainnet quote.</small>}
          </div>
          <div>
            <span className="sp-context-label">Wallet network</span>
            <strong>{wallet.networkName ?? "Unknown network"}</strong>
            <small>Chain ID {wallet.chainId ?? "unavailable"} · App: {model.network.options.find((network) => network.id === model.network.selected)?.label ?? "unknown"} ({selectedChainId ?? "unknown"})</small>
          </div>
          {nativeBalance ? (
            <div>
              <span className="sp-context-label">Public native balance</span>
              <strong>{nativeBalance.amount} ETH</strong>
              <small>Wallet RPC · block {nativeBalance.blockNumber}. Gas reserve is checked again during preflight.</small>
            </div>
          ) : null}
        </section>

        <div className="sp-box">
          <div className="sp-top"><label htmlFor="mainnet-swap-amount">You pay</label>
            <select aria-label="Token you pay on Robinhood Mainnet" value={tokenIn} disabled={transactionPending} onChange={(event) => editTokenIn(event.target.value as RobinhoodSwapTokenId)}>
              {SWAP_TOKENS.map((token) => <option key={token} value={token}>{ROBINHOOD_MAINNET_TOKENS[token].symbol}</option>)}
            </select>
          </div>
          <input id="mainnet-swap-amount" className="sp-amt" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} disabled={transactionPending} aria-describedby="mainnet-sell-balance" onChange={(event) => editAmount(event.target.value)} />
          <small>Only canonical Robinhood Mainnet ETH, WETH, and USDG addresses are accepted. Token decimals are re-read from chain bytecode.</small>
          <small id="mainnet-sell-balance">
            {tokenIn === "ETH" && nativeBalance
              ? `Available: ${nativeBalance.amount} ETH · public balance from the connected wallet RPC. Gas reserve is checked before wallet confirmation.`
              : quote && quoteContextMatches && !quoteExpired && quote.tokenIn.id === tokenIn && quote.walletBalance.actual != null
                ? `0x quote reports ${formatMainnetTokenAmount(quote.walletBalance.actual, quote.tokenIn.decimals) ?? "an unreadable"} ${quote.tokenIn.symbol} available; wallet RPC preflight remains required.`
                : `${tokenIn} balance is read from the quote provider when available and checked against the wallet before approval or swap. No balance is inferred.`}
          </small>
        </div>
        <div className="sp-box">
          <div className="sp-top"><label htmlFor="mainnet-swap-receive">You receive</label>
            <select id="mainnet-swap-receive" aria-label="Token to receive on Robinhood Mainnet" value={tokenOut} disabled={transactionPending} onChange={(event) => editTokenOut(event.target.value as RobinhoodSwapTokenId)}>
              {SWAP_TOKENS.map((token) => <option key={token} value={token}>{ROBINHOOD_MAINNET_TOKENS[token].symbol}</option>)}
            </select>
          </div>
          <span className="sp-amt none" aria-live="polite">{quoteCanReview && quote ? `${displayAmount(quote.amountOut, quote.tokenOut.decimals)} ${quote.tokenOut.symbol} quoted` : price ? `${displayAmount(price.amountOut, price.tokenOut.decimals)} ${price.tokenOut.symbol} indicative` : "No route quoted"}</span>
          <small>Indicative prices are informational. Only a current firm quote can proceed to review and wallet preflight.</small>
        </div>
        <div className="sp-slip">
          <label htmlFor="mainnet-swap-slippage">Maximum slippage</label>
          <select id="mainnet-swap-slippage" value={slippage} disabled={transactionPending} onChange={(event) => editSlippage(event.target.value)}>
            {["50", "100", "300", "500", "1000"].map((basisPoints) => <option key={basisPoints} value={basisPoints}>{Number(basisPoints) / 100}%</option>)}
          </select>
        </div>
        <dl className="sp-q">
          <div><dt>Network</dt><dd>Robinhood Mainnet · 4663 only</dd></div>
          <div><dt>Quote status</dt><dd>{quote && !quoteContextMatches ? "Invalidated · refresh required" : quoteExpired ? "Expired · refresh required" : quoteBalanceInsufficient ? "Not actionable · insufficient balance" : quoteCanReview ? "Firm quote available" : price ? "Indicative price only" : "Not requested"}</dd></div>
          <div><dt>Expected output</dt><dd>{quoteCanReview && quote ? `${displayAmount(quote.amountOut, quote.tokenOut.decimals)} ${quote.tokenOut.symbol}` : price ? `${displayAmount(price.amountOut, price.tokenOut.decimals)} ${price.tokenOut.symbol} · indicative` : "Not quoted"}</dd></div>
          <div><dt>Minimum received</dt><dd>{quoteCanReview && quote ? `${displayAmount(quote.minimumReceived, quote.tokenOut.decimals)} ${quote.tokenOut.symbol}` : "Not quoted"}</dd></div>
          {quote && quoteContextMatches && !quoteExpired && !quote.tokenIn.native ? <div><dt>Sell-token balance · 0x</dt><dd>{formatMainnetTokenAmount(quote.walletBalance.actual, quote.tokenIn.decimals) === undefined ? "Not returned" : `${formatMainnetTokenAmount(quote.walletBalance.actual, quote.tokenIn.decimals)} ${quote.tokenIn.symbol}`}</dd></div> : null}
          {quote && quoteContextMatches && !quoteExpired ? <div><dt>0x balance check</dt><dd>{quote.walletBalance.sufficient ? "Provider reports sufficient · wallet preflight still required" : "Provider reports insufficient · wallet preflight required"}</dd></div> : null}
          <div><dt>Estimated gas</dt><dd>{quoteCanReview && quote ? `${quote.estimatedGas} units · fee ${quote.totalNetworkFee ? `${displayAmount(quote.totalNetworkFee, 18)} ETH` : "wallet estimate required"}` : "Not quoted"}</dd></div>
          <div><dt>Route</dt><dd>{quoteCanReview && quote ? quote.route.map((fill) => fill.source).join(" → ") : price ? price.route.map((fill) => fill.source).join(" → ") : "Not available"}</dd></div>
        </dl>
        {quoteBalanceInsufficient && quoteContextMatches && !quoteExpired ? <p className="sp-error" role="alert">The 0x quote reports less {quote?.tokenIn.symbol} than this swap requires. This quote cannot be reviewed or submitted. Reduce the sell amount, choose a token with available balance, or reconnect the intended wallet. No wallet transaction has been requested.</p> : null}
        {quoteExpired && quoteContextMatches ? <p className="sp-error" role="status">This firm quote expired at {quote?.expiresAt}. It cannot be signed or submitted. Refresh it, review the new terms, and run preflight again.</p> : null}
        {quote && !quoteContextMatches ? <p className="sp-error" role="status">This firm quote no longer matches the current form, connected wallet, or selected Mainnet network. Request a fresh quote before reviewing or continuing.</p> : null}
        {quoteExpired && quoteContextMatches ? <div className="sp-actions"><Button className="swapbtn" disabled={!currentRequest || busy !== undefined || tokenIn === tokenOut} onClick={() => { void getFirmQuote(); }}>{busy === "quote" ? "Refreshing quote…" : "Refresh quote"}</Button></div> : null}
        {!taker ? <Button className="swapbtn" onClick={actions.pressWalletButton}>Connect wallet before requesting Mainnet quotes</Button> : null}
        {taker && !networkReady ? (
          <div>
            <p className="sp-note" role="status">Mainnet quotes require both the VEYRA application and connected wallet on Robinhood Mainnet (4663). Current application chain: {selectedChainId ?? "unknown"}; wallet chain: {wallet.chainId ?? "unknown"}. Neither network is changed automatically.</p>
            <div className="sp-actions">
              {!networkReadiness.applicationReady ? <Button variant="outline" disabled={busy !== undefined} onClick={() => actions.setNetwork("mainnet")}>Select Mainnet in VEYRA</Button> : null}
              {!networkReadiness.walletReady ? <Button className="swapbtn" disabled={!provider || busy !== undefined} onClick={() => { void switchNetwork(); }}>{busy === "switch" ? "Waiting for wallet…" : "Switch wallet to Robinhood Mainnet"}</Button> : null}
            </div>
          </div>
        ) : null}
        {networkReady && taker ? (
          <div className="sp-actions">
            <Button variant="outline" disabled={!currentRequest || busy !== undefined || tokenIn === tokenOut} onClick={() => { void loadPrice(); }}>{busy === "price" ? "Fetching indicative price…" : "Get live price"}</Button>
            <Button className="swapbtn" disabled={!currentRequest || busy !== undefined || tokenIn === tokenOut} onClick={() => { void getFirmQuote(); }}>{busy === "quote" ? "Requesting firm quote…" : "Get firm quote"}</Button>
          </div>
        ) : null}

        {quoteCanReview && quote ? (
          <>
            <section className="sp-review" aria-labelledby="mainnet-intent-heading">
              <h3 id="mainnet-intent-heading">Exact transaction review</h3>
              <p className="sp-review-lede">Check the quote, minimum output, route, fee estimate, and expiry. Editing any swap input clears this review and its dependent checks.</p>
              <dl className="kv">
                <div><dt>Connected wallet</dt><dd><code>{quote.taker}</code></dd></div>
                <div><dt>Network</dt><dd>Robinhood Mainnet · {quote.chainId}</dd></div>
                <div><dt>Sell amount</dt><dd>{displayAmount(quote.amountIn, quote.tokenIn.decimals)} {quote.tokenIn.symbol}</dd></div>
                <div><dt>Expected output</dt><dd>{displayAmount(quote.amountOut, quote.tokenOut.decimals)} {quote.tokenOut.symbol}</dd></div>
                <div><dt>Minimum received</dt><dd>{displayAmount(quote.minimumReceived, quote.tokenOut.decimals)} {quote.tokenOut.symbol}</dd></div>
                <div><dt>Maximum slippage</dt><dd>{(quote.slippageBps / 100).toFixed(2)}%</dd></div>
                <div><dt>Estimated gas</dt><dd>{quote.estimatedGas} units · {quote.totalNetworkFee ? `${displayAmount(quote.totalNetworkFee, 18)} ETH estimated fee` : "wallet fee estimate required"}</dd></div>
                <div><dt>Route</dt><dd>{quote.route.map((fill) => fill.source).join(" → ")}</dd></div>
                <div><dt>Quote expires</dt><dd>{quoteExpired ? `Expired · ${quote.expiresAt}` : quote.expiresAt}</dd></div>
              </dl>
              <details className="sp-details">
                <summary>Transaction details</summary>
                <dl className="kv">
                  <div><dt>Recipient</dt><dd><code>{quote.recipient}</code></dd></div>
                  <div><dt>Sell token contract</dt><dd><code>{quote.tokenIn.address}</code></dd></div>
                  <div><dt>Buy token contract</dt><dd><code>{quote.tokenOut.address}</code></dd></div>
                  <div><dt>Allowance spender</dt><dd><code>{quote.allowance.spender ?? "Not applicable · native ETH"}</code></dd></div>
                  <div><dt>Allowance reported by quote provider</dt><dd><code>{quote.allowance.actual ?? "Not returned"}</code> / required <code>{quote.allowance.requiredAmount}</code></dd></div>
                  <div><dt>Settler</dt><dd><code>{quote.settlerAddress}</code></dd></div>
                  <div><dt>Execution target</dt><dd><code>{quote.transaction.to}</code></dd></div>
                  <div><dt>Transaction value / gas</dt><dd><code>{quote.transaction.value} wei · {quote.transaction.gas} units</code></dd></div>
                  <div><dt>Canonical quote digest</dt><dd><code>{quote.quoteDigest}</code></dd></div>
                  <div><dt>Provider fee metadata</dt><dd><code>{JSON.stringify(quote.fees ?? null)}</code></dd></div>
                </dl>
                <details className="sp-raw-details">
                  <summary>Raw executable calldata</summary>
                  <pre>{quote.transaction.data}</pre>
                </details>
              </details>
              {matchingQuote ? <p className="sp-note" role="status">Exact quote reviewed. Balance, gas, allowance, bytecode, Settler registry, and expiry still need wallet preflight.</p> : null}
            </section>
            <div className="sp-actions">
              <Button variant="outline" disabled={!quoteCanReview || busy !== undefined} onClick={() => { setReviewedDigest(quote.quoteDigest); setPreflightReady(false); setPreflight(undefined); setAttestation(undefined); setPublicKeyFingerprint(undefined); setAttestedIntent(undefined); setExecutionNonce(undefined); setStatus("This exact quote is marked for review. Run wallet preflight before any wallet transaction."); }}>Review exact quote</Button>
              <Button variant="outline" disabled={!matchingQuote || !preflightReady || !executionNonce || busy !== undefined} onClick={() => { void createAttestation(); }}>{busy === "attest" ? "Creating local ML-DSA attestation…" : attestation ? "Create new optional PQ attestation" : "Optional: create ML-DSA attestation"}</Button>
            </div>
            {attestation && !quoteExpired ? (
              <details className="sp-pq-details">
                <summary>Local PQ intent verification succeeded</summary>
                <p>The ML-DSA-44 signature verified locally against an ephemeral public key. The private key was not persisted or sent to VEYRA. This does not identify a persistent signer or authorize the EVM transaction; on-chain PQ enforcement is unavailable.</p>
                <dl className="kv">
                  <div><dt>Local signature check</dt><dd>Verified</dd></div>
                  <div><dt>Algorithm</dt><dd>{attestation.algorithm}</dd></div>
                  <div><dt>Signing implementation</dt><dd>{attestationImplementation === "webcrypto-native" ? "Browser WebCrypto native ML-DSA-44" : "@noble/post-quantum JavaScript fallback"}</dd></div>
                  <div><dt>Public-key fingerprint · SHA-256</dt><dd><code>{publicKeyFingerprint ?? "Computing fingerprint…"}</code></dd></div>
                  <div><dt>Canonical payload digest · SHA-256</dt><dd><code>{attestation.payloadDigest}</code></dd></div>
                  <div><dt>Bound wallet and chain</dt><dd><code>{attestation.payload.account}</code> · Robinhood Mainnet 4663</dd></div>
                  <div><dt>Bound intent</dt><dd>{displayAmount(attestation.payload.amountIn, quote.tokenIn.decimals)} {quote.tokenIn.symbol} → minimum {displayAmount(attestation.payload.minimumAmountOut, quote.tokenOut.decimals)} {quote.tokenOut.symbol} · {attestation.payload.slippageBps} bps</dd></div>
                  <div><dt>Bound route and quote digest</dt><dd>{quote.route.map((fill) => fill.source).join(" → ")} · <code>{attestation.payload.quoteDigest}</code></dd></div>
                  <div><dt>Bound target / value</dt><dd><code>{attestation.payload.transaction.to}</code> · {attestation.payload.transaction.value} wei</dd></div>
                </dl>
                {attestationImplementation === "javascript-fallback" ? <p>The JavaScript fallback uses the browser CSPRNG. Caller-owned seed and secret-key buffers are cleared best-effort, but JavaScript cannot guarantee memory erasure or constant-time execution. Not audited independently. This experimental off-chain evidence must not be treated as protection for funds.</p> : <p>The browser-reported native path uses a non-exportable WebCrypto private key for this local operation. This attestation remains off-chain and does not add post-quantum protection to EVM execution.</p>}
                <details>
                  <summary>Inspect canonical payload, public key, and signature</summary>
                  <pre>{JSON.stringify(attestation, null, 2)}</pre>
                </details>
              </details>
            ) : null}
            <div className="sp-actions">
              <Button variant="outline" disabled={!provider || !matchingQuote || busy !== undefined} onClick={() => { void checkSwap(); }}>{busy === "preflight" ? "Checking wallet and contracts…" : "Check wallet preflight"}</Button>
              {approvalNeeded && !quoteExpired ? <Button className="swapbtn" disabled={!provider || busy !== undefined || !matchingQuote} onClick={() => { void approveAmount(); }}>{busy === "approval" ? "Waiting for wallet approval…" : `Approve exact ${quote.tokenIn.symbol} amount in wallet`}</Button> : null}
              {preflightReady && !quoteExpired ? <Button className="swapbtn" disabled={!provider || busy !== undefined || !matchingQuote || !networkReady} onClick={() => { void sendSwap(); }}>{busy === "send" ? "Waiting for wallet confirmation…" : "Confirm swap in wallet"}</Button> : null}
            </div>
            {preflight && !quoteExpired ? (() => {
              const balances = formatMainnetPreflightBalances(preflight, quote.tokenIn);
              return (
                <section className="sp-review" aria-label="Wallet balance and execution preflight">
                  <h3>Wallet read and execution preflight</h3>
                  <dl className="kv">
                    <div><dt>Sell-token balance · selected wallet RPC</dt><dd>{balances.sellTokenBalance}</dd></div>
                    <div><dt>Native ETH balance · selected wallet RPC</dt><dd>{balances.nativeBalance}</dd></div>
                    <div><dt>Current allowance</dt><dd>{balances.allowance}{preflight.status === "approval_required" ? " · approval required" : ""}</dd></div>
                    <div><dt>Estimated gas</dt><dd>{balances.estimatedGas}</dd></div>
                    <div><dt>Estimated gas fee</dt><dd>{balances.estimatedFee}</dd></div>
                    <div><dt>Execution status</dt><dd>{preflight.status === "ready" ? "Preflight ready · wallet approval still required" : "Approval required · no swap submitted"}</dd></div>
                  </dl>
                </section>
              );
            })() : null}
          </>
        ) : null}
        {error ? <p className="sp-error" role="alert">{error}</p> : null}
        {status ? <p className="sp-note" role="status">{status}</p> : null}
      </div>
      <aside className="sp-mainnet-aside" aria-label="Swap progress and execution information">
        <p className="sp-context-label">Robinhood Mainnet · 4663</p>
        <h3>Swap flow</h3>
        <ol className="sp-mainnet-steps">
          {flowSteps.map((step, index) => <li key={step.title} className={(index === 0 && networkReady) || (index === 1 && quoteCanReview) || (index === 2 && matchingQuote) || (index === 3 && preflightReady && matchingQuote) || (index === 4 && receiptState?.state === "confirmed") ? "done" : ""}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{step.title}</strong><small>{step.state}</small></div>
          </li>)}
        </ol>
        <div className="sp-mainnet-boundary">
          <h4>What each check means</h4>
          <p>A live price is indicative. A firm quote includes transaction parameters, route, and a short expiry. Wallet preflight rechecks balance, gas, allowance, contract bytecode, and the current Settler registry.</p>
          <p>Approvals and swaps require separate wallet confirmation. Optional ML-DSA verification is an off-chain attestation; it does not authorize or protect the EVM transaction.</p>
          <p>Submitted transactions are checked against Robinhood Mainnet RPC. The receipt endpoint does not return token settlement logs or establish finality.</p>
        </div>
      </aside>
      {lastTransaction ? (
        <section className="sp-mainnet-receipt" aria-live="polite" aria-label="Mainnet transaction status">
          <div>
            <span className="sp-context-label">{lastTransaction.kind === "approval" ? "Token approval" : "Mainnet swap"}</span>
            <strong>{receiptState?.state === "confirmed" ? "Receipt confirmed by Robinhood Mainnet RPC" : receiptState?.state === "reverted" ? "Transaction reverted on Robinhood Mainnet" : receiptState?.state === "unavailable" ? "Receipt status temporarily unavailable" : "Transaction submitted · waiting for receipt"}</strong>
            <code>{lastTransaction.hash}</code>
            {receiptState?.blockNumber ? <small>Included in block {receiptState.blockNumber} according to the configured Mainnet RPC. Inclusion does not establish finality.</small> : null}
            {receiptState?.state === "confirmed" ? <small>Token settlement logs are not returned by the receipt endpoint.</small> : null}
          </div>
          {getExplorerTransactionUrl("mainnet", lastTransaction.hash) ? <a href={getExplorerTransactionUrl("mainnet", lastTransaction.hash)} target="_blank" rel="noopener noreferrer">View transaction in Blockscout</a> : null}
        </section>
      ) : null}
      <p className="sp-fee sp-mainnet-fee">Each transaction is separately authorized by your external wallet. ERC-20 approvals are capped at the quoted sell amount and target 0x AllowanceHolder, never Settler. Robinhood Mainnet fees are real and may be lost on a reverted transaction.</p>
    </div>
  );
}
