import { anomalies, auditLog, eq, projects, proofMedia } from "@namma-seva/db";
import { id } from "ethers";
import pino from "pino";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAnomalyEngine } from "../src/anomaly/engine";
import { TokenService, type SessionUser } from "../src/auth/tokens";
import { Indexer } from "../src/indexer/indexer";
import { makeTestApp } from "./helpers/app";
import { CONTRACTOR, seedLifecycle } from "./helpers/fake-chain";
import { picture } from "./helpers/picture";

type T = Awaited<ReturnType<typeof makeTestApp>>;
let t: T;

beforeEach(async () => {
  t = await makeTestApp();
});
afterEach(async () => {
  await t.close();
});

async function tokenFor(user: Partial<SessionUser>) {
  return new TokenService(t.ctx.config.auth.jwtSecret, false).signAccess({
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

const AUDITOR = "0x00000000000000000000000000000000000000a1";

describe("proof integrity on upload", () => {
  it("re-encodes, pins a thumbnail, and flags a photo reused on another milestone", async () => {
    seedLifecycle(t.chain!);
    const c = t.chain!;
    c.mine([
      c.ev("MilestoneEscrow", "MilestoneCreated", 2, 1, id("ms-2"), "bafyms2", 1_000_000n),
      c.ev("MilestoneEscrow", "MilestoneCreated", 3, 1, id("ms-3"), "bafyms3", 1_000_000n),
    ]);
    c.mineEmpty(6);
    await index();
    const contractor = await tokenFor({ role: "CONTRACTOR", roles: ["CONTRACTOR"], walletAddress: CONTRACTOR });
    const jpeg = await (await picture(4)).jpeg().toBuffer();
    const upload = (milestone: number, buf: Buffer) =>
      request(t.app)
        .post(`/api/milestones/${milestone}/proof/upload`)
        .set("authorization", `Bearer ${contractor}`)
        .attach("photos", buf, { filename: "site.jpg", contentType: "image/jpeg" })
        .field("latE6", "12971650")
        .field("lngE6", "77594620")
        .expect(201);

    const first = await upload(2, jpeg);
    expect(first.body.media[0].checks.duplicate).toEqual({ ok: true });
    const pinnedImage = t.ctx.ipfs.get!(first.body.media[0].cid)!;
    expect(pinnedImage.mime).toBe("image/jpeg");
    expect(t.ctx.ipfs.get!(first.body.media[0].thumbCid)!.bytes.length).toBeLessThan(pinnedImage.bytes.length);

    // Same picture, re-compressed, submitted for a different milestone → duplicate check fails but the upload succeeds.
    const recompressed = await (await picture(4)).jpeg({ quality: 40 }).toBuffer();
    const second = await upload(3, recompressed);
    expect(second.body.media[0]).toMatchObject({ flagged: true, checks: { duplicate: { ok: false, detail: expect.stringContaining("#2") } } });
    expect(second.body.warnings.some((w: string) => w.includes("duplicate"))).toBe(true);
    expect(second.body.proofCID).toBeTruthy();

    // A different picture is clean.
    const other = await (await picture(11)).jpeg().toBuffer();
    c.mine([c.ev("MilestoneEscrow", "MilestoneCreated", 4, 1, id("ms-4"), "bafyms4", 1_000_000n)]);
    c.mineEmpty(6);
    await index();
    expect((await upload(4, other)).body.media[0].checks.duplicate).toEqual({ ok: true });

    // The engine turns the failed check into an anomaly.
    const fresh = await runAnomalyEngine(t.db);
    expect(fresh.filter((f) => f.rule === "DUPLICATE_MEDIA")).toMatchObject([{ projectId: 1, severity: "CRITICAL" }]);
    expect(fresh.some((f) => f.rule === "GPS_MISMATCH")).toBe(true);
  });

  it("strict mode fails the capture check for gallery uploads without blocking", async () => {
    await t.close();
    t = await makeTestApp({ PROOF_STRICT: "true" });
    seedLifecycle(t.chain!);
    const c = t.chain!;
    c.mine([c.ev("MilestoneEscrow", "MilestoneCreated", 2, 1, id("ms-2"), "bafyms2", 1_000_000n)]);
    c.mineEmpty(6);
    await index();
    const contractor = await tokenFor({ role: "CONTRACTOR", roles: ["CONTRACTOR"], walletAddress: CONTRACTOR });
    const jpeg = await (await picture(6)).jpeg().toBuffer();
    const res = await request(t.app)
      .post("/api/milestones/2/proof/upload")
      .set("authorization", `Bearer ${contractor}`)
      .attach("photos", jpeg, { filename: "a.jpg", contentType: "image/jpeg" })
      .field("source", "gallery")
      .field("latE6", "12971650")
      .field("lngE6", "77594620")
      .expect(201);
    expect(res.body.media[0].checks.capture).toMatchObject({ ok: false });
    expect((await t.db.select().from(proofMedia))[0].phash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("rejects files that are not images", async () => {
    seedLifecycle(t.chain!);
    const c = t.chain!;
    c.mine([c.ev("MilestoneEscrow", "MilestoneCreated", 2, 1, id("ms-2"), "bafyms2", 1_000_000n)]);
    c.mineEmpty(6);
    await index();
    const contractor = await tokenFor({ role: "CONTRACTOR", roles: ["CONTRACTOR"], walletAddress: CONTRACTOR });
    await request(t.app)
      .post("/api/milestones/2/proof/upload")
      .set("authorization", `Bearer ${contractor}`)
      .attach("photos", Buffer.from("definitely not a jpeg"), { filename: "x.jpg", contentType: "image/jpeg" })
      .expect(400);
  });
});

describe("anomaly engine + API", () => {
  async function withAnomaly() {
    seedLifecycle(t.chain!);
    t.chain!.mineEmpty(6);
    await index();
    // A budget below what has been sanctioned/spent gives a deterministic BUDGET_OVERRUN.
    await t.db.update(projects).set({ budget: "1" }).where(eq(projects.id, 1));
    return runAnomalyEngine(t.db);
  }

  it("records findings once, and never re-opens a resolved one", async () => {
    const first = await withAnomaly();
    expect(first.map((f) => f.rule)).toContain("BUDGET_OVERRUN");
    expect(await runAnomalyEngine(t.db)).toEqual([]);
    const rows = await t.db.select().from(anomalies);
    expect(rows.filter((r) => r.rule === "BUDGET_OVERRUN")).toHaveLength(1);

    const auditor = await tokenFor({ role: "AUDITOR", roles: ["AUDITOR"], walletAddress: AUDITOR });
    const target = rows.find((r) => r.rule === "BUDGET_OVERRUN")!;
    await request(t.app).post(`/api/anomalies/${target.id}/resolve`).send({ note: "Checked" }).expect(401);
    await request(t.app).post(`/api/anomalies/${target.id}/resolve`).set("authorization", `Bearer ${auditor}`).send({}).expect(400);
    const done = await request(t.app)
      .post(`/api/anomalies/${target.id}/resolve`)
      .set("authorization", `Bearer ${auditor}`)
      .send({ note: "Budget revised in sanction order" })
      .expect(200);
    expect(done.body.resolvedAt).toBeTruthy();
    expect(done.body.details.resolution).toMatchObject({ note: "Budget revised in sanction order", by: AUDITOR });
    await request(t.app).post(`/api/anomalies/${target.id}/resolve`).set("authorization", `Bearer ${auditor}`).send({ note: "again" }).expect(404);
    expect((await t.db.select().from(auditLog)).map((a) => a.action)).toContain("anomaly.resolve");

    expect(await runAnomalyEngine(t.db)).toEqual([]); // still not re-opened
  });

  it("shows the public only a neutral 'under review' marker; reviewers see the rule", async () => {
    await withAnomaly();
    const publicList = await request(t.app).get("/api/anomalies?open=true").expect(200);
    expect(publicList.body.length).toBeGreaterThan(0);
    for (const a of publicList.body) expect(a).toMatchObject({ rule: "UNDER_REVIEW", severity: "LOW", details: {} });

    const publicProject = await request(t.app).get("/api/projects/1").expect(200);
    expect(publicProject.body.anomalies.length).toBeGreaterThan(0);
    expect(JSON.stringify(publicProject.body.anomalies)).not.toContain("BUDGET_OVERRUN");

    const auditor = await tokenFor({ role: "AUDITOR", roles: ["AUDITOR"], walletAddress: AUDITOR });
    const detailed = await request(t.app).get("/api/anomalies?open=true").set("authorization", `Bearer ${auditor}`).expect(200);
    expect(detailed.body.map((a: { rule: string }) => a.rule)).toContain("BUDGET_OVERRUN");
    const project = await request(t.app).get("/api/projects/1").set("authorization", `Bearer ${auditor}`).expect(200);
    expect(project.body.anomalies.map((a: { rule: string }) => a.rule)).toContain("BUDGET_OVERRUN");
  });
});

describe("open data", () => {
  it("exports one ward (or all) as JSON with an explorer link", async () => {
    seedLifecycle(t.chain!);
    t.chain!.mineEmpty(6);
    await index();
    const ward = await request(t.app).get("/api/public/export.json?wardId=42").expect(200);
    expect(ward.headers["content-disposition"]).toContain("namma-seva-ward-42.json");
    expect(ward.body).toHaveLength(1);
    expect(ward.body[0]).toMatchObject({ id: 1, wardId: 42, budget: "5000000" });
    expect(ward.body[0].explorerUrl).toContain("/tx/");
    expect((await request(t.app).get("/api/public/export.json?wardId=7").expect(200)).body).toEqual([]);
    expect((await request(t.app).get("/api/public/export.json").expect(200)).body).toHaveLength(1);
  });
});
