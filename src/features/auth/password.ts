import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 3;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const PASSWORD_MIN_CHARACTERS = 15;
const PASSWORD_MAX_CHARACTERS = 128;
const PASSWORD_MAX_BYTES = 1_024;

interface ParsedPasswordHash {
  salt: Buffer;
  digest: Buffer;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAX_MEMORY,
    }, (error, key) => error ? reject(error) : resolve(Buffer.from(key)));
  });
}

export function validatePassword(value: unknown): string {
  if (typeof value !== "string") throw new Error("password_invalid");
  const characters = Array.from(value).length;
  if (characters < PASSWORD_MIN_CHARACTERS) throw new Error("password_too_short");
  if (characters > PASSWORD_MAX_CHARACTERS || Buffer.byteLength(value, "utf8") > PASSWORD_MAX_BYTES) {
    throw new Error("password_too_long");
  }
  return value;
}

export function validateLoginPassword(value: unknown): string | undefined {
  if (typeof value !== "string" || Array.from(value).length > PASSWORD_MAX_CHARACTERS
    || Buffer.byteLength(value, "utf8") > PASSWORD_MAX_BYTES) return undefined;
  return value;
}

export async function hashPassword(value: unknown): Promise<string> {
  const password = validatePassword(value);
  const salt = randomBytes(16);
  const digest = await derive(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

function parsePasswordHash(value: string): ParsedPasswordHash | undefined {
  const parts = value.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt" || Number(parts[1]) !== SCRYPT_N
    || Number(parts[2]) !== SCRYPT_R || Number(parts[3]) !== SCRYPT_P
    || !/^[A-Za-z0-9_-]{22}$/.test(parts[4]) || !/^[A-Za-z0-9_-]{86}$/.test(parts[5])) return undefined;
  const salt = Buffer.from(parts[4], "base64url");
  const digest = Buffer.from(parts[5], "base64url");
  if (salt.length !== 16 || digest.length !== SCRYPT_KEY_LENGTH) return undefined;
  return { salt, digest };
}

const DUMMY_PASSWORD_HASH = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(SCRYPT_KEY_LENGTH).toString("base64url")}`;

export async function verifyPassword(value: unknown, encodedHash: string | undefined): Promise<boolean> {
  const password = validateLoginPassword(value);
  const parsed = encodedHash ? parsePasswordHash(encodedHash) : parsePasswordHash(DUMMY_PASSWORD_HASH);
  if (!password || !parsed) return false;
  const calculated = await derive(password, parsed.salt);
  return timingSafeEqual(calculated, parsed.digest) && Boolean(encodedHash);
}
