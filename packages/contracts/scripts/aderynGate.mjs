// CI gate for Aderyn (plan §16.1: "fail on High"). Aderyn's High bucket has known false positives
// that were triaged in docs/security/phase-2-static-analysis.md; those titles are allow-listed here.
// Any High finding with a title NOT on the list fails the build, so a new class of issue is never
// silently absorbed. Also fails if the report is missing or unparsable.
//   node scripts/aderynGate.mjs reports/aderyn.md
import { readFileSync } from "node:fs";

const TRIAGED_HIGH = new Map([
  ["Contract locks Ether without a withdraw function", "H-1 — only OZ upgradeToAndCall is payable, ADMIN-only"],
  ["ETH transferred without address checks", "H-2 — recipients are registry-recorded, not caller-supplied; nonReentrant + CEI"],
  ["Reentrancy: State change after external call", "H-3 — every flagged call is a view/STATICCALL on our own contracts"],
  ["Unsafe Casting of integers", "H-4 — all casts bounded by uint64 counters / uint128 budgets"],
]);

const file = process.argv[2];
if (!file) throw new Error("usage: aderynGate.mjs <report.md>");
const md = readFileSync(file, "utf8");
const high = md.split(/^# High Issues$/m)[1]?.split(/^# (?:Medium|Low) Issues$/m)[0];
if (md.includes("# High Issues") === false && !md.includes("No issues found")) {
  throw new Error(`${file}: no "High Issues" section and no "No issues found" — report format changed?`);
}

const titles = [...(high ?? "").matchAll(/^## H-\d+: (.+)$/gm)].map((m) => m[1].trim());
const untriaged = titles.filter((t) => !TRIAGED_HIGH.has(t));

for (const t of titles) console.log(`${TRIAGED_HIGH.has(t) ? "triaged " : "NEW HIGH "} ${t}${TRIAGED_HIGH.has(t) ? `  (${TRIAGED_HIGH.get(t)})` : ""}`);
if (untriaged.length) {
  console.error(`\n${untriaged.length} un-triaged High finding(s). Fix them, or triage in docs/security and add to TRIAGED_HIGH.`);
  process.exit(1);
}
console.log(`\nOK — ${titles.length} High finding(s), all triaged.`);
