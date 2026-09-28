// Event → read-model projections. Must be deterministic given the ordered confirmed event stream:
// `indexer:rebuild` replays the same events and its checksum must match the live tables.
import {
  accountRoles,
  and,
  bids,
  citizenSigners,
  count,
  eq,
  grievances,
  grievanceUpvotes,
  milestoneApprovals,
  milestones,
  pinnedMetadata,
  projectApprovals,
  projects,
  sql,
  tenders,
  wardAccess,
  type DbOrTx,
} from "@namma-seva/db";
import {
  enumName,
  GRIEVANCE_ACTION,
  GRIEVANCE_CATEGORY,
  MILESTONE_STATUS,
  PROJECT_CATEGORY,
  PROJECT_STATUS,
  ROLE_IDS,
} from "../chain/contracts";
import type { ChainEvent } from "./decode";

/** Entities whose read model changed; drives Socket.IO notifications. */
export type Touched = { kind: "project" | "milestone" | "grievance" | "tender" | "role"; id: string; projectId?: string };

/** Every projection table, in truncation order for rebuilds. */
export const PROJECTION_TABLES = [
  "projects",
  "project_approvals",
  "milestones",
  "milestone_approvals",
  "grievances",
  "grievance_upvotes",
  "tenders",
  "bids",
  "account_roles",
  "ward_access",
  "citizen_signers",
] as const;

const secs = (v: unknown) => new Date(Number(v) * 1000);
const num = (v: unknown) => Number(v);
const ZERO_ADDRESS = "0x" + "0".repeat(40);

async function metadata(tx: DbOrTx, cid: string) {
  const [row] = await tx.select({ body: pinnedMetadata.body }).from(pinnedMetadata).where(eq(pinnedMetadata.cid, cid));
  const body = row?.body ?? {};
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : null);
  return { title: str("title"), description: str("description") };
}

