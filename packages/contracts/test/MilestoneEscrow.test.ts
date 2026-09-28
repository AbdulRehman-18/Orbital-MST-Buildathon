import { expect } from "chai";
import {
  activeProject,
  CID,
  deployWithRoles,
  ethers,
  fundedMilestone,
  h,
  MStatus,
  networkHelpers,
  newProjectParams,
  Status,
} from "./helpers/fixture.js";

const LAT = 12_971_599;
const LNG = 77_594_566;

async function ledger() {
  return deployWithRoles("LEDGER");
}
async function escrowMode() {
  return deployWithRoles("ESCROW");
}

describe("MilestoneEscrow", function () {
  describe("funding", function () {
    it("LEDGER: records a sanction with its PFMS reference, capped at budget", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const id = await activeProject(d);
      await expect(d.escrow.connect(d.official).fundProject(id, { value: 1 }))
        .to.be.revertedWithCustomError(d.escrow, "WrongMode")
        .withArgs(1);
      await expect(d.escrow.connect(d.official).recordSanction(id, 100, ethers.ZeroHash)).to.be.revertedWithCustomError(
        d.escrow,
        "MissingReference",
      );
      await expect(d.escrow.connect(d.official).recordSanction(id, 0, h("ref"))).to.be.revertedWithCustomError(
        d.escrow,
        "ZeroAmount",
      );
      await expect(d.escrow.connect(d.official).recordSanction(id, 600_000n, h("PFMS-1")))
        .to.emit(d.escrow, "ProjectFunded")
        .withArgs(id, d.official.address, 600_000n, h("PFMS-1"), 600_000n);
      await expect(d.escrow.connect(d.official).recordSanction(id, 400_001n, h("PFMS-2")))
        .to.be.revertedWithCustomError(d.escrow, "FundingExceedsBudget")
        .withArgs(id, 400_001n, 400_000n);
      const f = await d.escrow.funds(id);
      expect(f.funded).to.equal(600_000n);
      expect(f.balance).to.equal(600_000n);
    });

    it("ESCROW: locks native coin", async function () {
      const d = await networkHelpers.loadFixture(escrowMode);
      const id = await activeProject(d);
      await expect(d.escrow.connect(d.official).recordSanction(id, 1, h("x")))
        .to.be.revertedWithCustomError(d.escrow, "WrongMode")
        .withArgs(0);
      await expect(d.escrow.connect(d.official).fundProject(id, { value: 500_000n })).to.changeEtherBalances(
        ethers,
        [d.official, d.escrow],
        [-500_000n, 500_000n],
      );
    });

    it("only funds ACTIVE projects of the official's ward (H-1)", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      await expect(d.escrow.connect(d.official).recordSanction(99, 1, h("x"))).to.be.revertedWithCustomError(
        d.registry,
        "ProjectNotFound",
      );
      await d.registry.connect(d.official).createProject(await newProjectParams());
      await expect(d.escrow.connect(d.official).recordSanction(1, 1, h("x")))
        .to.be.revertedWithCustomError(d.escrow, "ProjectNotActive")
        .withArgs(1n, Status.PENDING_APPROVAL);
      const id = await activeProject(d);
      await expect(d.escrow.connect(d.officialOtherWard).recordSanction(id, 1, h("x"))).to.be.revertedWithCustomError(
        d.escrow,
        "NotInWard",
      );
    });
  });

  describe("createMilestone (H-3)", function () {
    it("caps cumulative allocation at the funded balance", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const id = await activeProject(d);
      await d.escrow.connect(d.official).recordSanction(id, 500_000n, h("s"));
      await expect(d.escrow.connect(d.official).createMilestone(id, h("m1"), CID, 300_000n))
        .to.emit(d.escrow, "MilestoneCreated")
        .withArgs(1n, id, h("m1"), CID, 300_000n);
      await expect(d.escrow.connect(d.official).createMilestone(id, h("m2"), CID, 200_001n))
        .to.be.revertedWithCustomError(d.escrow, "InsufficientEscrow")
        .withArgs(id, 200_001n, 200_000n);
      await d.escrow.connect(d.official).createMilestone(id, h("m2"), CID, 200_000n);
      const f = await d.escrow.funds(id);
      expect(f.allocated).to.equal(500_000n);
      expect(f.unsettled).to.equal(2n);
      expect((await d.registry.getProject(id)).milestoneCount).to.equal(2);
    });

    it("validates inputs and requires an ACTIVE project", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const id = await activeProject(d);
      await d.escrow.connect(d.official).recordSanction(id, 500_000n, h("s"));
      await expect(d.escrow.connect(d.official).createMilestone(id, ethers.ZeroHash, CID, 1)).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidMetadata",
      );
      await expect(d.escrow.connect(d.official).createMilestone(id, h("m"), "", 1)).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidMetadata",
      );
      await expect(d.escrow.connect(d.official).createMilestone(id, h("m"), CID, 0)).to.be.revertedWithCustomError(
        d.escrow,
        "ZeroAmount",
      );
      await expect(d.escrow.connect(d.auditor1).createMilestone(id, h("m"), CID, 1)).to.be.revertedWithCustomError(
        d.escrow,
        "Unauthorized",
      );
      await d.registry.connect(d.auditor1).pauseProject(id, h("x"));
      await expect(d.escrow.connect(d.official).createMilestone(id, h("m"), CID, 1)).to.be.revertedWithCustomError(
        d.escrow,
        "ProjectNotActive",
      );
    });
  });

  describe("submitProof (C-2)", function () {
    it("accepts proof only from the project's assigned contractor", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { projectId, milestoneId } = await fundedMilestone(d, "LEDGER");
      await expect(d.escrow.connect(d.contractor2).submitProof(milestoneId, CID, h("p"), LAT, LNG))
        .to.be.revertedWithCustomError(d.escrow, "NotAssignedContractor")
        .withArgs(projectId, d.contractor2.address);
      await expect(d.escrow.connect(d.outsider).submitProof(milestoneId, CID, h("p"), LAT, LNG)).to.be.revertedWithCustomError(
        d.escrow,
        "NotAssignedContractor",
      );
      await expect(d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG))
        .to.emit(d.escrow, "ProofSubmitted")
        .withArgs(milestoneId, projectId, d.contractor.address, CID, h("p"), LAT, LNG, 0);
      const m = await d.escrow.getMilestone(milestoneId);
      expect(m.status).to.equal(MStatus.PROOF_SUBMITTED);
      expect(m.proofHash).to.equal(h("p"));
    });

    it("drops a contractor whose role was revoked", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { milestoneId } = await fundedMilestone(d, "LEDGER");
      await d.access.revokeRole(d.roles.CONTRACTOR, d.contractor.address);
      await expect(d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG)).to.be.revertedWithCustomError(
        d.escrow,
        "Unauthorized",
      );
    });

    it("validates proof data and status", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { milestoneId } = await fundedMilestone(d, "LEDGER");
      const c = d.escrow.connect(d.contractor);
      await expect(c.submitProof(milestoneId, "", h("p"), LAT, LNG)).to.be.revertedWithCustomError(d.escrow, "InvalidMetadata");
      await expect(c.submitProof(milestoneId, CID, ethers.ZeroHash, LAT, LNG)).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidMetadata",
      );
      await expect(c.submitProof(milestoneId, CID, h("p"), 90_000_001, LNG)).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidCoordinates",
      );
      await expect(c.submitProof(milestoneId, CID, h("p"), LAT, -180_000_001)).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidCoordinates",
      );
      await expect(c.submitProof(99, CID, h("p"), LAT, LNG)).to.be.revertedWithCustomError(d.escrow, "MilestoneNotFound");
      await c.submitProof(milestoneId, CID, h("p"), LAT, LNG);
      await expect(c.submitProof(milestoneId, CID, h("p2"), LAT, LNG)).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidMilestoneStatus",
      );
    });
  });

  describe("approval & rejection (H-4, M-2)", function () {
    it("needs the project's threshold of distinct auditors", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { projectId, milestoneId } = await fundedMilestone(d, "LEDGER");
      await d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG);
      await expect(d.escrow.connect(d.auditor1).approveMilestone(milestoneId))
        .to.emit(d.escrow, "MilestoneApproved")
        .withArgs(milestoneId, projectId, d.auditor1.address, 1, 0);
      expect((await d.escrow.getMilestone(milestoneId)).status).to.equal(MStatus.PROOF_SUBMITTED);
      await expect(d.escrow.connect(d.auditor1).approveMilestone(milestoneId)).to.be.revertedWithCustomError(
        d.escrow,
        "AlreadyApproved",
      );
      await expect(d.escrow.connect(d.auditor2).approveMilestone(milestoneId))
        .to.emit(d.escrow, "MilestoneStatusChanged")
        .withArgs(milestoneId, projectId, MStatus.APPROVED);
      await expect(d.escrow.connect(d.auditor3).approveMilestone(milestoneId)).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidMilestoneStatus",
      );
    });

    it("blocks conflicted approvers (project official or contractor holding AUDITOR)", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { milestoneId } = await fundedMilestone(d, "LEDGER");
      await d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG);
      for (const who of [d.official, d.contractor]) {
        await d.access.grantRole(d.roles.AUDITOR, who.address);
        await d.access.setWardAccess(who.address, 42, true);
        await expect(d.escrow.connect(who).approveMilestone(milestoneId))
          .to.be.revertedWithCustomError(d.escrow, "ConflictOfInterest")
          .withArgs(who.address);
      }
    });

    it("rejection starts a fresh approval round without looping over approvers", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { projectId, milestoneId } = await fundedMilestone(d, "LEDGER");
      await d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG);
      await d.escrow.connect(d.auditor1).approveMilestone(milestoneId);
      expect(await d.escrow.hasApproved(milestoneId, d.auditor1.address)).to.equal(true);

      await expect(d.escrow.connect(d.auditor2).rejectMilestone(milestoneId, h("blurry photos")))
        .to.emit(d.escrow, "MilestoneRejected")
        .withArgs(milestoneId, projectId, d.auditor2.address, h("blurry photos"), 0);
      const m = await d.escrow.getMilestone(milestoneId);
      expect(m.status).to.equal(MStatus.REJECTED);
      expect(m.round).to.equal(1);
      expect(m.approvalCount).to.equal(0);
      expect(await d.escrow.hasApproved(milestoneId, d.auditor1.address)).to.equal(false);

      await expect(d.escrow.connect(d.auditor1).approveMilestone(milestoneId)).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidMilestoneStatus",
      );
      await d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p2"), LAT, LNG);
      await d.escrow.connect(d.auditor1).approveMilestone(milestoneId); // allowed again in round 1
      await d.escrow.connect(d.auditor2).approveMilestone(milestoneId);
      expect((await d.escrow.getMilestone(milestoneId)).status).to.equal(MStatus.APPROVED);

      // an APPROVED milestone can still be pulled back before release
      await d.escrow.connect(d.auditor3).rejectMilestone(milestoneId, h("site visit failed"));
      expect((await d.escrow.getMilestone(milestoneId)).status).to.equal(MStatus.REJECTED);
    });

    it("rejection is allowed while PAUSED but not for pending milestones or closed projects", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { projectId, milestoneId } = await fundedMilestone(d, "LEDGER");
      await expect(d.escrow.connect(d.auditor1).rejectMilestone(milestoneId, h("x"))).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidMilestoneStatus",
      );
      await d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG);
      await d.registry.connect(d.auditor1).pauseProject(projectId, h("x"));
      await d.escrow.connect(d.auditor1).rejectMilestone(milestoneId, h("x"));
      await d.registry.connect(d.official).requestCancel(projectId, h("x"));
      await d.registry.connect(d.auditor1).confirmCancel(projectId);
      await expect(d.escrow.connect(d.auditor1).rejectMilestone(milestoneId, h("x"))).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidProjectStatus",
      );
    });
  });

  describe("PAUSED projects (H-2)", function () {
    it("block proofs, approvals and releases", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { projectId, milestoneId } = await fundedMilestone(d, "LEDGER");
      await d.registry.connect(d.auditor1).pauseProject(projectId, h("x"));
      await expect(d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG))
        .to.be.revertedWithCustomError(d.escrow, "ProjectNotActive")
        .withArgs(projectId, Status.PAUSED);
      await d.registry.connect(d.auditor1).resumeProject(projectId);
      await d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG);
      await d.escrow.connect(d.auditor1).approveMilestone(milestoneId);
      await d.registry.connect(d.auditor1).pauseProject(projectId, h("x"));
      await expect(d.escrow.connect(d.auditor2).approveMilestone(milestoneId)).to.be.revertedWithCustomError(
        d.escrow,
        "ProjectNotActive",
      );
      await d.registry.connect(d.auditor1).resumeProject(projectId);
      await d.escrow.connect(d.auditor2).approveMilestone(milestoneId);
      await d.registry.connect(d.auditor1).pauseProject(projectId, h("x"));
      await expect(d.escrow.connect(d.official).releaseFunds(milestoneId, h("UTR"))).to.be.revertedWithCustomError(
        d.escrow,
        "ProjectNotActive",
      );
    });
  });

  describe("releaseFunds", function () {
    async function approved(d: Awaited<ReturnType<typeof ledger>>, mode: "LEDGER" | "ESCROW") {
      const ids = await fundedMilestone(d, mode);
      await d.escrow.connect(d.contractor).submitProof(ids.milestoneId, CID, h("p"), LAT, LNG);
      await d.escrow.connect(d.auditor1).approveMilestone(ids.milestoneId);
      await d.escrow.connect(d.auditor2).approveMilestone(ids.milestoneId);
      return ids;
    }

    it("LEDGER: requires the payment reference and updates spend", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { projectId, milestoneId } = await approved(d, "LEDGER");
      await expect(d.escrow.connect(d.official).releaseFunds(milestoneId, ethers.ZeroHash)).to.be.revertedWithCustomError(
        d.escrow,
        "MissingReference",
      );
      await expect(d.escrow.connect(d.auditor1).releaseFunds(milestoneId, h("UTR"))).to.be.revertedWithCustomError(
        d.escrow,
        "Unauthorized",
      );
      await expect(d.escrow.connect(d.official).releaseFunds(milestoneId, h("UTR-9981")))
        .to.emit(d.escrow, "FundsReleased")
        .withArgs(milestoneId, projectId, d.contractor.address, 400_000n, h("UTR-9981"))
        .and.to.emit(d.registry, "SpentUpdated")
        .withArgs(projectId, 400_000n);
      const f = await d.escrow.funds(projectId);
      expect(f.balance).to.equal(600_000n);
      expect(f.allocated).to.equal(0n);
      expect(f.unsettled).to.equal(0n);
      expect((await d.registry.getProject(projectId)).spent).to.equal(400_000n);
      await expect(d.escrow.connect(d.official).releaseFunds(milestoneId, h("UTR"))).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidMilestoneStatus",
      );
    });

    it("ESCROW: pays the contractor in native coin", async function () {
      const d = await networkHelpers.loadFixture(escrowMode);
      const { milestoneId } = await approved(d, "ESCROW");
      await expect(d.escrow.connect(d.official).releaseFunds(milestoneId, ethers.ZeroHash)).to.changeEtherBalances(
        ethers,
        [d.escrow, d.contractor],
        [-400_000n, 400_000n],
      );
    });

    it("ESCROW: reverts cleanly when the contractor can't receive", async function () {
      const d = await networkHelpers.loadFixture(escrowMode);
      const receiver = await ethers.deployContract("RejectingReceiver");
      const rAddr = await receiver.getAddress();
      await d.access.grantRole(d.roles.CONTRACTOR, rAddr);
      const projectId = await activeProject(d, { contractor: rAddr });
      await d.escrow.connect(d.official).fundProject(projectId, { value: 100n });
      await d.escrow.connect(d.official).createMilestone(projectId, h("m"), CID, 100n);
      const mId = await d.escrow.milestoneCount();
      await receiver.call(
        await d.escrow.getAddress(),
        d.escrow.interface.encodeFunctionData("submitProof", [mId, CID, h("p"), LAT, LNG]),
      );
      await d.escrow.connect(d.auditor1).approveMilestone(mId);
      await d.escrow.connect(d.auditor2).approveMilestone(mId);
      await expect(d.escrow.connect(d.official).releaseFunds(mId, ethers.ZeroHash))
        .to.be.revertedWithCustomError(d.escrow, "TransferFailed")
        .withArgs(rAddr, 100n);
    });
  });

  describe("cancelMilestone & refundUnallocated (H-1)", function () {
    it("voids PENDING milestones and frees the allocation", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { projectId, milestoneId } = await fundedMilestone(d, "LEDGER");
      await expect(d.escrow.connect(d.official).cancelMilestone(milestoneId, h("scope change")))
        .to.emit(d.escrow, "MilestoneVoided")
        .withArgs(milestoneId, projectId, h("scope change"));
      const f = await d.escrow.funds(projectId);
      expect(f.allocated).to.equal(0n);
      expect(f.unsettled).to.equal(0n);
      await expect(d.escrow.connect(d.official).cancelMilestone(milestoneId, h("x"))).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidMilestoneStatus",
      );
    });

    it("cannot void submitted work on a live project", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { milestoneId } = await fundedMilestone(d, "LEDGER");
      await d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG);
      await expect(d.escrow.connect(d.official).cancelMilestone(milestoneId, h("x"))).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidMilestoneStatus",
      );
    });

    it("ESCROW: on cancellation, voids open milestones and refunds everything to the treasury", async function () {
      const d = await networkHelpers.loadFixture(escrowMode);
      const { projectId, milestoneId } = await fundedMilestone(d, "ESCROW");
      await d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG);
      await expect(d.escrow.connect(d.official).refundUnallocated(projectId)).to.be.revertedWithCustomError(
        d.escrow,
        "InvalidProjectStatus",
      );
      await d.registry.connect(d.official).requestCancel(projectId, h("x"));
      await d.registry.connect(d.auditor1).confirmCancel(projectId);

      await d.escrow.connect(d.official).cancelMilestone(milestoneId, h("project cancelled"));
      const refund = d.escrow.connect(d.official).refundUnallocated(projectId);
      await expect(refund).to.emit(d.escrow, "UnallocatedRefunded").withArgs(projectId, d.treasury.address, 1_000_000n);
      await expect(refund).to.changeEtherBalances(ethers, [d.escrow, d.treasury], [-1_000_000n, 1_000_000n]);
      await expect(d.escrow.connect(d.official).refundUnallocated(projectId)).to.be.revertedWithCustomError(
        d.escrow,
        "NothingToRefund",
      );
    });

    it("LEDGER: refunds the unspent balance of a COMPLETED project as a ledger entry", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { projectId, milestoneId } = await fundedMilestone(d, "LEDGER");
      await d.escrow.connect(d.contractor).submitProof(milestoneId, CID, h("p"), LAT, LNG);
      await d.escrow.connect(d.auditor1).approveMilestone(milestoneId);
      await d.escrow.connect(d.auditor2).approveMilestone(milestoneId);
      await d.escrow.connect(d.official).releaseFunds(milestoneId, h("UTR"));
      await d.registry.connect(d.official).closeProject(projectId);
      await expect(d.escrow.connect(d.official).refundUnallocated(projectId))
        .to.emit(d.escrow, "UnallocatedRefunded")
        .withArgs(projectId, d.treasury.address, 600_000n);
      expect((await d.escrow.funds(projectId)).balance).to.equal(0n);
    });
  });

  describe("initialization", function () {
    it("rejects zero registry or treasury", async function () {
      const d = await networkHelpers.loadFixture(ledger);
      const { upgradesApi } = await import("./helpers/fixture.js");
      const Escrow = await ethers.getContractFactory("MilestoneEscrow");
      const accessAddr = await d.access.getAddress();
      await expect(
        upgradesApi.deployProxy(Escrow, [accessAddr, ethers.ZeroAddress, 0, d.treasury.address], { kind: "uups" }),
      ).to.be.revertedWithCustomError(Escrow, "ZeroAddress");
      await expect(
        upgradesApi.deployProxy(Escrow, [accessAddr, await d.registry.getAddress(), 0, ethers.ZeroAddress], { kind: "uups" }),
      ).to.be.revertedWithCustomError(Escrow, "ZeroAddress");
    });

    it("exposes mode and treasury", async function () {
      const d = await networkHelpers.loadFixture(escrowMode);
      expect(await d.escrow.mode()).to.equal(1n);
      expect(await d.escrow.treasury()).to.equal(d.treasury.address);
      await expect(d.escrow.hasApproved(5, d.auditor1.address)).to.be.revertedWithCustomError(d.escrow, "MilestoneNotFound");
    });
  });
});
