import {
  bids,
  chainEvents,
  eq,
  grievances,
  indexerCursor,
  milestoneApprovals,
  milestones,
  pendingTxs,
  pinnedMetadata,
  projects,
  tenders,
  type Db,
} from "@namma-seva/db";
import { createTestDb } from "@namma-seva/db/testing";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Indexer, projectionChecksum } from "../src/indexer/indexer";
import { MemorySink } from "../src/indexer/notify";
import { AUDITOR_1, CITIZEN_A, CONTRACTOR, FakeChain, OFFICIAL, seedLifecycle, START_BLOCK } from "./helpers/fake-chain";

const CONFIRMATIONS = 6;
const logger = pino({ level: "silent" });

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

function makeIndexer(chain: FakeChain, opts: { batchSize?: number; sink?: MemorySink } = {}) {
  return new Indexer({
    db,
    provider: chain.provider,
    contracts: chain.contracts,
    network: "test",
    confirmations: CONFIRMATIONS,
    batchSize: opts.batchSize ?? 2000,
    reorgDepth: 12,
    logger,
    sink: opts.sink,
  });
}

describe("indexer projections", () => {
  it("projects the full lifecycle once confirmed", async () => {
    const chain = new FakeChain();
    await db.insert(pinnedMetadata).values({
      cid: "bafymeta1",
      metaHash: "0x" + "00".repeat(32),
      kind: "project",
      body: { title: "80 Feet Road resurfacing", description: "Resurface 1.2 km" },
    });
    seedLifecycle(chain);
    chain.mineEmpty(CONFIRMATIONS);

    const r = await makeIndexer(chain).catchUp();
    expect(r.indexedTo).toBe(chain.head - CONFIRMATIONS);

    const [p] = await db.select().from(projects).where(eq(projects.id, 1));
    expect(p).toMatchObject({
      title: "80 Feet Road resurfacing",
      status: "ACTIVE",
      wardId: 42,
      officialAddr: OFFICIAL,
      contractorAddr: CONTRACTOR,
      budget: "5000000",
      spent: "2000000",
      funded: "3000000",
      approvalCount: 2,
      milestoneCount: 1,
    });
    const [m] = await db.select().from(milestones).where(eq(milestones.id, 1));
    expect(m).toMatchObject({ status: "PAID", approvalCount: 2, proofCid: "bafyproof1", submittedBy: CONTRACTOR });
    expect(m.paidTx).toMatch(/^0x/);
    expect(await db.select().from(milestoneApprovals)).toHaveLength(2);
    const [g] = await db.select().from(grievances);
    expect(g).toMatchObject({ citizenHash: CITIZEN_A, upvotes: 1, status: "OPEN", category: "QUALITY" });
    const [t] = await db.select().from(tenders);
    expect(t).toMatchObject({ status: "OPEN", bidCount: 1 });
    expect(await db.select().from(bids)).toHaveLength(1);
  });

  it("does not index blocks inside the confirmation window, but mirrors them as pending", async () => {
    const chain = new FakeChain();
    seedLifecycle(chain); // last events are < CONFIRMATIONS deep
    const sink = new MemorySink();
    const r = await makeIndexer(chain, { sink }).tick();

    expect(r.safeHead).toBe(chain.head - CONFIRMATIONS);
    const pending = await db.select().from(chainEvents).where(eq(chainEvents.confirmed, false));
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((e) => e.blockNumber > r.indexedTo)).toBe(true);
    expect(sink.received.some((n) => n.type === "pending")).toBe(true);
    // The tender (mined last) is not projected yet.
    expect(await db.select().from(tenders)).toHaveLength(0);

    chain.mineEmpty(CONFIRMATIONS);
    await makeIndexer(chain).tick();
    expect(await db.select().from(tenders)).toHaveLength(1);
    expect(await db.select().from(chainEvents).where(eq(chainEvents.confirmed, false))).toHaveLength(0);
  });
});