export async function applyEvent(tx: DbOrTx, ev: ChainEvent): Promise<Touched[]> {
  const a = ev.args as Record<string, string>;
  const block = ev.blockNumber;
  const at = ev.blockTime ?? new Date(0);
  const key = `${ev.contract}.${ev.eventName}`;

  switch (key) {
    // ─── ProjectRegistry ───────────────────────────────────────────────────
    case "ProjectRegistry.ProjectCreated": {
      const meta = await metadata(tx, a.metaCID);
      await tx
        .insert(projects)
        .values({
          id: num(a.projectId),
          metaCid: a.metaCID,
          metaHash: a.metaHash,
          title: meta.title,
          description: meta.description,
          category: enumName(PROJECT_CATEGORY, a.category),
          wardId: num(a.wardId),
          deptId: num(a.departmentId),
          latE6: num(a.latE6),
          lngE6: num(a.lngE6),
          budget: a.budget,
          status: "PENDING_APPROVAL",
          officialAddr: a.official,
          contractorAddr: a.contractor === ZERO_ADDRESS ? null : a.contractor,
          approvalThreshold: num(a.approvalThreshold),
          startDate: secs(a.startDate),
          endDate: secs(a.endDate),
          createdAt: at,
          createdTx: ev.txHash,
          createdBlock: block,
          updatedBlock: block,
        })
        .onConflictDoNothing();
      return [{ kind: "project", id: a.projectId }];
    }
    case "ProjectRegistry.ProjectApproved":
      await tx
        .insert(projectApprovals)
        .values({ projectId: num(a.projectId), auditorAddr: a.auditor, txHash: ev.txHash, block })
        .onConflictDoNothing();
      return updateProject(tx, a.projectId, { approvalCount: num(a.approvalCount) }, block);
    case "ProjectRegistry.ProjectStatusChanged":
      return updateProject(tx, a.projectId, { status: enumName(PROJECT_STATUS, a.status) }, block);
    case "ProjectRegistry.ProjectCancelRequested":
      return updateProject(tx, a.projectId, { cancelRequested: true }, block);
    case "ProjectRegistry.ContractorAssigned":
      return updateProject(tx, a.projectId, { contractorAddr: a.contractor }, block);
    case "ProjectRegistry.MilestoneCountUpdated":
      return updateProject(tx, a.projectId, { milestoneCount: num(a.milestoneCount) }, block);
    case "ProjectRegistry.SpentUpdated":
      return updateProject(tx, a.projectId, { spent: a.spent }, block);

    // ─── MilestoneEscrow ───────────────────────────────────────────────────
    case "MilestoneEscrow.ProjectFunded":
      await tx
        .update(projects)
        .set({ funded: sql`${projects.funded} + ${a.amount}::numeric`, updatedBlock: block })
        .where(eq(projects.id, num(a.projectId)));
      return [{ kind: "project", id: a.projectId }];
    case "MilestoneEscrow.MilestoneCreated": {
      const meta = await metadata(tx, a.metaCID);
      await tx
        .insert(milestones)
        .values({
          id: num(a.milestoneId),
          projectId: num(a.projectId),
          title: meta.title,
          description: meta.description,
          metaCid: a.metaCID,
          metaHash: a.metaHash,
          amount: a.amount,
          status: "PENDING",
          createdAt: at,
          createdTx: ev.txHash,
          updatedBlock: block,
        })
        .onConflictDoNothing();
      return [{ kind: "milestone", id: a.milestoneId, projectId: a.projectId }];
    }
    case "MilestoneEscrow.ProofSubmitted":
      return updateMilestone(tx, a, block, {
        proofCid: a.proofCID,
        proofHash: a.proofHash,
        proofLatE6: num(a.latE6),
        proofLngE6: num(a.lngE6),
        submittedBy: a.contractor,
        submittedAt: at,
        round: num(a.round),
        approvalCount: 0,
      });
    case "MilestoneEscrow.MilestoneApproved":
      await tx
        .insert(milestoneApprovals)
        .values({ milestoneId: num(a.milestoneId), round: num(a.round), auditorAddr: a.auditor, txHash: ev.txHash, block })
        .onConflictDoNothing();
      return updateMilestone(tx, a, block, { approvalCount: num(a.approvalCount) });
    case "MilestoneEscrow.MilestoneRejected":
      // The contract bumps the round after emitting; approvals restart from zero.
      return updateMilestone(tx, a, block, {
        rejectionReasonHash: a.reasonHash,
        round: num(a.round) + 1,
        approvalCount: 0,
      });
    case "MilestoneEscrow.MilestoneStatusChanged":
      return updateMilestone(tx, a, block, { status: enumName(MILESTONE_STATUS, a.status) });
    case "MilestoneEscrow.FundsReleased":
      return updateMilestone(tx, a, block, { paidTx: ev.txHash, paidAt: at });
    case "MilestoneEscrow.MilestoneVoided":
      return updateMilestone(tx, a, block, { rejectionReasonHash: a.reasonHash });

    // ─── GrievanceRegistry ─────────────────────────────────────────────────
    case "GrievanceRegistry.GrievanceFiled":
      await tx
        .insert(grievances)
        .values({
          id: num(a.grievanceId),
          projectId: num(a.projectId),
          citizenHash: a.citizenHash,
          category: enumName(GRIEVANCE_CATEGORY, a.category),
          cid: a.cid,
          status: "OPEN",
          createdAt: at,
          createdTx: ev.txHash,
          updatedBlock: block,
        })
        .onConflictDoNothing();
      return [{ kind: "grievance", id: a.grievanceId, projectId: a.projectId }];
    case "GrievanceRegistry.GrievanceUpvoted":
      await tx
        .insert(grievanceUpvotes)
        .values({ grievanceId: num(a.grievanceId), citizenHash: a.citizenHash, txHash: ev.txHash, block })
        .onConflictDoNothing();
      return updateGrievance(tx, a, block, { upvotes: num(a.upvotes) });
    case "GrievanceRegistry.GrievanceThresholdReached":
      return updateGrievance(tx, a, block, { status: "ESCALATED", escalatedAt: at, respondBy: secs(a.respondBy) });
    case "GrievanceRegistry.GrievanceResponded":
      return updateGrievance(tx, a, block, {
        status: "RESPONDED",
        action: enumName(GRIEVANCE_ACTION, a.action),
        responseCid: a.responseCID,
        respondedBy: a.auditor,
        respondedAt: at,
      });
    case "GrievanceRegistry.CitizenSignerSet":
      if (/^0x0+$/.test(a.citizenHash)) {
        await tx.delete(citizenSigners).where(eq(citizenSigners.signer, a.signer));
      } else {
        await tx
          .insert(citizenSigners)
          .values({ signer: a.signer, citizenHash: a.citizenHash, updatedBlock: block })
          .onConflictDoUpdate({
            target: citizenSigners.signer,
            set: { citizenHash: a.citizenHash, updatedBlock: block },
          });
      }
      return [];

    // ─── TenderRegistry ────────────────────────────────────────────────────
    case "TenderRegistry.TenderPublished":
      await tx
        .insert(tenders)
        .values({
          id: num(a.tenderId),
          projectId: num(a.projectId),
          officialAddr: a.official,
          metaCid: a.metaCID,
          status: "OPEN",
          commitDeadline: secs(a.commitDeadline),
          revealDeadline: secs(a.revealDeadline),
          createdTx: ev.txHash,
          updatedBlock: block,
        })
        .onConflictDoNothing();
      return [{ kind: "tender", id: a.tenderId, projectId: a.projectId }];
    case "TenderRegistry.BidCommitted": {
      await tx
        .insert(bids)
        .values({ tenderId: num(a.tenderId), bidderAddr: a.bidder, commitHash: a.commitHash, committedTx: ev.txHash })
        .onConflictDoNothing();
      const [{ n }] = await tx.select({ n: count() }).from(bids).where(eq(bids.tenderId, num(a.tenderId)));
      return updateTender(tx, a.tenderId, { bidCount: n }, block);
    }
    case "TenderRegistry.BidRevealed": {
      await tx
        .update(bids)
        .set({ revealedAmount: a.amount, revealedAt: at })
        .where(and(eq(bids.tenderId, num(a.tenderId)), eq(bids.bidderAddr, a.bidder)));
      const [{ n }] = await tx
        .select({ n: count() })
        .from(bids)
        .where(and(eq(bids.tenderId, num(a.tenderId)), sql`${bids.revealedAt} is not null`));
      return updateTender(tx, a.tenderId, { revealedCount: n }, block);
    }
    case "TenderRegistry.TenderAwarded":
      return updateTender(tx, a.tenderId, { status: "AWARDED", awardedTo: a.winner, winningBid: a.amount }, block);
    case "TenderRegistry.TenderCancelled":
      return updateTender(tx, a.tenderId, { status: "CANCELLED", cancelReasonHash: a.reasonHash }, block);

    // ─── NammaSevaAccess ───────────────────────────────────────────────────
    case "NammaSevaAccess.RoleGranted": {
      const role = ROLE_IDS[a.role] ?? a.role;
      await tx
        .insert(accountRoles)
        .values({ address: a.account, role, grantedBlock: block })
        .onConflictDoUpdate({ target: [accountRoles.address, accountRoles.role], set: { grantedBlock: block } });
      return [{ kind: "role", id: a.account }];
    }
    case "NammaSevaAccess.RoleRevoked":
      await tx
        .delete(accountRoles)
        .where(and(eq(accountRoles.address, a.account), eq(accountRoles.role, ROLE_IDS[a.role] ?? a.role)));
      return [{ kind: "role", id: a.account }];
    case "NammaSevaAccess.WardAccessSet":
      if (ev.args.allowed === true) {
        await tx
          .insert(wardAccess)
          .values({ address: a.account, wardId: num(a.wardId), updatedBlock: block })
          .onConflictDoUpdate({ target: [wardAccess.address, wardAccess.wardId], set: { updatedBlock: block } });
      } else {
        await tx.delete(wardAccess).where(and(eq(wardAccess.address, a.account), eq(wardAccess.wardId, num(a.wardId))));
      }
      return [{ kind: "role", id: a.account }];

    default:
      // Stored in chain_events for the ledger view; no projection (e.g. Paused, UnallocatedRefunded).
      return [];
  }
}

