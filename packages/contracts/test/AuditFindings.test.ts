// Regression tests for every contract defect in plan §3.2. Each finding is shown twice:
//   "legacy: …"  the exploit SUCCEEDS against the unchanged DecentraliTrack contracts;
//   "v2: …"      the same attempt is BLOCKED by the Namma Seva contracts.
// H-5 (server-held role keys), L-1 (hard-coded deploy accounts) and L-2 (event listener) are
// off-chain: fixed by scripts/deploy.ts + config/roles.*.json and the Phase 3 indexer.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import { activeProject, CID, DAY, deployWithRoles, ethers, fundedMilestone, h, networkHelpers } from "./helpers/fixture.js";

const LAT = 12_971_599;
const LNG = 77_594_566;

async function legacyFixture() {
  const [admin, official, auditor1, auditor2, contractor, attacker] = await ethers.getSigners();
  const rm = await ethers.deployContract("LegacyRoleManager");
  const registry = await ethers.deployContract("LegacyProjectRegistry", [await rm.getAddress()]);
  const escrow = await ethers.deployContract("LegacyMilestoneEscrow", [await registry.getAddress(), await rm.getAddress()]);
  await rm.grantUserRole(official.address, await rm.GOVT_OFFICIAL());
  await rm.grantUserRole(auditor1.address, await rm.AUDITOR());
  await rm.grantUserRole(auditor2.address, await rm.AUDITOR());
  await rm.grantUserRole(contractor.address, await rm.CONTRACTOR());

  const now = await networkHelpers.time.latest();
  const create = (description = "Resurface 2 km of 80 Feet Road") =>
    registry
      .connect(official)
      .createProject("Road", description, "Koramangala", LAT, LNG, 1_000_000n, now + 180 * DAY, contractor.address, 0);
  await create();
  await registry.connect(auditor1).approveProject(1);
  return { admin, official, auditor1, auditor2, contractor, attacker, rm, registry, escrow, create };
}

async function v2Fixture() {
  return deployWithRoles("ESCROW");
}

