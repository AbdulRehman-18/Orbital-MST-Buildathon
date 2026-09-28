import { existsSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIRMATIONS, getNetwork, isNetworkName, type Network, type NetworkName } from "@namma-seva/chain";
import { z } from "zod";
import { WORKSPACE_ROOT } from "./lib/paths";

// Load the repo-root .env in development. Production injects env vars directly.
const rootEnv = WORKSPACE_ROOT && path.join(WORKSPACE_ROOT, ".env");
if (rootEnv && existsSync(rootEnv) && process.env.NODE_ENV !== "test") process.loadEnvFile(rootEnv);

const list = (s: string | undefined) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const optional = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

const Env = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  NS_DEMO_MODE: z.string().optional().transform((v) => v === "true"),
  /** Demo burner accounts (demo mode only). Defaults to Hardhat's public test mnemonic on NS_CHAIN=local. */
  NS_DEMO_MNEMONIC: optional,
  PUBLIC_BASE_URL: z.string().default("http://localhost:5173"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  NS_CHAIN: z.string().default("mstTestnet").refine(isNetworkName, "NS_CHAIN must be local | mstTestnet | mstMainnet"),
  MST_RPC_URLS: optional,
  CONFIRMATIONS: z.coerce.number().int().min(0).default(DEFAULT_CONFIRMATIONS),
  INDEXER_BATCH_SIZE: z.coerce.number().int().positive().default(2000),
  INDEXER_POLL_MS: z.coerce.number().int().positive().default(3000),
  REORG_DEPTH: z.coerce.number().int().positive().default(64),
  /** Override the deployment manifest path (tests, forks). */
  NS_DEPLOYMENT_FILE: optional,

  RELAYER_PRIVATE_KEY: optional,
  RELAYER_KMS_KEY_ID: optional,
  RELAYER_MIN_BALANCE: z.string().default("10"),
  RELAYER_DAILY_CAP: z.string().default("50"),
  RELAYER_GAS_BUMP_AFTER_MS: z.coerce.number().int().positive().default(60_000),
  CITIZEN_DAILY_TX_LIMIT: z.coerce.number().int().positive().default(10),

  DATABASE_URL: optional,
  REDIS_URL: optional,

  JWT_SECRET: optional,
  SIWE_DOMAIN: z.string().default("localhost:5173"),
  OTP_PROVIDER: z.enum(["msg91", "twilio", "console"]).default("console"),
  OTP_API_KEY: optional,
  OTP_TEMPLATE_ID: optional,
  OTP_SENDER: optional,
  TWILIO_ACCOUNT_SID: optional,
  PHONE_HASH_PEPPER: optional,

  PINATA_JWT: optional,
  PINATA_GATEWAY: optional,
});

export type Config = ReturnType<typeof loadConfig>;

/** Hardhat's well-known development mnemonic — public, worthless outside a local chain. */
export const HARDHAT_TEST_MNEMONIC = "test test test test test test test test test test test junk";

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = Env.parse(env);
  const production = e.NODE_ENV === "production";

  // Per-role keys are gone (plan §9.2): officials, auditors and contractors sign in their wallets.
  const legacyKeys = Object.keys(env).filter((k) => k.startsWith("PRIVKEY_"));
  if (legacyKeys.length) throw new Error(`Remove legacy per-role keys from the environment: ${legacyKeys.join(", ")}`);
  if (env.DEPLOYER_PRIVATE_KEY && production) {
    throw new Error("DEPLOYER_PRIVATE_KEY must not be present in the API environment.");
  }
  if (e.RELAYER_KMS_KEY_ID && !e.RELAYER_PRIVATE_KEY) {
    throw new Error("RELAYER_KMS_KEY_ID is reserved for the KMS signer (Phase 6); set RELAYER_PRIVATE_KEY for now.");
  }

  const chainName = e.NS_CHAIN as NetworkName;
  const network: Network = getNetwork(chainName);
  const rpcUrls = e.MST_RPC_URLS ? list(e.MST_RPC_URLS) : [...network.rpcUrls.default.http];

  if (production) {
    for (const key of ["DATABASE_URL", "REDIS_URL", "JWT_SECRET", "PHONE_HASH_PEPPER"] as const) {
      if (!e[key]) throw new Error(`${key} is required in production.`);
    }
    if (e.NS_DEMO_MODE) throw new Error("NS_DEMO_MODE must be off in production.");
    if (e.OTP_PROVIDER === "console") throw new Error("OTP_PROVIDER=console is for development only.");
  }
  if (e.NS_DEMO_MODE && chainName === "mstMainnet") throw new Error("NS_DEMO_MODE is not allowed on MST mainnet.");
  const demoMnemonic = e.NS_DEMO_MODE
    ? (e.NS_DEMO_MNEMONIC ?? (chainName === "local" ? HARDHAT_TEST_MNEMONIC : undefined))
    : undefined;
  if (e.JWT_SECRET && e.JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");

  return {
    env: e.NODE_ENV,
    production,
    port: e.PORT,
    demoMode: e.NS_DEMO_MODE,
    /** Burner-account mnemonic handed to the demo login screen; never set outside demo mode. */
    demoMnemonic,
    publicBaseUrl: e.PUBLIC_BASE_URL,
    corsOrigins: list(e.CORS_ORIGINS),
    trustProxy: e.TRUST_PROXY,
    chainName,
    network,
    chain: {
      rpcUrls,
      confirmations: e.CONFIRMATIONS,
      batchSize: e.INDEXER_BATCH_SIZE,
      pollMs: e.INDEXER_POLL_MS,
      reorgDepth: e.REORG_DEPTH,
      deploymentFile: e.NS_DEPLOYMENT_FILE,
    },
    relayer: {
      privateKey: e.RELAYER_PRIVATE_KEY,
      minBalance: e.RELAYER_MIN_BALANCE,
      dailyCap: e.RELAYER_DAILY_CAP,
      gasBumpAfterMs: e.RELAYER_GAS_BUMP_AFTER_MS,
      citizenDailyLimit: e.CITIZEN_DAILY_TX_LIMIT,
    },
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    auth: {
      // Dev fallback keeps `pnpm dev` working without secrets; production requires JWT_SECRET above.
      jwtSecret: e.JWT_SECRET ?? "dev-only-insecure-jwt-secret-change-me!!",
      siweDomain: e.SIWE_DOMAIN,
      phonePepper: e.PHONE_HASH_PEPPER ?? "dev-only-pepper",
      otp: {
        provider: e.OTP_PROVIDER,
        apiKey: e.OTP_API_KEY,
        templateId: e.OTP_TEMPLATE_ID,
        sender: e.OTP_SENDER,
        twilioAccountSid: e.TWILIO_ACCOUNT_SID,
      },
    },
    ipfs: { pinataJwt: e.PINATA_JWT, gateway: e.PINATA_GATEWAY },
  };
}
