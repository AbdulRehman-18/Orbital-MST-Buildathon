import { and, anomalies, chainEvents, eq, grievances, inArray, milestoneApprovals, milestones, projects, proofMedia, type Db } from "@namma-seva/db";
import type { Logger } from "pino";
import { DEFAULT_THRESHOLDS, evaluate, findingId, type Finding, type Snapshot, type Thresholds } from "./rules";

/** Read the model into the plain shape the rules work on. */
export async function loadSnapshot(db: Db, now: Date): Promise<Snapshot> {
  const [ps, ms, approvals, media, gs] = await Promise.all([
    db.select().from(projects),
    db.select().from(milestones),
    db
      .select({ milestoneId: milestoneApprovals.milestoneId, auditor: milestoneApprovals.auditorAddr, at: chainEvents.blockTime })
      .from(milestoneApprovals)
      .leftJoin(
        chainEvents,
        and(eq(chainEvents.txHash, milestoneApprovals.txHash), eq(chainEvents.eventName, "MilestoneApproved"), eq(chainEvents.confirmed, true)),
      ),
    db.select().from(proofMedia),
    db.select().from(grievances),
  ]);
  return {
    now,
    projects: ps.map((p) => ({
      id: p.id,
      wardId: p.wardId,
      category: p.category,
      status: p.status,
      budget: BigInt(p.budget),
      spent: BigInt(p.spent),
      contractor: p.contractorAddr,
      startDate: p.startDate,
      endDate: p.endDate,
      createdAt: p.createdAt,
    })),
    milestones: ms.map((m) => ({ id: m.id, projectId: m.projectId, amount: BigInt(m.amount), status: m.status, submittedAt: m.submittedAt })),
    approvals,
    proofMedia: media.map((m) => ({ milestoneId: m.milestoneId, cid: m.cid, phash: m.phash, createdAt: m.createdAt, checks: m.checks })),
    grievances: gs.map((g) => ({
      id: g.id,
      projectId: g.projectId,
      citizenHash: g.citizenHash,
      createdAt: g.createdAt,
      respondBy: g.respondBy,
      respondedAt: g.respondedAt,
    })),
  };
}

/**
 * Evaluate every rule and insert findings that are not already recorded. Resolved anomalies
 * count as recorded, so an auditor's resolution is never undone by the next run.
 */
export async function runAnomalyEngine(db: Db, opts: { now?: Date; thresholds?: Thresholds } = {}): Promise<Finding[]> {
  const findings = evaluate(await loadSnapshot(db, opts.now ?? new Date()), opts.thresholds ?? DEFAULT_THRESHOLDS);
  if (findings.length === 0) return [];
  const existing = await db
    .select({ projectId: anomalies.projectId, rule: anomalies.rule, details: anomalies.details })
    .from(anomalies)
    .where(inArray(anomalies.projectId, [...new Set(findings.map((f) => f.projectId))]));
  const known = new Set(existing.map((e) => findingId({ projectId: e.projectId, rule: e.rule, key: String(e.details.key) })));
  const fresh = findings.filter((f) => !known.has(findingId(f)));
  if (fresh.length) {
    await db.insert(anomalies).values(
      fresh.map((f) => ({ projectId: f.projectId, rule: f.rule, severity: f.severity, details: { ...f.details, key: f.key } })),
    );
  }
  return fresh;
}

/** Run the engine on an interval (plan §14: every 10 minutes). Returns a stop function. */
export function startAnomalyEngine(db: Db, logger: Logger, everyMs = 10 * 60_000): () => void {
  const tick = () =>
    runAnomalyEngine(db)
      .then((fresh) => fresh.length && logger.info({ count: fresh.length }, "anomaly engine recorded new findings"))
      .catch((err) => logger.error({ err: (err as Error).message }, "anomaly engine failed"));
  void tick();
  const timer = setInterval(tick, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
