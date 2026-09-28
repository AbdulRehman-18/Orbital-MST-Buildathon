// Anomaly rules (plan §14). Pure functions over a `Snapshot` of the read model so every rule can be
// unit-tested with fixtures. Findings state facts about the data — they never accuse anyone; the
// public API redacts them to a neutral "Under review" marker.
import { findDuplicate } from "../proof/checks";

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Finding = {
  projectId: number;
  rule: string;
  severity: Severity;
  /** Distinguishes several findings of one rule on one project; part of the dedupe identity. */
  key: string;
  details: Record<string, unknown>;
};

export type Snapshot = {
  now: Date;
  projects: {
    id: number;
    wardId: number;
    category: string;
    status: string;
    budget: bigint;
    spent: bigint;
    contractor: string | null;
    startDate: Date;
    endDate: Date;
    createdAt: Date;
  }[];
  milestones: { id: number; projectId: number; amount: bigint; status: string; submittedAt: Date | null }[];
  /** Approval events with their block time. */
  approvals: { milestoneId: number; auditor: string; at: Date | null }[];
  proofMedia: {
    milestoneId: number;
    cid: string;
    phash: string | null;
    createdAt: Date;
    checks: Record<string, { ok: boolean; detail?: string }> | null;
  }[];
  grievances: {
    id: number;
    projectId: number;
    citizenHash: string;
    createdAt: Date;
    respondBy: Date | null;
    respondedAt: Date | null;
  }[];
};

export type Thresholds = {
  stalledApprovalDays: number;
  stalledMilestoneDays: number;
  velocityBudgetShare: number;
  velocityTimeShare: number;
  collusionShare: number;
  collusionMinMilestones: number;
  concentrationShare: number;
  concentrationMinProjects: number;
  grievanceSpikeCitizens: number;
  grievanceSpikeDays: number;
  /** Tender threshold in ledger units (paise); projects within `splitBand` below it are suspicious. */
  tenderThreshold: bigint;
  splitBand: number;
  splitMinProjects: number;
  offHoursMinApprovals: number;
  offHoursShare: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  stalledApprovalDays: 14,
  stalledMilestoneDays: 7,
  velocityBudgetShare: 0.6,
  velocityTimeShare: 0.2,
  collusionShare: 0.8,
  collusionMinMilestones: 5,
  concentrationShare: 0.4,
  concentrationMinProjects: 3,
  grievanceSpikeCitizens: 10,
  grievanceSpikeDays: 7,
  tenderThreshold: 500_000_000n, // ₹50 lakh in paise
  splitBand: 0.2,
  splitMinProjects: 3,
  offHoursMinApprovals: 3,
  offHoursShare: 0.5,
};

const DAY = 86_400_000;
const daysBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / DAY;
/** `part / whole` for paise-scale bigints, to 4 decimals. */
const ratio = (part: bigint, whole: bigint) => (whole === 0n ? 0 : Number((part * 10_000n) / whole) / 10_000);
const round3 = (r: number) => Math.round(r * 1000) / 1000;

export type Rule = (s: Snapshot, t: Thresholds) => Finding[];

const projectOfMilestone = (s: Snapshot, milestoneId: number) => s.milestones.find((m) => m.id === milestoneId)?.projectId;

export const budgetOverrun: Rule = (s) => {
  const out: Finding[] = [];
  for (const p of s.projects) {
    const allocated = s.milestones
      .filter((m) => m.projectId === p.id && m.status !== "VOID")
      .reduce((sum, m) => sum + m.amount, 0n);
    if (p.spent > p.budget || allocated > p.budget) {
      out.push({
        projectId: p.id,
        rule: "BUDGET_OVERRUN",
        severity: "HIGH",
        key: "budget",
        details: { budget: p.budget.toString(), spent: p.spent.toString(), milestonesTotal: allocated.toString() },
      });
    }
  }
  return out;
};

export const stalledApproval: Rule = (s, t) =>
  s.projects
    .filter((p) => p.status === "PENDING_APPROVAL" && daysBetween(p.createdAt, s.now) > t.stalledApprovalDays)
    .map((p) => ({
      projectId: p.id,
      rule: "STALLED_APPROVAL",
      severity: "MEDIUM" as const,
      key: "approval",
      details: { waitingDays: Math.floor(daysBetween(p.createdAt, s.now)), limitDays: t.stalledApprovalDays },
    }));

export const stalledMilestone: Rule = (s, t) =>
  s.milestones
    .filter((m) => m.status === "PROOF_SUBMITTED" && m.submittedAt && daysBetween(m.submittedAt, s.now) > t.stalledMilestoneDays)
    .map((m) => ({
      projectId: m.projectId,
      rule: "STALLED_MILESTONE",
      severity: "MEDIUM" as const,
      key: `m${m.id}`,
      details: { milestoneId: m.id, waitingDays: Math.floor(daysBetween(m.submittedAt!, s.now)), limitDays: t.stalledMilestoneDays },
    }));

