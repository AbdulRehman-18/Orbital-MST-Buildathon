// Reorg-aware, restartable chain indexer (plan §9.3). Replaces DecentraliTrack's
// blockchainListener.ts (`contract.on()`), which lost events on restart and never handled reorgs.
//
// Each tick:
//   1. reorg check — the stored hash of the last indexed block must still be canonical;
//   2. catch up to safeHead = head − CONFIRMATIONS in adaptive `getLogs` batches, each applied in
//      ONE DB transaction ordered by (block, logIndex) together with the cursor advance;
//   3. mirror the unconfirmed head into chain_events (confirmed = false) for "Pending" badges;
//   4. resolve client-tracked pending_txs;
//   5. publish notifications for everything that changed (after commit).
import {
  and,
  asc,
  chainEvents,
  eq,
  gt,
  indexerCursor,
  inArray,
  pendingTxs,
  sql,
  type Db,
  type DbOrTx,
} from "@namma-seva/db";
import type { Log, Provider } from "ethers";
import type { Logger } from "pino";
import type { ChainContracts } from "../chain/contracts";
import { byChainOrder, decodeLog, type ChainEvent } from "./decode";
import { applyEvent, PROJECTION_TABLES, type Touched } from "./projections";
import type { IndexerNotification, NotificationSink } from "./notify";

export type IndexerOptions = {
  db: Db;
  provider: Provider;
  contracts: ChainContracts;
  /** Cursor key, e.g. "mstTestnet". */
  network: string;
  confirmations: number;
  batchSize: number;
  reorgDepth: number;
  logger: Logger;
  sink?: NotificationSink;
  /** Pending txs with no receipt after this long are marked dropped. */
  dropAfterMs?: number;
};

export type Cursor = { lastBlock: number; lastBlockHash: string | null };

export type TickResult = {
  head: number;
  safeHead: number;
  indexedTo: number;
  events: number;
  reorg: boolean;
};

const MIN_BATCH = 1;
/** Consecutive successful getLogs calls before a shrunken batch is allowed to grow again. */
const GROW_AFTER = 20;
const BLOCK_FETCH_CONCURRENCY = 8;

export class Indexer {
  private batch: number;
  private successStreak = 0;
  private readonly o: Required<Omit<IndexerOptions, "sink">> & { sink?: NotificationSink };

  constructor(options: IndexerOptions) {
    this.o = { dropAfterMs: 15 * 60_000, ...options };
    this.batch = options.batchSize;
  }

  get currentBatchSize() {
    return this.batch;
  }

  async tick(): Promise<TickResult> {
    const { provider, confirmations } = this.o;
    const head = await provider.getBlockNumber();
    const safeHead = Math.max(head - confirmations, 0);
    const notes: IndexerNotification[] = [];

    let cursor = await this.readCursor();
    let reorg = false;
    if (await this.isReorged(cursor)) {
      reorg = true;
      cursor = await this.rollback(cursor);
      notes.push({ type: "reorg", toBlock: cursor.lastBlock });
    }

    let events = 0;
    while (cursor.lastBlock < safeHead) {
      const from = cursor.lastBlock + 1;
      const to = Math.min(from + this.batch - 1, safeHead);
      const r = await this.indexRange(from, to);
      events += r.applied;
      notes.push(...r.touched.map((t) => ({ type: "entity" as const, ...t })));
      cursor = { lastBlock: r.to, lastBlockHash: r.hash };
    }

    await this.trackHead(cursor.lastBlock, head, notes);
    await this.resolvePending(safeHead, notes);
    await this.o.db
      .update(indexerCursor)
      .set({ headBlock: head, updatedAt: new Date() })
      .where(eq(indexerCursor.network, this.o.network));

    notes.push({ type: "head", head, safeHead, indexed: cursor.lastBlock });
    await this.publish(notes);
    return { head, safeHead, indexedTo: cursor.lastBlock, events, reorg };
  }

  /** Index until the cursor reaches the current safe head. */
  async catchUp(): Promise<TickResult> {
    let result = await this.tick();
    while (result.indexedTo < result.safeHead) result = await this.tick();
    return result;
  }

