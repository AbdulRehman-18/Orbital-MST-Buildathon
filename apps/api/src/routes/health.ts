import { departments, sql, wards } from "@namma-seva/db";
import { Router, type IRouter } from "express";
import type { AppContext } from "../context";
import { indexerLag } from "../indexer/indexer";
import { handler, notFound } from "../lib/http";

/** Readiness requires the indexer to have advanced within this window (plan §9.6). */
export const MAX_INDEXER_STALENESS_MS = 60_000;

export default function healthRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const startedAt = new Date().toISOString();
  const { config, db } = ctx;

  /** Liveness. */
  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "namma-seva-api",
      startedAt,
      demoMode: config.demoMode,
      chain: { name: config.network.name, chainId: config.network.id },
    });
  });

  /** Readiness: DB + RPC + indexer lag < 60 s. */
  router.get(
    "/ready",
    handler(async (_req, res) => {
      const database = await db
        .execute(sql`select 1`)
        .then(() => ({ ok: true }))
        .catch((e: Error) => ({ ok: false, detail: e.message }));
      const rpc = ctx.chain
        ? await ctx.chain.provider
            .getBlockNumber()
            .then((n) => ({ ok: true, detail: `head ${n}` }))
            .catch((e: Error) => ({ ok: false, detail: e.message }))
        : { ok: false, detail: "chain not configured" };
      const lag = database.ok ? await indexerLag(db, config.chainName).catch(() => null) : null;
      const age = lag ? Date.now() - lag.updatedAt.getTime() : null;
      const indexer =
        lag && age !== null && age < MAX_INDEXER_STALENESS_MS
          ? { ok: true, detail: `block ${lag.lastBlock}, ${lag.lagBlocks ?? "?"} behind head, updated ${Math.round(age / 1000)} s ago` }
          : { ok: false, detail: lag ? `last update ${Math.round((age ?? 0) / 1000)} s ago` : "indexer has not run" };
      const ready = database.ok && rpc.ok && indexer.ok;
      res.status(ready ? 200 : 503).json({ ready, checks: { database, rpc, indexer } });
    }),
  );

  router.get(
    "/wards",
    handler(async (_req, res) => {
      res.json(
        (await db.select().from(wards).orderBy(wards.id)).map(({ geojson: _g, ...w }) => w),
      );
    }),
  );

  router.get(
    "/departments",
    handler(async (_req, res) => {
      res.json(await db.select().from(departments).orderBy(departments.id));
    }),
  );

  /** Serves dev-store pins (LocalIpfs); production content comes from the Pinata gateway. */
  router.get("/ipfs/:cid", (req, res, next) => {
    const item = ctx.ipfs.get?.(req.params.cid);
    if (!item) return next(notFound());
    res.setHeader("content-type", item.mime);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.send(Buffer.from(item.bytes));
  });

  return router;
}
