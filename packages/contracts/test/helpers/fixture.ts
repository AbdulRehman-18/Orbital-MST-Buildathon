import { network } from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";
import hre from "hardhat";
import { DEFAULT_GRIEVANCE, deploySystem, type ModeName } from "../../scripts/lib/system.js";

// One connection per test file (Hardhat 3 convention); loadFixture snapshots state between tests.
export const connection = await network.create();
export const { ethers, networkHelpers } = connection;
export const upgradesApi = await upgrades(hre, connection);

export const WARD = 42; // e.g. a BBMP ward number
export const OTHER_WARD = 7;
export const DAY = 24 * 60 * 60;

export const Status = { PENDING_APPROVAL: 0, ACTIVE: 1, PAUSED: 2, COMPLETED: 3, CANCELLED: 4 } as const;
export const MStatus = { PENDING: 0, PROOF_SUBMITTED: 1, APPROVED: 2, REJECTED: 3, PAID: 4, VOID: 5 } as const;
export const Category = { ROAD: 0, DRAINAGE: 1, WATER_SUPPLY: 2 } as const;

export const h = (text: string) => ethers.keccak256(ethers.toUtf8Bytes(text));
export const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

export async function signers() {
  const [admin, official, officialOtherWard, auditor1, auditor2, auditor3, contractor, contractor2, relayer, treasury, outsider] =
    await ethers.getSigners();
  return { admin, official, officialOtherWard, auditor1, auditor2, auditor3, contractor, contractor2, relayer, treasury, outsider };
}

/** Full system with roles granted and ward access set. */
export async function deployWithRoles(mode: ModeName) {
  const s = await signers();
  const sys = await deploySystem(ethers, upgradesApi, {
    admin: s.admin.address,
    mode,
    treasury: s.treasury.address,
    grievance: { ...DEFAULT_GRIEVANCE, escalationThreshold: 3 },
  });
  const { access } = sys;
  const OFFICIAL = await access.GOVT_OFFICIAL_ROLE();
  const AUDITOR = await access.AUDITOR_ROLE();
  const CONTRACTOR = await access.CONTRACTOR_ROLE();
  const RELAYER = await access.RELAYER_ROLE();

  await access.grantRole(OFFICIAL, s.official.address);
  await access.grantRole(OFFICIAL, s.officialOtherWard.address);
  for (const a of [s.auditor1, s.auditor2, s.auditor3]) await access.grantRole(AUDITOR, a.address);
  await access.grantRole(CONTRACTOR, s.contractor.address);
  await access.grantRole(CONTRACTOR, s.contractor2.address);
  await access.grantRole(RELAYER, s.relayer.address);

  await access.setWardAccess(s.official.address, WARD, true);
  await access.setWardAccess(s.officialOtherWard.address, OTHER_WARD, true);
  for (const a of [s.auditor1, s.auditor2]) await access.setWardAccess(a.address, WARD, true);
  await access.setWardAccess(s.auditor3.address, await access.ALL_WARDS(), true);

  return { ...sys, ...s, roles: { OFFICIAL, AUDITOR, CONTRACTOR, RELAYER } };
}

export type Deployed = Awaited<ReturnType<typeof deployWithRoles>>;

export async function newProjectParams(overrides: Partial<Record<string, unknown>> = {}) {
  const now = await networkHelpers.time.latest();
  return {
    metaHash: h("project-meta"),
    metaCID: CID,
    wardId: WARD,
    departmentId: 3,
    category: Category.ROAD,
    latE6: 12_971_599, // Bengaluru
    lngE6: 77_594_566,
    budget: 1_000_000n,
    startDate: BigInt(now),
    endDate: BigInt(now + 180 * DAY),
    contractor: ethers.ZeroAddress,
    approvalThreshold: 2,
    ...overrides,
  };
}

/** Creates a project as `official` and approves it with auditor1+2 → ACTIVE. Returns its id. */
export async function activeProject(d: Deployed, overrides: Partial<Record<string, unknown>> = {}) {
  const params = await newProjectParams({ contractor: d.contractor.address, ...overrides });
  await d.registry.connect(d.official).createProject(params);
  const id = await d.registry.projectCount();
  await d.registry.connect(d.auditor1).approveProject(id);
  await d.registry.connect(d.auditor2).approveProject(id);
  return id;
}

/** ACTIVE project funded with `amount` (mode-appropriate) and one milestone of `milestoneAmount`. */
export async function fundedMilestone(d: Deployed, mode: ModeName, amount = 1_000_000n, milestoneAmount = 400_000n) {
  const projectId = await activeProject(d);
  if (mode === "ESCROW") await d.escrow.connect(d.official).fundProject(projectId, { value: amount });
  else await d.escrow.connect(d.official).recordSanction(projectId, amount, h("PFMS-sanction-001"));
  await d.escrow.connect(d.official).createMilestone(projectId, h("m1"), CID, milestoneAmount);
  const milestoneId = await d.escrow.milestoneCount();
  return { projectId, milestoneId };
}
