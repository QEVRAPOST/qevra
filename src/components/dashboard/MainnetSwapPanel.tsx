"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAppModel } from "./DemoAppProvider";
import { useLiveWalletExecutionProvider } from "@/features/dashboard/LiveAppProvider";
import { requestRobinhoodSwapQuote, MainnetSwapClientError, type MainnetFirmQuote, type MainnetIndicativePrice } from "@/features/swap/client";
import { ROBINHOOD_MAINNET_TOKENS, type RobinhoodSwapRequest, type RobinhoodSwapTokenId } from "@/features/swap/mainnet";
import { approveExactSwapAmount, preflightRobinhoodSwap, sendReviewedSwap, SwapExecutionError, switchWalletToRobinhoodMainnet, type SwapPreflightResult } from "@/features/swap/execution";
import { createMldsa44IntentAttestation, createPqIntentNonce, verifyMldsa44IntentAttestation, type Mldsa44Implementation, type Mldsa44IntentAttestation } from "@/features/swap/pq-attestation";
import { saveSwapTransaction } from "@/features/swap/activity";
import { getExplorerTransactionUrl } from "@/lib/config/networks";
import { formatMainnetPreflightBalances, formatMainnetTokenAmount, getMainnetSwapNetworkReadiness, getMldsa44PublicKeyFingerprint, hasMainnetSwapContextChanged, isWalletRequestRejection } from "@/features/swap/presentation";

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
  if (error instanceof MainnetSwapClientError) return `${error.code}: ${error.message}`;
  if (error instanceof SwapExecutionError) return `${error.code}: ${error.message}`;
  if (error instanceof Error && error.name === "PqAttestationError") {
    const code = "code" in error ? String(error.code) : "crypto_operation_failed";
    return code === "mldsa44_unavailable"
      ? "ML-DSA-44 is not available in this browser. The swap remains an EVM wallet transaction and no PQ attestation was created."
      : "The ML-DSA intent attestation could not be created or verified.";
  }
  return "The request failed. No transaction was submitted.";
}

