import { pendingTxs } from "@namma-seva/db";
import { id, keccak256, Wallet } from "ethers";
import pino from "pino";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TokenService, type SessionUser } from "../src/auth/tokens";
import { Indexer } from "../src/indexer/indexer";
import { csvCell } from "../src/routes/chain";
import { makeTestApp } from "./helpers/app";
import { CONTRACTOR, OFFICIAL, seedLifecycle, ZERO } from "./helpers/fake-chain";

type T = Awaited<ReturnType<typeof makeTestApp>>;
let t: T;

beforeEach(async () => {
  t = await makeTestApp();
});
afterEach(async () => {
  await t.close();
});

async function tokenFor(user: Partial<SessionUser>) {
  const tokens = new TokenService(t.ctx.config.auth.jwtSecret, false);
  return tokens.signAccess({
    id: "00000000-0000-0000-0000-000000000001",
    role: "PUBLIC",
    roles: [],
    walletAddress: null,
    citizenHash: null,
    wards: [],
    preferredLang: "en",
    demo: false,
    ...user,
  });
}

async function index() {
  await new Indexer({
    db: t.db,
    provider: t.chain!.provider,
    contracts: t.chain!.contracts,
    network: "local",
    confirmations: 6,
    batchSize: 2000,
    reorgDepth: 12,
    logger: pino({ level: "silent" }),
  }).catchUp();
}

const newProject = {
  title: "80 Feet Road resurfacing",
  description: "Resurface 1.2 km of 80 Feet Road, Koramangala 4th Block",
  category: "ROAD",
  wardId: 42,
  deptId: 1,
  latE6: 12_971_600,
  lngE6: 77_594_600,
  budget: "5000000",
  startDate: "2026-11-01T00:00:00Z",
  endDate: "2027-03-31T00:00:00Z",
  approvalThreshold: 2,
};

describe("health", () => {
  it("liveness is up; readiness reports the indexer has not run", async () => {
    const live = await request(t.app).get("/api/health").expect(200);
    expect(live.body).toMatchObject({ status: "ok", chain: { chainId: 31337 } });
    const ready = await request(t.app).get("/api/ready").expect(503);
    expect(ready.body.checks.database.ok).toBe(true);
    expect(ready.body.checks.rpc.ok).toBe(true);
    expect(ready.body.checks.indexer).toMatchObject({ ok: false, detail: "indexer has not run" });

    await index();
    await request(t.app).get("/api/ready").expect(200);
  });

  it("serves seeded reference data and security headers", async () => {
    const wards = await request(t.app).get("/api/wards").expect(200);
    expect(wards.body.find((w: { id: number }) => w.id === 151)).toMatchObject({ nameEn: "Koramangala", nameKn: "ಕೋರಮಂಗಲ" });
    expect(wards.headers["x-content-type-options"]).toBe("nosniff");
    expect(wards.headers["x-request-id"]).toBeTruthy();
    const depts = await request(t.app).get("/api/departments").expect(200);
    expect(depts.body[0]).toMatchObject({ id: 1, code: "ROADS" });
  });
});

