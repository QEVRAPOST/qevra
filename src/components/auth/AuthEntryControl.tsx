"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useLiveResearchAccess } from "@/features/dashboard/LiveAppProvider";
import { useAppModel } from "@/components/dashboard/DemoAppProvider";
import { AuthApiError, getAuthCapabilities, getCurrentAuthSession, loginWithPassword, logoutAuthSession, registerPasswordAccount } from "@/features/auth/client";
import type { AuthCapabilities, AuthCurrentSession } from "@/features/auth/contracts";
import { AuthDialog, type AuthDialogStep } from "./AuthDialog";

export const AUTH_ENTRY_OPEN_EVENT = "veyra:open-auth-entry";

function compactAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function presentPasswordError(error: unknown, action: "signin" | "register"): string {
  const code = error instanceof AuthApiError ? error.code : "";
  if (code === "invalid_credentials" || code === "invalid_credentials_input") return "The email or password is incorrect. Check both and try again.";
  if (code === "account_already_exists") return "An account already exists for this email. Choose Sign in to continue.";
  if (code === "password_too_short") return "Use a password with at least 15 characters.";
  if (code === "password_too_long") return "Use a password with no more than 128 characters.";
  if (code === "invalid_email") return "Enter a valid email address.";
  if (code === "rate_limit_exceeded") return "Too many attempts. Wait a little before trying again.";
  if (code === "origin_not_allowed" || code === "auth_origin_not_configured") return "This site does not match VEYRA’s configured authentication origin. Open the configured VEYRA address and try again.";
  if (code.includes("not_configured")) return "Email/password authentication is not configured on this server.";
  if (code.includes("persistence") || code.includes("unavailable")) return "Account authentication is temporarily unavailable. Try again shortly.";
  if (error instanceof Error && error.message) return error.message;
  return action === "register" ? "Your VEYRA account could not be created. Try again." : "Sign-in could not be completed. Check your details and try again.";
}

