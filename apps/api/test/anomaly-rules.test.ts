import { describe, expect, it } from "vitest";
import {
  auditorContractorCollusion,
  budgetOverrun,
  contractorConcentration,
  DEFAULT_THRESHOLDS,
  duplicateMedia,
  evaluate,
  financialYear,
  gpsMismatch,
  grievanceSlaBreach,
  grievanceSpike,
  isOffHours,
  offHoursApprovals,
  spendingVelocity,
  splitTendering,
  stalledApproval,
  stalledMilestone,
  type Snapshot,
} from "../src/anomaly/rules";

const NOW = new Date("2026-10-15T06:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const T = DEFAULT_THRESHOLDS;

const project = (over: Partial<Snapshot["projects"][number]> = {}): Snapshot["projects"][number] => ({
  id: 1,
  wardId: 42,
  category: "ROAD",
  status: "ACTIVE",
  budget: 10_000_000n,
  spent: 1_000_000n,
  contractor: "0xc0",
  startDate: daysAgo(100),
  endDate: new Date(NOW.getTime() + 100 * 86_400_000),
  createdAt: daysAgo(110),
  ...over,
});
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  now: NOW,
  projects: [project()],
  milestones: [],
  approvals: [],
  proofMedia: [],
  grievances: [],
  ...over,
});
const ms = (id: number, over: Partial<Snapshot["milestones"][number]> = {}): Snapshot["milestones"][number] => ({
  id,
  projectId: 1,
  amount: 1_000_000n,
  status: "PENDING",
  submittedAt: null,
  ...over,
});

describe("budget overrun", () => {
  it("flags spent > budget and milestone total > budget, ignoring void milestones", () => {
    expect(budgetOverrun(snap(), T)).toEqual([]);
    expect(budgetOverrun(snap({ projects: [project({ spent: 10_000_001n })] }), T)).toMatchObject([{ rule: "BUDGET_OVERRUN", severity: "HIGH" }]);
    const over = [ms(1, { amount: 6_000_000n }), ms(2, { amount: 5_000_000n })];
    expect(budgetOverrun(snap({ milestones: over }), T)).toHaveLength(1);
    expect(budgetOverrun(snap({ milestones: [over[0], { ...over[1], status: "VOID" }] }), T)).toEqual([]);
  });
});

describe("stalled approval / milestone", () => {
  it("flags projects pending approval for more than 14 days", () => {
    const pending = (days: number) => snap({ projects: [project({ status: "PENDING_APPROVAL", createdAt: daysAgo(days) })] });
    expect(stalledApproval(pending(14), T)).toEqual([]);
    expect(stalledApproval(pending(15), T)).toMatchObject([{ rule: "STALLED_APPROVAL", severity: "MEDIUM", details: { waitingDays: 15 } }]);
    expect(stalledApproval(snap({ projects: [project({ createdAt: daysAgo(90) })] }), T)).toEqual([]);
  });

  it("flags proofs waiting more than 7 days without a decision", () => {
    const waiting = (days: number, status = "PROOF_SUBMITTED") => snap({ milestones: [ms(7, { status, submittedAt: daysAgo(days) })] });
    expect(stalledMilestone(waiting(7), T)).toEqual([]);
    expect(stalledMilestone(waiting(8), T)).toMatchObject([{ rule: "STALLED_MILESTONE", key: "m7", details: { milestoneId: 7 } }]);
    expect(stalledMilestone(waiting(30, "APPROVED"), T)).toEqual([]);
  });
});

describe("spending velocity", () => {
  it("flags > 60% released in < 20% of the timeline", () => {
    const early = { startDate: daysAgo(10), endDate: new Date(NOW.getTime() + 90 * 86_400_000) }; // 10% elapsed
    expect(spendingVelocity(snap({ projects: [project({ ...early, spent: 6_100_000n })] }), T)).toMatchObject([{ rule: "SPENDING_VELOCITY" }]);
    expect(spendingVelocity(snap({ projects: [project({ ...early, spent: 5_000_000n })] }), T)).toEqual([]);
    expect(spendingVelocity(snap({ projects: [project({ spent: 9_000_000n })] }), T)).toEqual([]); // 50% elapsed
    expect(spendingVelocity(snap({ projects: [project({ budget: 0n })] }), T)).toEqual([]);
  });
});

describe("gps mismatch", () => {
  const media = (ok: boolean, milestoneId = 1) => ({
    milestoneId,
    cid: `c${milestoneId}`,
    phash: null,
    createdAt: daysAgo(1),
    checks: { geofence: { ok, detail: "900 m from the site (limit 400 m)" } },
  });
  it("reports one finding per milestone whose geofence check failed", () => {
    const s = snap({ milestones: [ms(1)], proofMedia: [media(false), media(false), media(true, 2)] });
    expect(gpsMismatch(s, T)).toMatchObject([{ rule: "GPS_MISMATCH", severity: "HIGH", key: "m1" }]);
    expect(gpsMismatch(snap({ milestones: [ms(1)], proofMedia: [media(true)] }), T)).toEqual([]);
  });
});

