// End-to-end against a real local chain (plan Phase 3 §7). Needs:
//   pnpm --filter @namma-seva/contracts node         (terminal 1)
//   pnpm --filter @namma-seva/contracts deploy:local (once per node start)
// Skipped automatically when no node / manifest is available. State is snapshotted and reverted,
// so the suite can be re-run against the same node.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Deployment } from "@namma-seva/chain";
import { citizenSigners, eq, grievances, milestones, projects, type Db } from "@namma-seva/db";
import { createTestDb } from "@namma-seva/db/testing";
import { seedReferenceData } from "@namma-seva/db/seed";
import { HDNodeWallet, id, JsonRpcProvider, Mnemonic, Network, type Contract } from "ethers";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { ChainRoleReader } from "../src/auth/roles";
import { TokenService } from "../src/auth/tokens";
import { resolveContracts, type ChainContracts } from "../src/chain/contracts";
import { loadConfig } from "../src/config";
import { LocalIpfs } from "../src/ipfs/ipfs";
import { Indexer, projectionChecksum } from "../src/indexer/indexer";
import { MemoryJobQueue } from "../src/relayer/queue";
import { Relayer } from "../src/relayer/relayer";
import { MemoryNonceLock, TxSender } from "../src/relayer/sender";
import { CapturingOtp, TEST_ENV } from "./helpers/app";

const RPC = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8545";
const MANIFEST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages/chain/deployments/localhost.json");

const reachable =
  existsSync(MANIFEST) &&
  (await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    signal: AbortSignal.timeout(1500),
  })
    .then((r) => r.ok)
    .catch(() => false));

const logger = pino({ level: "silent" });
const WARD = 151;