describe("indexer reliability", () => {
  it("is idempotent: re-running ticks and restarting never double-applies", async () => {
    const chain = new FakeChain();
    seedLifecycle(chain);
    chain.mineEmpty(CONFIRMATIONS);
    await makeIndexer(chain).catchUp();
    const first = await projectionChecksum(db);

    // Restart (fresh instance, same DB) and tick again with no new blocks.
    await makeIndexer(chain).tick();
    // Force a re-scan of already-indexed blocks by rewinding the cursor.
    await db.update(indexerCursor).set({ lastBlock: START_BLOCK - 1, lastBlockHash: null });
    await makeIndexer(chain).catchUp();

    expect(await projectionChecksum(db)).toEqual(first);
    const [p] = await db.select().from(projects);
    expect(p.funded).toBe("3000000"); // additive projection applied exactly once
  });

  it("rebuild from the deploy block produces an identical checksum", async () => {
    const chain = new FakeChain();
    seedLifecycle(chain);
    chain.mineEmpty(CONFIRMATIONS);
    const live = makeIndexer(chain, { batchSize: 3 }); // many small batches, like a live tail
    await live.catchUp();
    const liveSum = await projectionChecksum(db);

    const rebuild = makeIndexer(chain, { batchSize: 2000 });
    await rebuild.resetForRebuild(START_BLOCK);
    expect(await db.select().from(projects)).toHaveLength(0);
    await rebuild.catchUp();

    expect((await projectionChecksum(db)).total).toBe(liveSum.total);
  });

  it("detects a reorg below the cursor, rolls back and replays the canonical chain", async () => {
    const chain = new FakeChain();
    seedLifecycle(chain);
    chain.mineEmpty(CONFIRMATIONS);
    const sink = new MemorySink();
    const indexer = makeIndexer(chain, { sink });
    await indexer.catchUp();
    expect(await db.select().from(grievances)).toHaveLength(1);

    // Deep reorg that removes the grievance / tender blocks (beyond CONFIRMATIONS — PoSA edge case).
    const [g] = await db.select().from(chainEvents).where(eq(chainEvents.eventName, "GrievanceFiled"));
    chain.reorg(g.blockNumber);
    chain.mineEmpty(CONFIRMATIONS);

    const r = await indexer.catchUp();
    expect(sink.received.some((n) => n.type === "reorg")).toBe(true);
    expect(r.indexedTo).toBe(chain.head - CONFIRMATIONS);
    expect(await db.select().from(grievances)).toHaveLength(0);
    expect(await db.select().from(tenders)).toHaveLength(0);
    // Everything before the fork survives the replay intact.
    const [p] = await db.select().from(projects);
    expect(p).toMatchObject({ status: "ACTIVE", spent: "2000000", funded: "3000000" });

    // And the result equals a clean rebuild of the canonical chain.
    const afterReorg = await projectionChecksum(db);
    await indexer.resetForRebuild(START_BLOCK);
    await indexer.catchUp();
    expect((await projectionChecksum(db)).total).toBe(afterReorg.total);
  });

  it("halves the getLogs batch when the RPC rejects a range", async () => {
    const chain = new FakeChain();
    seedLifecycle(chain);
    chain.mineEmpty(40);
    chain.maxLogRange = 5;
    const indexer = makeIndexer(chain, { batchSize: 64 });
    await indexer.catchUp();
    expect(indexer.currentBatchSize).toBeLessThanOrEqual(5);
    // 64 → 32 → 16 → 8 → 4: four rejected calls, then it stays within the RPC limit.
    const blocks = chain.head - CONFIRMATIONS - START_BLOCK + 1;
    expect(chain.getLogsCalls).toBeLessThanOrEqual(4 + Math.ceil(blocks / 4) + 2);
    const [p] = await db.select().from(projects);
    expect(p.status).toBe("ACTIVE");
  });

  it("resolves tracked transactions as they confirm, fail or drop", async () => {
    const chain = new FakeChain();
    const approveTx = "0x" + "ab".repeat(32);
    chain.mine([chain.ev("NammaSevaAccess", "RoleGranted", "0x" + "00".repeat(32), AUDITOR_1, OFFICIAL)], approveTx);
    const failedTx = "0x" + "cd".repeat(32);
    chain.receipts.set(failedTx, { status: 0, blockNumber: chain.head });
    const lostTx = "0x" + "ef".repeat(32);
    await db.insert(pendingTxs).values([
      { txHash: approveTx, kind: "grantRole" },
      { txHash: failedTx, kind: "approveMilestone" },
      { txHash: lostTx, kind: "createProject", submittedAt: new Date(Date.now() - 60 * 60 * 1000) },
    ]);

    const sink = new MemorySink();
    await makeIndexer(chain, { sink }).tick();
    let rows = Object.fromEntries((await db.select().from(pendingTxs)).map((r) => [r.txHash, r.status]));
    expect(rows).toEqual({ [approveTx]: "mined", [failedTx]: "failed", [lostTx]: "dropped" });

    chain.mineEmpty(CONFIRMATIONS);
    await makeIndexer(chain, { sink }).tick();
    rows = Object.fromEntries((await db.select().from(pendingTxs)).map((r) => [r.txHash, r.status]));
    expect(rows[approveTx]).toBe("confirmed");
    expect(sink.received.filter((n) => n.type === "tx").map((n) => (n as { status: string }).status)).toContain("confirmed");
  });
});
