import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, isAddress, recoverMessageAddress } from "viem";

export const USER_SESSION_COOKIE = "veyra_user_session";
const USER_SESSION_SECONDS = 12 * 60 * 60;
const USER_SECRET_ENV = "VEYRA_USER_SESSION_SECRET";
const AUTH_ORIGIN_ENV = "VEYRA_AUTH_ORIGIN";

export interface UserWalletSession {
  address: `0x${string}`;
  sessionKey: string;
  expiresAt: number;
}

function userSecret(env: NodeJS.ProcessEnv): string | undefined {
  const secret = env[USER_SECRET_ENV];
  return secret && Buffer.byteLength(secret, "utf8") >= 32 ? secret : undefined;
}

export function configuredWalletAuthOrigin(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const configured = env[AUTH_ORIGIN_ENV]?.trim();
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    const isLocalHttp = env.NODE_ENV !== "production" && url.protocol === "http:"
      && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if ((!isLocalHttp && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function hasWalletAuthConfiguration(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(userSecret(env) && configuredWalletAuthOrigin(env));
}

export function isConfiguredWalletAuthOrigin(origin: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = configuredWalletAuthOrigin(env);
  if (!expected || !origin) return false;
  try {
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}

export function formatWalletChallenge(input: {
  address: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  origin: string;
}): string {
  if (!isAddress(input.address) || !/^[a-f0-9]{32}$/i.test(input.nonce)) throw new Error("invalid_wallet_challenge");
  const origin = new URL(input.origin);
  if (origin.origin !== input.origin || !["https:", "http:"].includes(origin.protocol)) throw new Error("invalid_wallet_origin");
  if (!Number.isInteger(input.chainId) || ![4_663, 46_630].includes(input.chainId)) throw new Error("unsupported_wallet_chain");
  if (!Number.isFinite(Date.parse(input.issuedAt)) || !Number.isFinite(Date.parse(input.expiresAt))
    || Date.parse(input.expiresAt) <= Date.parse(input.issuedAt)) throw new Error("invalid_wallet_challenge_time");

  const address = getAddress(input.address);
  return [
    `${origin.host} wants you to sign in with your Ethereum account:`,
    address,
    "",
    "Sign in to VEYRA. This request will not approve tokens or authorize transactions.",
    "",
    `URI: ${origin.origin}`,
    "Version: 1",
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${new Date(input.issuedAt).toISOString()}`,
    `Expiration Time: ${new Date(input.expiresAt).toISOString()}`,
  ].join("\n");
}

export async function verifyWalletChallengeSignature(address: string, message: string, signature: string): Promise<boolean> {
  if (!isAddress(address) || !/^0x[0-9a-f]{130}$/i.test(signature) || message.length > 2_048) return false;
  try {
    const recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` });
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createUserSession(addressInput: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()):
  { value: string; address: `0x${string}`; expiresAt: number } | undefined {
  const secret = userSecret(env);
  if (!secret || !isAddress(addressInput)) return undefined;
  const address = getAddress(addressInput);
  const expiresAt = Math.floor(now / 1_000) + USER_SESSION_SECONDS;
  const nonce = randomBytes(24).toString("base64url");
  const payload = `u1.${expiresAt}.${address}.${nonce}`;
  return { value: `${payload}.${sign(payload, secret)}`, address, expiresAt };
}

export function verifyUserSessionCookie(
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): UserWalletSession | undefined {
  const secret = userSecret(env);
  if (!secret || !value || value.length > 512) return undefined;
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "u1" || !/^\d+$/.test(parts[1]) || !isAddress(parts[2])
    || !/^[A-Za-z0-9_-]{32}$/.test(parts[3])) return undefined;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1_000)) return undefined;
  const payload = parts.slice(0, 4).join(".");
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(parts[4]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
  return {
    address: getAddress(parts[2]),
    sessionKey: createHash("sha256").update(parts[3]).digest("hex"),
    expiresAt,
  };
}

export function setUserSessionCookie(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }, value: string, env: NodeJS.ProcessEnv = process.env): void {
  response.cookies.set(USER_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: USER_SESSION_SECONDS,
  });
}

export function clearUserSessionCookie(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }, env: NodeJS.ProcessEnv = process.env): void {
  response.cookies.set(USER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
