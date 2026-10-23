"use client";

import { useCallback, useRef, useState, type FormEvent, type RefObject } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { useOverlay } from "@/lib/use-overlay";
import { NETWORKS } from "@/lib/config/networks";
import type { NetworkId, ReadOnlyWalletState } from "@/types";
import type { WalletAuthChallenge } from "@/features/security/client";
import type { AuthCapabilities, AuthCurrentSession } from "@/features/auth/contracts";

export interface AuthEntryAccess {
  gate: "checking" | "unauthenticated" | "authenticated" | "not_configured" | "service_error" | "rate_limited";
  message?: string;
  wallet: ReadOnlyWalletState;
  selectedNetwork: NetworkId;
  authenticationMethod?: "wallet" | "operator";
  authenticatedAddress?: `0x${string}`;
  walletAuthConfigured: boolean;
  signInChallenge?: WalletAuthChallenge;
  signInBusy: boolean;
  signInError?: string;
  connectWallet: () => void;
  requestWalletSignIn: () => Promise<void>;
  approveWalletSignIn: () => Promise<void>;
  cancelWalletSignIn: () => void;
  retry: () => void;
}

export interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
  onSetNetwork: (network: NetworkId) => void;
  access: AuthEntryAccess | null;
  authCapabilities?: Pick<AuthCapabilities, "password"> | null;
  accountSession?: AuthCurrentSession | null;
  sessionRestoring?: boolean;
  authNotice?: string;
  sessionCheckError?: string;
  onPasswordLogin?: (email: string, password: string) => Promise<void>;
  onPasswordRegister?: (email: string, password: string) => Promise<void>;
  onPasswordSuccess?: () => void;
  previewMode?: boolean;
  dialogRef?: RefObject<HTMLDivElement | null>;
  initialStep?: AuthDialogStep;
}

export type AuthDialogStep = "signin" | "register" | "wallet";

