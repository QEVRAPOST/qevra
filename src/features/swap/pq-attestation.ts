import { z } from "zod";

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const HASH = /^0x[0-9a-f]{64}$/i;
const DATA = /^0x(?:[0-9a-f]{2})+$/i;
const UINT = /^(0|[1-9][0-9]*)$/;
const DOMAIN = /^[a-z0-9][a-z0-9.-]*(?::[0-9]{1,5})?$/i;
const INTENT_DOMAIN_SEPARATOR = "VEYRA_PQ_SWAP_INTENT_V1\0";
const ML_DSA_44_PUBLIC_KEY_BYTES = 1_312;
const ML_DSA_44_SIGNATURE_BYTES = 2_420;
const MAX_INTENT_LIFETIME_SECONDS = 120;

const intentSchema = z.object({
  domain: z.string().regex(DOMAIN).max(255),
  chainId: z.literal(4_663),
  account: z.string().regex(ADDRESS),
  tokenIn: z.string().regex(ADDRESS),
  tokenOut: z.string().regex(ADDRESS),
  amountIn: z.string().regex(UINT),
  minimumAmountOut: z.string().regex(UINT),
  slippageBps: z.number().int().min(1).max(1_000),
  allowanceSpender: z.string().regex(ADDRESS).nullable(),
  settlerAddress: z.string().regex(ADDRESS),
  recipient: z.string().regex(ADDRESS),
  /** Actual pending EVM transaction nonce sent unchanged in the wallet request. */
  nonce: z.string().regex(UINT),
  /** Separate random challenge that prevents reusing the same off-chain attestation payload. */
  intentNonce: z.string().regex(HASH),
  issuedAt: z.number().int().positive().safe(),
  expiresAt: z.number().int().positive().safe(),
  quoteDigest: z.string().regex(HASH),
  transaction: z.object({
    to: z.string().regex(ADDRESS),
    data: z.string().regex(DATA),
    value: z.string().regex(UINT),
  }).strict(),
}).strict();

export type PqSwapIntent = z.infer<typeof intentSchema>;

export interface Mldsa44IntentAttestation {
  version: 1;
  algorithm: "ML-DSA-44";
  payload: PqSwapIntent;
  payloadDigest: `0x${string}`;
  publicKey: string;
  signature: string;
}

export type Mldsa44Implementation = "webcrypto-native" | "javascript-fallback";

export class PqAttestationError extends Error {
  constructor(readonly code: "invalid_intent" | "mldsa44_unavailable" | "crypto_operation_failed") {
    super(code);
    this.name = "PqAttestationError";
  }
}

function parseIntent(input: unknown, nowSeconds: number): PqSwapIntent {
  const parsed = intentSchema.safeParse(input);
  if (!parsed.success) throw new PqAttestationError("invalid_intent");
  const intent = parsed.data;
  if (BigInt(intent.amountIn) <= BigInt(0) || BigInt(intent.minimumAmountOut) <= BigInt(0)
    || intent.issuedAt > nowSeconds + 5 || intent.expiresAt <= nowSeconds
    || intent.expiresAt <= intent.issuedAt
    || intent.expiresAt - intent.issuedAt > MAX_INTENT_LIFETIME_SECONDS) {
    throw new PqAttestationError("invalid_intent");
  }
  return intent;
}

