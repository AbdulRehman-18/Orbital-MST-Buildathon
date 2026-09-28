import { expect } from "chai";
import {
  activeProject,
  CID,
  DAY,
  deployWithRoles,
  ethers,
  fundedMilestone,
  h,
  MStatus,
  networkHelpers,
  newProjectParams,
  OTHER_WARD,
  Status,
  WARD,
} from "./helpers/fixture.js";

async function fixture() {
  return deployWithRoles("LEDGER");
}

describe("ProjectRegistry", function () {
  describe("createProject", function () {
    it("creates a PENDING_APPROVAL project and emits the full record for the indexer", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const params = await newProjectParams();
      await expect(d.registry.connect(d.official).createProject(params))
        .to.emit(d.registry, "ProjectCreated")
        .withArgs(
          1n,
          d.official.address,
          WARD,
          params.metaHash,
          CID,
          params.category,
          params.departmentId,
          params.latE6,
          params.lngE6,
          params.budget,
          params.startDate,
          params.endDate,
          ethers.ZeroAddress,
          2,
        );
      const p = await d.registry.getProject(1);
      expect(p.status).to.equal(Status.PENDING_APPROVAL);
      expect(p.official).to.equal(d.official.address);
      expect(p.metaHash).to.equal(params.metaHash); // CID lives in the event only (ADR 0008)
      expect(await d.registry.exists(1)).to.equal(true);
      expect(await d.registry.exists(2)).to.equal(false);
      expect(await d.registry.exists(0)).to.equal(false);
    });

    it("requires an official of the project's ward", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const params = await newProjectParams();
      await expect(d.registry.connect(d.outsider).createProject(params))
        .to.be.revertedWithCustomError(d.registry, "Unauthorized")
        .withArgs(d.outsider.address, d.roles.OFFICIAL);
      await expect(d.registry.connect(d.officialOtherWard).createProject(params))
        .to.be.revertedWithCustomError(d.registry, "NotInWard")
        .withArgs(d.officialOtherWard.address, WARD);
    });

    it("validates metadata, budget, dates, coordinates, threshold and contractor", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const r = d.registry.connect(d.official);
      const now = await networkHelpers.time.latest();
      const cases: [Partial<Record<string, unknown>>, string][] = [
        [{ metaHash: ethers.ZeroHash }, "InvalidMetadata"],
        [{ metaCID: "" }, "InvalidMetadata"],
        [{ budget: 0n }, "InvalidBudget"],
        [{ endDate: BigInt(now - 1) }, "InvalidDates"],
        [{ startDate: BigInt(now + 10 * DAY), endDate: BigInt(now + 5 * DAY) }, "InvalidDates"],
        [{ latE6: 90_000_001 }, "InvalidCoordinates"],
        [{ latE6: -90_000_001 }, "InvalidCoordinates"],
        [{ lngE6: 180_000_001 }, "InvalidCoordinates"],
        [{ lngE6: -180_000_001 }, "InvalidCoordinates"],
        [{ approvalThreshold: 0 }, "InvalidThreshold"],
        [{ approvalThreshold: 4 }, "InvalidThreshold"], // only 3 auditors exist
        [{ approvalThreshold: 8 }, "InvalidThreshold"], // above MAX_APPROVAL_THRESHOLD
        [{ contractor: d.outsider.address }, "NotAContractor"],
      ];
      for (const [overrides, error] of cases) {
        await expect(r.createProject(await newProjectParams(overrides)), error).to.be.revertedWithCustomError(
          d.registry,
          error,
        );
      }
    });

    it("is blocked by the global pause", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await d.access.pause();
      await expect(
        d.registry.connect(d.official).createProject(await newProjectParams()),
      ).to.be.revertedWithCustomError(d.registry, "SystemPaused");
      await d.access.unpause();
      await d.registry.connect(d.official).createProject(await newProjectParams());
    });
  });

  describe("approval (M-of-N)", function () {
    it("stays pending until the threshold of distinct ward auditors approve", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await d.registry.connect(d.official).createProject(await newProjectParams({ approvalThreshold: 3 }));
      await expect(d.registry.connect(d.auditor1).approveProject(1))
        .to.emit(d.registry, "ProjectApproved")
        .withArgs(1n, d.auditor1.address, 1);
      await d.registry.connect(d.auditor2).approveProject(1);
      expect((await d.registry.getProject(1)).status).to.equal(Status.PENDING_APPROVAL);
      await expect(d.registry.connect(d.auditor3).approveProject(1))
        .to.emit(d.registry, "ProjectStatusChanged")
        .withArgs(1n, Status.ACTIVE);
      expect(await d.registry.hasApprovedProject(1, d.auditor3.address)).to.equal(true);
    });

    it("rejects duplicate approvals, non-auditors, wrong ward, self-approval and non-pending projects", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await d.registry.connect(d.official).createProject(await newProjectParams());
      await d.registry.connect(d.auditor1).approveProject(1);
      await expect(d.registry.connect(d.auditor1).approveProject(1)).to.be.revertedWithCustomError(
        d.registry,
        "AlreadyApproved",
      );
      await expect(d.registry.connect(d.outsider).approveProject(1)).to.be.revertedWithCustomError(
        d.registry,
        "Unauthorized",
      );
      // auditor with access to OTHER_WARD only
      await d.access.grantRole(d.roles.AUDITOR, d.contractor2.address);
      await d.access.setWardAccess(d.contractor2.address, OTHER_WARD, true);
      await expect(d.registry.connect(d.contractor2).approveProject(1)).to.be.revertedWithCustomError(
        d.registry,
        "NotInWard",
      );
      // an official who is also an auditor can't approve their own project
      await d.access.grantRole(d.roles.AUDITOR, d.official.address);
      await expect(d.registry.connect(d.official).approveProject(1)).to.be.revertedWithCustomError(
        d.registry,
        "SelfApproval",
      );
      await d.registry.connect(d.auditor2).approveProject(1);
      await expect(d.registry.connect(d.auditor3).approveProject(1)).to.be.revertedWithCustomError(
        d.registry,
        "InvalidStatus",
      );
      await expect(d.registry.connect(d.auditor1).approveProject(99)).to.be.revertedWithCustomError(
        d.registry,
        "ProjectNotFound",
      );
    });

    it("lets an auditor reject a pending project", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await d.registry.connect(d.official).createProject(await newProjectParams());
      await expect(d.registry.connect(d.auditor1).rejectProject(1, h("incomplete DPR")))
        .to.emit(d.registry, "ProjectRejected")
        .withArgs(1n, d.auditor1.address, h("incomplete DPR"));
      expect((await d.registry.getProject(1)).status).to.equal(Status.CANCELLED);
      await expect(d.registry.connect(d.auditor2).rejectProject(1, h("x"))).to.be.revertedWithCustomError(
        d.registry,
        "InvalidStatus",
      );
    });
  });

  describe("pause / resume", function () {
    it("auditor pauses an ACTIVE project and resumes it", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const id = await activeProject(d);
      await expect(d.registry.connect(d.auditor1).pauseProject(id, h("citizen complaint")))
        .to.emit(d.registry, "ProjectPaused")
        .withArgs(id, d.auditor1.address, h("citizen complaint"), 0n);
      expect((await d.registry.getProject(id)).status).to.equal(Status.PAUSED);
      await expect(d.registry.connect(d.auditor1).pauseProject(id, h("again"))).to.be.revertedWithCustomError(
        d.registry,
        "InvalidStatus",
      );
      await expect(d.registry.connect(d.auditor2).resumeProject(id))
        .to.emit(d.registry, "ProjectResumed")
        .withArgs(id, d.auditor2.address);
      expect((await d.registry.getProject(id)).status).to.equal(Status.ACTIVE);
      await expect(d.registry.connect(d.auditor2).resumeProject(id)).to.be.revertedWithCustomError(
        d.registry,
        "InvalidStatus",
      );
    });

    it("pauseByGrievance is callable only by the grievance registry", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const id = await activeProject(d);
      await expect(d.registry.connect(d.auditor1).pauseByGrievance(id, 1)).to.be.revertedWithCustomError(
        d.registry,
        "OnlyGrievanceRegistry",
      );
    });
  });

  describe("cancellation (official + auditor)", function () {
    it("needs the project's official to request and an auditor to confirm", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const id = await activeProject(d);
      await expect(d.registry.connect(d.auditor1).confirmCancel(id)).to.be.revertedWithCustomError(
        d.registry,
        "CancelNotRequested",
      );
      // another official in the ward is not the project's official
      await d.access.setWardAccess(d.officialOtherWard.address, WARD, true);
      await expect(d.registry.connect(d.officialOtherWard).requestCancel(id, h("x")))
        .to.be.revertedWithCustomError(d.registry, "NotProjectOfficial")
        .withArgs(id, d.officialOtherWard.address);

      await expect(d.registry.connect(d.official).requestCancel(id, h("land dispute")))
        .to.emit(d.registry, "ProjectCancelRequested")
        .withArgs(id, d.official.address, h("land dispute"));
      await expect(d.registry.connect(d.auditor1).confirmCancel(id))
        .to.emit(d.registry, "ProjectCancelled")
        .withArgs(id, d.auditor1.address);
      expect((await d.registry.getProject(id)).status).to.equal(Status.CANCELLED);
      await expect(d.registry.connect(d.official).requestCancel(id, h("x"))).to.be.revertedWithCustomError(
        d.registry,
        "InvalidStatus",
      );
      await expect(d.registry.connect(d.auditor1).confirmCancel(id)).to.be.revertedWithCustomError(
        d.registry,
        "InvalidStatus",
      );
    });

    it("works on a PAUSED project too", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const id = await activeProject(d);
      await d.registry.connect(d.auditor1).pauseProject(id, h("x"));
      await d.registry.connect(d.official).requestCancel(id, h("x"));
      await d.registry.connect(d.auditor2).confirmCancel(id);
      expect((await d.registry.getProject(id)).status).to.equal(Status.CANCELLED);
    });
  });

  describe("closeProject (M-1)", function () {
    it("requires at least one milestone and all milestones settled", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const id = await activeProject(d);
      await expect(d.registry.connect(d.official).closeProject(id)).to.be.revertedWithCustomError(
        d.registry,
        "NoMilestones",
      );

      await d.escrow.connect(d.official).recordSanction(id, 500_000n, h("sanction"));
      await d.escrow.connect(d.official).createMilestone(id, h("m"), CID, 100_000n);
      const mId = await d.escrow.milestoneCount();
      await expect(d.registry.connect(d.official).closeProject(id))
        .to.be.revertedWithCustomError(d.registry, "MilestonesUnsettled")
        .withArgs(id, 1n);

      await d.escrow.connect(d.contractor).submitProof(mId, CID, h("proof"), 12_971_599, 77_594_566);
      await d.escrow.connect(d.auditor1).approveMilestone(mId);
      await d.escrow.connect(d.auditor2).approveMilestone(mId);
      await d.escrow.connect(d.official).releaseFunds(mId, h("UTR123"));
      expect((await d.escrow.getMilestone(mId)).status).to.equal(MStatus.PAID);

      await expect(d.registry.connect(d.official).closeProject(id))
        .to.emit(d.registry, "ProjectClosed")
        .withArgs(id, d.official.address);
      expect((await d.registry.getProject(id)).status).to.equal(Status.COMPLETED);
    });

    it("only closes ACTIVE projects", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await d.registry.connect(d.official).createProject(await newProjectParams());
      await expect(d.registry.connect(d.official).closeProject(1)).to.be.revertedWithCustomError(
        d.registry,
        "InvalidStatus",
      );
    });
  });

  describe("assignContractor", function () {
    it("lets a ward official assign once, to a CONTRACTOR", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await d.registry.connect(d.official).createProject(await newProjectParams());
      await expect(d.registry.connect(d.official).assignContractor(1, d.outsider.address))
        .to.be.revertedWithCustomError(d.registry, "NotAContractor")
        .withArgs(d.outsider.address);
      await expect(d.registry.connect(d.official).assignContractor(1, d.contractor.address))
        .to.emit(d.registry, "ContractorAssigned")
        .withArgs(1n, d.contractor.address, d.official.address);
      await expect(
        d.registry.connect(d.official).assignContractor(1, d.contractor2.address),
      ).to.be.revertedWithCustomError(d.registry, "ContractorAlreadyAssigned");
      await expect(
        d.registry.connect(d.officialOtherWard).assignContractor(1, d.contractor2.address),
      ).to.be.revertedWithCustomError(d.registry, "NotInWard");
    });

    it("is blocked for officials while a tender is open, and for closed projects", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await d.registry.connect(d.official).createProject(await newProjectParams());
      const now = await networkHelpers.time.latest();
      await d.tender.connect(d.official).publishTender(1, CID, now + DAY, now + 2 * DAY);
      await expect(d.registry.connect(d.official).assignContractor(1, d.contractor.address))
        .to.be.revertedWithCustomError(d.registry, "TenderInProgress")
        .withArgs(1n);

      await d.registry.connect(d.official).createProject(await newProjectParams());
      await d.registry.connect(d.auditor1).rejectProject(2, h("x"));
      await expect(
        d.registry.connect(d.official).assignContractor(2, d.contractor.address),
      ).to.be.revertedWithCustomError(d.registry, "InvalidStatus");
    });
  });

  describe("escrow hooks (C-1)", function () {
    it("only the escrow can record milestones and spend", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const id = await activeProject(d);
      await expect(d.registry.connect(d.official).recordSpent(id, 1)).to.be.revertedWithCustomError(
        d.registry,
        "OnlyEscrow",
      );
      await expect(d.registry.connect(d.outsider).recordMilestoneCreated(id)).to.be.revertedWithCustomError(
        d.registry,
        "OnlyEscrow",
      );
    });

    it("never lets spend exceed budget even via the escrow", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const id = await activeProject(d);
      const escrowAddr = await d.escrow.getAddress();
      await networkHelpers.setBalance(escrowAddr, ethers.parseEther("1"));
      const asEscrow = await ethers.getImpersonatedSigner(escrowAddr);
      await expect(d.registry.connect(asEscrow).recordSpent(id, 1_000_001n))
        .to.be.revertedWithCustomError(d.registry, "BudgetExceeded")
        .withArgs(id);
      await expect(d.registry.connect(asEscrow).recordSpent(99, 1)).to.be.revertedWithCustomError(
        d.registry,
        "ProjectNotFound",
      );
    });
  });

  describe("wiring guards", function () {
    it("only ADMIN wires, never to zero, and only once", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const Registry = await ethers.getContractFactory("ProjectRegistry");
      const fresh = await (await import("./helpers/fixture.js")).upgradesApi.deployProxy(
        Registry,
        [await d.access.getAddress()],
        { kind: "uups" },
      );
      const r = await ethers.getContractAt("ProjectRegistry", await fresh.getAddress());
      await expect(r.connect(d.outsider).setEscrow(d.outsider.address)).to.be.revertedWithCustomError(
        r,
        "Unauthorized",
      );
      await expect(r.setEscrow(ethers.ZeroAddress)).to.be.revertedWithCustomError(r, "ZeroAddress");
      await expect(r.setTenderRegistry(ethers.ZeroAddress)).to.be.revertedWithCustomError(r, "ZeroAddress");
      await expect(r.setGrievanceRegistry(ethers.ZeroAddress)).to.be.revertedWithCustomError(r, "ZeroAddress");
      await expect(r.setGrievanceRegistry(d.outsider.address))
        .to.emit(r, "LinkedContractSet")
        .withArgs(ethers.encodeBytes32String("GRIEVANCE"), d.outsider.address);
    });

    it("rejects a zero access address at initialization", async function () {
      await networkHelpers.loadFixture(fixture);
      const { upgradesApi } = await import("./helpers/fixture.js");
      const Registry = await ethers.getContractFactory("ProjectRegistry");
      await expect(upgradesApi.deployProxy(Registry, [ethers.ZeroAddress], { kind: "uups" })).to.be.revertedWithCustomError(
        Registry,
        "ZeroAddress",
      );
    });
  });

  it("fundedMilestone helper leaves one PENDING milestone", async function () {
    const d = await networkHelpers.loadFixture(fixture);
    const { projectId, milestoneId } = await fundedMilestone(d, "LEDGER");
    expect((await d.registry.getProject(projectId)).milestoneCount).to.equal(1);
    expect((await d.escrow.getMilestone(milestoneId)).status).to.equal(MStatus.PENDING);
  });
});
