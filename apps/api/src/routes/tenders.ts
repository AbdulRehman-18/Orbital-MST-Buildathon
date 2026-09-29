import { and, asc, bids, desc, eq, tenders, type SQL } from "@namma-seva/db";
import { GetTenderParams, ListTendersQueryParams } from "@namma-seva/api-zod";
import { Router, type IRouter } from "express";
import type { AppContext } from "../context";
import { handler, notFound, parse } from "../lib/http";

/** Commit / reveal / award happen on-chain via `TenderRegistry`; this is the read side. */
export default function tenderRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const { db } = ctx;

  // Phases follow chain time, as the contract does (block.timestamp), not this server's clock.
  // ponytail: one cached head read per 5 s; falls back to the wall clock if the RPC is unreachable.
  let cached = { at: 0, now: 0 };
  async function chainNow(): Promise<number> {
    if (!ctx.chain) return Date.now();
    if (Date.now() - cached.at < 5_000) return cached.now + (Date.now() - cached.at);
    try {
      const block = await ctx.chain.provider.getBlock("latest");
      if (block) cached = { at: Date.now(), now: block.timestamp * 1000 };
      return block ? cached.now : Date.now();
    } catch {
      return Date.now();
    }
  }

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
      const now = await chainNow();
      res.json(rows.map((t) => withPhase(t, now)));
    }),
  );

  router.get(
    "/tenders/:id",
    handler(async (req, res) => {
      const { id } = parse(GetTenderParams, req.params);
      const [tender] = await db.select().from(tenders).where(eq(tenders.id, id));
      if (!tender) throw notFound("Tender not indexed yet");
      const rows = await db.select().from(bids).where(eq(bids.tenderId, id)).orderBy(asc(bids.bidderAddr));
      res.json({ tender: withPhase(tender, await chainNow()), bids: rows.map(({ tenderId: _t, ...b }) => b) });
    }),
  );

  return router;
}

export function withPhase(t: typeof tenders.$inferSelect, now: number) {
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
