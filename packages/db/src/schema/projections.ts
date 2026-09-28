// Read-model tables written ONLY by the indexer (apps/api/src/indexer). Every one of them is
// truncated and replayed by `indexer:rebuild`, so nothing here may hold off-chain-only data.
import { boolean, index, integer, pgTable, primaryKey, smallint, text } from "drizzle-orm/pg-core";
import { address, amount, blockNo, bytes32, e6, tsz } from "./_types";

export const projects = pgTable(
  "projects",
  {
    id: blockNo("id").primaryKey(), // on-chain projectId
    metaCid: text("meta_cid").notNull(),
    metaHash: bytes32("meta_hash").notNull(),
    /** Filled from `pinned_metadata` when the CID was pinned through this API; null otherwise. */
    title: text("title"),
    description: text("description"),
    category: text("category").notNull(),
    wardId: integer("ward_id").notNull(),
    deptId: smallint("dept_id").notNull(),
    latE6: e6("lat_e6").notNull(),
    lngE6: e6("lng_e6").notNull(),
    budget: amount("budget").notNull(),
    spent: amount("spent").notNull().default("0"),
    funded: amount("funded").notNull().default("0"),
    status: text("status").notNull(),
    officialAddr: address("official_addr").notNull(),
    contractorAddr: address("contractor_addr"),
    approvalThreshold: smallint("approval_threshold").notNull(),
    approvalCount: smallint("approval_count").notNull().default(0),
    milestoneCount: integer("milestone_count").notNull().default(0),
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    startDate: tsz("start_date").notNull(),
    endDate: tsz("end_date").notNull(),
    createdAt: tsz("created_at").notNull(),
    createdTx: bytes32("created_tx").notNull(),
    createdBlock: blockNo("created_block").notNull(),
    updatedBlock: blockNo("updated_block").notNull(),
  },
  (t) => [index("projects_ward_idx").on(t.wardId), index("projects_status_idx").on(t.status)],
);

export const projectApprovals = pgTable(
  "project_approvals",
  {
    projectId: blockNo("project_id").notNull(),
    auditorAddr: address("auditor_addr").notNull(),
    txHash: bytes32("tx_hash").notNull(),
    block: blockNo("block").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.auditorAddr] })],
);

export const milestones = pgTable(
  "milestones",
  {
    id: blockNo("id").primaryKey(), // on-chain milestoneId
    projectId: blockNo("project_id").notNull(),
    title: text("title"),
    description: text("description"),
    metaCid: text("meta_cid").notNull(),
    metaHash: bytes32("meta_hash").notNull(),
    amount: amount("amount").notNull(),
    status: text("status").notNull(),
    round: integer("round").notNull().default(0),
    proofCid: text("proof_cid"),
    proofHash: bytes32("proof_hash"),
    proofLatE6: e6("proof_lat_e6"),
    proofLngE6: e6("proof_lng_e6"),
    submittedBy: address("submitted_by"),
    submittedAt: tsz("submitted_at"),
    approvalCount: smallint("approval_count").notNull().default(0),
    rejectionReasonHash: bytes32("rejection_reason_hash"),
    paidTx: bytes32("paid_tx"),
    paidAt: tsz("paid_at"),
    createdAt: tsz("created_at").notNull(),
    createdTx: bytes32("created_tx").notNull(),
    updatedBlock: blockNo("updated_block").notNull(),
  },
  (t) => [index("milestones_project_idx").on(t.projectId), index("milestones_status_idx").on(t.status)],
);

/** Approvals are per review round: a rejection bumps the round and clears the count (M-2). */
export const milestoneApprovals = pgTable(
  "milestone_approvals",
  {
    milestoneId: blockNo("milestone_id").notNull(),
    round: integer("round").notNull(),
    auditorAddr: address("auditor_addr").notNull(),
    txHash: bytes32("tx_hash").notNull(),
    block: blockNo("block").notNull(),
  },
  (t) => [primaryKey({ columns: [t.milestoneId, t.round, t.auditorAddr] })],
);

