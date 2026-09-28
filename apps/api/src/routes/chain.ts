import {
  and,
  anomalies,
  count,
  desc,
  eq,
  isNull,
  isNotNull,
  pendingTxs,
  projects,
  sql,
  chainEvents,
  type SQL,
} from "@namma-seva/db";
import {
  GetTrackedTxParams,
  ListAnomaliesQueryParams,
  ListLedgerEventsQueryParams,
  TrackTxBody,
} from "@namma-seva/api-zod";
import { txUrl } from "@namma-seva/chain";
import { Router, type IRouter } from "express";
import type { AppContext } from "../context";
import { indexerLag } from "../indexer/indexer";
import { handler, notFound, parse } from "../lib/http";

export default function chainRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const { db, config } = ctx;

  async function trackedView(row: typeof pendingTxs.$inferSelect) {
    const head = ctx.chain ? await ctx.chain.provider.getBlockNumber().catch(() => null) : null;
    return {
      txHash: row.txHash,
      kind: row.kind,
      entityId: row.entityId,
      status: row.status,
      blockNumber: row.blockNumber,
      confirmations: row.blockNumber !== null && head !== null ? Math.max(head - row.blockNumber + 1, 0) : null,
      explorerUrl: txUrl(config.network, row.txHash),
    };
  }

  /** Optimistic "Pending" state for wallet-sent txs; the indexer resolves them. */
  router.post(
    "/tx/track",
    handler(async (req, res) => {
      const body = parse(TrackTxBody, req.body);
      const txHash = body.txHash.toLowerCase();
      const [row] = await db
        .insert(pendingTxs)
        .values({ txHash, kind: body.kind, entityId: body.entityId ?? null, userId: req.user?.id ?? null })
        .onConflictDoUpdate({ target: pendingTxs.txHash, set: { updatedAt: new Date() } })
        .returning();
      res.status(202).json(await trackedView(row));
    }),
  );

  router.get(
    "/tx/:txHash",
    handler(async (req, res) => {
      const { txHash } = parse(GetTrackedTxParams, req.params);
      const [row] = await db.select().from(pendingTxs).where(eq(pendingTxs.txHash, txHash.toLowerCase()));
      if (!row) throw notFound("Transaction is not being tracked");
      res.json(await trackedView(row));
    }),
  );

  router.get(
    "/chain/status",
    handler(async (_req, res) => {
      const lag = await indexerLag(db, config.chainName);
      const head = ctx.chain ? await ctx.chain.provider.getBlockNumber().catch(() => null) : null;
      const relayer = ctx.relayer ? await ctx.relayer.status().catch(() => null) : null;
      res.json({
        network: config.chainName,
        chainId: config.network.id,
        explorerUrl: config.network.blockExplorers.default.url,
        headBlock: head ?? lag?.headBlock ?? null,
        indexedBlock: lag?.lastBlock ?? null,
        lagBlocks: head !== null && lag ? Math.max(head - lag.lastBlock, 0) : (lag?.lagBlocks ?? null),
        indexerUpdatedAt: lag?.updatedAt ?? null,
        confirmations: config.chain.confirmations,
        mode: ctx.chain?.contracts.deployment.mode ?? null,
        contracts: ctx.chain ? ctx.chain.contracts.address : {},
        relayer,
      });
    }),
  );

  router.get(
    "/ledger",
    handler(async (req, res) => {
      const q = parse(ListLedgerEventsQueryParams, req.query);
      const where: SQL[] = [];
      if (!q.includePending) where.push(eq(chainEvents.confirmed, true));
      if (q.contract) where.push(eq(chainEvents.contract, q.contract));
      if (q.eventName) where.push(eq(chainEvents.eventName, q.eventName));
      if (q.projectId !== undefined) where.push(sql`${chainEvents.args}->>'projectId' = ${String(q.projectId)}`);
      const filter = where.length ? and(...where) : undefined;
      const [items, [{ total }]] = await Promise.all([
        db
          .select()
          .from(chainEvents)
          .where(filter)
          .orderBy(desc(chainEvents.blockNumber), desc(chainEvents.logIndex))
          .limit(q.limit ?? 50)
          .offset(q.offset ?? 0),
        db.select({ total: count() }).from(chainEvents).where(filter),
      ]);
      res.json({ items: items.map(({ blockHash: _b, ...e }) => e), total });
    }),
  );

  router.get(
    "/anomalies",
    handler(async (req, res) => {
      const q = parse(ListAnomaliesQueryParams, req.query);
      const where: SQL[] = [];
      if (q.projectId !== undefined) where.push(eq(anomalies.projectId, q.projectId));
      if (q.open === true) where.push(isNull(anomalies.resolvedAt));
      if (q.open === false) where.push(isNotNull(anomalies.resolvedAt));
      res.json(
        await db
          .select()
          .from(anomalies)
          .where(where.length ? and(...where) : undefined)
          .orderBy(desc(anomalies.detectedAt))
          .limit(500),
      );
    }),
  );

  /** Open-data export (plan §11.2 `/ward/:wardId`). */
  router.get(
    "/public/export.csv",
    handler(async (req, res) => {
      const wardId = req.query.wardId !== undefined ? Number(req.query.wardId) : undefined;
      if (wardId !== undefined && !Number.isInteger(wardId)) throw notFound();
      const rows = await db
        .select()
        .from(projects)
        .where(wardId !== undefined ? eq(projects.wardId, wardId) : undefined)
        .orderBy(projects.id);
      const header = [
        "project_id", "title", "category", "status", "ward_id", "department_id", "latitude", "longitude",
        "budget", "spent", "funded", "official", "contractor", "milestones", "start_date", "end_date",
        "meta_cid", "meta_hash", "created_tx", "explorer_url",
      ];
      const lines = rows.map((p) =>
        [
          p.id, p.title ?? "", p.category, p.status, p.wardId, p.deptId, p.latE6 / 1e6, p.lngE6 / 1e6,
          p.budget, p.spent, p.funded, p.officialAddr, p.contractorAddr ?? "", p.milestoneCount,
          p.startDate.toISOString().slice(0, 10), p.endDate.toISOString().slice(0, 10),
          p.metaCid, p.metaHash, p.createdTx, txUrl(config.network, p.createdTx),
        ]
          .map(csvCell)
          .join(","),
      );
      const name = wardId !== undefined ? `namma-seva-ward-${wardId}.csv` : "namma-seva-projects.csv";
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", `attachment; filename="${name}"`);
      res.send([header.join(","), ...lines].join("\r\n") + "\r\n");
    }),
  );

  return router;
}

/** RFC 4180 quoting, plus a leading ' on formula-like cells (CSV injection in spreadsheets). */
export function csvCell(value: unknown): string {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
