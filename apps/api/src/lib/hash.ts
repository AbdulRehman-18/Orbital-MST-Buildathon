import { createHash, createHmac } from "node:crypto";
import { keccak256, toUtf8Bytes } from "ethers";

export const sha256Hex = (data: string | Uint8Array) => "0x" + createHash("sha256").update(data).digest("hex");

export const keccakUtf8 = (text: string) => keccak256(toUtf8Bytes(text));

/** Normalise an Indian mobile number to E.164 (+91XXXXXXXXXX); other E.164 numbers pass through. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  return null;
}

/**
 * `sha256(phone + pepper)` (plan §10). Used as the DB key AND as the on-chain `citizenHash`,
 * so the raw number never leaves the OTP step.
 */
export const phoneHash = (e164: string, pepper: string) => sha256Hex(e164 + pepper);

/** Hash of an IP for audit rows without storing the address itself. */
export const ipHash = (ip: string | undefined, pepper: string) =>
  ip ? "0x" + createHmac("sha256", pepper).update(ip).digest("hex") : null;

/**
 * Canonical JSON: keys sorted recursively, no whitespace. The bytes that are pinned to IPFS are
 * exactly these, and `metaHash = keccak256(bytes)` is what goes on-chain — so anyone can re-hash
 * the pinned file and compare.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