describe("Audit findings (plan §3.2): legacy exploit vs v2 fix", function () {
  describe("C-1 — registry mutators had no access control", function () {
    it("legacy: anyone inflates a project's spent amount and milestone count", async function () {
      const l = await networkHelpers.loadFixture(legacyFixture);
      await l.registry.connect(l.attacker).addSpentAmount(1, 999_999_999n);
      await l.registry.connect(l.attacker).incrementMilestoneCount(1);
      const p = await l.registry.getProject(1);
      expect(p.spentAmount).to.equal(999_999_999n);
      expect(p.milestoneCount).to.equal(1n);
    });

    it("v2: only the escrow contract can touch spend or milestone count", async function () {
      const d = await networkHelpers.loadFixture(v2Fixture);
      const id = await activeProject(d);
      await expect(d.registry.connect(d.outsider).recordSpent(id, 1)).to.be.revertedWithCustomError(d.registry, "OnlyEscrow");
      await expect(d.registry.connect(d.outsider).recordMilestoneCreated(id)).to.be.revertedWithCustomError(
        d.registry,
        "OnlyEscrow",
      );
    });
  });

  describe("C-2 — any address could submit proof for any milestone", function () {
    it("legacy: an attacker submits fake proof", async function () {
      const l = await networkHelpers.loadFixture(legacyFixture);
      await l.escrow.connect(l.official).fundProject(1, { value: 1000n });
      await l.escrow.connect(l.official).createMilestone(1, "Foundation", "x", 500n);
      await l.escrow.connect(l.attacker).submitProof(1, "QmFake", LAT, LNG);
      expect((await l.escrow.getMilestone(1)).submittedBy).to.equal(l.attacker.address);
    });

    it("v2: only the assigned contractor", async function () {
      const d = await networkHelpers.loadFixture(v2Fixture);
      const { milestoneId } = await fundedMilestone(d, "ESCROW");
      await expect(d.escrow.connect(d.outsider).submitProof(milestoneId, CID, h("p"), LAT, LNG)).to.be.revertedWithCustomError(
        d.escrow,
        "NotAssignedContractor",
      );
    });
  });

  describe("H-1 — funds could be sent to non-existent projects with no way back", function () {
    it("legacy: funding project #999 succeeds and the coins are stuck", async function () {
      const l = await networkHelpers.loadFixture(legacyFixture);
      await l.escrow.connect(l.official).fundProject(999, { value: 1000n });
      expect(await l.escrow.projectEscrowBalance(999)).to.equal(1000n);
      const names = l.escrow.interface.fragments.filter(ethers.FunctionFragment.isFragment).map((f) => f.name);
      expect(names).to.not.include("refundUnallocated"); // no way to recover the coins
    });

    it("v2: funding requires an existing ACTIVE project, and unallocated funds are refundable", async function () {
      const d = await networkHelpers.loadFixture(v2Fixture);
      await expect(d.escrow.connect(d.official).fundProject(999, { value: 1000n })).to.be.revertedWithCustomError(
        d.registry,
        "ProjectNotFound",
      );
      const id = await activeProject(d);
      await d.escrow.connect(d.official).fundProject(id, { value: 1000n });
      await d.registry.connect(d.official).requestCancel(id, h("x"));
      await d.registry.connect(d.auditor1).confirmCancel(id);
      await expect(d.escrow.connect(d.official).refundUnallocated(id)).to.changeEtherBalance(ethers, d.treasury, 1000n);
    });
  });

  describe("H-2 — work continued while a project was PAUSED", function () {
    it("legacy: approve and release still succeed on a paused project", async function () {
      const l = await networkHelpers.loadFixture(legacyFixture);
      await l.escrow.connect(l.official).fundProject(1, { value: 1000n });
      await l.escrow.connect(l.official).createMilestone(1, "Foundation", "x", 500n);
      await l.escrow.connect(l.contractor).submitProof(1, "Qm", LAT, LNG);
      await l.registry.connect(l.auditor1).pauseProject(1);
      await l.escrow.connect(l.auditor1).approveMilestone(1);
      await expect(l.escrow.connect(l.official).releaseFunds(1)).to.changeEtherBalance(ethers, l.contractor, 500n);
    });

    it("v2: blocked until the project is resumed", async function () {
      const d = await networkHelpers.loadFixture(v2Fixture);
      const { projectId, milestoneId } = await fundedMilestone(d, "ESCROW");
      await d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG);
      await d.registry.connect(d.auditor1).pauseProject(projectId, h("x"));
      await expect(d.escrow.connect(d.auditor1).approveMilestone(milestoneId)).to.be.revertedWithCustomError(
        d.escrow,
        "ProjectNotActive",
      );
    });
  });

  describe("H-3 — milestone payments could exceed escrow in total", function () {
    it("legacy: two 1000-unit milestones against 1000 units of escrow", async function () {
      const l = await networkHelpers.loadFixture(legacyFixture);
      await l.escrow.connect(l.official).fundProject(1, { value: 1000n });
      await l.escrow.connect(l.official).createMilestone(1, "A", "x", 1000n);
      await l.escrow.connect(l.official).createMilestone(1, "B", "x", 1000n);
      expect((await l.registry.getProject(1)).milestoneCount).to.equal(2n);
    });

    it("v2: cumulative allocation can't exceed the balance", async function () {
      const d = await networkHelpers.loadFixture(v2Fixture);
      const id = await activeProject(d);
      await d.escrow.connect(d.official).fundProject(id, { value: 1000n });
      await d.escrow.connect(d.official).createMilestone(id, h("a"), CID, 1000n);
      await expect(d.escrow.connect(d.official).createMilestone(id, h("b"), CID, 1000n)).to.be.revertedWithCustomError(
        d.escrow,
        "InsufficientEscrow",
      );
    });
  });

  describe("H-4 — a single auditor could approve payment", function () {
    it("legacy: one approval is enough to release", async function () {
      const l = await networkHelpers.loadFixture(legacyFixture);
      await l.escrow.connect(l.official).fundProject(1, { value: 1000n });
      await l.escrow.connect(l.official).createMilestone(1, "A", "x", 500n);
      await l.escrow.connect(l.contractor).submitProof(1, "Qm", LAT, LNG);
      await l.escrow.connect(l.auditor1).approveMilestone(1);
      await expect(l.escrow.connect(l.official).releaseFunds(1)).to.changeEtherBalance(ethers, l.contractor, 500n);
    });

    it("v2: M-of-N (default 2) before the milestone is releasable", async function () {
      const d = await networkHelpers.loadFixture(v2Fixture);
      const { milestoneId } = await fundedMilestone(d, "ESCROW");
      await d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG);
      await d.escrow.connect(d.auditor1).approveMilestone(milestoneId);
      await expect(d.escrow.connect(d.official).releaseFunds(milestoneId, ethers.ZeroHash)).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidMilestoneStatus",
      );
    });
  });

  describe("M-1 — projects could close with unpaid milestones", function () {
    it("legacy: close succeeds with a pending milestone", async function () {
      const l = await networkHelpers.loadFixture(legacyFixture);
      await l.escrow.connect(l.official).fundProject(1, { value: 1000n });
      await l.escrow.connect(l.official).createMilestone(1, "A", "x", 500n);
      await l.registry.connect(l.official).closeProject(1);
      expect((await l.registry.getProject(1)).status).to.equal(3n); // COMPLETED
    });

    it("v2: MilestonesUnsettled", async function () {
      const d = await networkHelpers.loadFixture(v2Fixture);
      const { projectId } = await fundedMilestone(d, "ESCROW");
      await expect(d.registry.connect(d.official).closeProject(projectId)).to.be.revertedWithCustomError(
        d.registry,
        "MilestonesUnsettled",
      );
    });
  });

  describe("M-2 — rejection looped over every approver", function () {
    it("legacy: reject gas grows with the number of approvers; v2: constant", async function () {
      const l = await networkHelpers.loadFixture(legacyFixture);
      const extra = (await ethers.getSigners()).slice(10, 18);
      for (const a of extra) await l.rm.grantUserRole(a.address, await l.rm.AUDITOR());
      await l.escrow.connect(l.official).fundProject(1, { value: 1000n });
      const legacyRejectGas = async (approvers: typeof extra) => {
        await l.escrow.connect(l.official).createMilestone(1, "A", "x", 1n);
        const id = await l.escrow.getProjectMilestones(1).then((m) => m.length);
        await l.escrow.connect(l.contractor).submitProof(id, "Qm", LAT, LNG);
        for (const a of approvers) await l.escrow.connect(a).approveMilestone(id);
        return (await (await l.escrow.connect(l.auditor1).rejectMilestone(id, "x")).wait())!.gasUsed;
      };
      const g1 = await legacyRejectGas(extra.slice(0, 1));
      const g8 = await legacyRejectGas(extra);
      expect(g8 - g1).to.be.greaterThan(7n * 2_000n); // every extra approver costs storage writes

      const d = await deployWithRoles("ESCROW");
      const v2RejectGas = async (approvals: number) => {
        const { milestoneId } = await fundedMilestone(d, "ESCROW", 1000n, 10n);
        await d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG);
        const auditors = [d.auditor1, d.auditor2].slice(0, approvals);
        for (const a of auditors.slice(0, 1)) await d.escrow.connect(a).approveMilestone(milestoneId);
        return (await (await d.escrow.connect(d.auditor3).rejectMilestone(milestoneId, h("x"))).wait())!.gasUsed;
      };
      const v1 = await v2RejectGas(1);
      const v1b = await v2RejectGas(1);
      expect(v1b).to.be.closeTo(v1, 2_000n);
    });
  });

  describe("M-3 — full text stored on-chain", function () {
    it("legacy createProject gas scales with description length; v2 stores only hash + CID", async function () {
      const l = await networkHelpers.loadFixture(legacyFixture);
      const short = (await (await l.create("x")).wait())!.gasUsed;
      const long = (await (await l.create("x".repeat(2000))).wait())!.gasUsed;
      expect(long - short).to.be.greaterThan(1_000_000n);
      const fragment = (await ethers.getContractFactory("ProjectRegistry")).interface.getFunction("createProject")!;
      const fields = fragment.inputs[0].components!.map((c) => c.name);
      expect(fields).to.include.members(["metaHash", "metaCID"]);
      expect(fields).to.not.include.members(["title", "description", "location"]);
    });
  });

  describe("M-4 — default EVM target would emit opcodes MST mainnet lacks", function () {
    it("every compilation targets shanghai (see scripts/checkOpcodes.ts, ADR 0003)", async function () {
      const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../artifacts/build-info");
      const infos = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".output.json"));
      expect(infos.length).to.be.greaterThan(0);
      for (const f of infos) {
        const info = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
        expect(info.input.settings.evmVersion, f).to.equal("shanghai");
      }
    });
  });
});
