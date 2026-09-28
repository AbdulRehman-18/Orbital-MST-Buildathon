import type { Log } from "ethers";
import { interfaces, type ChainContracts, type IndexedContract } from "../chain/contracts";

/** A decoded log. `args` are JSON-safe: integers as decimal strings, addresses/bytes lower-cased. */
export type ChainEvent = {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  blockTime: Date | null;
  contract: IndexedContract;
  eventName: string;
  args: Record<string, string | boolean | string[]>;
};

function normalize(value: unknown): string | boolean | string[] {
  if (typeof value === "bigint" || typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.startsWith("0x") ? value.toLowerCase() : value;
  if (Array.isArray(value)) return value.map((v) => String(normalize(v)));
  return String(value);
}

/** Decodes a log from one of the indexed contracts; unknown addresses/topics yield null. */
export function decodeLog(contracts: ChainContracts, log: Log, blockTime: Date | null): ChainEvent | null {
  const contract = contracts.byAddress.get(log.address.toLowerCase());
  if (!contract) return null;
  const parsed = interfaces[contract].parseLog({ topics: [...log.topics], data: log.data });
  if (!parsed) return null;
  const args: ChainEvent["args"] = {};
  parsed.fragment.inputs.forEach((input, i) => {
    args[input.name || `arg${i}`] = normalize(parsed.args[i]);
  });
  return {
    txHash: log.transactionHash.toLowerCase(),
    logIndex: log.index,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash.toLowerCase(),
    blockTime,
    contract,
    eventName: parsed.name,
    args,
  };
}

export const byChainOrder = (a: { blockNumber: number; logIndex: number }, b: { blockNumber: number; logIndex: number }) =>
  a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;