export const spendingVelocity: Rule = (s, t) => {
  const out: Finding[] = [];
  for (const p of s.projects) {
    const total = p.endDate.getTime() - p.startDate.getTime();
    if (total <= 0 || p.budget === 0n) continue;
    const timeShare = Math.max(0, (s.now.getTime() - p.startDate.getTime()) / total);
    const spendShare = ratio(p.spent, p.budget);
    if (spendShare > t.velocityBudgetShare && timeShare < t.velocityTimeShare) {
      out.push({
        projectId: p.id,
        rule: "SPENDING_VELOCITY",
        severity: "HIGH",
        key: "velocity",
        details: { budgetReleased: round3(spendShare), timelineElapsed: round3(timeShare) },
      });
    }
  }
  return out;
};

export const gpsMismatch: Rule = (s) => {
  const seen = new Set<number>();
  const out: Finding[] = [];
  for (const media of s.proofMedia) {
    const projectId = projectOfMilestone(s, media.milestoneId);
    if (projectId === undefined || media.checks?.geofence?.ok !== false || seen.has(media.milestoneId)) continue;
    seen.add(media.milestoneId);
    out.push({
      projectId,
      rule: "GPS_MISMATCH",
      severity: "HIGH",
      key: `m${media.milestoneId}`,
      details: { milestoneId: media.milestoneId, detail: media.checks.geofence.detail ?? null },
    });
  }
  return out;
};

/** Perceptual-hash reuse across milestones; the later upload is the one reported. */
export const duplicateMedia: Rule = (s) => {
  const out: Finding[] = [];
  const ordered = [...s.proofMedia].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const seen = new Set<string>();
  ordered.forEach((media, i) => {
    if (!media.phash) return;
    const earlier = ordered.slice(0, i).filter((o) => o.milestoneId !== media.milestoneId);
    const hit = findDuplicate(media.phash, earlier);
    const projectId = projectOfMilestone(s, media.milestoneId);
    const key = `m${media.milestoneId}:${media.cid}`;
    if (!hit || projectId === undefined || seen.has(key)) return;
    seen.add(key);
    out.push({
      projectId,
      rule: "DUPLICATE_MEDIA",
      severity: "CRITICAL",
      key,
      details: {
        milestoneId: media.milestoneId,
        matchedMilestoneId: hit.match.milestoneId,
        matchedProjectId: projectOfMilestone(s, hit.match.milestoneId) ?? null,
        hammingDistance: hit.distance,
      },
    });
  });
  return out;
};

/** One auditor approving > 80 % of a contractor's reviewed milestones (with a minimum sample). */
export const auditorContractorCollusion: Rule = (s, t) => {
  const out: Finding[] = [];
  const contractors = new Set(s.projects.map((p) => p.contractor).filter((c): c is string => !!c));
  for (const contractor of contractors) {
    const projectIds = new Set(s.projects.filter((p) => p.contractor === contractor).map((p) => p.id));
    const milestoneIds = new Set(s.milestones.filter((m) => projectIds.has(m.projectId)).map((m) => m.id));
    const approved = s.approvals.filter((a) => milestoneIds.has(a.milestoneId));
    const reviewed = new Set(approved.map((a) => a.milestoneId));
    if (reviewed.size < t.collusionMinMilestones) continue;
    const byAuditor = new Map<string, Set<number>>();
    for (const a of approved) byAuditor.set(a.auditor, (byAuditor.get(a.auditor) ?? new Set()).add(a.milestoneId));
    for (const [auditor, ms] of byAuditor) {
      const share = ms.size / reviewed.size;
      if (share <= t.collusionShare) continue;
      for (const projectId of projectIds) {
        if (![...ms].some((id) => projectOfMilestone(s, id) === projectId)) continue;
        out.push({
          projectId,
          rule: "AUDITOR_CONTRACTOR_PATTERN",
          severity: "MEDIUM",
          key: `${auditor}:${contractor}`,
          details: { auditor, contractor, approvalShare: round3(share), milestonesReviewed: reviewed.size },
        });
      }
    }
  }
  return out;
};

/** Indian financial year label (Apr–Mar) of a date, e.g. `2026-27`. */
export const financialYear = (d: Date) => {
  const start = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${start}-${String(start + 1).slice(2)}`;
};

export const contractorConcentration: Rule = (s, t) => {
  const out: Finding[] = [];
  const groups = new Map<string, Snapshot["projects"]>();
  for (const p of s.projects) {
    if (p.status === "CANCELLED") continue;
    const k = `${p.wardId}|${financialYear(p.startDate)}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const [k, ps] of groups) {
    if (ps.length < t.concentrationMinProjects) continue;
    const [ward, fy] = k.split("|");
    const total = ps.reduce((sum, p) => sum + p.budget, 0n);
    const perContractor = new Map<string, bigint>();
    for (const p of ps) if (p.contractor) perContractor.set(p.contractor, (perContractor.get(p.contractor) ?? 0n) + p.budget);
    for (const [contractor, amount] of perContractor) {
      const share = ratio(amount, total);
      if (share <= t.concentrationShare) continue;
      for (const p of ps.filter((x) => x.contractor === contractor)) {
        out.push({
          projectId: p.id,
          rule: "CONTRACTOR_CONCENTRATION",
          severity: "MEDIUM",
          key: `${fy}:${contractor}`,
          details: { wardId: Number(ward), financialYear: fy, contractor, wardBudgetShare: round3(share) },
        });
      }
    }
  }
  return out;
};