async function updateProject(
  tx: DbOrTx,
  projectId: string,
  set: Partial<typeof projects.$inferInsert>,
  block: number,
): Promise<Touched[]> {
  await tx.update(projects).set({ ...set, updatedBlock: block }).where(eq(projects.id, num(projectId)));
  return [{ kind: "project", id: projectId }];
}

async function updateMilestone(
  tx: DbOrTx,
  a: Record<string, string>,
  block: number,
  set: Partial<typeof milestones.$inferInsert>,
): Promise<Touched[]> {
  await tx.update(milestones).set({ ...set, updatedBlock: block }).where(eq(milestones.id, num(a.milestoneId)));
  return [{ kind: "milestone", id: a.milestoneId, projectId: a.projectId }];
}

async function updateGrievance(
  tx: DbOrTx,
  a: Record<string, string>,
  block: number,
  set: Partial<typeof grievances.$inferInsert>,
): Promise<Touched[]> {
  await tx.update(grievances).set({ ...set, updatedBlock: block }).where(eq(grievances.id, num(a.grievanceId)));
  return [{ kind: "grievance", id: a.grievanceId, projectId: a.projectId }];
}

async function updateTender(
  tx: DbOrTx,
  tenderId: string,
  set: Partial<typeof tenders.$inferInsert>,
  block: number,
): Promise<Touched[]> {
  const [row] = await tx
    .update(tenders)
    .set({ ...set, updatedBlock: block })
    .where(eq(tenders.id, num(tenderId)))
    .returning({ projectId: tenders.projectId });
  return [{ kind: "tender", id: tenderId, projectId: row ? String(row.projectId) : undefined }];
}
