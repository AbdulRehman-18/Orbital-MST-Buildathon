import { eq, pinnedMetadata, type Db } from "@namma-seva/db";
import { canonicalJson, keccakUtf8 } from "../lib/hash";
import type { IpfsService } from "./ipfs";

export type PinnedJson = { cid: string; hash: string; bytes: string };

/**
 * Pin `body` as canonical JSON and remember it, so the indexer can fill titles without an IPFS
 * round-trip and `/verify` can re-hash it. `hash = keccak256(pinned bytes)` is the on-chain metaHash.
 */
export async function pinJson(
  db: Db,
  ipfs: IpfsService,
  kind: string,
  body: Record<string, unknown>,
  pinnedBy: string | null,
): Promise<PinnedJson> {
  const bytes = canonicalJson({ schema: `namma-seva/${kind}@1`, ...body });
  const hash = keccakUtf8(bytes);
  const cid = await ipfs.pin(new TextEncoder().encode(bytes), `${kind}-${hash.slice(2, 14)}.json`, "application/json");
  await db
    .insert(pinnedMetadata)
    .values({ cid, metaHash: hash, kind, body: JSON.parse(bytes), pinnedBy })
    .onConflictDoNothing();
  return { cid, hash, bytes };
}

/** Re-hash pinned metadata; null when this API never pinned the CID. */
export async function pinnedHash(db: Db, cid: string): Promise<string | null> {
  const [row] = await db.select({ body: pinnedMetadata.body }).from(pinnedMetadata).where(eq(pinnedMetadata.cid, cid));
  return row ? keccakUtf8(canonicalJson(row.body)) : null;
}
