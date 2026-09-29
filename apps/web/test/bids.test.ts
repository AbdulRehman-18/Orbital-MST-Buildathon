import { keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";
import { bidCommitment, loadBid, parseBackup, saveBid } from "@/lib/bids";

describe("sealed bids", () => {
  it("match TenderRegistry.computeCommitment (the demo seed's bid on tender 1)", () => {
    // Kaveri Infra (Hardhat #7) bid ₹1,08,50,000 = 10,85,00,000 paise with salt id("demo-salt-contractor2-1").
    const hash = bidCommitment({
      chainId: 31337,
      registry: "0x8a791620dd6260079bf849dc5567adc3f2fdc318",
      tenderId: 1n,
      bidder: "0x14dc79964da2c08b23698b3d3cc7ca32193d9955",
      amount: 1_08_50_000n * 100n,
      salt: keccak256(toBytes("demo-salt-contractor2-1")),
    });
    expect(hash).toBe("0x4fe4d807819fbedbcf24ac9f8e5c9635865a28d4aaa7e6056dad6300948780ad");
  });

  it("keep the price and code per tender and bidder, and reject malformed backups", () => {
    const b = { chainId: 31337, tenderId: 9, bidder: "0xAbC", amount: "500", salt: `0x${"1".repeat(64)}` as const };
    saveBid(b);
    expect(loadBid(31337, 9, "0xabc")).toEqual(b);
    expect(loadBid(31337, 10, "0xabc")).toBeNull();
    expect(parseBackup('{"chainId":1}')).toBeNull();
    expect(parseBackup(JSON.stringify({ ...b, salt: "0x12" }))).toBeNull();
    expect(parseBackup("not json")).toBeNull();
  });
});
