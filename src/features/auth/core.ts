import { createHmac, createPublicKey, randomInt, verify as verifySignature } from "node:crypto";
import { getAddress, isAddress } from "viem";
import { configuredWalletAuthOrigin, hasWalletAuthConfiguration } from "@/features/security/wallet-auth";

export interface AuthCapabilities {
  wallet: boolean;
  password: boolean;
  google: boolean;
  email: boolean;
  database: boolean;
  embeddedWallet: boolean;
}

export function hasAuthSessionConfiguration(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.DATABASE_URL?.trim() && configuredWalletAuthOrigin(env)
    && env.VEYRA_USER_SESSION_SECRET && Buffer.byteLength(env.VEYRA_USER_SESSION_SECRET, "utf8") >= 32);
}

export function getAuthCapabilities(env: NodeJS.ProcessEnv = process.env): AuthCapabilities {
  const base = hasAuthSessionConfiguration(env);
  return {
    wallet: base && hasWalletAuthConfiguration(env),
    password: base,
    google: base && Boolean(env.VEYRA_GOOGLE_CLIENT_ID?.trim() && env.VEYRA_GOOGLE_CLIENT_SECRET?.trim()),
    email: base && Boolean(env.RESEND_API_KEY?.trim() && validEmailFrom(env.VEYRA_EMAIL_FROM)),
    database: Boolean(env.DATABASE_URL?.trim()),
    embeddedWallet: false,
  };
}

function validEmailFrom(value: string | undefined): boolean {
  if (!value || value.length > 254 || /[\r\n]/.test(value)) return false;
  const address = value.match(/<([^<>]+)>/)?.[1] ?? value;
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address);
}

export function normalizeEmailAddress(value: string): string | undefined {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return undefined;
  return email;
}

export function hashEmailOtp(email: string, code: string, secret: string): string {
  const normalized = normalizeEmailAddress(email);
  if (!normalized || !/^\d{6}$/.test(code) || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("invalid_email_otp_input");
  }
  return createHmac("sha256", secret).update(`veyra-email-otp:v1:${normalized}:${code}`).digest("hex");
}

export function emailLookupHash(email: string, secret: string): string {
  const normalized = normalizeEmailAddress(email);
  if (!normalized || Buffer.byteLength(secret, "utf8") < 32) throw new Error("invalid_email_address");
  return createHmac("sha256", secret).update(`veyra-email:v1:${normalized}`).digest("hex");
}

export function generateEmailOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface GoogleIdentityClaims {
  subject: string;
  email: string;
  emailVerified: true;
}

export type GoogleJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

export async function loadGoogleSigningKeys(): Promise<GoogleJwk[]> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("google_signing_keys_unavailable");
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || !Array.isArray((value as { keys?: unknown }).keys)) {
    throw new Error("google_signing_keys_invalid");
  }
  return (value as { keys: GoogleJwk[] }).keys;
}

export async function verifyGoogleIdToken(
  token: string,
  options: {
    clientId: string;
    nonce: string;
    now?: number;
    getKeys?: () => Promise<GoogleJwk[]>;
  },
): Promise<GoogleIdentityClaims> {
  if (token.length > 16_384) throw new Error("google_token_invalid");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("google_token_invalid");
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Record<string, unknown>;
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("google_token_invalid");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("google_token_algorithm_invalid");
  const key = (await (options.getKeys ?? loadGoogleSigningKeys)()).find((candidate) => candidate.kid === header.kid
    && candidate.kty === "RSA" && (!candidate.use || candidate.use === "sig")
    && (!candidate.alg || candidate.alg === "RS256"));
  if (!key) throw new Error("google_signing_key_not_found");
  let validSignature = false;
  try {
    validSignature = verifySignature("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: key as unknown as import("node:crypto").JsonWebKey, format: "jwk" }), Buffer.from(parts[2], "base64url"));
  } catch {
    validSignature = false;
  }
  if (!validSignature) throw new Error("google_signature_invalid");

  const now = Math.floor((options.now ?? Date.now()) / 1_000);
  const audiences = typeof claims.aud === "string" ? [claims.aud]
    : Array.isArray(claims.aud) ? claims.aud.filter((aud): aud is string => typeof aud === "string") : [];
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") throw new Error("google_issuer_invalid");
  if (!audiences.includes(options.clientId) || (claims.azp !== undefined && claims.azp !== options.clientId)
    || (audiences.length > 1 && claims.azp !== options.clientId)) throw new Error("google_audience_invalid");
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("google_token_expired");
  if (typeof claims.iat !== "number" || claims.iat > now + 60) throw new Error("google_token_issued_at_invalid");
  if (typeof claims.nonce !== "string" || claims.nonce !== options.nonce) throw new Error("google_nonce_invalid");
  if (typeof claims.sub !== "string" || claims.sub.length < 1 || claims.sub.length > 255) throw new Error("google_subject_invalid");
  const email = typeof claims.email === "string" ? normalizeEmailAddress(claims.email) : undefined;
  if (!email || claims.email_verified !== true) throw new Error("google_email_unverified");
  return { subject: claims.sub, email, emailVerified: true };
}

export function createWalletLinkMessage(input: {
  address: string;
  chainId: number;
  nonce: string;
  origin: string;
  now?: number;
}): string {
  if (!isAddress(input.address) || !/^[a-f0-9]{32}$/i.test(input.nonce)
    || ![4_663, 46_630].includes(input.chainId)) throw new Error("invalid_wallet_link_challenge");
  const url = new URL(input.origin);
  const isLocalHttp = process.env.NODE_ENV !== "production" && url.protocol === "http:"
    && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.origin !== input.origin || (url.protocol !== "https:" && !isLocalHttp)) throw new Error("invalid_wallet_link_origin");
  const issuedAt = new Date(input.now ?? Date.now());
  const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000);
  return [
    `${url.host} wants you to link this wallet to your VEYRA account:`,
    getAddress(input.address),
    "",
    "This EIP-191 message proves control of this wallet. It will not approve tokens or authorize transactions.",
    "",
    `URI: ${url.origin}`,
    "Version: 1",
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expiresAt.toISOString()}`,
  ].join("\n");
}