describe.skipIf(!reachable)("e2e on a local Hardhat node", () => {
  let provider: JsonRpcProvider;
  let contracts: ChainContracts;
  let db: Db;
  let closeDb: () => Promise<void>;
  let snapshot: string;
  const hardhat = Mnemonic.fromPhrase("test test test test test test test test test test test junk");
  const acct = (i: number) => HDNodeWallet.fromMnemonic(hardhat, `m/44'/60'/0'/0/${i}`).connect(provider);
  let admin: HDNodeWallet, official: HDNodeWallet, auditor1: HDNodeWallet, auditor2: HDNodeWallet;
  let contractor: HDNodeWallet, relayerWallet: HDNodeWallet;
  let registry: Contract, escrow: Contract, access: Contract;
  let indexer: Indexer;

  const as = (c: Contract, w: HDNodeWallet) => c.connect(w) as Contract;
  const send = async (p: Promise<{ wait(): Promise<unknown> }>) => (await p).wait();
  const mine = (n: number) => provider.send("hardhat_mine", ["0x" + n.toString(16)]);

  beforeAll(async () => {
    provider = new JsonRpcProvider(RPC, new Network("local", 31337), { staticNetwork: true, cacheTimeout: -1 });
    contracts = resolveContracts(JSON.parse(readFileSync(MANIFEST, "utf8")) as Deployment);
    snapshot = await provider.send("evm_snapshot", []);
    ({ db, close: closeDb } = await createTestDb());
    await seedReferenceData(db);
    [admin, official, auditor1, auditor2, contractor, relayerWallet] = [0, 1, 2, 3, 4, 5].map(acct);
    registry = contracts.contract("ProjectRegistry", provider);
    escrow = contracts.contract("MilestoneEscrow", provider);
    access = contracts.contract("NammaSevaAccess", admin);

    for (const [role, who] of [
      ["GOVT_OFFICIAL", official],
      ["AUDITOR", auditor1],
      ["AUDITOR", auditor2],
      ["CONTRACTOR", contractor],
      ["RELAYER", relayerWallet],
    ] as const) {
      await send(access.grantRole(id(role), who.address));
    }
    for (const w of [official, auditor1, auditor2]) await send(access.setWardAccess(w.address, WARD, true));

    indexer = new Indexer({
      db,
      provider,
      contracts,
      network: "local",
      confirmations: 2,
      batchSize: 500,
      reorgDepth: 12,
      logger,
    });
  });

  afterAll(async () => {
    if (snapshot) await provider.send("evm_revert", [snapshot]);
    await closeDb?.();
  });

  it("runs the full lifecycle through the API, wallets, relayer and indexer", async () => {
    const config = loadConfig({ ...TEST_ENV, NS_CHAIN: "local" } as NodeJS.ProcessEnv);
    const ipfs = new LocalIpfs("http://api.test");
    const tokens = new TokenService(config.auth.jwtSecret, false);
    const lock = new MemoryNonceLock();
    const relayer = new Relayer({
      db,
      provider,
      contracts,
      chainId: 31337,
      rootPrivateKey: relayerWallet.privateKey,
      sender: new TxSender(relayerWallet as never, lock, logger, 60_000),
      logger,
      minBalance: "10",
      dailyCap: "50",
      citizenDailyLimit: 10,
    });
    const queue = new MemoryJobQueue(relayer.process, relayer.onFailed, logger);
    relayer.queue = queue;
    const app = createApp({
      config,
      db,
      logger,
      tokens,
      otp: new CapturingOtp(),
      roles: new ChainRoleReader(contracts.contract("NammaSevaAccess", provider)),
      ipfs,
      chain: { provider, contracts },
      relayer,
    });

    // 1. Official: API pins metadata → wallet signs createProject.
    const officialToken = await tokens.signAccess({
      id: "00000000-0000-0000-0000-00000000000a",
      role: "GOVT_OFFICIAL",
      roles: ["GOVT_OFFICIAL"],
      walletAddress: official.address.toLowerCase(),
      citizenHash: null,
      wards: [WARD],
      preferredLang: "en",
      demo: false,
    });
    const now = (await provider.getBlock("latest"))!.timestamp;
    const prep = await request(app)
      .post("/api/projects")
      .set("authorization", `Bearer ${officialToken}`)
      .send({
        title: "Koramangala 80 Feet Road resurfacing",
        description: "Resurface 1.2 km incl. footpaths",
        category: "ROAD",
        wardId: WARD,
        deptId: 1,
        latE6: 12_934_533,
        lngE6: 77_626_579,
        budget: "3000000000000000000",
        startDate: new Date(now * 1000).toISOString(),
        endDate: new Date((now + 90 * 86400) * 1000).toISOString(),
        contractorAddr: contractor.address,
        approvalThreshold: 2,
      })
      .expect(201);
    const { args } = prep.body;
    const rc = (await send(as(registry, official).createProject({ ...args, budget: BigInt(args.budget) }))) as {
      logs: { topics: string[]; data: string }[];
    };
    const created = rc.logs.map((l) => { try { return registry.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "ProjectCreated");
    const projectId = created!.args.projectId as bigint;

    // 2. Auditors approve; official funds and creates a milestone; contractor proves; payout.
    await send(as(registry, auditor1).approveProject(projectId));
    await send(as(registry, auditor2).approveProject(projectId));
    await send(as(escrow, official).fundProject(projectId, { value: 3n * 10n ** 18n }));
    await send(as(escrow, official).createMilestone(projectId, id("m1"), "bafkreim1", 10n ** 18n));
    const milestoneId = (await escrow.milestoneCount!()) as bigint;
    await send(as(escrow, contractor).submitProof(milestoneId, "bafkreiproof", id("proof"), 12_934_540, 77_626_570));
    await send(as(escrow, auditor1).approveMilestone(milestoneId));
    await send(as(escrow, auditor2).approveMilestone(milestoneId));
    await send(as(escrow, official).releaseFunds(milestoneId, "0x" + "00".repeat(32)));

    // 3. Two citizens, no wallets: grievance + upvote through the ERC-2771 forwarder.
    const citizenA = id("citizen:+919845012345");
    const citizenB = id("citizen:+919845054321");
    const g = await relayer.enqueueGrievance("ua", citizenA, { projectId: Number(projectId), category: 0, cid: "bafkreigrievance" });
    await queue.drain();
    expect(await relayer.job(g.jobId)).toMatchObject({ status: "confirmed" });

    await mine(3);
    await indexer.catchUp();
    const [grv] = await db.select().from(grievances);
    expect(grv).toMatchObject({ citizenHash: citizenA, status: "OPEN" });

    const up = await relayer.enqueueUpvote("ub", citizenB, grv.id);
    await queue.drain();
    expect(await relayer.job(up.jobId)).toMatchObject({ status: "confirmed" });
    // Duplicate upvote fails in simulation, before any gas is spent.
    const dup = await relayer.enqueueUpvote("ub", citizenB, grv.id);
    await queue.drain();
    expect(await relayer.job(dup.jobId)).toMatchObject({ status: "failed", error: expect.stringMatching(/AlreadyUpvoted/) });

    // 4. Indexer confirms everything.
    await mine(3);
    await indexer.catchUp();
    const [p] = await db.select().from(projects).where(eq(projects.id, Number(projectId)));
    expect(p).toMatchObject({
      title: "Koramangala 80 Feet Road resurfacing",
      status: "ACTIVE",
      wardId: WARD,
      spent: "1000000000000000000",
      funded: "3000000000000000000",
      contractorAddr: contractor.address.toLowerCase(),
    });
    const [m] = await db.select().from(milestones).where(eq(milestones.id, Number(milestoneId)));
    expect(m).toMatchObject({ status: "PAID", approvalCount: 2 });
    const [grvAfter] = await db.select().from(grievances).where(eq(grievances.id, grv.id));
    expect(grvAfter.upvotes).toBe(1);
    expect(await db.select().from(citizenSigners)).toHaveLength(2);

    // 5. "Verify on chain": indexed row == live read, and the pinned metadata re-hashes to metaHash.
    const verify = await request(app).get(`/api/verify/${projectId}`).expect(200);
    expect(verify.body).toMatchObject({ verified: true, metadataVerified: true });

    // 6. Rebuild from the deploy block reproduces the live read model exactly.
    const live = await projectionChecksum(db);
    await indexer.resetForRebuild(contracts.startBlock);
    await indexer.catchUp();
    expect((await projectionChecksum(db)).total).toBe(live.total);
  });

  it("rolls back and replays when blocks it indexed are reorged away (evm_snapshot / evm_revert)", async () => {
    const fast = new Indexer({ db, provider, contracts, network: "local", confirmations: 0, batchSize: 500, reorgDepth: 12, logger });
    await fast.catchUp();
    const before = await projectionChecksum(db);
    const count = (await db.select().from(projects)).length;

    const fork = await provider.send("evm_snapshot", []);
    const now = (await provider.getBlock("latest"))!.timestamp;
    await send(
      as(registry, official).createProject({
        metaHash: id("orphan"),
        metaCID: "bafkreiorphan",
        wardId: WARD,
        departmentId: 1,
        category: 0,
        latE6: 12_934_533,
        lngE6: 77_626_579,
        budget: 10n ** 18n,
        startDate: now,
        endDate: now + 86400,
        contractor: "0x0000000000000000000000000000000000000000",
        approvalThreshold: 2,
      }),
    );
    await fast.catchUp();
    expect(await db.select().from(projects)).toHaveLength(count + 1);

    // Replace that block with a different one on a new fork.
    await provider.send("evm_revert", [fork]);
    await mine(3);
    const r = await fast.catchUp();
    expect(r.reorg).toBe(true);
    expect(await db.select().from(projects)).toHaveLength(count);
    expect((await projectionChecksum(db)).total).toBe(before.total);
  });
});