export function AuthEntryControl() {
  const access = useLiveResearchAccess();
  const { model, actions } = useAppModel();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<AuthDialogStep>("signin");
  const [pendingAuthOpen, setPendingAuthOpen] = useState(false);
  const [authCapabilities, setAuthCapabilities] = useState<Pick<AuthCapabilities, "password"> | null>();
  const [accountSession, setAccountSession] = useState<AuthCurrentSession | null>(null);
  const [authNotice, setAuthNotice] = useState<string>();
  const [sessionCheckError, setSessionCheckError] = useState<string>();
  const [sessionRestoring, setSessionRestoring] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const sessionRequest = useRef(0);
  const accountMenuRef = useRef<HTMLDetailsElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setDialogStep("signin");
  }, []);

  const refreshAccountSession = useCallback(async () => {
    const requestId = ++sessionRequest.current;
    setSessionRestoring(true);
    try {
      const session = await getCurrentAuthSession();
      if (sessionRequest.current === requestId) {
        setAccountSession(session);
        setSessionCheckError(undefined);
      }
    } catch {
      if (sessionRequest.current === requestId) {
        setAccountSession(null);
        setSessionCheckError("The VEYRA account session could not be checked. Retry before relying on a saved sign-in.");
      }
    } finally {
      if (sessionRequest.current === requestId) setSessionRestoring(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const url = new URL(window.location.href);
      const shouldOpen = url.searchParams.get("auth") === "1";
      const authError = url.searchParams.get("auth_error");
      if (!shouldOpen && !authError) return;
      url.searchParams.delete("auth");
      url.searchParams.delete("auth_error");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      if (authError) setAuthNotice("Your previous sign-in could not be restored. Sign in again.");
      setPendingAuthOpen(shouldOpen || Boolean(authError));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void refreshAccountSession(); });
    return () => window.cancelAnimationFrame(frame);
  }, [access?.gate, refreshAccountSession]);

  useEffect(() => {
    let activeRequest = true;
    getAuthCapabilities().then((capabilities) => {
      if (activeRequest) setAuthCapabilities({ password: capabilities.password });
    }).catch(() => {
      if (activeRequest) setAuthCapabilities(null);
    });
    return () => { activeRequest = false; };
  }, []);

  useEffect(() => {
    const expiresAt = accountSession?.identity?.expiresAt;
    if (!expiresAt) return;
    const expiresIn = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(expiresIn)) return;
    const timer = window.setTimeout(() => { void refreshAccountSession(); }, Math.max(0, Math.min(expiresIn, 2_147_000_000)));
    return () => window.clearTimeout(timer);
  }, [accountSession?.identity?.expiresAt, refreshAccountSession]);

  useEffect(() => {
    const openAuthEntry = (event: Event) => {
      const requestedStep = (event as CustomEvent<{ step?: AuthDialogStep }>).detail?.step;
      setDialogStep(requestedStep === "wallet" ? "wallet" : "signin");
      setOpen(true);
    };
    window.addEventListener(AUTH_ENTRY_OPEN_EVENT, openAuthEntry);
    return () => window.removeEventListener(AUTH_ENTRY_OPEN_EVENT, openAuthEntry);
  }, []);

  const identity = accountSession?.authenticated ? accountSession.identity : undefined;
  const operatorAuthenticated = Boolean(accountSession?.operatorAuthenticated || access?.authenticationMethod === "operator");
  const authenticated = Boolean(accountSession?.authenticated || access?.gate === "authenticated");
  const address = accountSession?.walletSession?.authenticated
    ? accountSession.walletSession.address
    : access?.authenticationMethod === "wallet" ? access.authenticatedAddress : undefined;
  const email = identity?.email;
  const showDialog = open && !(dialogStep === "wallet" && access?.gate === "authenticated");

  useEffect(() => {
    if (!pendingAuthOpen || sessionRestoring || access?.gate === "checking") return;
    const frame = window.requestAnimationFrame(() => {
      setPendingAuthOpen(false);
      if (!authenticated) {
        setDialogStep("signin");
        setOpen(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingAuthOpen, sessionRestoring, access?.gate, authenticated]);

  useEffect(() => {
    if (!open || dialogStep !== "wallet" || access?.gate !== "authenticated") return;
    const frame = window.requestAnimationFrame(close);
    return () => window.cancelAnimationFrame(frame);
  }, [open, dialogStep, access?.gate, close]);

  const signOut = async () => {
    if (signingOut) return;
    sessionRequest.current += 1;
    setSigningOut(true);
    setAuthNotice(undefined);
    try {
      if (identity || accountSession?.walletSession?.authenticated) await logoutAuthSession();
      if (operatorAuthenticated || access?.gate === "authenticated") actions.logout();
      setAccountSession({ authenticated: false, walletSession: { authenticated: false } });
      setOpen(false);
    } catch (error) {
      setAuthNotice(error instanceof Error ? error.message : "The server could not confirm sign-out. Try again shortly.");
    } finally {
      setSigningOut(false);
      void refreshAccountSession();
    }
  };

  const submitPassword = async (action: "signin" | "register", email: string, password: string) => {
    try {
      const session = action === "register"
        ? await registerPasswordAccount({ email, password })
        : await loginWithPassword({ email, password });
      if (!session.authenticated || session.identity?.provider !== "password") {
        throw new Error("The authentication service did not confirm a VEYRA account session.");
      }
      sessionRequest.current += 1;
      setAccountSession(session);
      setSessionRestoring(false);
      setAuthNotice(undefined);
      setSessionCheckError(undefined);
    } catch (error) {
      throw new Error(presentPasswordError(error, action));
    }
  };

  const menuLabel = operatorAuthenticated ? "Operator" : address ? compactAddress(address) : email ?? "VEYRA account";
  const accountStatus = operatorAuthenticated ? "Operator administration session active"
    : address ? "Wallet research access verified" : "VEYRA account active";

  return (
    <div className="auth-entry">
      {authenticated ? (
        <details ref={accountMenuRef} className="auth-account-menu">
          <summary className="auth-entry-trigger" aria-label="Open VEYRA account menu">
            <span className="auth-account-dot" aria-hidden="true" />
            <span>{menuLabel}</span>
          </summary>
          <div className="auth-account-panel">
            <p className="auth-account-state" role="status">{accountStatus}</p>
            {email ? <p>{email}</p> : null}
            {address ? <p className="auth-account-state">Wallet ownership verified for research access</p> : identity ? <p>This VEYRA Account is separate from a blockchain wallet. Built-in wallet setup is not available yet; external wallets are optional.</p> : null}
            {address ? <code>{address}</code> : null}
            <p>Sign out ends the VEYRA session. It does not disconnect an external browser wallet.</p>
            <nav className="auth-account-links" aria-label="Account destinations">
              <Link href="/app" onClick={() => accountMenuRef.current?.removeAttribute("open")}>Open dashboard <span aria-hidden="true">→</span></Link>
              <Link href="/app/wallet" onClick={() => accountMenuRef.current?.removeAttribute("open")}>Open wallet overview <span aria-hidden="true">→</span></Link>
              <Link href="/app/security" onClick={() => accountMenuRef.current?.removeAttribute("open")}>Open Security Swarm <span aria-hidden="true">→</span></Link>
            </nav>
            {authNotice ? <p className="auth-error" role="alert">{authNotice}</p> : null}
            <Button variant="ghost" size="small" disabled={signingOut} onClick={() => { void signOut(); }}>{signingOut ? "Signing out…" : "Sign out"}</Button>
          </div>
        </details>
      ) : (
        <Button className="auth-entry-trigger" variant="ghost" size="small" disabled={sessionRestoring || access?.gate === "checking" && !accountSession} onClick={() => { setDialogStep("signin"); setOpen(true); }}>
          {sessionRestoring || access?.gate === "checking" && !accountSession ? "Checking…" : "Sign in"}
        </Button>
      )}
      <AuthDialog
        key={dialogStep}
        open={showDialog}
        onClose={close}
        initialStep={dialogStep}
        onSetNetwork={actions.setNetwork}
        access={access}
        authCapabilities={authCapabilities}
        accountSession={accountSession}
        sessionRestoring={sessionRestoring}
        authNotice={authNotice}
        sessionCheckError={sessionCheckError}
        onPasswordLogin={(email, password) => submitPassword("signin", email, password)}
        onPasswordRegister={(email, password) => submitPassword("register", email, password)}
        onPasswordSuccess={() => { close(); router.push("/app"); }}
        previewMode={model.mode !== "live"}
      />
    </div>
  );
}
