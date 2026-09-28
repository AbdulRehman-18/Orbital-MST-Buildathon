import { createServer } from "node:http";
import { Redis } from "ioredis";
import { createApp } from "./app";
import { startAnomalyEngine } from "./anomaly/engine";
import { createOtpSender } from "./auth/otp";
import { ChainRoleReader, type RoleReader } from "./auth/roles";
import { TokenService } from "./auth/tokens";
import { loadConfig } from "./config";
import type { AppContext } from "./context";
import { demoAccount, demoWallet } from "./demo/accounts";
import { createIpfs, devIpfsDir } from "./ipfs/ipfs";
import { logger } from "./lib/logger";
import { BullJobQueue, MemoryJobQueue } from "./relayer/queue";
import { createWallet, Relayer } from "./relayer/relayer";
import { MemoryNonceLock, RedisNonceLock, TxSender } from "./relayer/sender";
import { connectChain, connectDb, type Chain } from "./runtime";
import { createSocketServer } from "./socket/server";

const config = loadConfig();
const { pool, db } = connectDb(config);

// Startup guard: wrong chain id or a missing deployment manifest refuses to boot (plan §9.2).
// Demo mode may run without a chain so the UI can be shown offline.
let chain: Chain | undefined;
try {
  chain = await connectChain(config);
} catch (err) {
  if (!config.demoMode) throw err;
  logger.warn({ err: (err as Error).message }, "DEMO MODE: running without a chain connection");
}

const redis = config.redisUrl ? new Redis(config.redisUrl, { maxRetriesPerRequest: null }) : undefined;
if (!redis) logger.warn("REDIS_URL not set — rate limits and the relayer queue are in-process only");

const roles: RoleReader = chain
  ? new ChainRoleReader(chain.contracts.contract("NammaSevaAccess", chain.provider))
  : { rolesOf: async () => [] };

// Demo mode without an explicit key uses the demo cast's relayer burner (index 5).
const relayerKey =
  config.relayer.privateKey ??
  (config.demoMnemonic ? demoWallet(config.demoMnemonic, demoAccount("relayer").index).privateKey : undefined);

let relayer: Relayer | undefined;
if (chain && relayerKey) {
  const wallet = createWallet(relayerKey, chain.provider);
  const lock = redis ? new RedisNonceLock(redis, `ns:relayer:${config.chainName}:${wallet.address}`) : new MemoryNonceLock();
  const sender = new TxSender(wallet, lock, logger, config.relayer.gasBumpAfterMs);
  relayer = new Relayer({
    db,
    provider: chain.provider,
    contracts: chain.contracts,
    chainId: config.network.id,
    rootPrivateKey: relayerKey,
    sender,
    logger,
    minBalance: config.relayer.minBalance,
    dailyCap: config.relayer.dailyCap,
    citizenDailyLimit: config.relayer.citizenDailyLimit,
  });
  relayer.queue = redis
    ? new BullJobQueue(redis, relayer.process, relayer.onFailed, logger)
    : new MemoryJobQueue(relayer.process, relayer.onFailed, logger);
  const access = chain.contracts.contract("NammaSevaAccess", chain.provider);
  const isRelayer = (await access.hasRole(await access.RELAYER_ROLE(), wallet.address)) as boolean;
  if (!isRelayer) logger.error({ relayer: wallet.address }, "Relayer wallet lacks RELAYER_ROLE — grievances will fail");
  relayer.startMonitor();
} else if (chain) {
  logger.warn("RELAYER_PRIVATE_KEY not set — citizen grievances/upvotes are disabled");
}

const ctx: AppContext = {
  config,
  db,
  logger,
  tokens: new TokenService(config.auth.jwtSecret, config.production),
  otp: createOtpSender(config.auth.otp, logger),
  roles,
  ipfs: createIpfs(
    {
      pinataJwt: config.ipfs.pinataJwt,
      gateway: config.ipfs.gateway,
      backupUrl: config.ipfs.backupUrl,
      backupToken: config.ipfs.backupToken,
      production: config.production,
      apiBaseUrl: config.publicBaseUrl,
      localDir: devIpfsDir(),
    },
    logger,
  ),
  chain,
  relayer,
  redis,
};

const stopAnomalyEngine = startAnomalyEngine(db, logger);
const app = createApp(ctx);
const server = createServer(app);
const sockets = createSocketServer(server, config.corsOrigins, logger);
const stopListening = await sockets.listen(pool);

server.listen(config.port, "0.0.0.0", () => {
  logger.info(
    {
      port: config.port,
      chain: config.network.name,
      chainId: config.network.id,
      demoMode: config.demoMode,
      relayer: relayer?.address ?? null,
      ipfs: ctx.ipfs.kind,
    },
    "Namma Seva API listening",
  );
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  server.close();
  await sockets.io.close();
  stopListening();
  stopAnomalyEngine();
  await relayer?.close();
  await redis?.quit();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