export const grievanceSpike: Rule = (s, t) => {
  const since = s.now.getTime() - t.grievanceSpikeDays * DAY;
  const byProject = new Map<number, Set<string>>();
  for (const g of s.grievances) {
    if (g.createdAt.getTime() < since) continue;
    byProject.set(g.projectId, (byProject.get(g.projectId) ?? new Set()).add(g.citizenHash));
  }
  return [...byProject]
    .filter(([, citizens]) => citizens.size >= t.grievanceSpikeCitizens)
    .map(([projectId, citizens]) => ({
      projectId,
      rule: "GRIEVANCE_SPIKE",
      severity: "HIGH" as const,
      key: "spike",
      details: { uniqueCitizens: citizens.size, windowDays: t.grievanceSpikeDays, suggestedAction: "PAUSE_PROJECT" },
    }));
};

/** Escalated grievances the auditors did not answer within the on-chain SLA. */
export const grievanceSlaBreach: Rule = (s) =>
  s.grievances
    .filter((g) => g.respondBy && !g.respondedAt && g.respondBy.getTime() < s.now.getTime())
    .map((g) => ({
      projectId: g.projectId,
      rule: "GRIEVANCE_SLA_BREACH",
      severity: "HIGH" as const,
      key: `g${g.id}`,
      details: { grievanceId: g.id, overdueDays: Math.floor(daysBetween(g.respondBy!, s.now)) },
    }));

/** ≥ N projects in one ward + category + month with budgets just under the tender threshold. */
export const splitTendering: Rule = (s, t) => {
  const floor = (t.tenderThreshold * BigInt(Math.round((1 - t.splitBand) * 1000))) / 1000n;
  const groups = new Map<string, Snapshot["projects"]>();
  for (const p of s.projects) {
    if (p.budget >= t.tenderThreshold || p.budget < floor) continue;
    const k = `${p.wardId}|${p.category}|${p.createdAt.toISOString().slice(0, 7)}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const out: Finding[] = [];
  for (const [k, ps] of groups) {
    if (ps.length < t.splitMinProjects) continue;
    const [ward, category, month] = k.split("|");
    for (const p of ps) {
      out.push({
        projectId: p.id,
        rule: "SPLIT_TENDERING",
        severity: "HIGH",
        key: k,
        details: { wardId: Number(ward), category, month, projectsInGroup: ps.map((x) => x.id) },
      });
    }
  }
  return out;
};

/** Working hours: Mon–Fri, 09:00–18:00 IST. */
export function isOffHours(at: Date): boolean {
  const ist = new Date(at.getTime() + 330 * 60_000);
  const day = ist.getUTCDay();
  const hour = ist.getUTCHours();
  return day === 0 || day === 6 || hour < 9 || hour >= 18;
}

export const offHoursApprovals: Rule = (s, t) => {
  const byProject = new Map<number, { total: number; off: number }>();
  for (const a of s.approvals) {
    const projectId = projectOfMilestone(s, a.milestoneId);
    if (projectId === undefined || !a.at) continue;
    const c = byProject.get(projectId) ?? { total: 0, off: 0 };
    c.total++;
    if (isOffHours(a.at)) c.off++;
    byProject.set(projectId, c);
  }
  return [...byProject]
    .filter(([, c]) => c.off >= t.offHoursMinApprovals && c.off / c.total >= t.offHoursShare)
    .map(([projectId, c]) => ({
      projectId,
      rule: "OFF_HOURS_APPROVALS",
      severity: "LOW" as const,
      key: "hours",
      details: { offHoursApprovals: c.off, totalApprovals: c.total },
    }));
};

export const RULES: Rule[] = [
  budgetOverrun,
  stalledApproval,
  stalledMilestone,
  spendingVelocity,
  gpsMismatch,
  duplicateMedia,
  auditorContractorCollusion,
  contractorConcentration,
  grievanceSpike,
  grievanceSlaBreach,
  splitTendering,
  offHoursApprovals,
];

export function evaluate(snapshot: Snapshot, thresholds: Thresholds = DEFAULT_THRESHOLDS): Finding[] {
  return RULES.flatMap((rule) => rule(snapshot, thresholds));
}

/** Identity used to avoid re-inserting a finding that is already recorded. */
export const findingId = (f: Pick<Finding, "projectId" | "rule" | "key">) => `${f.projectId}|${f.rule}|${f.key}`;