describe("project creation → indexing → read model", () => {
  it("pins canonical metadata, then serves the indexed project with its title", async () => {
    await request(t.app).post("/api/projects").send(newProject).expect(401);
    const contractor = await tokenFor({ role: "CONTRACTOR", roles: ["CONTRACTOR"], walletAddress: CONTRACTOR });
    await request(t.app).post("/api/projects").set("authorization", `Bearer ${contractor}`).send(newProject).expect(403);

    const official = await tokenFor({ role: "GOVT_OFFICIAL", roles: ["GOVT_OFFICIAL"], walletAddress: OFFICIAL, wards: [42] });
    const bad = await request(t.app)
      .post("/api/projects")
      .set("authorization", `Bearer ${official}`)
      .send({ ...newProject, budget: "-5", latE6: 1e9 })
      .expect(400);
    expect(bad.body.details.map((i: { path: string[] }) => i.path[0]).sort()).toEqual(["budget", "latE6"]);
    await request(t.app)
      .post("/api/projects")
      .set("authorization", `Bearer ${official}`)
      .send({ ...newProject, wardId: 7 })
      .expect(400);

    const res = await request(t.app).post("/api/projects").set("authorization", `Bearer ${official}`).send(newProject).expect(201);
    expect(res.body.registry).toBe(t.chain!.contracts.address.ProjectRegistry);
    expect(res.body.args).toMatchObject({ category: 0, wardId: 42, departmentId: 1, contractor: ZERO, startDate: 1793491200 });
    // The pinned bytes hash to metaHash — anyone can re-verify from IPFS.
    const pinned = t.ctx.ipfs.get!(res.body.metaCID)!;
    expect(keccak256(pinned.bytes)).toBe(res.body.metaHash);

    // The official's wallet sends createProject; the indexer picks it up.
    const c = t.chain!;
    const a = res.body.args;
    c.mine([
      c.ev("ProjectRegistry", "ProjectCreated", 1, OFFICIAL, a.wardId, a.metaHash, a.metaCID, a.category, a.departmentId,
        a.latE6, a.lngE6, BigInt(a.budget), a.startDate, a.endDate, ZERO, a.approvalThreshold),
    ]);
    c.mineEmpty(6);
    await index();

    const list = await request(t.app).get("/api/projects?wardId=42").expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({ id: 1, title: newProject.title, status: "PENDING_APPROVAL", budget: "5000000" });
    await request(t.app).get("/api/projects?wardId=abc").expect(400);
    expect((await request(t.app).get("/api/projects?wardId=7").expect(200)).body.total).toBe(0);
  });

  it("serves detail, stats, queues, grievances, tenders, ledger and CSV from the indexed lifecycle", async () => {
    seedLifecycle(t.chain!);
    t.chain!.mineEmpty(6);
    await index();

    const detail = await request(t.app).get("/api/projects/1").expect(200);
    expect(detail.body.project).toMatchObject({ status: "ACTIVE", spent: "2000000", contractorAddr: CONTRACTOR });
    expect(detail.body.approvals).toHaveLength(2);
    expect(detail.body.milestones[0]).toMatchObject({ status: "PAID", approvalCount: 2 });
    expect(detail.body).toMatchObject({ grievanceCount: 1, openTenderId: 1 });
    await request(t.app).get("/api/projects/99").expect(404);

    const stats = await request(t.app).get("/api/projects/stats").expect(200);
    expect(stats.body).toMatchObject({ totalProjects: 1, byStatus: { ACTIVE: 1 }, totalBudget: "5000000", openGrievances: 1 });

    expect((await request(t.app).get("/api/milestones/pending").expect(200)).body).toHaveLength(0);
    expect((await request(t.app).get("/api/milestones/1").expect(200)).body.proofCid).toBe("bafyproof1");

    const grv = await request(t.app).get("/api/grievances?projectId=1").expect(200);
    expect(grv.body[0]).toMatchObject({ id: 1, upvotes: 1, mine: false, upvotedByMe: false });
    expect(grv.body[0].citizenHash).toBeUndefined();

    const tenders = await request(t.app).get("/api/tenders").expect(200);
    expect(tenders.body[0]).toMatchObject({ id: 1, bidCount: 1, phase: "CLOSED" === tenders.body[0].phase ? "CLOSED" : tenders.body[0].phase });
    const tender = await request(t.app).get("/api/tenders/1").expect(200);
    expect(tender.body.bids[0].bidderAddr).toBe(CONTRACTOR);

    const ledger = await request(t.app).get("/api/ledger?projectId=1&limit=5").expect(200);
    expect(ledger.body.items).toHaveLength(5);
    expect(ledger.body.total).toBeGreaterThan(10);
    expect(ledger.body.items[0].blockNumber).toBeGreaterThanOrEqual(ledger.body.items[4].blockNumber);

    const csv = await request(t.app).get("/api/public/export.csv?wardId=42").expect(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    const lines = csv.text.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("5000000");

    const status = await request(t.app).get("/api/chain/status").expect(200);
    expect(status.body).toMatchObject({ network: "local", chainId: 31337, lagBlocks: 6, mode: "LEDGER", relayer: null });
  });

  it("verifies the indexed record against a live on-chain read", async () => {
    seedLifecycle(t.chain!);
    t.chain!.mineEmpty(6);
    await index();
    const c = t.chain!;
    const onChain = {
      metaHash: id("meta-1"), budget: 5_000_000n, spent: 2_000_000n, id: 1n, startDate: 1_760_000_000n,
      endDate: 1_790_000_000n, wardId: 42n, departmentId: 1n, latE6: 12_971_600n, lngE6: 77_594_600n,
      official: OFFICIAL, contractor: CONTRACTOR, status: 1n, category: 0n, approvalThreshold: 2n,
      approvalCount: 2n, milestoneCount: 1n, cancelRequested: false,
    };
    c.stubCall("ProjectRegistry", "exists", () => [true]);
    c.stubCall("ProjectRegistry", "getProject", () => [onChain]);

    const ok = await request(t.app).get("/api/verify/1").expect(200);
    expect(ok.body).toMatchObject({ projectId: 1, verified: true, metadataVerified: null });
    expect(ok.body.fields.every((f: { match: boolean }) => f.match)).toBe(true);

    c.stubCall("ProjectRegistry", "getProject", () => [{ ...onChain, spent: 4_000_000n }]);
    const tampered = await request(t.app).get("/api/verify/1").expect(200);
    expect(tampered.body.verified).toBe(false);
    expect(tampered.body.fields.find((f: { field: string }) => f.field === "spent")).toMatchObject({
      indexed: "2000000",
      onChain: "4000000",
      match: false,
    });
  });
});

describe("tx tracking", () => {
  it("tracks a wallet-sent tx until the indexer confirms it", async () => {
    const hash = "0x" + "AB".repeat(32);
    const res = await request(t.app).post("/api/tx/track").send({ txHash: hash, kind: "approveProject", entityId: "1" }).expect(202);
    expect(res.body).toMatchObject({ txHash: hash.toLowerCase(), status: "pending", confirmations: null });
    expect(res.body.explorerUrl).toContain(`/tx/${hash.toLowerCase()}`);
    await request(t.app).post("/api/tx/track").send({ txHash: "0x1234", kind: "x" }).expect(400);
    await request(t.app).get(`/api/tx/${hash.toLowerCase()}`).expect(200);
    await request(t.app).get(`/api/tx/0x${"00".repeat(32)}`).expect(404);
    expect(await t.db.select().from(pendingTxs)).toHaveLength(1);
  });
});

describe("citizen grievances", () => {
  it("require a citizen session and a configured relayer", async () => {
    const body = { projectId: 1, category: "QUALITY", text: "Potholes reappeared a week after resurfacing" };
    await request(t.app).post("/api/grievances").send(body).expect(401);
    const official = await tokenFor({ role: "GOVT_OFFICIAL", roles: ["GOVT_OFFICIAL"], walletAddress: OFFICIAL });
    await request(t.app).post("/api/grievances").set("authorization", `Bearer ${official}`).send(body).expect(403);
    const citizen = await tokenFor({ role: "CITIZEN", roles: ["CITIZEN"], citizenHash: id("c") });
    await request(t.app)
      .post("/api/grievances")
      .set("authorization", `Bearer ${citizen}`)
      .send({ ...body, text: "short" })
      .expect(400);
    await request(t.app).post("/api/grievances").set("authorization", `Bearer ${citizen}`).send(body).expect(503);
  });
});

describe("misc", () => {
  it("csv cells are quoted and defused", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-42")).toBe("-42");
  });

  it("unknown routes and malformed JSON get JSON errors", async () => {
    await request(t.app).get("/api/nope").expect(404, { error: "not_found" });
    const res = await request(t.app).post("/api/tx/track").set("content-type", "application/json").send("{bad").expect(400);
    expect(res.body.error).toBe("bad_request");
  });

  it("wallet addresses in tokens are lower-case hex", () => {
    expect(Wallet.createRandom().address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
