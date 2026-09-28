// Demo data for the web app (NS_DEMO_MODE): `pnpm --filter @namma-seva/api demo:seed`.
// Sends REAL transactions from the demo cast (see ./accounts.ts) so every dashboard starts with
// something to act on — a project awaiting approval, proof awaiting auditors, funds awaiting
// release, a milestone awaiting proof, an escalated grievance, an open tender, a paused and a
// completed project. Run once per fresh local chain (skips project creation if any exist).
import { proofMedia, type Db } from "@namma-seva/db";
import { id, NonceManager, ZeroAddress, ZeroHash, type ContractRunner, type Provider } from "ethers";
import { loadConfig } from "../config";
import { interfaces } from "../chain/contracts";
import { createIpfs, devIpfsDir } from "../ipfs/ipfs";
import { pinJson } from "../ipfs/metadata";
import { phoneHash, sha256Hex } from "../lib/hash";
import { logger } from "../lib/logger";
import { connectChain, connectDb } from "../runtime";
import { ALL_WARDS, DEMO_ACCOUNTS, DEMO_CITIZENS, demoAccount, demoWallet } from "./accounts";
import { sitePhotoSvg } from "./site-photo";


type Stage = "PAID" | "APPROVED" | "PROOF" | "PROOF_HALF" | "REJECTED" | "PENDING";
type ProjectSeed = {
  title: string;
  description: string;
  location: string;
  official: string;
  contractor: string | null;
  wardId: number;
  deptId: number;
  category: string;
  lat: number;
  lng: number;
  budget: number; // rupees
  approvals: 0 | 1 | 2;
  fund?: number; // rupees
  milestones?: { title: string; amount: number; stage: Stage }[];
  close?: boolean;
  tender?: boolean;
  grievances?: { by: string; category: string; text: string; upvotes: string[]; response?: { text: string; action: "PAUSE_PROJECT" | "DISMISS" } }[];
};

const CATEGORIES = ["ROAD", "DRAINAGE", "WATER_SUPPLY", "STREET_LIGHTING", "PARK", "BUILDING", "OTHER"];
const G_CATEGORIES = ["QUALITY", "DELAY", "SAFETY", "MISSING_WORK", "CORRUPTION", "OTHER"];
const DAY = 86_400;

