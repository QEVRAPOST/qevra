import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const AUTH_SESSION_COOKIE = "veyra_auth_session";
export const AUTH_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const GOOGLE_STATE_COOKIE = "veyra_google_state";
export const AUTH_SESSION_SECRET_ENV = "VEYRA_USER_SESSION_SECRET";

export interface NewAuthSession {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

export interface GoogleOAuthState {
  state: string;
  nonce: string;
  codeVerifier: string;
  cookieValue: string;
  expiresAt: string;
}

function secret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[AUTH_SESSION_SECRET_ENV];
  return value && Buffer.byteLength(value, "utf8") >= 32 ? value : undefined;
}

export function createNewAuthSession(now = Date.now(), lifetimeSeconds = AUTH_SESSION_SECONDS): NewAuthSession {
  if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 60 || lifetimeSeconds > AUTH_SESSION_SECONDS) {
    throw new Error("invalid_auth_session_lifetime");
  }
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(now + lifetimeSeconds * 1_000).toISOString(),
  };
}

export function hashAuthSessionToken(token: string): string | undefined {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  return createHash("sha256").update(token).digest("hex");
}

function mac(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createGoogleOAuthState(now = Date.now(), env: NodeJS.ProcessEnv = process.env): GoogleOAuthState | undefined {
  const key = secret(env);
  if (!key) return undefined;
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const expiresAtMs = now + 10 * 60_000;
  const payload = ["g1", expiresAtMs, state, nonce, codeVerifier].join(".");
  return {
    state,
    nonce,
    codeVerifier,
    cookieValue: `${payload}.${mac(payload, key)}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function verifyGoogleOAuthStateCookie(
  value: string | undefined,
  expectedState: string,
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): Omit<GoogleOAuthState, "cookieValue"> | undefined {
  const key = secret(env);
  if (!key || !value || value.length > 512) return undefined;
  const parts = value.split(".");
  if (parts.length !== 6 || parts[0] !== "g1" || !/^\d+$/.test(parts[1])
    || !/^[A-Za-z0-9_-]{43}$/.test(parts[2]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[3])
    || !/^[A-Za-z0-9_-]{43}$/.test(parts[4])) return undefined;
  const expiresAtMs = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= now || parts[2] !== expectedState) return undefined;
  const payload = parts.slice(0, 5).join(".");
  const expected = Buffer.from(mac(payload, key));
  const actual = Buffer.from(parts[5]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
  return {
    state: parts[2],
    nonce: parts[3],
    codeVerifier: parts[4],
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function createPkceChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function setAuthSessionCookie(
  response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } },
  token: string,
  env = process.env,
  maxAge = AUTH_SESSION_SECONDS,
): void {
  response.cookies.set(AUTH_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}

export function clearAuthSessionCookie(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }, env = process.env): void {
  response.cookies.set(AUTH_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export function setGoogleStateCookie(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }, value: string, env = process.env): void {
  response.cookies.set(GOOGLE_STATE_COOKIE, value, {
    httpOnly: true,
    secure: env.NODE_ENV === "production" || Boolean(env.VEYRA_AUTH_ORIGIN?.startsWith("https://")),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 10 * 60,
  });
}

export function clearGoogleStateCookie(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }, env = process.env): void {
  response.cookies.set(GOOGLE_STATE_COOKIE, "", {
    httpOnly: true,
    secure: env.NODE_ENV === "production" || Boolean(env.VEYRA_AUTH_ORIGIN?.startsWith("https://")),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 0,
  });
}
