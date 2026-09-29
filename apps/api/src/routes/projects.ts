import {
  and,
  anomalies,
  archivedProjects,
  auditLog,
  asc,
  chainEvents,
  count,
  desc,
  eq,
  grievances,
  inArray,
  isNull,
  milestones,
  ne,
  notInArray,
  projectApprovals,
  projects,
  sql,
  tenders,
  type SQL,
} from "@namma-seva/db";
import {
  GetProjectParams,
  GetProjectStatsQueryParams,
  ListProjectsQueryParams,
  PinMetadataBody,
  PrepareProjectBody,
  VerifyProjectParams,
} from "@namma-seva/api-zod";
import { txUrl, addressUrl } from "@namma-seva/chain";
import { Router, type IRouter, type Request } from "express";
import { ZeroAddress } from "ethers";
import { anomalyView, canSeeAnomalyDetails } from "../anomaly/view";
import { requireAuth } from "../auth/middleware";
import { PROJECT_CATEGORY } from "../chain/contracts";
import type { AppContext } from "../context";
import { pinJson, pinnedHash } from "../ipfs/metadata";
import { badRequest, conflict, forbidden, handler, notFound, parse, unavailable } from "../lib/http";

export default function projectRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const { db, config } = ctx;

  const archivedIds = db.select({ id: archivedProjects.projectId }).from(archivedProjects);

  router.get(
    "/projects",
    handler(async (req, res) => {
      const q = parse(ListProjectsQueryParams, req.query);
      const where: SQL[] = [];
      if (q.wardId !== undefined) where.push(eq(projects.wardId, q.wardId));
      if (q.status) where.push(eq(projects.status, q.status));
      if (q.official) where.push(eq(projects.officialAddr, q.official.toLowerCase()));
      if (q.contractor) where.push(eq(projects.contractorAddr, q.contractor.toLowerCase()));
      where.push(q.archived === "only" ? inArray(projects.id, archivedIds) : notInArray(projects.id, archivedIds));
      const filter = and(...where);
      const [items, [{ total }]] = await Promise.all([
        db
          .select()
          .from(projects)
          .where(filter)
          .orderBy(desc(projects.id))
          .limit(q.limit ?? 50)
          .offset(q.offset ?? 0),
        db.select({ total: count() }).from(projects).where(filter),
      ]);
      res.json({ items, total });
    }),
  );

  router.get(
    "/projects/stats",
    handler(async (req, res) => {
      const q = parse(GetProjectStatsQueryParams, req.query);
      const ward = and(
        notInArray(projects.id, archivedIds),
        q.wardId !== undefined ? eq(projects.wardId, q.wardId) : undefined,
      );
      const rows = await db
        .select({
          status: projects.status,
          n: count(),
          budget: sql<string>`coalesce(sum(${projects.budget}), 0)::text`,
          spent: sql<string>`coalesce(sum(${projects.spent}), 0)::text`,
        })
        .from(projects)
        .where(ward)
        .groupBy(projects.status);
      const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
      const sumOf = (k: "budget" | "spent") => rows.reduce((acc, r) => acc + BigInt(r[k]), 0n).toString();
      const [{ openGrievances }] = await db
        .select({ openGrievances: count() })
        .from(grievances)
        .innerJoin(projects, eq(projects.id, grievances.projectId))
        .where(and(ne(grievances.status, "RESPONDED"), ward));
      const [{ openAnomalies }] = await db
        .select({ openAnomalies: count() })
        .from(anomalies)
        .innerJoin(projects, eq(projects.id, anomalies.projectId))
        .where(and(isNull(anomalies.resolvedAt), ward));
      res.json({
        totalProjects: rows.reduce((a, r) => a + r.n, 0),
        byStatus,
        totalBudget: sumOf("budget"),
        totalSpent: sumOf("spent"),
        openGrievances,
        openAnomalies,
      });
    }),
  );

  router.get(
    "/projects/:id",
    handler(async (req, res) => {
      const { id } = parse(GetProjectParams, req.params);
      const [project] = await db.select().from(projects).where(eq(projects.id, id));
      if (!project) throw notFound("Project not indexed yet");
      const [approvals, ms, [{ grievanceCount }], [openTender], flags, pending] = await Promise.all([
        db.select().from(projectApprovals).where(eq(projectApprovals.projectId, id)).orderBy(asc(projectApprovals.block)),
        db.select().from(milestones).where(eq(milestones.projectId, id)).orderBy(asc(milestones.id)),
        db.select({ grievanceCount: count() }).from(grievances).where(eq(grievances.projectId, id)),
        db
          .select({ id: tenders.id })
          .from(tenders)
          .where(and(eq(tenders.projectId, id), eq(tenders.status, "OPEN"))),
        db.select().from(anomalies).where(eq(anomalies.projectId, id)).orderBy(desc(anomalies.detectedAt)),
        db
          .select()
          .from(chainEvents)
          .where(and(eq(chainEvents.confirmed, false), sql`${chainEvents.args}->>'projectId' = ${String(id)}`))
          .orderBy(asc(chainEvents.blockNumber), asc(chainEvents.logIndex)),
      ]);
      res.json({
        project,
        approvals,
        milestones: ms,
        grievanceCount,
        openTenderId: openTender?.id ?? null,
        // Public viewers only see that a project is "under review", never the rule or its details.
        anomalies: canSeeAnomalyDetails(req)
          ? flags
          : flags.filter((f) => !f.resolvedAt).map((f) => anomalyView(f, false)),
        pendingEvents: pending,
      });
    }),
  );

  /**
   * "Delete" a rejected project. The chain is append-only, so this only hides it from public lists,
   * maps and totals; the record, its events and its proofs stay verifiable by id.
   */
  const canArchive = async (req: Request) => {
    const { id } = parse(GetProjectParams, req.params);
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) throw notFound("Project not indexed yet");
    const isAdmin = req.user!.roles.includes("ADMIN");
    if (!isAdmin && project.officialAddr !== req.user!.walletAddress?.toLowerCase()) {
      throw forbidden("Only the official who created this project can remove it");
    }
    return project;
  };

  router.post(
    "/projects/:id/archive",
    requireAuth("GOVT_OFFICIAL", "ADMIN"),
    handler(async (req, res) => {
      const project = await canArchive(req);
      if (project.status !== "CANCELLED") throw conflict("Only rejected or cancelled projects can be removed");
      await db
        .insert(archivedProjects)
        .values({ projectId: project.id, archivedBy: req.user!.walletAddress ?? req.user!.id })
        .onConflictDoNothing();
      await db.insert(auditLog).values({
        actor: req.user!.walletAddress ?? req.user!.id,
        action: "project.archive",
        entity: "project",
        entityId: String(project.id),
        requestId: String(req.id ?? ""),
      });
      res.status(204).end();
    }),
  );

  router.delete(
    "/projects/:id/archive",
    requireAuth("GOVT_OFFICIAL", "ADMIN"),
    handler(async (req, res) => {
      const project = await canArchive(req);
      await db.delete(archivedProjects).where(eq(archivedProjects.projectId, project.id));
      await db.insert(auditLog).values({
        actor: req.user!.walletAddress ?? req.user!.id,
        action: "project.unarchive",
        entity: "project",
        entityId: String(project.id),
        requestId: String(req.id ?? ""),
      });
      res.status(204).end();
    }),
  );

  /** Pins metadata and returns the `NewProject` struct for the official's wallet to sign. */
  router.post(
    "/projects",
    requireAuth("GOVT_OFFICIAL"),
    handler(async (req, res) => {
      if (!ctx.chain) throw unavailable("Chain not configured");
      const body = parse(PrepareProjectBody, req.body);
      if (body.endDate <= body.startDate) throw badRequest("endDate must be after startDate");
      if (BigInt(body.budget) <= 0n) throw badRequest("budget must be positive");
      const wards = req.user!.wards;
      if (wards.length && !wards.includes(body.wardId) && !wards.includes(0xffffffff)) {
        throw badRequest(`Your wallet has no on-chain access to ward ${body.wardId}`);
      }

      const pinned = await pinJson(
        db,
        ctx.ipfs,
        "project",
        {
          title: body.title,
          description: body.description,
          location: body.location,
          category: body.category,
          wardId: body.wardId,
          departmentId: body.deptId,
          latE6: body.latE6,
          lngE6: body.lngE6,
          budget: body.budget,
          startDate: body.startDate.toISOString(),
          endDate: body.endDate.toISOString(),
          official: req.user!.walletAddress,
        },
        req.user!.walletAddress,
      );
      res.status(201).json({
        metaCID: pinned.cid,
        metaHash: pinned.hash,
        registry: ctx.chain.contracts.address.ProjectRegistry,
        args: {
          metaHash: pinned.hash,
          metaCID: pinned.cid,
          wardId: body.wardId,
          departmentId: body.deptId,
          category: PROJECT_CATEGORY.indexOf(body.category),
          latE6: body.latE6,
          lngE6: body.lngE6,
          budget: body.budget,
          startDate: Math.floor(body.startDate.getTime() / 1000),
          endDate: Math.floor(body.endDate.getTime() / 1000),
          contractor: body.contractorAddr ?? ZeroAddress,
          approvalThreshold: body.approvalThreshold,
        },
      });
    }),
  );

  /** Pins milestone / tender / response / reason metadata; returns `{cid, hash}` to sign. */
  router.post(
    "/metadata",
    requireAuth("GOVT_OFFICIAL", "AUDITOR", "CONTRACTOR", "ADMIN"),
    handler(async (req, res) => {
      const body = parse(PinMetadataBody, req.body);
      const pinned = await pinJson(
        db,
        ctx.ipfs,
        body.kind,
        {
          title: body.title,
          description: body.description,
          projectId: body.projectId,
          extra: body.extra,
          author: req.user!.walletAddress,
        },
        req.user!.walletAddress,
      );
      res.status(201).json({ cid: pinned.cid, hash: pinned.hash });
    }),
  );

  /** "Verify on chain": indexed row vs a live `getProject` read vs the pinned metadata hash. */
  router.get(
    "/verify/:projectId",
    handler(async (req, res) => {
      if (!ctx.chain) throw unavailable("Chain not configured");
      const { projectId } = parse(VerifyProjectParams, req.params);
      const registry = ctx.chain.contracts.contract("ProjectRegistry", ctx.chain.provider);
      const exists = (await registry.exists(projectId)) as boolean;
      if (!exists) throw notFound("No such project on-chain");
      const [block, onChain, [row]] = await Promise.all([
        ctx.chain.provider.getBlockNumber(),
        registry.getProject(projectId),
        db.select().from(projects).where(eq(projects.id, projectId)),
      ]);
      const pairs: [string, string | null, string][] = [
        ["metaHash", row?.metaHash ?? null, String(onChain.metaHash).toLowerCase()],
        ["budget", row?.budget ?? null, onChain.budget.toString()],
        ["spent", row?.spent ?? null, onChain.spent.toString()],
        ["status", row?.status ?? null, ["PENDING_APPROVAL", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"][Number(onChain.status)]],
        ["wardId", row ? String(row.wardId) : null, onChain.wardId.toString()],
        ["official", row?.officialAddr ?? null, String(onChain.official).toLowerCase()],
        [
          "contractor",
          row ? (row.contractorAddr ?? ZeroAddress) : null,
          String(onChain.contractor).toLowerCase(),
        ],
        ["milestoneCount", row ? String(row.milestoneCount) : null, onChain.milestoneCount.toString()],
      ];
      const fields = pairs.map(([field, indexed, chain]) => ({ field, indexed, onChain: chain, match: indexed === chain }));
      const rehash = row ? await pinnedHash(db, row.metaCid) : null;
      const metadataVerified = rehash === null ? null : rehash === String(onChain.metaHash).toLowerCase();
      res.json({
        projectId,
        verified: fields.every((f) => f.match) && metadataVerified !== false,
        metadataVerified,
        fields,
        contract: ctx.chain.contracts.address.ProjectRegistry,
        explorerUrl: addressUrl(config.network, ctx.chain.contracts.address.ProjectRegistry),
        createdTxUrl: row ? txUrl(config.network, row.createdTx) : null,
        checkedAt: new Date(),
        block,
      });
    }),
  );

  return router;
}
