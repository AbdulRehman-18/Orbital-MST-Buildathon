// Indexer process — separate from the API, singleton per network via a Postgres advisory lock.
//
//   pnpm --filter @namma-seva/api indexer                         run the loop
//   pnpm --filter @namma-seva/api indexer:rebuild [--from <block>]  truncate + replay, print checksum
//   pnpm --filter @namma-seva/api indexer:checksum                  print the read-model checksum
import { parseArgs } from "node:util";
import { loadConfig } from "../config";
import { logger } from "../lib/logger";
import { connectChain, connectDb } from "../runtime";
import { Indexer, projectionChecksum } from "./indexer";
import { PgNotifySink } from "./notify";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { from: { type: "string" } },
});
const command = positionals[0] ?? "run";

const config = loadConfig();
const { pool, db } = connectDb(config, 4);

if (command === "checksum") {
  const sum = await projectionChecksum(db);
  console.log(JSON.stringify(sum, null, 2));
  await pool.end();
  process.exit(0);
}

const chain = await connectChain(config);

// Singleton: hold a session-level advisory lock on a dedicated connection for the process lifetime.
const lockClient = await pool.connect();
const lockKey = `namma-seva-indexer:${config.chainName}`;
const { rows } = await lockClient.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [
  lockKey,
]);
if (!rows[0].locked) {
  logger.error({ lockKey }, "Another indexer holds the lock for this network — exiting");
  lockClient.release();
  await pool.end();
  process.exit(1);
}

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

if (command === "rebuild") {
  const from = values.from ? Number(values.from) : chain.contracts.startBlock;
  if (!Number.isInteger(from) || from < 0) throw new Error(`Invalid --from "${values.from}"`);
  logger.info({ from }, "Rebuilding read model");
  const started = Date.now();
  await indexer.resetForRebuild(from);
  const result = await indexer.catchUp();
  const sum = await projectionChecksum(db);
  logger.info({ ...result, ms: Date.now() - started, checksum: sum.total }, "Rebuild complete");
  console.log(JSON.stringify(sum, null, 2));
  await shutdown(0);
} else if (command === "run") {
  logger.info(
    { chain: config.chainName, startBlock: chain.contracts.startBlock, confirmations: config.chain.confirmations },
    "Indexer started",
  );
  let stopping = false;
  let timer: NodeJS.Timeout | undefined;
  const loop = async () => {
    try {
      const r = await indexer.tick();
      if (r.events || r.reorg) logger.info(r, "Tick");
    } catch (err) {
      logger.error({ err }, "Indexer tick failed");
    }
    if (!stopping) timer = setTimeout(loop, config.chain.pollMs);
  };
  void loop();
  const stop = (signal: string) => {
    logger.info({ signal }, "Indexer stopping");
    stopping = true;
    clearTimeout(timer);
    void shutdown(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
} else {
  console.error(`Unknown command "${command}". Use run | rebuild [--from N] | checksum.`);
  await shutdown(1);
}

async function shutdown(code: number) {
  lockClient.release();
  await pool.end();
  process.exit(code);
}