const DEMO_PROJECTS: ProjectSeed[] = [
  {
    title: "Koramangala 80 Feet Road resurfacing",
    description: "Mill and resurface 1.6 km of 80 Feet Road from Sony World junction to Jyoti Nivas College, with new lane markings and signage.",
    location: "80 Feet Road, Koramangala 4th Block",
    official: "official", contractor: "contractor", wardId: 151, deptId: 1, category: "ROAD",
    lat: 12.93524, lng: 77.62447, budget: 48_00_000, approvals: 2, fund: 46_00_000,
    milestones: [
      { title: "Milling & base course — Sony World to Jyoti Nivas", amount: 18_00_000, stage: "PAID" },
      { title: "Bituminous concrete wearing course", amount: 20_00_000, stage: "PROOF_HALF" },
      { title: "Lane markings, studs & signage", amount: 8_00_000, stage: "PENDING" },
    ],
    grievances: [
      { by: "citizen", category: "QUALITY", text: "Potholes reappeared near the Jyoti Nivas College junction within weeks of the first patch.", upvotes: ["citizen3"] },
    ],
  },
  {
    title: "Bellandur lake outlet storm-water drain desilting",
    description: "Desilt 1.4 km of the primary storm-water drain at the Bellandur lake outlet and repair the damaged retaining wall before the monsoon.",
    location: "Outer Ring Road service lane, Bellandur",
    official: "official", contractor: "contractor2", wardId: 150, deptId: 2, category: "DRAINAGE",
    lat: 12.93021, lng: 77.67213, budget: 32_00_000, approvals: 2, fund: 26_00_000,
    milestones: [
      { title: "Desilting of 1.4 km primary drain", amount: 14_00_000, stage: "PENDING" },
      { title: "Retaining wall repair", amount: 12_00_000, stage: "PENDING" },
    ],
    grievances: [
      { by: "citizen3", category: "SAFETY", text: "Silt has been heaped on the footpath beside the drain for two weeks — pedestrians are forced onto the road.", upvotes: ["citizen", "citizen2", "citizen4"] },
    ],
  },
  {
    title: "Koramangala 5th Block LED street lights",
    description: "Replace 180 sodium-vapour lamps with LED fittings and add 24 new poles on dark stretches of 5th Block.",
    location: "Koramangala 5th Block",
    official: "official", contractor: "contractor", wardId: 151, deptId: 4, category: "STREET_LIGHTING",
    lat: 12.9346, lng: 77.6188, budget: 12_50_000, approvals: 1,
  },
  {
    title: "Malleswaram 18th Cross park renovation",
    description: "New walking track with drainage, children's play area, benches and native-species planting in the 18th Cross park.",
    location: "18th Cross, Malleswaram",
    official: "official2", contractor: "contractor2", wardId: 45, deptId: 5, category: "PARK",
    lat: 13.0035, lng: 77.5699, budget: 22_00_000, approvals: 2, fund: 21_00_000,
    milestones: [
      { title: "Walking track & drainage", amount: 12_00_000, stage: "PAID" },
      { title: "Play area, benches & planting", amount: 9_00_000, stage: "PAID" },
    ],
    close: true,
  },
  {
    title: "Yelahanka New Town water pipeline replacement",
    description: "Replace 3.2 km of corroded AC pipes with DI pipes and renew house service connections in Sectors A and B.",
    location: "Sector A & B, Yelahanka New Town",
    official: "official2", contractor: "contractor", wardId: 4, deptId: 9, category: "WATER_SUPPLY",
    lat: 13.1006, lng: 77.5963, budget: 60_00_000, approvals: 2, fund: 45_00_000,
    milestones: [
      { title: "Trenching & DI pipe laying — Phase A", amount: 25_00_000, stage: "APPROVED" },
      { title: "House service connections", amount: 20_00_000, stage: "PENDING" },
    ],
  },
  {
    title: "Jakkur main road widening",
    description: "Widen 2.1 km of Jakkur main road from two to four lanes with a median, footpaths and storm-water drains. Contractor to be selected by sealed-bid tender.",
    location: "Jakkur Main Road",
    official: "official2", contractor: null, wardId: 5, deptId: 1, category: "ROAD",
    lat: 13.0786, lng: 77.6069, budget: 1_20_00_000, approvals: 2, tender: true,
  },
  {
    title: "Thanisandra primary health centre annexe",
    description: "Two-storey annexe for the Thanisandra PHC: maternity ward, pharmacy and a waiting hall.",
    location: "Thanisandra Main Road",
    official: "official2", contractor: "contractor2", wardId: 6, deptId: 6, category: "BUILDING",
    lat: 13.057, lng: 77.633, budget: 85_00_000, approvals: 2, fund: 40_00_000,
    milestones: [{ title: "Foundation & plinth", amount: 30_00_000, stage: "REJECTED" }],
    grievances: [
      {
        by: "citizen4", category: "MISSING_WORK", text: "Work on the annexe foundation stopped a month ago and cement bags were taken away from the site at night.",
        upvotes: ["citizen", "citizen2", "citizen3"],
        response: { text: "Site inspection confirmed work stoppage and missing material. Project paused pending a quality audit of the foundation.", action: "PAUSE_PROJECT" },
      },
    ],
  },
  {
    title: "Kempegowda ward drain & culvert repair",
    description: "Repair 600 m of collapsed side drain and rebuild the culvert at the bus-stand junction.",
    location: "Near Yelahanka Old Town bus stand",
    official: "official2", contractor: "contractor", wardId: 1, deptId: 2, category: "DRAINAGE",
    lat: 13.1003, lng: 77.5826, budget: 18_00_000, approvals: 0,
  },
];