function canonicalPayload(intent: PqSwapIntent): string {
  return JSON.stringify({
    version: 1,
    domain: intent.domain.toLowerCase(),
    chainId: intent.chainId,
    account: intent.account.toLowerCase(),
    tokenIn: intent.tokenIn.toLowerCase(),
    tokenOut: intent.tokenOut.toLowerCase(),
    amountIn: intent.amountIn,
    minimumAmountOut: intent.minimumAmountOut,
    slippageBps: intent.slippageBps,
    allowanceSpender: intent.allowanceSpender?.toLowerCase() ?? null,
    settlerAddress: intent.settlerAddress.toLowerCase(),
    recipient: intent.recipient.toLowerCase(),
    nonce: intent.nonce,
    intentNonce: intent.intentNonce.toLowerCase(),
    issuedAt: intent.issuedAt,
    expiresAt: intent.expiresAt,
    quoteDigest: intent.quoteDigest.toLowerCase(),
    transaction: {
      to: intent.transaction.to.toLowerCase(),
      data: intent.transaction.data.toLowerCase(),
      value: intent.transaction.value,
    },
  });
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

function cryptoSubtle(cryptoProvider?: Crypto): { provider: Crypto; subtle: SubtleCrypto } {
  const provider = cryptoProvider ?? (typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined);
  if (!provider?.subtle || typeof provider.getRandomValues !== "function") throw new PqAttestationError("mldsa44_unavailable");
  return { provider, subtle: provider.subtle };
}

function isAlgorithmUnsupported(error: unknown): boolean {
  return error instanceof Error && error.name === "NotSupportedError";
}

export function createPqIntentNonce(cryptoProvider?: Crypto): `0x${string}` {
  const { provider } = cryptoSubtle(cryptoProvider);
  const random = new Uint8Array(32);
  provider.getRandomValues(random);
  return bytesToHex(random);
}

function attestationMessage(intent: PqSwapIntent): Uint8Array {
  return new TextEncoder().encode(`${INTENT_DOMAIN_SEPARATOR}${canonicalPayload(intent)}`);
}

export async function createMldsa44IntentAttestation(
  input: PqSwapIntent,
  options: { cryptoProvider?: Crypto; now?: number } = {},
): Promise<{ attestation: Mldsa44IntentAttestation; verified: true; implementation: Mldsa44Implementation }> {
  const now = Math.floor((options.now ?? Date.now()) / 1_000);
  let intent: PqSwapIntent;
  let provider: Crypto;
  let subtle: SubtleCrypto;
  try {
    intent = parseIntent(input, now);
    ({ provider, subtle } = cryptoSubtle(options.cryptoProvider));
  } catch (error) {
    if (error instanceof PqAttestationError) throw error;
    throw new PqAttestationError("invalid_intent");
  }

  const message = attestationMessage(intent);
  const digestMessage = async () => bytesToHex(new Uint8Array(await subtle.digest("SHA-256", toArrayBuffer(message))));

  try {
    try {
      const pair = await subtle.generateKey({ name: "ML-DSA-44" } as AlgorithmIdentifier, false, ["sign", "verify"]) as CryptoKeyPair;
      if (!pair.privateKey || !pair.publicKey || pair.privateKey.extractable || !pair.publicKey.extractable
        || pair.privateKey.algorithm.name !== "ML-DSA-44" || pair.publicKey.algorithm.name !== "ML-DSA-44") {
        throw new PqAttestationError("mldsa44_unavailable");
      }
      const publicKey = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
      if (publicKey.byteLength !== ML_DSA_44_PUBLIC_KEY_BYTES) throw new PqAttestationError("mldsa44_unavailable");
      const signature = new Uint8Array(await subtle.sign({ name: "ML-DSA-44" }, pair.privateKey, toArrayBuffer(message)));
      if (signature.byteLength !== ML_DSA_44_SIGNATURE_BYTES) throw new PqAttestationError("crypto_operation_failed");
      const publicCryptoKey = await subtle.importKey("raw", toArrayBuffer(publicKey), { name: "ML-DSA-44" } as AlgorithmIdentifier, false, ["verify"]);
      const verified = await subtle.verify({ name: "ML-DSA-44" }, publicCryptoKey, toArrayBuffer(signature), toArrayBuffer(message));
      if (!verified) throw new PqAttestationError("crypto_operation_failed");
      return {
        attestation: {
          version: 1,
          algorithm: "ML-DSA-44",
          payload: intent,
          payloadDigest: await digestMessage(),
          publicKey: bytesToBase64Url(publicKey),
          signature: bytesToBase64Url(signature),
        },
        verified: true as const,
        implementation: "webcrypto-native" as const,
      };
    } catch (error) {
      if (!isAlgorithmUnsupported(error)) throw error;
    }

    const { ml_dsa44 } = await import("@noble/post-quantum/ml-dsa.js");
    const seed = new Uint8Array(32);
    const extraEntropy = new Uint8Array(32);
    let secretKey: Uint8Array | undefined;
    try {
      // Both seed and hedged-signature entropy come only from Crypto.getRandomValues().
      provider.getRandomValues(seed);
      provider.getRandomValues(extraEntropy);
      const keys = ml_dsa44.keygen(seed);
      secretKey = keys.secretKey;
      if (keys.publicKey.byteLength !== ML_DSA_44_PUBLIC_KEY_BYTES || secretKey.byteLength !== 2_560) {
        throw new PqAttestationError("crypto_operation_failed");
      }
      const signature = ml_dsa44.sign(message, secretKey, { extraEntropy });
      if (signature.byteLength !== ML_DSA_44_SIGNATURE_BYTES || !ml_dsa44.verify(signature, message, keys.publicKey)) {
        throw new PqAttestationError("crypto_operation_failed");
      }
      return {
        attestation: {
          version: 1,
          algorithm: "ML-DSA-44",
          payload: intent,
          payloadDigest: await digestMessage(),
          publicKey: bytesToBase64Url(keys.publicKey),
          signature: bytesToBase64Url(signature),
        },
        verified: true,
        implementation: "javascript-fallback",
      };
    } finally {
      // JavaScript cannot promise memory erasure; clear caller-owned secret bytes best-effort.
      seed.fill(0);
      extraEntropy.fill(0);
      secretKey?.fill(0);
    }
  } catch (error) {
    if (error instanceof PqAttestationError) throw error;
    throw new PqAttestationError("crypto_operation_failed");
  }
}

export async function verifyMldsa44IntentAttestation(
  input: unknown,
  currentIntent: PqSwapIntent,
  options: { cryptoProvider?: Crypto; now?: number } = {},
): Promise<boolean> {
  try {
    const now = Math.floor((options.now ?? Date.now()) / 1_000);
    const expected = parseIntent(currentIntent, now);
    if (!input || typeof input !== "object") return false;
    const attestation = input as Partial<Mldsa44IntentAttestation>;
    if (attestation.version !== 1 || attestation.algorithm !== "ML-DSA-44" || !attestation.payload
      || typeof attestation.payloadDigest !== "string" || typeof attestation.publicKey !== "string" || typeof attestation.signature !== "string") return false;
    const payload = parseIntent(attestation.payload, now);
    if (canonicalPayload(payload) !== canonicalPayload(expected)) return false;
    const publicKey = base64UrlToBytes(attestation.publicKey);
    const signature = base64UrlToBytes(attestation.signature);
    if (!publicKey || publicKey.byteLength !== ML_DSA_44_PUBLIC_KEY_BYTES || !signature || signature.byteLength !== ML_DSA_44_SIGNATURE_BYTES) return false;
    const { subtle } = cryptoSubtle(options.cryptoProvider);
    const message = attestationMessage(payload);
    const digest = bytesToHex(new Uint8Array(await subtle.digest("SHA-256", toArrayBuffer(message))));
    if (digest.toLowerCase() !== attestation.payloadDigest.toLowerCase()) return false;
    try {
      const key = await subtle.importKey("raw", toArrayBuffer(publicKey), { name: "ML-DSA-44" } as AlgorithmIdentifier, false, ["verify"]);
      return await subtle.verify({ name: "ML-DSA-44" }, key, toArrayBuffer(signature), toArrayBuffer(message));
    } catch (error) {
      if (!isAlgorithmUnsupported(error)) return false;
      const { ml_dsa44 } = await import("@noble/post-quantum/ml-dsa.js");
      return ml_dsa44.verify(signature, message, publicKey);
    }
  } catch {
    return false;
  }
}
