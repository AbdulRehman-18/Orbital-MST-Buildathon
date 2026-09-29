// Sealed bids (TenderRegistry commit/reveal). The price and secret code stay on the bidder's device
// until they open the bid; only the fingerprint goes on-chain while bidding is open.
import { encodeAbiParameters, keccak256, toHex, type Hex } from "viem";

/** Same as TenderRegistry.computeCommitment: keccak256(abi.encode(chainid, registry, tenderId, bidder, amount, salt)). */
export function bidCommitment(p: {
  chainId: number;
  registry: Hex;
  tenderId: bigint;
  bidder: Hex;
  amount: bigint;
  salt: Hex;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [BigInt(p.chainId), p.registry, p.tenderId, p.bidder, p.amount, p.salt],
    ),
  );
}

export const newSalt = (): Hex => toHex(crypto.getRandomValues(new Uint8Array(32)));

/** What a bidder must keep to open their bid later. Also the backup file's format. */
export type SavedBid = {
  chainId: number;
  tenderId: number;
  bidder: string;
  amount: string;
  salt: Hex;
};

const storageKey = (chainId: number, tenderId: number, bidder: string) =>
  `ns_bid:${chainId}:${tenderId}:${bidder.toLowerCase()}`;

export function saveBid(b: SavedBid) {
  try {
    localStorage.setItem(storageKey(b.chainId, b.tenderId, b.bidder), JSON.stringify(b));
  } catch {
    // Private mode or storage blocked: the backup download is the fallback.
  }
}

export function forgetBid(chainId: number, tenderId: number, bidder: string) {
  try {
    localStorage.removeItem(storageKey(chainId, tenderId, bidder));
  } catch {
    // nothing stored
  }
}

export function loadBid(chainId: number, tenderId: number, bidder: string): SavedBid | null {
  try {
    return parseBackup(localStorage.getItem(storageKey(chainId, tenderId, bidder)) ?? "");
  } catch {
    return null;
  }
}

/** A pasted or stored backup, or null if it is not one. */
export function parseBackup(text: string): SavedBid | null {
  try {
    const b = JSON.parse(text) as Partial<SavedBid>;
    if (
      typeof b.chainId !== "number" ||
      typeof b.tenderId !== "number" ||
      typeof b.bidder !== "string"
    )
      return null;
    if (typeof b.amount !== "string" || !/^\d+$/.test(b.amount)) return null;
    if (typeof b.salt !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(b.salt)) return null;
    return b as SavedBid;
  } catch {
    return null;
  }
}

export function downloadBackup(b: SavedBid) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(b, null, 2)], { type: "application/json" }),
  );
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `namma-seva-bid-tender-${b.tenderId}.json`,
  });
  a.click();
  URL.revokeObjectURL(url);
}
