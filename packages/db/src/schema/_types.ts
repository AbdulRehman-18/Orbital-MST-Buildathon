import { bigint, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";

// Shared column builders. On-chain amounts are uint128 in the escrow's accounting unit (INR paise
// in LEDGER mode, wei in ESCROW mode — plan §7.4), so they are stored as exact numerics and
// surfaced as decimal strings; never as JS numbers.

/** uint128/uint256 amount as a decimal string. */
export const amount = (name: string) => numeric(name, { precision: 78, scale: 0 });

/** Block number / chain id (fits in 2^53). */
export const blockNo = (name: string) => bigint(name, { mode: "number" });

/** Checksum-less, lower-cased 0x address. */
export const address = (name: string) => text(name);

/** 0x-prefixed 32-byte hex. */
export const bytes32 = (name: string) => text(name);

/** Micro-degrees (int32 on-chain). */
export const e6 = (name: string) => integer(name);

export const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
