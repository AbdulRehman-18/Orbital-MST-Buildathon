// Serverless hosts (Vercel) have no long-lived indexer process, so API traffic drives it instead:
// each request may start one background tick, at most every INDEXER_POLL_MS, under the same
// advisory lock as src/indexer/main.ts so a standalone indexer and every instance stay a singleton.
import type { Db } from "@namma-seva/db";
import type pg from "pg";
import type { Logger } from "pino";
import type { Config } from "../config";
import type { Chain } from "../runtime";
import { Indexer } from "./indexer";
import { PgNotifySink } from "./notify";

export function createInlineIndexer(config: Config, pool: pg.Pool, db: Db, chain: Chain, logger: Logger) {
  const indexer = new Indexer({
    db,
    provider: chain.provider,
    contracts: chain.contracts,
    network: config.chainName,
    confirmations: config.chain.confirmations,
    batchSize: config.chain.batchSize,
    reorgDepth: config.chain.reorgDepth,
    logger,
    sink: new PgNotifySink(db),
  });
  const lockKey = `namma-seva-indexer:${config.chainName}`;
  let running: Promise<void> | undefined;
  let lastRun = 0;

  async function tick() {
    const client = await pool.connect();
    try {
      const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [
        lockKey,
      ]);
      if (!rows[0].locked) return;
      try {
        const r = await indexer.tick();
        if (r.events || r.reorg) logger.info(r, "Inline indexer tick");
      } finally {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
      }
    } catch (err) {
      logger.error({ err }, "Inline indexer tick failed");
    } finally {
      client.release();
    }
  }

  /** Starts a tick unless one is running or ran recently; returns it so the host can keep the instance alive. */
  return function poke(): Promise<void> | undefined {
    if (running || Date.now() - lastRun < config.chain.pollMs) return undefined;
    lastRun = Date.now();
    running = tick().finally(() => {
      running = undefined;
    });
    return running;
  };
}
