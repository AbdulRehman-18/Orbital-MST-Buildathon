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
  /** AWS KMS ECC_SECG_P256K1 key that signs relayer transactions (replaces RELAYER_PRIVATE_KEY). */
  RELAYER_KMS_KEY_ID: optional,
  /** AWS KMS HMAC_256 key that derives per-citizen signing keys (replaces the private-key HMAC root). */
  RELAYER_KMS_HMAC_KEY_ID: optional,
  AWS_REGION: optional,
  /** Override the KMS endpoint (LocalStack, VPC endpoint). */
  RELAYER_KMS_ENDPOINT: optional,
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
  IPFS_BACKUP_PIN_URL: optional,
  IPFS_BACKUP_PIN_TOKEN: optional,
  /** Strict proof capture: reject-flag anything not taken with the in-app camera. */
  /** Requests per minute per client IP: API 300, auth 30 — ten times that in demo mode, where a presenter (or the e2e suite) tries many roles from one address. */
  RATE_LIMIT_API_PER_MIN: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().optional(),
  /** Days to keep audit/security logs. CERT-In requires ≥ 180; the Privacy Notice states 180. */
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().min(180, "CERT-In requires security logs to be kept for at least 180 days").default(180),
  /** Bearer token for GET /metrics. Required in production (the route is disabled without it). */
  METRICS_TOKEN: optional,
  /** Version of the Privacy Notice; must match `consent.version` in @namma-seva/i18n. */
  CONSENT_VERSION: z.string().default("2026-10-01"),
  /** Published on the Transparency page and in the Privacy Notice (DPDP Act grievance officer). */
  GRIEVANCE_OFFICER_NAME: optional,
  GRIEVANCE_OFFICER_EMAIL: optional,
  GRIEVANCE_OFFICER_PHONE: optional,
  AUDIT_REPORT_URL: optional,
  /** Name of the pilot ward, shown on the Transparency page while running as a pilot. */
  PILOT_NAME: optional,
  PROOF_STRICT: z.string().optional().transform((v) => v === "true"),
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
  // A copied local .env on Vercel points the API and build-time migrations at the build machine itself.
  if (env.VERCEL) {
    for (const key of ["DATABASE_URL", "REDIS_URL"] as const) {
      const host = e[key] && URL.canParse(e[key]) ? new URL(e[key]).hostname : "";
      if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
        throw new Error(`${key} points at ${host}; on Vercel it must be a hosted service (e.g. Neon Postgres, Upstash Redis).`);
      }
    }
  }
  if (e.RELAYER_KMS_KEY_ID && e.RELAYER_PRIVATE_KEY) {
    throw new Error("Set either RELAYER_KMS_KEY_ID or RELAYER_PRIVATE_KEY, not both.");
  }
  if (Boolean(e.RELAYER_KMS_KEY_ID) !== Boolean(e.RELAYER_KMS_HMAC_KEY_ID)) {
    throw new Error("RELAYER_KMS_KEY_ID and RELAYER_KMS_HMAC_KEY_ID must be set together.");
  }
  if (e.NS_CHAIN === "mstMainnet" && e.RELAYER_PRIVATE_KEY) {
    throw new Error("Mainnet relayer keys must live in KMS (plan §16.2): set RELAYER_KMS_KEY_ID, not RELAYER_PRIVATE_KEY.");
  }

  const chainName = e.NS_CHAIN as NetworkName;
  const network: Network = getNetwork(chainName);
  const rpcUrls = e.MST_RPC_URLS ? list(e.MST_RPC_URLS) : [...network.rpcUrls.default.http];

  if (production && list(e.SIWE_DOMAIN).some((d) => d.includes("*"))) {
    throw new Error("SIWE_DOMAIN wildcards are for development tunnels only; list exact domains in production.");
  }
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
      kms: e.RELAYER_KMS_KEY_ID
        ? { keyId: e.RELAYER_KMS_KEY_ID, hmacKeyId: e.RELAYER_KMS_HMAC_KEY_ID!, region: e.AWS_REGION, endpoint: e.RELAYER_KMS_ENDPOINT }
        : undefined,
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
      /** Comma-separated in SIWE_DOMAIN; "*.host" wildcards are refused in production. */
      siweDomains: list(e.SIWE_DOMAIN),
      phonePepper: e.PHONE_HASH_PEPPER ?? "dev-only-pepper",
      otp: {
        provider: e.OTP_PROVIDER,
        apiKey: e.OTP_API_KEY,
        templateId: e.OTP_TEMPLATE_ID,
        sender: e.OTP_SENDER,
        twilioAccountSid: e.TWILIO_ACCOUNT_SID,
      },
    },
    ipfs: { pinataJwt: e.PINATA_JWT, gateway: e.PINATA_GATEWAY, backupUrl: e.IPFS_BACKUP_PIN_URL, backupToken: e.IPFS_BACKUP_PIN_TOKEN },
    proofStrict: e.PROOF_STRICT,
    rateLimits: {
      apiPerMin: e.RATE_LIMIT_API_PER_MIN ?? (e.NS_DEMO_MODE ? 3000 : 300),
      authPerMin: e.RATE_LIMIT_AUTH_PER_MIN ?? (e.NS_DEMO_MODE ? 300 : 30),
    },
    auditLogRetentionDays: e.AUDIT_LOG_RETENTION_DAYS,
    metricsToken: e.METRICS_TOKEN,
    consentVersion: e.CONSENT_VERSION,
    disclosure: {
      grievanceOfficer: e.GRIEVANCE_OFFICER_NAME && e.GRIEVANCE_OFFICER_EMAIL
        ? { name: e.GRIEVANCE_OFFICER_NAME, email: e.GRIEVANCE_OFFICER_EMAIL, phone: e.GRIEVANCE_OFFICER_PHONE ?? null }
        : null,
      auditReportUrl: e.AUDIT_REPORT_URL ?? null,
      pilot: e.PILOT_NAME ?? null,
    },
  };
}
