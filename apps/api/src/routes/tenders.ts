import { and, asc, bids, desc, eq, tenders, type SQL } from "@namma-seva/db";
import { GetTenderParams, ListTendersQueryParams } from "@namma-seva/api-zod";
import { Router, type IRouter } from "express";
import type { AppContext } from "../context";
import { handler, notFound, parse } from "../lib/http";

/** Commit / reveal / award happen on-chain via `TenderRegistry`; this is the read side. */
export default function tenderRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const { db } = ctx;

  router.get(
    "/tenders",
    handler(async (req, res) => {
      const q = parse(ListTendersQueryParams, req.query);
      const where: SQL[] = [];
      if (q.projectId !== undefined) where.push(eq(tenders.projectId, q.projectId));
      if (q.status) where.push(eq(tenders.status, q.status));
      const rows = await db
        .select()
        .from(tenders)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(tenders.id));
      res.json(rows.map(withPhase));
    }),
  );

  router.get(
    "/tenders/:id",
    handler(async (req, res) => {
      const { id } = parse(GetTenderParams, req.params);
      const [tender] = await db.select().from(tenders).where(eq(tenders.id, id));
      if (!tender) throw notFound("Tender not indexed yet");
      const rows = await db.select().from(bids).where(eq(bids.tenderId, id)).orderBy(asc(bids.bidderAddr));
      res.json({ tender: withPhase(tender), bids: rows.map(({ tenderId: _t, ...b }) => b) });
    }),
  );

  return router;
}

function withPhase(t: typeof tenders.$inferSelect) {
  const now = Date.now();
  const phase =
    t.status !== "OPEN"
      ? "CLOSED"
      : now < t.commitDeadline.getTime()
        ? "COMMIT"
        : now < t.revealDeadline.getTime()
          ? "REVEAL"
          : "AWAITING_AWARD";
  const { updatedBlock: _u, cancelReasonHash: _c, ...rest } = t;
  return { ...rest, phase };
}
