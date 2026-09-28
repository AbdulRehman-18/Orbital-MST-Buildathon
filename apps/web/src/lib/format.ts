import { formatUnits } from "viem";
import { network } from "./chain";

export type EscrowMode = "LEDGER" | "ESCROW" | null | undefined;

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/**
 * On-chain amounts are INR paise in LEDGER mode and wei in ESCROW mode (plan §7.4).
 * `compact` renders lakh / crore: ₹48 L, ₹1.2 Cr.
 */
export function formatAmount(value: string | bigint | null | undefined, mode: EscrowMode, { compact = false } = {}) {
  if (value === null || value === undefined || value === "") return "—";
  const v = BigInt(value);
  if (mode === "ESCROW") {
    const n = Number(formatUnits(v, 18));
    return `${n.toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${network.nativeCurrency.symbol}`;
  }
  const rupees = Number(v / 100n);
  if (compact) {
    if (rupees >= 1_00_00_000) return `₹${trim(rupees / 1_00_00_000)} Cr`;
    if (rupees >= 1_00_000) return `₹${trim(rupees / 1_00_000)} L`;
  }
  return inr.format(rupees);
}

const trim = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: n >= 10 ? 1 : 2 });

/** Rupees typed by an official → the on-chain unit for the deployment's mode. */
export function toChainAmount(rupeesOrCoins: string, mode: EscrowMode): bigint {
  const clean = rupeesOrCoins.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d+)?$/.test(clean)) throw new Error("Enter a number");
  if (mode === "ESCROW") {
    const [whole, frac = ""] = clean.split(".");
    return BigInt(whole) * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18));
  }
  const [whole, frac = ""] = clean.split(".");
  return BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
}

export const percent = (part: string | bigint, whole: string | bigint) => {
  const w = BigInt(whole);
  return w === 0n ? 0 : Number((BigInt(part) * 1000n) / w) / 10;
};

export const shortAddress = (a: string | null | undefined) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const shortHash = (h: string | null | undefined) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");

export function formatDate(d: string | Date | null | undefined, lang = "en") {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(lang === "en" ? "en-IN" : lang, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(d: string | Date | null | undefined, lang = "en") {
  if (!d) return "—";
  return new Date(d).toLocaleString(lang === "en" ? "en-IN" : lang, { dateStyle: "medium", timeStyle: "short" });
}

export function relativeTime(d: string | Date | null | undefined, lang = "en") {
  if (!d) return "—";
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  return rtf.format(Math.round(diff), "second");
}

export const e6 = (v: number) => v / 1e6;