export function MainnetSwapPanel() {
  const { model, actions } = useAppModel();
  const provider = useLiveWalletExecutionProvider();
  const wallet = model.wallet.connection ?? { status: "disconnected" as const };
  const [tokenIn, setTokenIn] = useState<RobinhoodSwapTokenId>("WETH");
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
  const [lastTransaction, setLastTransaction] = useState<{ kind: "swap" | "approval"; hash: `0x${string}` }>();
  const [busy, setBusy] = useState<"price" | "quote" | "preflight" | "approval" | "send" | "attest" | "switch">();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [approvalNeeded, setApprovalNeeded] = useState(false);
  const [preflightReady, setPreflightReady] = useState(false);
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
  const quoteContextMatches = Boolean(quote && taker && quote.taker.toLowerCase() === taker.toLowerCase() && networkReadiness.ready);
  useEffect(() => {
    if (!hasMainnetSwapContextChanged(previousWalletContext.current, currentWalletContext)) return;
    previousWalletContext.current = currentWalletContext;
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
  const networkReady = networkReadiness.ready;
  const matchingQuote = quoteContextMatches && reviewedDigest === quote?.quoteDigest;

  function clearReviewedState() {
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
    if (!currentRequest || tokenIn === tokenOut) return;
    setBusy("price"); setError(undefined); setStatus(undefined);
    try {
      const result = await requestRobinhoodSwapQuote({ ...currentRequest, mode: "price" });
      if (result.mode !== "price") throw new Error("wrong_price_response");
      setPrice(result);
    } catch (cause) { setError(shortError(cause)); } finally { setBusy(undefined); }
  }

  async function getFirmQuote() {
    if (!currentRequest || tokenIn === tokenOut) return;
    setBusy("quote"); setError(undefined); setStatus(undefined); setPreflightReady(false); setApprovalNeeded(false); setAttestation(undefined); setAttestationImplementation(undefined); setPublicKeyFingerprint(undefined); setAttestedIntent(undefined); setExecutionNonce(undefined); setPreflight(undefined); setPrice(undefined); setReviewedDigest(undefined); setQuote(undefined);
    try {
      const result = await requestRobinhoodSwapQuote({ ...currentRequest, mode: "quote" });
      if (result.mode !== "quote") throw new Error("wrong_quote_response");
      setQuote(result);
      setStatus("Firm quote received from 0x and checked against Robinhood Mainnet deployment reads. Review every field before any wallet transaction.");
    } catch (cause) { setQuote(undefined); setError(shortError(cause)); } finally { setBusy(undefined); }
  }

  async function switchNetwork() {
    if (!provider) { actions.pressWalletButton(); return; }
    setBusy("switch"); setError(undefined);
    try { await switchWalletToRobinhoodMainnet(provider); setStatus("Network switch requested and accepted by the wallet. Refresh the wallet state before requesting a quote."); }
    catch (cause) { setError(shortError(cause)); }
    finally { setBusy(undefined); }
  }

  async function checkSwap() {
    if (!provider || !quote || !matchingQuote) return;
    setBusy("preflight"); setError(undefined); setStatus(undefined); setPreflightReady(false); setApprovalNeeded(false); setPreflight(undefined);
    try {
      const result = await preflightRobinhoodSwap(provider, quote);
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
    } catch (cause) { setError(shortError(cause)); }
    finally { setBusy(undefined); }
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
      setLastTransaction({ kind: "approval", hash: result.hash as `0x${string}` });
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
      setLastTransaction({ kind: "swap", hash: hash as `0x${string}` });
      setStatus(`Wallet returned transaction ${hash}. ${saved ? "Saved to this browser's Activity; receipt status is checked against Mainnet RPC." : "Browser storage was unavailable; copy the hash before leaving."} This EVM transaction is not post-quantum protected.`);
      setQuote(undefined); setReviewedDigest(undefined); setAttestation(undefined); setAttestationImplementation(undefined); setPublicKeyFingerprint(undefined); setAttestedIntent(undefined); setExecutionNonce(undefined); setPreflight(undefined); setPreflightReady(false);
    } catch (cause) { setError(shortError(cause)); }
    finally { setBusy(undefined); }
  }

  async function createAttestation() {
    if (!quote || !matchingQuote || !taker || !executionNonce || !preflightReady) return;
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
      setAttestedIntent(intent);
      setAttestation(result.attestation);
      setAttestationImplementation(result.implementation);
      setPublicKeyFingerprint(fingerprint);
      setStatus(`The exact Mainnet intent and pending EVM nonce were signed and verified locally with the ${result.implementation === "webcrypto-native" ? "browser WebCrypto implementation" : "JavaScript fallback"}. No private key was persisted or sent to VEYRA. This off-chain attestation does not authorize or quantum-protect the EVM transaction.`);
    } catch (cause) { setError(shortError(cause)); }
    finally { setBusy(undefined); }
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

  return (
    <div className="sp-grid">
      <div className="sp-form">
        <div className="sp-box">
          <div className="sp-top"><label htmlFor="mainnet-swap-amount">You pay</label>
            <select aria-label="Token you pay on Robinhood Mainnet" value={tokenIn} onChange={(event) => editTokenIn(event.target.value as RobinhoodSwapTokenId)}>
              {SWAP_TOKENS.map((token) => <option key={token} value={token}>{ROBINHOOD_MAINNET_TOKENS[token].symbol}</option>)}
            </select>
          </div>
          <input id="mainnet-swap-amount" className="sp-amt" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onChange={(event) => editAmount(event.target.value)} />
          <small>Only canonical Robinhood Mainnet ETH, WETH, and USDG addresses are accepted. Token decimals are re-read from chain bytecode.</small>
        </div>
        <div className="sp-box">
          <div className="sp-top"><label htmlFor="mainnet-swap-receive">You receive</label>
            <select id="mainnet-swap-receive" aria-label="Token to receive on Robinhood Mainnet" value={tokenOut} onChange={(event) => editTokenOut(event.target.value as RobinhoodSwapTokenId)}>
              {SWAP_TOKENS.map((token) => <option key={token} value={token}>{ROBINHOOD_MAINNET_TOKENS[token].symbol}</option>)}
            </select>
          </div>
          <span className="sp-amt none">{quote ? `${displayAmount(quote.amountOut, quote.tokenOut.decimals)} ${quote.tokenOut.symbol} expected` : price ? `${displayAmount(price.amountOut, price.tokenOut.decimals)} ${price.tokenOut.symbol} indicative` : "No route quoted"}</span>
          <small>Indicative prices cannot be signed. A firm quote includes a verified executable payload and short expiry.</small>
        </div>
        <div className="sp-slip">
          <label htmlFor="mainnet-swap-slippage">Maximum slippage</label>
          <select id="mainnet-swap-slippage" value={slippage} onChange={(event) => editSlippage(event.target.value)}>
            {["50", "100", "300", "500", "1000"].map((basisPoints) => <option key={basisPoints} value={basisPoints}>{Number(basisPoints) / 100}%</option>)}
          </select>
        </div>
        <dl className="sp-q">
          <div><dt>Network</dt><dd>Robinhood Mainnet · 4663 only</dd></div>
          <div><dt>Expected output</dt><dd>{quote ? `${displayAmount(quote.amountOut, quote.tokenOut.decimals)} ${quote.tokenOut.symbol}` : price ? `${displayAmount(price.amountOut, price.tokenOut.decimals)} ${price.tokenOut.symbol} · indicative` : "Not quoted"}</dd></div>
          <div><dt>Minimum received</dt><dd>{quote ? `${displayAmount(quote.minimumReceived, quote.tokenOut.decimals)} ${quote.tokenOut.symbol}` : "Not quoted"}</dd></div>
          {quote ? <div><dt>Sell balance · 0x quote</dt><dd>{formatMainnetTokenAmount(quote.walletBalance.actual, quote.tokenIn.decimals) === undefined ? "Not returned by quote provider" : `${formatMainnetTokenAmount(quote.walletBalance.actual, quote.tokenIn.decimals)} ${quote.tokenIn.symbol}`}</dd></div> : null}
          {quote ? <div><dt>Quote-provider balance check</dt><dd>{quote.walletBalance.sufficient ? "0x reports sufficient balance" : "0x reports insufficient balance; wallet preflight still required"}</dd></div> : null}
          <div><dt>Estimated gas</dt><dd>{quote ? `${quote.estimatedGas} units · fee ${quote.totalNetworkFee ? `${displayAmount(quote.totalNetworkFee, 18)} ETH` : "wallet estimate required"}` : "Not quoted"}</dd></div>
          <div><dt>Route</dt><dd>{quote ? quote.route.map((fill) => fill.source).join(" → ") : price ? price.route.map((fill) => fill.source).join(" → ") : "Not available"}</dd></div>
          {quote ? <div><dt>0x fees</dt><dd><code>{JSON.stringify(quote.fees ?? null)}</code></dd></div> : null}
        </dl>
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

        {quote ? (
          <>
            <section className="sp-review" aria-labelledby="mainnet-intent-heading">
              <h3 id="mainnet-intent-heading">Review Mainnet transaction intent</h3>
              <dl className="kv">
                <div><dt>Wallet / recipient</dt><dd><code>{quote.taker}</code></dd></div>
                <div><dt>Chain</dt><dd>{quote.chainId}</dd></div>
                <div><dt>Sell</dt><dd>{displayAmount(quote.amountIn, quote.tokenIn.decimals)} {quote.tokenIn.symbol} · {quote.tokenIn.address}</dd></div>
                <div><dt>Expected output</dt><dd>{displayAmount(quote.amountOut, quote.tokenOut.decimals)} {quote.tokenOut.symbol}</dd></div>
                <div><dt>Buy minimum</dt><dd>{displayAmount(quote.minimumReceived, quote.tokenOut.decimals)} {quote.tokenOut.symbol} · {quote.tokenOut.address}</dd></div>
                <div><dt>Slippage</dt><dd>{quote.slippageBps} bps</dd></div>
                <div><dt>Approval spender</dt><dd>{quote.allowance.spender ?? "No ERC-20 allowance (native ETH)"}</dd></div>
                <div><dt>Execution target</dt><dd>{quote.transaction.to}</dd></div>
                <div><dt>Value / gas</dt><dd>{quote.transaction.value} wei · {quote.transaction.gas}</dd></div>
                <div><dt>Quote expires</dt><dd>{quote.expiresAt}</dd></div>
                <div><dt>Canonical quote digest</dt><dd><code>{quote.quoteDigest}</code></dd></div>
              </dl>
              {!matchingQuote ? <p role="status">The current quote does not match the reviewed digest. Review it again.</p> : null}
            </section>
            <div className="sp-actions">
              <Button variant="outline" disabled={!quoteContextMatches || busy !== undefined} onClick={() => { setReviewedDigest(quote.quoteDigest); setPreflightReady(false); setPreflight(undefined); setAttestation(undefined); setPublicKeyFingerprint(undefined); setAttestedIntent(undefined); setStatus("This exact amount, chain, wallet, recipient, output minimum, spender, target, calldata digest, value, slippage, route, gas, and expiry are marked as reviewed."); }}>Review these exact details</Button>
              <Button variant="outline" disabled={!matchingQuote || !preflightReady || !executionNonce || busy !== undefined} onClick={() => { void createAttestation(); }}>{busy === "attest" ? "Generating and verifying ML-DSA…" : attestation ? "Create new PQ attestation" : "Sign intent with ML-DSA-44"}</Button>
            </div>
            {attestation ? (
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
              <Button variant="outline" disabled={!provider || !matchingQuote || busy !== undefined} onClick={() => { void checkSwap(); }}>{busy === "preflight" ? "Checking chain and wallet…" : "Check balance, allowance, and contracts"}</Button>
              {approvalNeeded ? <Button className="swapbtn" disabled={!provider || busy !== undefined || !matchingQuote} onClick={() => { void approveAmount(); }}>{busy === "approval" ? "Waiting for wallet approval…" : `Approve exact ${quote.tokenIn.symbol} amount`}</Button> : null}
              {preflightReady ? <Button className="swapbtn" disabled={!provider || busy !== undefined || !matchingQuote || !networkReady} onClick={() => { void sendSwap(); }}>{busy === "send" ? "Waiting for wallet transaction…" : "Send reviewed Mainnet swap"}</Button> : null}
            </div>
            {preflight ? (() => {
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
        {lastTransaction ? (
          <p className="sp-note" role="status">
            {lastTransaction.kind === "approval" ? "Approval transaction submitted" : "Mainnet swap transaction submitted"}: <code>{lastTransaction.hash}</code>{" "}
            {getExplorerTransactionUrl("mainnet", lastTransaction.hash) ? <a href={getExplorerTransactionUrl("mainnet", lastTransaction.hash)} target="_blank" rel="noopener noreferrer">View on Robinhood Mainnet explorer</a> : null}{" "}
            Receipt status is checked in Activity. On-chain PQ enforcement is unavailable.
          </p>
        ) : null}
        <p className="sp-fee">Each transaction is separately authorized by your external wallet. ERC-20 approvals are capped at the quoted sell amount and target 0x AllowanceHolder, never Settler. Robinhood Mainnet fees are real and may be lost on a reverted transaction.</p>
      </div>
      <aside className="sp-review">
        <h3>Execution boundary</h3>
        <p>No VEYRA-owned contracts are required for this external DEX route. Only the server issues 0x API requests; the browser receives quote data, never the API credential.</p>
        <p>Contract bytecode and the 0x Settler registry are checked over chain 4663 before quotes are returned and again through the selected wallet before a swap.</p>
        <p>A PQ intent signature is a separate, optional off-chain attestation. Robinhood Chain still executes the ordinary EVM wallet transaction.</p>
        <p>Configured tokens: {SWAP_TOKENS.map((token) => `${ROBINHOOD_MAINNET_TOKENS[token].symbol} ${ROBINHOOD_MAINNET_TOKENS[token].address}`).join(" · ")}</p>
      </aside>
    </div>
  );
}