async function main() {
  const config = loadConfig();
  if (!config.demoMnemonic) {
    throw new Error("Demo seed needs NS_DEMO_MODE=true (and NS_DEMO_MNEMONIC unless NS_CHAIN=local).");
  }
  const mnemonic = config.demoMnemonic;
  const { pool, db } = connectDb(config, 2);
  const { provider, contracts } = await connectChain(config);
  const ipfs = createIpfs(
    { pinataJwt: config.ipfs.pinataJwt, gateway: config.ipfs.gateway, production: false, apiBaseUrl: config.publicBaseUrl, localDir: devIpfsDir() },
    logger,
  );

  const signer = (key: string) => new NonceManager(demoWallet(mnemonic, demoAccount(key).index).connect(provider));
  const signers = Object.fromEntries(DEMO_ACCOUNTS.map((a) => [a.key, signer(a.key)]));
  const address = (key: string) => demoWallet(mnemonic, demoAccount(key).index).address;
  const as = (name: Parameters<typeof contracts.contract>[0], key: string) =>
    contracts.contract(name, signers[key] as ContractRunner);
  const send = async (label: string, tx: Promise<{ wait(): Promise<unknown> }>) => {
    const receipt = (await (await tx).wait()) as { hash: string };
    logger.info({ tx: receipt.hash }, label);
    return receipt;
  };

  // ─── 1. Roles & ward access ──────────────────────────────────────────────
  const access = as("NammaSevaAccess", "admin");
  if (!(await access.hasRole(ZeroHash, address("admin")))) {
    throw new Error(`Demo admin ${address("admin")} is not ADMIN — deploy with the demo mnemonic's first account.`);
  }
  for (const a of DEMO_ACCOUNTS.filter((x) => x.role !== "ADMIN")) {
    const role = id(a.role);
    if (!(await access.hasRole(role, address(a.key)))) await send(`grant ${a.role} → ${a.name}`, access.grantRole(role, address(a.key)));
    const wards = a.wards === "ALL" ? [ALL_WARDS] : a.wards;
    const missing = [];
    for (const w of wards) if (!(await access.hasWardAccess(address(a.key), w))) missing.push(w);
    if (missing.length) await send(`ward access ${missing.join(",")} → ${a.name}`, access.setWardAccessBatch(address(a.key), missing, true));
  }

  const registry = contracts.contract("ProjectRegistry", provider);
  if (Number(await registry.projectCount()) > 0) {
    logger.info("Projects already exist on this chain — roles ensured, skipping project data.");
    await finish(provider, config.chainName, pool);
    return;
  }

  const escrowRead = contracts.contract("MilestoneEscrow", provider);
  const ledger = Number(await escrowRead.mode()) === 0;
  const paise = (rupees: number) => BigInt(rupees) * 100n;
  const now = (await provider.getBlock("latest"))!.timestamp;

  const fund = (key: string, projectId: bigint, rupees: number) =>
    ledger
      ? as("MilestoneEscrow", key).recordSanction(projectId, paise(rupees), id(`PFMS/BBMP/2026/${projectId}`))
      : as("MilestoneEscrow", key).fundProject(projectId, { value: paise(rupees) });

  const citizenHash = (key: string) => phoneHash(DEMO_CITIZENS.find((c) => c.key === key)!.phone, config.auth.phonePepper);

  // ─── 2. Projects ─────────────────────────────────────────────────────────
  for (const [i, p] of DEMO_PROJECTS.entries()) {
    const meta = await pinJson(
      db,
      ipfs,
      "project",
      {
        title: p.title,
        description: p.description,
        location: p.location,
        category: p.category,
        wardId: p.wardId,
        departmentId: p.deptId,
        latE6: Math.round(p.lat * 1e6),
        lngE6: Math.round(p.lng * 1e6),
        budget: paise(p.budget).toString(),
        startDate: new Date((now - (60 - i * 5) * DAY) * 1000).toISOString(),
        endDate: new Date((now + (120 + i * 15) * DAY) * 1000).toISOString(),
        official: address(p.official).toLowerCase(),
      },
      address(p.official).toLowerCase(),
    );
    const rc = (await send(
      `createProject #${i + 1} ${p.title}`,
      as("ProjectRegistry", p.official).createProject({
        metaHash: meta.hash,
        metaCID: meta.cid,
        wardId: p.wardId,
        departmentId: p.deptId,
        category: CATEGORIES.indexOf(p.category),
        latE6: Math.round(p.lat * 1e6),
        lngE6: Math.round(p.lng * 1e6),
        budget: paise(p.budget),
        startDate: now - (60 - i * 5) * DAY,
        endDate: now + (120 + i * 15) * DAY,
        contractor: p.contractor ? address(p.contractor) : ZeroAddress,
        approvalThreshold: 2,
      }),
    )) as unknown as { logs: { topics: string[]; data: string }[] };
    const created = rc.logs
      .map((l) => {
        try {
          return interfaces.ProjectRegistry.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "ProjectCreated");
    const projectId = created!.args.projectId as bigint;

    if (p.approvals >= 1) await send("  auditor approves", as("ProjectRegistry", "auditor").approveProject(projectId));
    if (p.approvals >= 2) await send("  auditor2 approves → ACTIVE", as("ProjectRegistry", "auditor2").approveProject(projectId));
    if (p.fund) await send(`  fund ₹${p.fund.toLocaleString("en-IN")}`, fund(p.official, projectId, p.fund));

    for (const [j, m] of (p.milestones ?? []).entries()) {
      const mMeta = await pinJson(db, ipfs, "milestone", { title: m.title, projectId: Number(projectId), author: address(p.official).toLowerCase() }, null);
      await send(`  milestone: ${m.title}`, as("MilestoneEscrow", p.official).createMilestone(projectId, mMeta.hash, mMeta.cid, paise(m.amount)));
      const milestoneId = (await escrowRead.milestoneCount()) as bigint;
      if (m.stage === "PENDING") continue;

      // Proof: an illustrated site photo + proof.json, as the upload route would pin them.
      const takenAt = new Date((now - (20 - j * 5) * DAY) * 1000);
      const latE6 = Math.round((p.lat + 0.0002 * (j + 1)) * 1e6);
      const lngE6 = Math.round((p.lng - 0.00015 * (j + 1)) * 1e6);
      const photo = new TextEncoder().encode(
        sitePhotoSvg({ category: p.category, caption: `${m.title} — ${p.location}`, lat: latE6 / 1e6, lng: lngE6 / 1e6, takenAt }),
      );
      const photoCid = await ipfs.pin(photo, `proof-${milestoneId}.svg`, "image/svg+xml");
      const sha256 = sha256Hex(photo);
      const proof = await pinJson(
        db,
        ipfs,
        "proof",
        {
          milestoneId: Number(milestoneId),
          projectId: Number(projectId),
          round: 0,
          contractor: address(p.contractor!).toLowerCase(),
          latE6,
          lngE6,
          note: "Seeded demo proof",
          media: [{ cid: photoCid, sha256, mime: "image/svg+xml", exifTime: takenAt.toISOString() }],
        },
        address(p.contractor!).toLowerCase(),
      );
      await insertMedia(db, Number(milestoneId), photoCid, sha256, latE6, lngE6, takenAt, p, address(p.contractor!));
      await send("  contractor submits proof", as("MilestoneEscrow", p.contractor!).submitProof(milestoneId, proof.cid, proof.hash, latE6, lngE6));

      if (m.stage === "REJECTED") {
        const reason = await pinJson(db, ipfs, "reason", { title: "Plinth beam reinforcement does not match the approved drawing", projectId: Number(projectId) }, null);
        await send("  auditor2 rejects proof", as("MilestoneEscrow", "auditor2").rejectMilestone(milestoneId, reason.hash));
        continue;
      }
      await send("  auditor approves proof", as("MilestoneEscrow", "auditor").approveMilestone(milestoneId));
      if (m.stage === "PROOF_HALF") continue;
      await send("  auditor2 approves proof → APPROVED", as("MilestoneEscrow", "auditor2").approveMilestone(milestoneId));
      if (m.stage === "APPROVED") continue;
      await send(
        "  official releases funds",
        as("MilestoneEscrow", p.official).releaseFunds(milestoneId, ledger ? id(`UTR/SBIN/${milestoneId}/2026`) : ZeroHash),
      );
    }

    if (p.close) await send("  official closes project → COMPLETED", as("ProjectRegistry", p.official).closeProject(projectId));

    if (p.tender) {
      const tenderMeta = await pinJson(
        db,
        ipfs,
        "tender",
        { title: `Tender — ${p.title}`, description: "Sealed-bid commit/reveal. EMD 2%, completion 9 months.", projectId: Number(projectId) },
        null,
      );
      await send(
        "  official publishes tender",
        as("TenderRegistry", p.official).publishTender(projectId, tenderMeta.cid, now + 3 * DAY, now + 5 * DAY),
      );
      const tenderId = (await contracts.contract("TenderRegistry", provider).tenderCount()) as bigint;
      const tender = contracts.contract("TenderRegistry", provider);
      for (const [key, bid] of [["contractor", 1_12_00_000], ["contractor2", 1_08_50_000]] as const) {
        const salt = id(`demo-salt-${key}-${tenderId}`);
        const commit = await tender.computeCommitment(tenderId, address(key), paise(bid), salt);
        await send(`  ${key} commits sealed bid`, as("TenderRegistry", key).commitBid(tenderId, commit));
      }
    }

    for (const g of p.grievances ?? []) {
      const body = await pinJson(db, ipfs, "grievance", { projectId: Number(projectId), category: g.category, text: g.text, lang: "en", photoCids: [] }, null);
      await send(
        `  ${g.by} files grievance (via relayer)`,
        as("GrievanceRegistry", "relayer").fileGrievance(projectId, G_CATEGORIES.indexOf(g.category), body.cid, citizenHash(g.by)),
      );
      const grievanceId = (await contracts.contract("GrievanceRegistry", provider).grievanceCount()) as bigint;
      for (const by of g.upvotes) {
        await send(`  ${by} upvotes`, as("GrievanceRegistry", "relayer").upvote(grievanceId, citizenHash(by)));
      }
      if (g.response) {
        const resp = await pinJson(db, ipfs, "grievance-response", { title: g.response.text, projectId: Number(projectId) }, null);
        await send(
          `  auditor responds: ${g.response.action}`,
          as("GrievanceRegistry", "auditor").respond(grievanceId, resp.cid, g.response.action === "PAUSE_PROJECT" ? 1 : 2),
        );
      }
    }
  }

  await finish(provider, config.chainName, pool);
}

async function insertMedia(
  db: Db,
  milestoneId: number,
  cid: string,
  sha256: string,
  latE6: number,
  lngE6: number,
  takenAt: Date,
  p: ProjectSeed,
  contractor: string,
) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const [lat, lng] = [latE6 / 1e6, lngE6 / 1e6];
  const h =
    Math.sin(rad(lat - p.lat) / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(lat)) * Math.sin(rad(lng - p.lng) / 2) ** 2;
  const distance = 2 * R * Math.asin(Math.sqrt(h));
  await db.insert(proofMedia).values({
    milestoneId,
    cid,
    sha256,
    mime: "image/svg+xml",
    width: 800,
    height: 600,
    exifLat: lat,
    exifLng: lng,
    exifTime: takenAt,
    gpsDistanceM: distance,
    flagged: distance > 250,
    uploadedBy: contractor.toLowerCase(),
  });
}

async function finish(provider: Provider, chainName: string, pool: { end(): Promise<void> }) {
  // Local chain: mine past the confirmation window so the indexer picks everything up now.
  if (chainName === "local") await (provider as unknown as { send(m: string, p: unknown[]): Promise<unknown> }).send("hardhat_mine", ["0x10"]);
  await pool.end();
  logger.info("Demo seed complete.");
}

await main();
