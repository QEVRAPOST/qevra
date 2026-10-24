import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ml_dsa44 } from "@noble/post-quantum/ml-dsa.js";
import {
  createMldsa44IntentAttestation,
  verifyMldsa44IntentAttestation,
  type PqSwapIntent,
} from "@/features/swap/pq-attestation";

class TestSubtle {
  private signedMessage?: Uint8Array;
  private publicBytes = new Uint8Array(1_312).fill(23);

  async generateKey(algorithm: unknown, extractable: boolean) {
    assert.deepEqual(algorithm, { name: "ML-DSA-44" });
    assert.equal(extractable, false);
    return {
      privateKey: { algorithm: { name: "ML-DSA-44" }, extractable: false } as CryptoKey,
      publicKey: { algorithm: { name: "ML-DSA-44" }, extractable: true } as CryptoKey,
    } as CryptoKeyPair;
  }

  async exportKey(format: string, key: CryptoKey) {
    assert.equal(format, "raw");
    assert.equal(key.type, undefined);
    return this.publicBytes.buffer.slice(0) as ArrayBuffer;
  }

  async sign(algorithm: unknown, key: CryptoKey, data: BufferSource) {
    assert.equal((algorithm as { name: string }).name, "ML-DSA-44");
    assert.equal(key.extractable, false);
    this.signedMessage = new Uint8Array(data as ArrayBuffer).slice();
    return new Uint8Array(2_420).fill(41).buffer;
  }

  async importKey(format: string, keyData: BufferSource) {
    assert.equal(format, "raw");
    this.publicBytes = new Uint8Array(keyData as ArrayBuffer).slice();
    return { algorithm: { name: "ML-DSA-44" }, extractable: false } as CryptoKey;
  }

  async verify(algorithm: unknown, _key: CryptoKey, signature: BufferSource, data: BufferSource) {
    assert.equal((algorithm as { name: string }).name, "ML-DSA-44");
    const sig = new Uint8Array(signature as ArrayBuffer);
    const message = new Uint8Array(data as ArrayBuffer);
    return sig.length === 2_420 && sig.every((value) => value === 41)
      && this.publicBytes.every((value) => value === 23)
      && this.signedMessage?.every((value, index) => value === message[index]) === true;
  }

  async digest(_algorithm: string, data: BufferSource) {
    const message = new Uint8Array(data as ArrayBuffer);
    return new Uint8Array(32).fill(message.length % 256).buffer;
  }
}

function intent(overrides: Partial<PqSwapIntent> = {}): PqSwapIntent {
  return {
    domain: "veyraapp.net",
    chainId: 4_663,
    account: "0x1111111111111111111111111111111111111111",
    tokenIn: "0x2222222222222222222222222222222222222222",
    tokenOut: "0x3333333333333333333333333333333333333333",
    amountIn: "10000000000000000",
    minimumAmountOut: "990000",
    slippageBps: 100,
    allowanceSpender: "0x4444444444444444444444444444444444444444",
    settlerAddress: "0x5555555555555555555555555555555555555555",
    recipient: "0x1111111111111111111111111111111111111111",
    nonce: "7",
    intentNonce: `0x${"44".repeat(32)}`,
    issuedAt: 1_800_000_000,
    expiresAt: 1_800_000_060,
    quoteDigest: `0x${"55".repeat(32)}`,
    transaction: {
      to: "0x6666666666666666666666666666666666666666",
      data: `0x${"ab".repeat(64)}`,
      value: "0",
    },
    ...overrides,
  };
}

test("ML-DSA-44 attestation signs and verifies a canonical domain-separated Mainnet swap intent", async () => {
  const subtle = new TestSubtle() as unknown as SubtleCrypto;
  const cryptoProvider = { subtle, getRandomValues<T extends ArrayBufferView | null>(array: T) { if (array) new Uint8Array(array.buffer).fill(4); return array; } } as Crypto;
  const created = await createMldsa44IntentAttestation(intent(), { cryptoProvider, now: 1_800_000_010_000 });
  assert.equal(created.attestation.algorithm, "ML-DSA-44");
  assert.equal(created.implementation, "webcrypto-native");
  assert.equal(created.attestation.publicKey.length > 1_700, true);
  assert.equal(created.attestation.signature.length > 3_000, true);
  assert.equal(await verifyMldsa44IntentAttestation(created.attestation, intent(), { cryptoProvider, now: 1_800_000_010_000 }), true);
});

test("JavaScript fallback performs real ML-DSA-44 when WebCrypto lacks the algorithm", async () => {
  const now = 1_800_000_010_000;
  const signed = await createMldsa44IntentAttestation(intent(), { now });

  assert.equal(signed.implementation, "javascript-fallback");
  assert.equal(await verifyMldsa44IntentAttestation(signed.attestation, intent(), { now }), true);
  assert.equal(await verifyMldsa44IntentAttestation(
    signed.attestation,
    intent({ transaction: { ...intent().transaction, value: "1" } }),
    { now },
  ), false);
  assert.equal("secretKey" in signed.attestation, false);
});

