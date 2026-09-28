import { boolean, index, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { blockNo, bytes32, tsz } from "./_types";

/**
 * Raw decoded logs. `(tx_hash, log_index)` makes re-applying a batch idempotent.
 * `confirmed = false` rows mirror the unconfirmed head (for "Pending" badges) and are replaced
 * on every indexer tick; only confirmed rows drive projections.
 */
export const chainEvents = pgTable(
  "chain_events",
  {
    txHash: bytes32("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: blockNo("block_number").notNull(),
    blockHash: bytes32("block_hash").notNull(),
    blockTime: tsz("block_time"),
    contract: text("contract").notNull(),
    eventName: text("event_name").notNull(),
    args: jsonb("args").notNull().$type<Record<string, unknown>>(),
    confirmed: boolean("confirmed").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.txHash, t.logIndex] }),
    index("chain_events_block_idx").on(t.blockNumber, t.logIndex),
    index("chain_events_confirmed_idx").on(t.confirmed),
  ],
);

export const indexerCursor = pgTable("indexer_cursor", {
  network: text("network").primaryKey(),
  lastBlock: blockNo("last_block").notNull(),
  lastBlockHash: bytes32("last_block_hash"),
  /** Latest head seen by the indexer, for lag reporting. */
  headBlock: blockNo("head_block"),
  updatedAt: tsz("updated_at").notNull().defaultNow(),
});

/** Client-reported transactions awaiting indexing (`POST /api/tx/track`). */
export const pendingTxs = pgTable(
  "pending_txs",
  {
    txHash: bytes32("tx_hash").primaryKey(),
    userId: text("user_id"),
    kind: text("kind").notNull(),
    entityId: text("entity_id"),
    submittedAt: tsz("submitted_at").notNull().defaultNow(),
    /** pending → mined → confirmed | failed | dropped */
    status: text("status").notNull().default("pending"),
    blockNumber: blockNo("block_number"),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("pending_txs_status_idx").on(t.status)],
);