  async readCursor(): Promise<Cursor> {
    const [row] = await this.o.db.select().from(indexerCursor).where(eq(indexerCursor.network, this.o.network));
    if (row) return { lastBlock: row.lastBlock, lastBlockHash: row.lastBlockHash };
    const initial = { lastBlock: Math.max(this.o.contracts.startBlock - 1, -1), lastBlockHash: null };
    await this.o.db
      .insert(indexerCursor)
      .values({ network: this.o.network, lastBlock: initial.lastBlock, lastBlockHash: null })
      .onConflictDoNothing();
    return initial;
  }

  /** Truncates projections + events and resets the cursor so the next ticks replay from `fromBlock`. */
  async resetForRebuild(fromBlock: number): Promise<void> {
    await this.o.db.transaction(async (tx) => {
      await truncateProjections(tx);
      await tx.delete(chainEvents);
      await tx
        .insert(indexerCursor)
        .values({ network: this.o.network, lastBlock: fromBlock - 1, lastBlockHash: null })
        .onConflictDoUpdate({
          target: indexerCursor.network,
          set: { lastBlock: fromBlock - 1, lastBlockHash: null, updatedAt: new Date() },
        });
    });
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async isReorged(cursor: Cursor): Promise<boolean> {
    if (!cursor.lastBlockHash || cursor.lastBlock < 0) return false;
    const block = await this.o.provider.getBlock(cursor.lastBlock);
    return !block || block.hash?.toLowerCase() !== cursor.lastBlockHash;
  }

  /** Drop everything above `lastBlock − REORG_DEPTH` and rebuild projections from stored events. */
  private async rollback(cursor: Cursor): Promise<Cursor> {
    const floor = Math.max(this.o.contracts.startBlock - 1, -1);
    const target = Math.max(cursor.lastBlock - this.o.reorgDepth, floor);
    const block = target >= 0 ? await this.o.provider.getBlock(target) : null;
    const hash = block?.hash?.toLowerCase() ?? null;
    this.o.logger.warn({ from: cursor.lastBlock, to: target }, "Reorg detected — rolling back and replaying");

    await this.o.db.transaction(async (tx) => {
      await tx.delete(chainEvents).where(gt(chainEvents.blockNumber, target));
      await replayProjections(tx);
      await tx
        .update(indexerCursor)
        .set({ lastBlock: target, lastBlockHash: hash, updatedAt: new Date() })
        .where(eq(indexerCursor.network, this.o.network));
    });
    return { lastBlock: target, lastBlockHash: hash };
  }

  private async indexRange(from: number, to: number) {
    const logs = await this.getLogsAdaptive(from, to);
    // getLogsAdaptive may have shrunk the batch; only index what was actually fetched.
    const end = logs.to;
    const times = await this.blockTimes(logs.logs);
    const toBlock = await this.o.provider.getBlock(end);
    if (!toBlock?.hash) throw new Error(`Block ${end} not available from RPC`);
    const hash = toBlock.hash.toLowerCase();

    const decoded = logs.logs
      .map((l) => decodeLog(this.o.contracts, l, times.get(l.blockNumber) ?? null))
      .filter((e): e is ChainEvent => e !== null)
      .sort(byChainOrder);

    let applied = 0;
    const touched: Touched[] = [];
    await this.o.db.transaction(async (tx) => {
      for (const ev of decoded) {
        const inserted = await tx
          .insert(chainEvents)
          .values(eventRow(ev, true))
          .onConflictDoUpdate({
            target: [chainEvents.txHash, chainEvents.logIndex],
            set: {
              confirmed: true,
              blockNumber: ev.blockNumber,
              blockHash: ev.blockHash,
              blockTime: ev.blockTime,
              args: ev.args,
            },
            // Idempotency: a row that is already confirmed was already projected.
            setWhere: eq(chainEvents.confirmed, false),
          })
          .returning({ txHash: chainEvents.txHash });
        if (inserted.length === 0) continue;
        touched.push(...(await applyEvent(tx, ev)));
        applied++;
      }
      await tx
        .insert(indexerCursor)
        .values({ network: this.o.network, lastBlock: end, lastBlockHash: hash })
        .onConflictDoUpdate({
          target: indexerCursor.network,
          set: { lastBlock: end, lastBlockHash: hash, updatedAt: new Date() },
        });
    });

    if (decoded.length) this.o.logger.info({ from, to: end, events: applied }, "Indexed blocks");
    return { applied, touched, hash, to: end };
  }

  /** `getLogs` with an adaptive range: halve on RPC error (range/size limits), grow back after a success streak. */
  private async getLogsAdaptive(from: number, to: number): Promise<{ logs: Log[]; to: number }> {
    let end = Math.min(to, from + this.batch - 1);
    for (;;) {
      try {
        const logs = await this.o.provider.getLogs({
          address: this.o.contracts.indexedAddresses,
          fromBlock: from,
          toBlock: end,
        });
        if (this.batch < this.o.batchSize && ++this.successStreak >= GROW_AFTER) {
          this.batch = Math.min(this.batch * 2, this.o.batchSize);
          this.successStreak = 0;
        }
        return { logs, to: end };
      } catch (err) {
        this.successStreak = 0;
        if (this.batch <= MIN_BATCH) throw err;
        this.batch = Math.max(Math.floor(this.batch / 2), MIN_BATCH);
        end = Math.min(to, from + this.batch - 1);
        this.o.logger.warn({ err: (err as Error).message, batch: this.batch }, "getLogs failed — halving batch");
      }
    }
  }

  private async blockTimes(logs: Log[]): Promise<Map<number, Date>> {
    const numbers = [...new Set(logs.map((l) => l.blockNumber))];
    const out = new Map<number, Date>();
    for (let i = 0; i < numbers.length; i += BLOCK_FETCH_CONCURRENCY) {
      const chunk = numbers.slice(i, i + BLOCK_FETCH_CONCURRENCY);
      const blocks = await Promise.all(chunk.map((n) => this.o.provider.getBlock(n)));
      blocks.forEach((b, j) => {
        if (b) out.set(chunk[j], new Date(b.timestamp * 1000));
      });
    }
    return out;
  }

  /** Mirror (indexed, head] as unconfirmed rows; replaced wholesale every tick, so reorgs self-heal. */
  private async trackHead(indexed: number, head: number, notes: IndexerNotification[]) {
    if (head <= indexed) {
      await this.o.db.delete(chainEvents).where(eq(chainEvents.confirmed, false));
      return;
    }
    const from = Math.max(indexed + 1, head - this.o.batchSize + 1);
    let logs: Log[];
    try {
      logs = await this.o.provider.getLogs({ address: this.o.contracts.indexedAddresses, fromBlock: from, toBlock: head });
    } catch (err) {
      this.o.logger.warn({ err: (err as Error).message }, "Head getLogs failed; skipping pending mirror this tick");
      return;
    }
    const decoded = logs
      .map((l) => decodeLog(this.o.contracts, l, null))
      .filter((e): e is ChainEvent => e !== null);
    await this.o.db.transaction(async (tx) => {
      await tx.delete(chainEvents).where(eq(chainEvents.confirmed, false));
      if (decoded.length) await tx.insert(chainEvents).values(decoded.map((e) => eventRow(e, false))).onConflictDoNothing();
    });
    for (const e of decoded) notes.push({ type: "pending", txHash: e.txHash, contract: e.contract, eventName: e.eventName, args: e.args });
  }

  private async resolvePending(safeHead: number, notes: IndexerNotification[]) {
    const { db, provider } = this.o;
    const open = await db.select().from(pendingTxs).where(inArray(pendingTxs.status, ["pending", "mined"])).limit(200);
    if (!open.length) return;

    const confirmed = await db
      .selectDistinct({ txHash: chainEvents.txHash })
      .from(chainEvents)
      .where(and(inArray(chainEvents.txHash, open.map((p) => p.txHash)), eq(chainEvents.confirmed, true)));
    const confirmedSet = new Set(confirmed.map((c) => c.txHash));

    for (const p of open) {
      let status = p.status;
      let blockNumber = p.blockNumber;
      if (confirmedSet.has(p.txHash)) {
        status = "confirmed";
      } else {
        const receipt = await provider.getTransactionReceipt(p.txHash).catch(() => null);
        if (receipt) {
          blockNumber = receipt.blockNumber;
          status = receipt.status === 0 ? "failed" : receipt.blockNumber <= safeHead ? "confirmed" : "mined";
        } else if (Date.now() - p.submittedAt.getTime() > this.o.dropAfterMs) {
          status = "dropped";
        }
      }
      if (status !== p.status || blockNumber !== p.blockNumber) {
        await db
          .update(pendingTxs)
          .set({ status, blockNumber, updatedAt: new Date() })
          .where(eq(pendingTxs.txHash, p.txHash));
        notes.push({ type: "tx", txHash: p.txHash, status, kind: p.kind, entityId: p.entityId, blockNumber });
      }
    }
  }

  private async publish(notes: IndexerNotification[]) {
    if (!this.o.sink || notes.length === 0) return;
    try {
      await this.o.sink.publish(dedupe(notes));
    } catch (err) {
      this.o.logger.error({ err }, "Failed to publish indexer notifications");
    }
  }
}

function eventRow(e: ChainEvent, confirmed: boolean) {
  return {
    txHash: e.txHash,
    logIndex: e.logIndex,
    blockNumber: e.blockNumber,
    blockHash: e.blockHash,
    blockTime: e.blockTime,
    contract: e.contract,
    eventName: e.eventName,
    args: e.args,
    confirmed,
  };
}

function dedupe(notes: IndexerNotification[]): IndexerNotification[] {
  const seen = new Set<string>();
  return notes.filter((n) => {
    const key = JSON.stringify(n);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function truncateProjections(tx: DbOrTx): Promise<void> {
  await tx.execute(sql.raw(`TRUNCATE ${PROJECTION_TABLES.join(", ")}`));
}

/** Rebuild every projection from the confirmed events already stored (no RPC calls). */
export async function replayProjections(tx: DbOrTx): Promise<number> {
  await truncateProjections(tx);
  const PAGE = 2000;
  let applied = 0;
  let after: { block: number; logIndex: number } | null = null;
  for (;;) {
    const rows: (typeof chainEvents.$inferSelect)[] = await tx
      .select()
      .from(chainEvents)
      .where(
        and(
          eq(chainEvents.confirmed, true),
          after
            ? sql`(${chainEvents.blockNumber}, ${chainEvents.logIndex}) > (${after.block}, ${after.logIndex})`
            : undefined,
        ),
      )
      .orderBy(asc(chainEvents.blockNumber), asc(chainEvents.logIndex))
      .limit(PAGE);
    for (const r of rows) {
      await applyEvent(tx, {
        txHash: r.txHash,
        logIndex: r.logIndex,
        blockNumber: r.blockNumber,
        blockHash: r.blockHash,
        blockTime: r.blockTime,
        contract: r.contract as ChainEvent["contract"],
        eventName: r.eventName,
        args: r.args as ChainEvent["args"],
      });
      applied++;
    }
    if (rows.length < PAGE) return applied;
    const last = rows[rows.length - 1];
    after = { block: last.blockNumber, logIndex: last.logIndex };
  }
}

/** Stable checksum over every projection table plus the confirmed event log (exit criterion G4). */
export async function projectionChecksum(db: DbOrTx): Promise<{ total: string; tables: Record<string, string> }> {
  const tables: Record<string, string> = {};
  for (const table of [...PROJECTION_TABLES, "chain_events"]) {
    const where = table === "chain_events" ? "WHERE t.confirmed" : "";
    const res = await db.execute(
      sql.raw(`SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), md5('')) AS h FROM ${table} t ${where}`),
    );
    const rows = (res as unknown as { rows: { h: string }[] }).rows;
    tables[table] = rows[0].h;
  }
  const res = await db.execute(sql`SELECT md5(${Object.values(tables).join("")}) AS h`);
  const total = (res as unknown as { rows: { h: string }[] }).rows[0].h;
  return { total, tables };
}

/** Indexer lag in blocks (head − last indexed), or null before the first tick. */
export async function indexerLag(db: DbOrTx, network: string) {
  const [row] = await db.select().from(indexerCursor).where(eq(indexerCursor.network, network));
  if (!row) return null;
  return {
    lastBlock: row.lastBlock,
    headBlock: row.headBlock,
    lagBlocks: row.headBlock == null ? null : row.headBlock - row.lastBlock,
    updatedAt: row.updatedAt,
  };
}

