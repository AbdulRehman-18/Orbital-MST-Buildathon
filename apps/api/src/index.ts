import { createServer } from "node:http";
import { waitUntil } from "@vercel/functions";
import { Redis } from "ioredis";
import { createApp } from "./app";
import { startAnomalyEngine } from "./anomaly/engine";
import { createOtpSender } from "./auth/otp";
import { ChainRoleReader, type RoleReader } from "./auth/roles";
import { TokenService } from "./auth/tokens";
import { loadConfig } from "./config";
import type { AppContext } from "./context";
import { demoAccount, demoWallet } from "./demo/accounts";
import { createInlineIndexer } from "./indexer/inline";
import { createIpfs, devIpfsDir } from "./ipfs/ipfs";
import { logger } from "./lib/logger";
import { BullJobQueue, MemoryJobQueue } from "./relayer/queue";
import { HmacCitizenKeys, KmsCitizenKeys } from "./relayer/forwarder";
import { KmsSigner } from "./relayer/kms";
import { createAwsKmsClient } from "./relayer/kms-aws";
import { createWallet, Relayer } from "./relayer/relayer";
import { MemoryNonceLock, RedisNonceLock, TxSender } from "./relayer/sender";
import { connectChain, connectDb, type Chain } from "./runtime";
import { startRetentionJob } from "./retention";
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

// Key custody: KMS on mainnet/staging (the key never enters this process); a hot key for dev/testnet.
let relayer: Relayer | undefined;
const kmsClient = config.relayer.kms
  ? await createAwsKmsClient({ region: config.relayer.kms.region, endpoint: config.relayer.kms.endpoint })
  : undefined;
if (chain && (kmsClient || relayerKey)) {
  const signer = kmsClient
    ? await KmsSigner.create(kmsClient, config.relayer.kms!.keyId, chain.provider)
    : createWallet(relayerKey!, chain.provider);
  const citizenKeys = kmsClient
    ? new KmsCitizenKeys(kmsClient, config.relayer.kms!.hmacKeyId)
    : new HmacCitizenKeys(relayerKey!);
  const lock = redis ? new RedisNonceLock(redis, `ns:relayer:${config.chainName}:${signer.address}`) : new MemoryNonceLock();
  const sender = new TxSender(signer as typeof signer & { address: string }, lock, logger, config.relayer.gasBumpAfterMs);
  relayer = new Relayer({
    db,
    provider: chain.provider,
    contracts: chain.contracts,
    chainId: config.network.id,
    citizenKeys,
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
  const isRelayer = (await access.hasRole(await access.RELAYER_ROLE(), signer.address)) as boolean;
  if (!isRelayer) logger.error({ relayer: signer.address }, "Relayer wallet lacks RELAYER_ROLE — grievances will fail");
  relayer.startMonitor();
} else if (chain) {
  logger.warn("No relayer key (RELAYER_KMS_KEY_ID / RELAYER_PRIVATE_KEY) — citizen grievances/upvotes are disabled");
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
const stopRetention = startRetentionJob(db, logger, config.auditLogRetentionDays);
const app = createApp(ctx);
// Vercel runs no separate indexer process: requests drive background ticks instead.
const pokeIndexer = process.env.VERCEL && chain ? createInlineIndexer(config, pool, db, chain, logger) : undefined;
const server = createServer((req, res) => {
  const tick = pokeIndexer?.();
  if (tick) waitUntil(tick);
  app(req, res);
});
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
  stopRetention();
  await relayer?.close();
  await redis?.quit();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
