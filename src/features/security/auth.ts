import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "qevra_session";
const SESSION_SECONDS = 60 * 60 * 12;

function sessionSecret(env: NodeJS.ProcessEnv): string | undefined {
  const secret = env.QEVRA_SESSION_SECRET;
  return secret && Buffer.byteLength(secret, "utf8") >= 32 ? secret : undefined;
}

function constantTimeSecretMatch(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function hasSessionConfiguration(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.QEVRA_ACCESS_TOKEN && Buffer.byteLength(env.QEVRA_ACCESS_TOKEN, "utf8") >= 32 && sessionSecret(env));
}

export function verifyAccessToken(token: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = env.QEVRA_ACCESS_TOKEN;
  return Boolean(expected && Buffer.byteLength(expected, "utf8") >= 32 && token.length <= 512 && constantTimeSecretMatch(token, expected));
}

export function createSession(env: NodeJS.ProcessEnv = process.env, now = Date.now()): { value: string; expiresAt: number } | undefined {
  const secret = sessionSecret(env);
  if (!secret) return undefined;
  const expiresAt = Math.floor(now / 1000) + SESSION_SECONDS;
  const payload = `v1.${expiresAt}.${randomBytes(24).toString("base64url")}`;
  return { value: `${payload}.${sign(payload, secret)}`, expiresAt };
}

export function verifySessionCookie(value: string | undefined, env: NodeJS.ProcessEnv = process.env, now = Date.now()): string | undefined {
  const secret = sessionSecret(env);
  if (!value || !secret || value.length > 256) return undefined;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^\d+$/.test(parts[1])) return undefined;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return undefined;
  const payload = parts.slice(0, 3).join(".");
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(parts[3]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
  return createHash("sha256").update(parts[2]).digest("hex");
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  for (const part of cookies) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function setSessionCookie(response: NextResponse, value: string, env: NodeJS.ProcessEnv = process.env): void {
  response.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse, env: NodeJS.ProcessEnv = process.env): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export function requireJsonContentType(request: Request): boolean {
  return request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() === "application/json";
}

export async function readJsonBody(request: Request, maxBytes = 8_192): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error("request_body_too_large");
  if (!request.body) throw new Error("request_body_empty");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error("request_body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

export function hashRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