test("ML-DSA-44 fallback matches the NIST ACVP deterministic signing known-answer hashes", () => {
  const seed = Buffer.from("090D97C1F4166EB32CA67C5FB564ACBE0735DB4AF4B8DB3A7C2CE7402357CA44", "hex");
  const messageRepresentative = Buffer.from("E3838364B37F47ED FCA2B577 B20B80C3 CB51B9F5 6E0E4CDB 7DF002C8 74039252".replaceAll(" ", ""), "hex");
  const keys = ml_dsa44.keygen(seed);
  const signature = ml_dsa44.internal.sign(messageRepresentative, keys.secretKey, { extraEntropy: false });

  assert.equal(createHash("sha256").update(keys.publicKey).update(keys.secretKey).digest("hex").toUpperCase(), "26D79E4068040E996BC9EB5034C20489C0AD38DC2FEC1918D0760C8621872408");
  assert.equal(createHash("sha256").update(signature).digest("hex").toUpperCase(), "CD91150C610FF02DE1DD7049C309EFE800CE5C1BC2E5A32D752AB62C5BF5E16F");
  assert.equal(ml_dsa44.internal.verify(signature, messageRepresentative, keys.publicKey), true);
});

test("attestation verification rejects changed transaction, quote, wallet, chain, and expired intent", async () => {
  const subtle = new TestSubtle() as unknown as SubtleCrypto;
  const cryptoProvider = { subtle, getRandomValues<T extends ArrayBufferView | null>(array: T) { if (array) new Uint8Array(array.buffer).fill(4); return array; } } as Crypto;
  const original = intent();
  const result = await createMldsa44IntentAttestation(original, { cryptoProvider, now: 1_800_000_010_000 });
  assert.equal(await verifyMldsa44IntentAttestation(result.attestation, { ...original, amountIn: "10000000000000001" }, { cryptoProvider, now: 1_800_000_010_000 }), false);
  assert.equal(await verifyMldsa44IntentAttestation(result.attestation, { ...original, account: "0x7777777777777777777777777777777777777777" }, { cryptoProvider, now: 1_800_000_010_000 }), false);
  assert.equal(await verifyMldsa44IntentAttestation(result.attestation, { ...original, chainId: 46_630 as unknown as 4_663 }, { cryptoProvider, now: 1_800_000_010_000 }), false);
  assert.equal(await verifyMldsa44IntentAttestation(result.attestation, { ...original, recipient: "0x7777777777777777777777777777777777777777" }, { cryptoProvider, now: 1_800_000_010_000 }), false);
  assert.equal(await verifyMldsa44IntentAttestation(result.attestation, { ...original, nonce: "8" }, { cryptoProvider, now: 1_800_000_010_000 }), false);
  assert.equal(await verifyMldsa44IntentAttestation(result.attestation, { ...original, intentNonce: `0x${"66".repeat(32)}` }, { cryptoProvider, now: 1_800_000_010_000 }), false);
  assert.equal(await verifyMldsa44IntentAttestation(result.attestation, { ...original, quoteDigest: `0x${"77".repeat(32)}` }, { cryptoProvider, now: 1_800_000_010_000 }), false);
  assert.equal(await verifyMldsa44IntentAttestation(result.attestation, { ...original, allowanceSpender: "0x7777777777777777777777777777777777777777" }, { cryptoProvider, now: 1_800_000_010_000 }), false);
  assert.equal(await verifyMldsa44IntentAttestation(result.attestation, { ...original, settlerAddress: "0x7777777777777777777777777777777777777777" }, { cryptoProvider, now: 1_800_000_010_000 }), false);
  assert.equal(await verifyMldsa44IntentAttestation(result.attestation, { ...original, expiresAt: 1_800_000_050 }, { cryptoProvider, now: 1_800_000_010_000 }), false);
  assert.equal(await verifyMldsa44IntentAttestation(result.attestation, { ...original, transaction: { ...original.transaction, value: "1" } }, { cryptoProvider, now: 1_800_000_010_000 }), false);
  assert.equal(await verifyMldsa44IntentAttestation(result.attestation, original, { cryptoProvider, now: 1_800_000_061_000 }), false);
});

test("attestation rejects malformed and non-Mainnet intents before key generation", async () => {
  let calls = 0;
  const subtle = new TestSubtle() as unknown as SubtleCrypto;
  const cryptoProvider = { subtle: new Proxy(subtle, { get(target, property, receiver) { const value = Reflect.get(target, property, receiver); if (property === "generateKey") return (...args: unknown[]) => { calls++; return (value as (...values: unknown[]) => unknown)(...args); }; return value; } }), getRandomValues<T extends ArrayBufferView | null>(array: T) { return array; } } as Crypto;
  await assert.rejects(createMldsa44IntentAttestation(intent({ chainId: 46_630 as unknown as 4_663 }), { cryptoProvider, now: 1_800_000_010_000 }));
  await assert.rejects(createMldsa44IntentAttestation(intent({ amountIn: "0x1" }), { cryptoProvider, now: 1_800_000_010_000 }));
  assert.equal(calls, 0);
});

test("altered public key or signature fails cryptographic verification", async () => {
  const subtle = new TestSubtle() as unknown as SubtleCrypto;
  const cryptoProvider = { subtle, getRandomValues<T extends ArrayBufferView | null>(array: T) { if (array) new Uint8Array(array.buffer).fill(4); return array; } } as Crypto;
  const original = intent();
  const result = await createMldsa44IntentAttestation(original, { cryptoProvider, now: 1_800_000_010_000 });
  const changedSig = result.attestation.signature.slice(0, -1) + (result.attestation.signature.endsWith("A") ? "B" : "A");
  assert.equal(await verifyMldsa44IntentAttestation({ ...result.attestation, signature: changedSig }, original, { cryptoProvider, now: 1_800_000_010_000 }), false);
  assert.equal(await verifyMldsa44IntentAttestation({ ...result.attestation, publicKey: result.attestation.publicKey.slice(0, -1) + "A" }, original, { cryptoProvider, now: 1_800_000_010_000 }), false);
});