describe("duplicate media", () => {
  const photo = (milestoneId: number, phash: string, createdAt: Date) => ({ milestoneId, cid: `cid${milestoneId}`, phash, createdAt, checks: null });
  it("flags the later upload of a near-identical photo on another milestone as CRITICAL", () => {
    const s = snap({
      milestones: [ms(1), ms(2)],
      proofMedia: [photo(1, "ffff0000ffff0000", daysAgo(5)), photo(2, "ffff0000ffff0003", daysAgo(1))],
    });
    expect(duplicateMedia(s, T)).toMatchObject([
      { rule: "DUPLICATE_MEDIA", severity: "CRITICAL", details: { milestoneId: 2, matchedMilestoneId: 1, hammingDistance: 2 } },
    ]);
  });
  it("ignores distinct photos and re-uploads within the same milestone", () => {
    const distinct = snap({ milestones: [ms(1), ms(2)], proofMedia: [photo(1, "ffff0000ffff0000", daysAgo(5)), photo(2, "0000ffff0000ffff", daysAgo(1))] });
    expect(duplicateMedia(distinct, T)).toEqual([]);
    const same = snap({ milestones: [ms(1)], proofMedia: [photo(1, "ffff0000ffff0000", daysAgo(5)), photo(1, "ffff0000ffff0000", daysAgo(1))] });
    expect(duplicateMedia(same, T)).toEqual([]);
  });
});

describe("auditor / contractor pattern", () => {
  const reviewed = (n: number, auditorFor: (i: number) => string) => ({
    milestones: Array.from({ length: n }, (_, i) => ms(i + 1, { status: "PAID" })),
    approvals: Array.from({ length: n }, (_, i) => ({ milestoneId: i + 1, auditor: auditorFor(i), at: NOW })),
  });
  it("flags one auditor approving more than 80% of a contractor's milestones", () => {
    const s = snap(reviewed(10, (i) => (i < 9 ? "0xa1" : "0xa2")));
    expect(auditorContractorCollusion(s, T)).toMatchObject([
      { rule: "AUDITOR_CONTRACTOR_PATTERN", severity: "MEDIUM", details: { auditor: "0xa1", approvalShare: 0.9 } },
    ]);
  });
  it("needs a minimum sample and a real majority", () => {
    expect(auditorContractorCollusion(snap(reviewed(4, () => "0xa1")), T)).toEqual([]);
    expect(auditorContractorCollusion(snap(reviewed(10, (i) => (i % 2 ? "0xa1" : "0xa2"))), T)).toEqual([]);
  });
});

describe("contractor concentration", () => {
  const p = (id: number, contractor: string, budget: bigint) => project({ id, contractor, budget });
  it("flags a contractor holding more than 40% of a ward's yearly budget", () => {
    const s = snap({ projects: [p(1, "0xc0", 5_000_000n), p(2, "0xc0", 1_000_000n), p(3, "0xc1", 2_000_000n), p(4, "0xc2", 2_000_000n)] });
    const out = contractorConcentration(s, T);
    expect(out.map((f) => f.projectId).sort()).toEqual([1, 2]);
    expect(out[0]).toMatchObject({ rule: "CONTRACTOR_CONCENTRATION", details: { wardId: 42, wardBudgetShare: 0.6 } });
  });
  it("does not flag balanced wards or tiny samples", () => {
    expect(contractorConcentration(snap({ projects: [p(1, "0xc0", 3n), p(2, "0xc1", 3n), p(3, "0xc2", 3n)] }), T)).toEqual([]);
    expect(contractorConcentration(snap({ projects: [p(1, "0xc0", 9n), p(2, "0xc1", 1n)] }), T)).toEqual([]);
  });
  it("labels Indian financial years", () => {
    expect(financialYear(new Date("2026-03-31T00:00:00Z"))).toBe("2025-26");
    expect(financialYear(new Date("2026-04-01T00:00:00Z"))).toBe("2026-27");
  });
});

