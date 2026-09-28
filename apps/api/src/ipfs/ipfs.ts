// Ported from DecentraliTrack's services/ipfsService.ts (Pinata). Redundant pinning, gateway
// fallbacks and content re-verification are Phase 5 hardening.
import { createHash } from "node:crypto";
import type { Logger } from "pino";

export interface IpfsService {
  readonly kind: "pinata" | "local";
  pin(bytes: Uint8Array, name: string, mime: string): Promise<string>;
  gatewayUrl(cid: string): string;
  /** Local store only — lets the API serve dev pins at /api/ipfs/:cid. */
  get?(cid: string): { bytes: Uint8Array; mime: string } | undefined;
}

export class PinataIpfs implements IpfsService {
  readonly kind = "pinata";

  constructor(
    private readonly jwt: string,
    private readonly gateway: string | undefined,
    private readonly logger: Logger,
  ) {}

  async pin(bytes: Uint8Array, name: string, mime: string): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), name);
    form.append("pinataMetadata", JSON.stringify({ name }));
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.jwt}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      this.logger.error({ status: res.status, body: text.slice(0, 300) }, "Pinata pin failed");
      throw new Error(`IPFS pin failed (${res.status})`);
    }
    const body = (await res.json()) as { IpfsHash: string };
    return body.IpfsHash;
  }

  gatewayUrl(cid: string) {
    const base = (this.gateway ?? "https://gateway.pinata.cloud").replace(/\/$/, "");
    return `${base}/ipfs/${cid}`;
  }
}

/**
 * Development/test stand-in: content-addresses bytes as a real CIDv1 (raw codec, sha2-256) and keeps
 * them in memory. Refused in production by `createIpfs`.
 */
export class LocalIpfs implements IpfsService {
  readonly kind = "local";
  private readonly store = new Map<string, { bytes: Uint8Array; mime: string }>();

  constructor(private readonly publicBaseUrl: string) {}

  async pin(bytes: Uint8Array, _name: string, mime: string): Promise<string> {
    const cid = rawCidV1(bytes);
    this.store.set(cid, { bytes, mime });
    return cid;
  }

  get(cid: string) {
    return this.store.get(cid);
  }

  gatewayUrl(cid: string) {
    return `${this.publicBaseUrl.replace(/\/$/, "")}/api/ipfs/${cid}`;
  }
}

export function createIpfs(
  opts: { pinataJwt?: string; gateway?: string; production: boolean; apiBaseUrl: string },
  logger: Logger,
): IpfsService {
  if (opts.pinataJwt) return new PinataIpfs(opts.pinataJwt, opts.gateway, logger);
  if (opts.production) throw new Error("PINATA_JWT is required in production.");
  logger.warn("PINATA_JWT not set — using the in-memory dev IPFS store (pins vanish on restart)");
  return new LocalIpfs(opts.apiBaseUrl);
}

/** CIDv1, raw codec (0x55), sha2-256 multihash, base32 multibase ("b…"). */
export function rawCidV1(bytes: Uint8Array): string {
  const digest = createHash("sha256").update(bytes).digest();
  const cid = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest]);
  return "b" + base32(cid);
}

function base32(data: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
