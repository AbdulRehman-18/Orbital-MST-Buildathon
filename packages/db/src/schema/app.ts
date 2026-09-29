// Off-chain-only data (plan §5.1): identities, sessions, uploads, relayer bookkeeping, analytics.
// None of these are touched by `indexer:rebuild`.
import { boolean, index, integer, jsonb, pgTable, real, smallint, text, uuid } from "drizzle-orm/pg-core";
import { address, amount, blockNo, bytes32, tsz } from "./_types";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAddress: address("wallet_address").unique(),
  phoneHash: bytes32("phone_hash").unique(),
  /** Last role observed on-chain at sign-in (the chain stays authoritative). */
  role: text("role").notNull(),
  wardId: integer("ward_id"),
  deptId: smallint("dept_id"),
  displayName: text("display_name"),
  preferredLang: text("preferred_lang").notNull().default("en"),
  createdAt: tsz("created_at").notNull().defaultNow(),
  lastLoginAt: tsz("last_login_at"),
});

/** Single-use SIWE nonces. */
export const authNonces = pgTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: tsz("expires_at").notNull(),
  usedAt: tsz("used_at"),
});

/** Refresh sessions behind the httpOnly `ns_session` cookie; only a hash of the token is kept. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    tokenHash: bytes32("token_hash").notNull().unique(),
    expiresAt: tsz("expires_at").notNull(),
    revokedAt: tsz("revoked_at"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

/**
 * DPDP Act 2023 consent records (plan §17): one row per notice a user accepted. Holds no phone
 * number — only the user id, so erasing the user erases the consent trail with it.
 */
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    purpose: text("purpose").notNull().default("phone-verification"),
    /** Version of the Privacy Notice shown (date string, e.g. "2026-10-01"). */
    version: text("version").notNull(),
    lang: text("lang").notNull().default("en"),
    acceptedAt: tsz("accepted_at").notNull().defaultNow(),
    withdrawnAt: tsz("withdrawn_at"),
  },
  (t) => [index("consents_user_idx").on(t.userId)],
);

export const otpSessions = pgTable("otp_sessions", {
  phoneHash: bytes32("phone_hash").primaryKey(),
  codeHash: bytes32("code_hash").notNull(),
  expiresAt: tsz("expires_at").notNull(),
  attempts: smallint("attempts").notNull().default(0),
  sentCount: smallint("sent_count").notNull().default(1),
  windowStart: tsz("window_start").notNull().defaultNow(),
});

/** Metadata JSON pinned through the API, so the indexer can fill titles without an IPFS fetch. */
export const pinnedMetadata = pgTable("pinned_metadata", {
  cid: text("cid").primaryKey(),
  metaHash: bytes32("meta_hash").notNull(),
  kind: text("kind").notNull(),
  body: jsonb("body").notNull().$type<Record<string, unknown>>(),
  pinnedBy: text("pinned_by"),
  createdAt: tsz("created_at").notNull().defaultNow(),
});

export const proofMedia = pgTable(
  "proof_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    milestoneId: blockNo("milestone_id").notNull(),
    cid: text("cid").notNull(),
    sha256: bytes32("sha256").notNull(),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    exifLat: real("exif_lat"),
    exifLng: real("exif_lng"),
    exifTime: tsz("exif_time"),
    gpsDistanceM: real("gps_distance_m"),
    flagged: boolean("flagged").notNull().default(false),
    /** 64-bit perceptual hash (16 hex chars) of the image, for cross-milestone reuse detection. */
    phash: text("phash"),
    thumbCid: text("thumb_cid"),
    /** Outcome of each integrity check, keyed by check name. */
    checks: jsonb("checks").$type<Record<string, { ok: boolean; detail?: string }>>(),
    uploadedBy: address("uploaded_by"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [index("proof_media_milestone_idx").on(t.milestoneId)],
);

export const anomalies = pgTable(
  "anomalies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: blockNo("project_id").notNull(),
    rule: text("rule").notNull(),
    severity: text("severity").notNull(),
    details: jsonb("details").notNull().$type<Record<string, unknown>>(),
    detectedAt: tsz("detected_at").notNull().defaultNow(),
    resolvedAt: tsz("resolved_at"),
  },
  (t) => [index("anomalies_project_idx").on(t.projectId)],
);

/** Relayer transactions (grievances / upvotes / signer registration), for the spend cap and audit. */
export const relayerTxs = pgTable(
  "relayer_txs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: text("job_id").notNull(),
    /** "grievance" | "upvote" (the job) or "register-signer" (its setup tx). */
    kind: text("kind").notNull(),
    userId: text("user_id"),
    citizenHash: bytes32("citizen_hash"),
    /** Content CID for grievances. */
    cid: text("cid"),
    /** queued → registering → submitted → confirmed | failed */
    nonce: integer("nonce"),
    txHash: bytes32("tx_hash"),
    /** All hashes broadcast for this nonce (gas bumps replace earlier ones). */
    replacedHashes: jsonb("replaced_hashes").notNull().$type<string[]>().default([]),
    gasPrice: amount("gas_price"),
    feeWei: amount("fee_wei"),
    status: text("status").notNull(),
    error: text("error"),
    createdAt: tsz("created_at").notNull().defaultNow(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("relayer_txs_created_idx").on(t.createdAt),
    index("relayer_txs_citizen_idx").on(t.citizenHash),
    index("relayer_txs_job_idx").on(t.jobId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    requestId: text("request_id"),
    ipHash: bytes32("ip_hash"),
    at: tsz("at").notNull().defaultNow(),
  },
  (t) => [index("audit_log_at_idx").on(t.at)],
);

/**
 * Public display names for wallets (contractor firms, offices), set by an admin. Shown instead of
 * raw addresses everywhere in the UI; the address stays the on-chain identity.
 */
export const accountProfiles = pgTable("account_profiles", {
  address: address("address").primaryKey(),
  name: text("name").notNull(),
  title: text("title"),
  updatedBy: address("updated_by"),
  updatedAt: tsz("updated_at").notNull().defaultNow(),
});