export function AuthDialog({ open, onClose, onSetNetwork, access, authCapabilities, accountSession, sessionRestoring = false, authNotice, sessionCheckError, onPasswordLogin, onPasswordRegister, onPasswordSuccess, previewMode = false, dialogRef, initialStep = "signin" }: AuthDialogProps) {
  const [step, setStep] = useState<AuthDialogStep>(initialStep);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [passwordAction, setPasswordAction] = useState<"signin" | "register">();
  const localDialogRef = useRef<HTMLDivElement>(null);
  const activeDialogRef = dialogRef ?? localDialogRef;
  const closeDialog = useCallback(() => {
    setStep("signin");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setFormError(undefined);
    onClose();
  }, [onClose]);
  useOverlay(open, closeDialog, activeDialogRef, { inertSelector: ".wsmain", initialFocus: "input" });

  if (!open) return null;

  const selected = NETWORKS.find((network) => network.id === access?.selectedNetwork);
  const wallet = access?.wallet;
  const hasWallet = Boolean(wallet?.address);
  const matchesNetwork = Boolean(wallet?.address && selected && wallet.chainId === selected.chainId);
  const identity = accountSession?.authenticated ? accountSession.identity : undefined;
  const accountReady = Boolean(accountSession?.authenticated && identity);
  const sessionReady = step === "wallet"
    ? access?.gate === "authenticated"
    : accountReady || access?.gate === "authenticated";
  const accountEmail = identity?.email;
  const accountWalletAddress = accountSession?.walletSession?.authenticated
    ? accountSession.walletSession.address
    : access?.authenticationMethod === "wallet" ? access.authenticatedAddress : undefined;
  const isPasswordForm = step === "signin" || step === "register";
  const passwordVisible = showPassword ? "text" : "password";
  const passwordLength = Array.from(password).length;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordAvailable = authCapabilities?.password === true;
  const loginSetupMessage = passwordAvailable
    ? step === "register" ? "Use 15–128 characters for your password. Your VEYRA Account is separate from any blockchain wallet." : "Use your VEYRA account email and password. An external wallet is not required."
    : authCapabilities === undefined ? "Checking email/password authentication setup…"
      : authCapabilities === null ? "Account authentication setup could not be checked. Try again shortly."
        : "Email/password authentication is not configured on this server. The form will not submit or create an account or session.";
  const submitLabel = passwordAction
    ? passwordAction === "register" ? "Creating account…" : "Signing in…"
    : authCapabilities === undefined ? "Checking setup…"
      : step === "register" ? passwordAvailable ? "Create account" : "Create account unavailable"
        : passwordAvailable ? "Sign in" : "Sign in unavailable";

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!emailValid) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (!passwordAvailable) {
      setFormError(loginSetupMessage);
      return;
    }
    if (step === "register" && (passwordLength < 15 || passwordLength > 128)) {
      setFormError(passwordLength < 15 ? "Use a password with at least 15 characters." : "Use a password with no more than 128 characters.");
      return;
    }
    if (step === "register" && password !== confirmPassword) {
      setFormError("The passwords do not match.");
      return;
    }
    if (step === "wallet") return;
    const action = step;
    const submit = action === "register" ? onPasswordRegister : onPasswordLogin;
    if (!submit || passwordAction) return;
    setFormError(undefined);
    setPasswordAction(action);
    try {
      await submit(email.trim(), password);
      setPassword("");
      setConfirmPassword("");
      setFormError(undefined);
      onPasswordSuccess?.();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : action === "register" ? "Your account could not be created. Try again." : "Sign-in could not be completed. Check your details and try again.");
    } finally {
      setPasswordAction(undefined);
    }
  };

  const dialog = (
    <div className="auth-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section
        ref={activeDialogRef}
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        aria-describedby="auth-dialog-description"
        tabIndex={-1}
      >
        <header className="auth-dialog-head">
          <div>
            <p className="auth-kicker">VEYRA · ACCOUNT ACCESS</p>
            <h2 id="auth-dialog-title">{sessionReady ? "Welcome back." : step === "register" ? "Create your VEYRA account" : step === "wallet" ? "External wallet access" : "Sign in to VEYRA"}</h2>
          </div>
          <Button variant="quiet" size="icon" aria-label="Close sign-in dialog" onClick={closeDialog}>×</Button>
        </header>

        {sessionReady ? (
          <div className="auth-success" id="auth-dialog-description">
            <p className="auth-status-mark" role="status">
              {access?.authenticationMethod === "operator" ? "Operator session active" : access?.authenticationMethod === "wallet" || identity?.provider === "wallet" || accountWalletAddress ? "Wallet research session verified" : "VEYRA account active"}
            </p>
            {accountEmail ? <p>{accountEmail}</p> : null}
            {accountWalletAddress ? <code className="auth-account-address">{accountWalletAddress}</code> : null}
            {accountReady && !accountWalletAddress ? <p>Your VEYRA Account is separate from a blockchain wallet. An external wallet is optional and is only needed for wallet-owned research access.</p> : null}
            <p>Signing out ends the VEYRA session. It does not disconnect an external browser wallet.</p>
            <div className="auth-actions">
              <Link className="auth-primary-link" href="/app" onClick={closeDialog}>Continue to dashboard <span aria-hidden="true">→</span></Link>
              <Link className="auth-secondary-link" href="/app/wallet" onClick={closeDialog}>Open wallet overview</Link>
              {accountReady && !accountWalletAddress ? <Button variant="ghost" onClick={() => setStep("wallet")}>Optional: verify an external wallet for research</Button> : null}
            </div>
          </div>
        ) : isPasswordForm ? (
          <>
            <p id="auth-dialog-description" className="auth-intro">Building the future of post-quantum DeFi on Robinhood Chain. Your VEYRA Account is separate from any blockchain wallet.</p>
            {sessionRestoring || access?.gate === "checking" ? <p className="auth-inline-status" role="status">Restoring your VEYRA session…</p> : null}
            {accountSession?.expired || access?.message?.toLowerCase().includes("expired") ? <p className="auth-inline-status" role="status">Your previous session expired. Sign in again to continue.</p> : null}
            {sessionCheckError ? <p className="auth-error" role="alert">{sessionCheckError}</p> : null}
            {authNotice ? <p className="auth-error" role="alert">{authNotice}</p> : null}
            <div className="auth-tabs" role="group" aria-label="Account access mode">
              <Button variant="ghost" aria-pressed={step === "signin"} onClick={() => { setStep("signin"); setFormError(undefined); }}>Sign in</Button>
              <Button variant="ghost" aria-pressed={step === "register"} onClick={() => { setStep("register"); setFormError(undefined); }}>Create account</Button>
            </div>
            <form className="auth-password-form" onSubmit={(event) => { void handleFormSubmit(event); }}>
              <label className="auth-field" htmlFor="auth-email">Email address
                <input id="auth-email" type="email" name="email" autoComplete="email" inputMode="email" required aria-invalid={email.length > 0 && !emailValid} value={email} onChange={(event) => { setEmail(event.target.value); setFormError(undefined); }} placeholder="you@example.com" />
              </label>
              <label className="auth-field" htmlFor="auth-password">Password
                <span className="auth-password-control">
                  <input id="auth-password" type={passwordVisible} name="password" autoComplete={step === "register" ? "new-password" : "current-password"} required value={password} onChange={(event) => { setPassword(event.target.value); setFormError(undefined); }} />
                  <button type="button" className="auth-show-password" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((current) => !current)}>{showPassword ? "Hide" : "Show"}</button>
                </span>
              </label>
              {step === "register" ? (
                <label className="auth-field" htmlFor="auth-confirm-password">Confirm password
                  <input id="auth-confirm-password" type={passwordVisible} name="confirmPassword" autoComplete="new-password" required aria-invalid={confirmPassword.length > 0 && password !== confirmPassword} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setFormError(undefined); }} />
                </label>
              ) : null}
              <p className="auth-inline-status" role="status">{loginSetupMessage}</p>
              {step === "register" && confirmPassword.length > 0 && password !== confirmPassword ? <p className="auth-error" role="alert">The passwords do not match.</p> : null}
              {formError ? <p className="auth-error" role="alert">{formError}</p> : null}
              <Button variant="primary" type="submit" disabled={!passwordAvailable || !emailValid || !password || (step === "register" && (passwordLength < 15 || passwordLength > 128 || password !== confirmPassword)) || Boolean(passwordAction) || (step === "register" ? !onPasswordRegister : !onPasswordLogin)}>
                {submitLabel}
              </Button>
            </form>
            <p className="auth-separation-note">No wallet connection, signature, or blockchain permission is required to enter the app.</p>
            <Button variant="ghost" className="auth-optional-wallet" onClick={() => { setStep("wallet"); setFormError(undefined); }}>Optional: use an external wallet for research access <span aria-hidden="true">→</span></Button>
          </>
        ) : (
          <div className="auth-method-panel" id="auth-dialog-description">
            <p>External wallet access is optional. It is used only when you choose to prove wallet ownership for wallet-owned research.</p>
            {previewMode ? <p className="auth-inline-status" role="status">Wallet research sign-in requires the live app. No wallet permission is requested in this preview.</p> : null}
            {access?.gate === "checking" ? <p className="auth-inline-status" role="status">Checking your existing VEYRA session…</p> : null}
            {access?.walletAuthConfigured === false && access?.gate !== "checking" ? <p className="auth-inline-status" role="status">Wallet research sign-in is not configured on this server. The public wallet read features remain separate.</p> : null}
            {hasWallet ? (
              <dl className="auth-wallet-details">
                <div><dt>Connected provider</dt><dd>{wallet?.providerName ?? "EVM wallet"}</dd></div>
                <div><dt>Authorized address</dt><dd><code>{wallet?.address}</code></dd></div>
                <div><dt>Actual wallet network</dt><dd>{wallet?.networkName ?? "Unknown network"} · chain ID {wallet?.chainId ?? "unknown"}</dd></div>
                <div><dt>Selected VEYRA network</dt><dd>
                  <label className="sr-only" htmlFor="auth-selected-network">Selected VEYRA network</label>
                  <select id="auth-selected-network" value={access?.selectedNetwork ?? "testnet"} onChange={(event) => onSetNetwork(event.target.value as NetworkId)}>
                    {NETWORKS.map((network) => <option key={network.id} value={network.id}>{network.label} · {network.chainId}</option>)}
                  </select>
                </dd></div>
              </dl>
            ) : (
              <Button variant="primary" disabled={!access || previewMode || access.gate === "authenticated"} onClick={() => access?.connectWallet()}>
                Choose an installed wallet
              </Button>
            )}
            {hasWallet && !matchesNetwork ? <p className="auth-warning" role="status">Your wallet is on {wallet?.networkName ?? `chain ${wallet?.chainId ?? "unknown"}`}. Manually select {selected?.label} (chain ID {selected?.chainId}) in your wallet, then refresh wallet status. VEYRA will never switch networks automatically.</p> : null}
            {access?.signInChallenge ? (
              <div className="auth-challenge">
                <details open>
                  <summary>Review the one-time sign-in message</summary>
                  <pre>{access.signInChallenge.message}</pre>
                </details>
                <p>Expires {access.signInChallenge.expiresAt}. This EIP-191 signature confirms a login message. It is not a blockchain transaction signature; no transaction or token approval is requested.</p>
                <div className="auth-actions">
                  <Button variant="primary" disabled={access.signInBusy || !matchesNetwork} onClick={() => { void access.approveWalletSignIn(); }}>
                    {access.signInBusy ? "Waiting for wallet approval…" : "Approve sign-in message"}
                  </Button>
                  <Button variant="ghost" disabled={access.signInBusy} onClick={access.cancelWalletSignIn}>Cancel</Button>
                </div>
              </div>
            ) : hasWallet && matchesNetwork && access?.walletAuthConfigured ? (
              <Button variant="primary" disabled={access.signInBusy || previewMode} onClick={() => { void access.requestWalletSignIn(); }}>
                {access.signInBusy ? "Preparing sign-in message…" : "Request sign-in message"}
              </Button>
            ) : null}
            {access?.signInError ? <p className="auth-error" role="alert">{access.signInError}</p> : null}
            {access?.gate === "service_error" || access?.gate === "rate_limited" ? (
              <div className="auth-inline-status" role="status"><p>{access.message ?? "The sign-in service could not be checked."}</p><Button variant="ghost" onClick={access.retry}>Retry session check</Button></div>
            ) : null}
            <p className="auth-separation-note">Only approve a message after reviewing its origin, address, and chain. This proves wallet ownership; it is not required for VEYRA Account sign-in.</p>
            <Button variant="quiet" onClick={() => { setStep("signin"); setFormError(undefined); }}>Back to email sign-in</Button>
          </div>
        )}
      </section>
    </div>
  );
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