export const grievances = pgTable(
  "grievances",
  {
    id: blockNo("id").primaryKey(), // on-chain grievanceId
    projectId: blockNo("project_id").notNull(),
    citizenHash: bytes32("citizen_hash").notNull(),
    category: text("category").notNull(),
    cid: text("cid").notNull(),
    status: text("status").notNull(),
    upvotes: integer("upvotes").notNull().default(0),
    action: text("action").notNull().default("NONE"),
    responseCid: text("response_cid"),
    respondedBy: address("responded_by"),
    escalatedAt: tsz("escalated_at"),
    respondBy: tsz("respond_by"),
    respondedAt: tsz("responded_at"),
    createdAt: tsz("created_at").notNull(),
    createdTx: bytes32("created_tx").notNull(),
    updatedBlock: blockNo("updated_block").notNull(),
  },
  (t) => [index("grievances_project_idx").on(t.projectId)],
);

export const grievanceUpvotes = pgTable(
  "grievance_upvotes",
  {
    grievanceId: blockNo("grievance_id").notNull(),
    citizenHash: bytes32("citizen_hash").notNull(),
    txHash: bytes32("tx_hash").notNull(),
    block: blockNo("block").notNull(),
  },
  (t) => [primaryKey({ columns: [t.grievanceId, t.citizenHash] })],
);

export const tenders = pgTable(
  "tenders",
  {
    id: blockNo("id").primaryKey(), // on-chain tenderId
    projectId: blockNo("project_id").notNull(),
    officialAddr: address("official_addr").notNull(),
    metaCid: text("meta_cid").notNull(),
    status: text("status").notNull(),
    commitDeadline: tsz("commit_deadline").notNull(),
    revealDeadline: tsz("reveal_deadline").notNull(),
    bidCount: integer("bid_count").notNull().default(0),
    revealedCount: integer("revealed_count").notNull().default(0),
    awardedTo: address("awarded_to"),
    winningBid: amount("winning_bid"),
    cancelReasonHash: bytes32("cancel_reason_hash"),
    createdTx: bytes32("created_tx").notNull(),
    updatedBlock: blockNo("updated_block").notNull(),
  },
  (t) => [index("tenders_project_idx").on(t.projectId)],
);

export const bids = pgTable(
  "bids",
  {
    tenderId: blockNo("tender_id").notNull(),
    bidderAddr: address("bidder_addr").notNull(),
    commitHash: bytes32("commit_hash").notNull(),
    revealedAmount: amount("revealed_amount"),
    revealedAt: tsz("revealed_at"),
    committedTx: bytes32("committed_tx").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenderId, t.bidderAddr] })],
);

/** Role membership from `NammaSevaAccess` RoleGranted / RoleRevoked. */
export const accountRoles = pgTable(
  "account_roles",
  {
    address: address("address").notNull(),
    role: text("role").notNull(),
    grantedBlock: blockNo("granted_block").notNull(),
  },
  (t) => [primaryKey({ columns: [t.address, t.role] })],
);

/** Ward scoping from `NammaSevaAccess.WardAccessSet` (ward 4294967295 = all wards). */
export const wardAccess = pgTable(
  "ward_access",
  {
    address: address("address").notNull(),
    wardId: blockNo("ward_id").notNull(),
    updatedBlock: blockNo("updated_block").notNull(),
  },
  (t) => [primaryKey({ columns: [t.address, t.wardId] })],
);

/** Citizen signing keys registered by the relayer (`GrievanceRegistry.CitizenSignerSet`). */
export const citizenSigners = pgTable("citizen_signers", {
  signer: address("signer").primaryKey(),
  citizenHash: bytes32("citizen_hash").notNull(),
  updatedBlock: blockNo("updated_block").notNull(),
});