describe("grievances", () => {
  const g = (id: number, citizen: string, days: number, extra = {}) => ({
    id,
    projectId: 1,
    citizenHash: citizen,
    createdAt: daysAgo(days),
    respondBy: null,
    respondedAt: null,
    ...extra,
  });
  it("spikes at ≥ 10 unique citizens within 7 days", () => {
    const nine = Array.from({ length: 9 }, (_, i) => g(i + 1, `0xc${i}`, 1));
    expect(grievanceSpike(snap({ grievances: nine }), T)).toEqual([]);
    const ten = [...nine, g(10, "0xc9", 2), g(11, "0xc9", 2)];
    expect(grievanceSpike(snap({ grievances: ten }), T)).toMatchObject([
      { rule: "GRIEVANCE_SPIKE", severity: "HIGH", details: { uniqueCitizens: 10, suggestedAction: "PAUSE_PROJECT" } },
    ]);
    const stale = Array.from({ length: 12 }, (_, i) => g(i + 1, `0xc${i}`, 20));
    expect(grievanceSpike(snap({ grievances: stale }), T)).toEqual([]);
  });
  it("flags escalated grievances past their SLA that were never answered", () => {
    const overdue = g(5, "0xc1", 30, { respondBy: daysAgo(3) });
    expect(grievanceSlaBreach(snap({ grievances: [overdue] }), T)).toMatchObject([{ rule: "GRIEVANCE_SLA_BREACH", key: "g5", details: { overdueDays: 3 } }]);
    expect(grievanceSlaBreach(snap({ grievances: [{ ...overdue, respondedAt: daysAgo(4) }] }), T)).toEqual([]);
    expect(grievanceSlaBreach(snap({ grievances: [{ ...overdue, respondBy: new Date(NOW.getTime() + 1000) }] }), T)).toEqual([]);
  });
});

describe("split tendering", () => {
  const near = (id: number, over = {}) => project({ id, budget: 480_000_000n, createdAt: new Date("2026-09-10T00:00:00Z"), ...over });
  it("flags ≥ 3 same-ward/category/month projects just under the tender threshold", () => {
    const out = splitTendering(snap({ projects: [near(1), near(2), near(3)] }), T);
    expect(out.map((f) => f.projectId)).toEqual([1, 2, 3]);
    expect(out[0]).toMatchObject({ rule: "SPLIT_TENDERING", severity: "HIGH", details: { projectsInGroup: [1, 2, 3] } });
  });
  it("ignores other months, other categories, big and small budgets", () => {
    expect(splitTendering(snap({ projects: [near(1), near(2), near(3, { createdAt: new Date("2026-10-02T00:00:00Z") })] }), T)).toEqual([]);
    expect(splitTendering(snap({ projects: [near(1), near(2), near(3, { category: "PARK" })] }), T)).toEqual([]);
    expect(splitTendering(snap({ projects: [near(1), near(2), near(3, { budget: 500_000_000n })] }), T)).toEqual([]);
    expect(splitTendering(snap({ projects: [near(1), near(2), near(3, { budget: 100_000_000n })] }), T)).toEqual([]);
  });
});

describe("off-hours approvals", () => {
  it("knows IST working hours", () => {
    expect(isOffHours(new Date("2026-10-14T05:00:00Z"))).toBe(false); // Wed 10:30 IST
    expect(isOffHours(new Date("2026-10-14T18:00:00Z"))).toBe(true); // Wed 23:30 IST
    expect(isOffHours(new Date("2026-10-17T06:00:00Z"))).toBe(true); // Saturday
  });
  it("flags a cluster of after-hours approvals on one project", () => {
    const night = new Date("2026-10-14T18:00:00Z");
    const day = new Date("2026-10-14T05:00:00Z");
    const appr = (n: number, at: Date) => Array.from({ length: n }, (_, i) => ({ milestoneId: 1, auditor: `0xa${i}`, at }));
    const flagged = offHoursApprovals(snap({ milestones: [ms(1)], approvals: [...appr(3, night), ...appr(1, day)] }), T);
    expect(flagged).toMatchObject([{ rule: "OFF_HOURS_APPROVALS", severity: "LOW", details: { offHoursApprovals: 3, totalApprovals: 4 } }]);
    expect(offHoursApprovals(snap({ milestones: [ms(1)], approvals: [...appr(2, night), ...appr(5, day)] }), T)).toEqual([]);
    expect(offHoursApprovals(snap({ milestones: [ms(1)], approvals: appr(5, day) }), T)).toEqual([]);
  });
});

describe("evaluate", () => {
  it("returns nothing for a healthy project", () => {
    expect(evaluate(snap({ milestones: [ms(1)] }))).toEqual([]);
  });
  it("combines every rule", () => {
    const out = evaluate(snap({ projects: [project({ spent: 20_000_000n })], milestones: [ms(1, { status: "PROOF_SUBMITTED", submittedAt: daysAgo(9) })] }));
    expect(out.map((f) => f.rule).sort()).toEqual(["BUDGET_OVERRUN", "STALLED_MILESTONE"]);
  });
});
