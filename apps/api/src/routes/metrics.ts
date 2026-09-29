import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type RequestHandler } from "express";
import type { AppContext } from "../context";
import { indexerLag } from "../indexer/indexer";
import { metrics } from "../lib/metrics";

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Records request count and latency by matched route (never the raw path — keeps cardinality bounded). */
export const httpMetrics: RequestHandler = (req, res, next) => {
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const route = req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : "unmatched";
    const labels = { method: req.method, route, status: String(res.statusCode) };
    metrics.httpRequests.inc(labels);
    metrics.httpDuration.observe(Number(process.hrtime.bigint() - started) / 1e6, { method: req.method, route });
  });
  next();
};

/**
 * `GET /metrics` for Prometheus. Deliberately outside `/api` so the public Nginx never proxies it;
 * scrapers reach the API's port on the internal network. In production a bearer token
 * (`METRICS_TOKEN`) is also required, and the route is off entirely when none is configured.
 */
export default function metricsRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const { config, db } = ctx;

  router.get("/metrics", async (req, res) => {
    if (config.metricsToken) {
      const given = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
      if (!safeEqual(given, config.metricsToken)) return void res.status(401).type("text/plain").send("unauthorized\n");
    } else if (config.production) {
      return void res.status(404).type("text/plain").send("not found\n");
    }

    metrics.buildInfo.set(1, { chain: config.chainName, chain_id: String(config.network.id) });

    // Probe the RPC so the latency series is fresh even when traffic is quiet.
    if (ctx.chain) {
      const t0 = performance.now();
      try {
        await ctx.chain.provider.getBlockNumber();
        metrics.rpcLatency.observe(performance.now() - t0);
        metrics.rpcUp.set(1);
      } catch {
        metrics.rpcUp.set(0);
      }
    }

    metrics.indexerLagBlocks.clear();
    metrics.indexerLastUpdateSeconds.clear();
    try {
      const lag = await indexerLag(db, config.chainName);
      if (lag) {
        if (lag.lagBlocks !== null) metrics.indexerLagBlocks.set(lag.lagBlocks);
        metrics.indexerLastUpdateSeconds.set((Date.now() - lag.updatedAt.getTime()) / 1000);
      }
    } catch {
      /* leave the series absent — the "indexer stalled" alert keys off absence */
    }

    if (ctx.relayer) {
      try {
        const s = await ctx.relayer.status();
        metrics.relayerBalance.set(Number(s.balance), { address: s.address });
        metrics.relayerSpentToday.set(Number(s.spentToday));
      } catch {
        /* balance unknown this scrape */
      }
    }

    res.type("text/plain; version=0.0.4; charset=utf-8").send(metrics.render());
  });

  return router;
}
