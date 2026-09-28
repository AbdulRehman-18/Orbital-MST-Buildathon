import { expect } from "chai";
import { CID, DAY, deployWithRoles, ethers, h, networkHelpers, newProjectParams, type Deployed } from "./helpers/fixture.js";

const T = { OPEN: 0, AWARDED: 1, CANCELLED: 2 } as const;
const salt = (n: number) => h(`salt-${n}`);

async function fixture() {
  const d = await deployWithRoles("LEDGER");
  await d.registry.connect(d.official).createProject(await newProjectParams()); // no contractor
  const projectId = await d.registry.projectCount();
  const now = await networkHelpers.time.latest();
  const commitDeadline = now + 2 * DAY;
  const revealDeadline = now + 4 * DAY;
  await d.tender.connect(d.official).publishTender(projectId, CID, commitDeadline, revealDeadline);
  return { ...d, projectId, tenderId: 1n, commitDeadline, revealDeadline };
}

async function commit(d: Deployed, who: Deployed["contractor"], tenderId: bigint, amount: bigint, s: string) {
  const hash = await d.tender.computeCommitment(tenderId, who.address, amount, s);
  await d.tender.connect(who).commitBid(tenderId, hash);
}

describe("TenderRegistry", function () {
  describe("publishTender", function () {
    it("publishes for a ward project without contractor and blocks direct assignment", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const t = await d.tender.getTender(d.tenderId);
      expect(t.status).to.equal(T.OPEN);
      expect(t.projectId).to.equal(d.projectId);
      expect(await d.tender.hasOpenTender(d.projectId)).to.equal(true);
      expect(await d.tender.openTenderOf(d.projectId)).to.equal(d.tenderId);
    });

    it("validates project, deadlines, metadata and duplicates", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const now = await networkHelpers.time.latest();
      await expect(d.tender.connect(d.official).publishTender(d.projectId, CID, now + DAY, now + 2 * DAY))
        .to.be.revertedWithCustomError(d.tender, "TenderAlreadyOpen")
        .withArgs(d.projectId, d.tenderId);

      await d.registry.connect(d.official).createProject(await newProjectParams());
      const p2 = await d.registry.projectCount();
      const o = d.tender.connect(d.official);
      await expect(o.publishTender(p2, CID, now - 1, now + DAY)).to.be.revertedWithCustomError(d.tender, "InvalidDeadlines");
      await expect(o.publishTender(p2, CID, now + DAY, now + DAY)).to.be.revertedWithCustomError(d.tender, "InvalidDeadlines");
      await expect(o.publishTender(p2, "", now + DAY, now + 2 * DAY)).to.be.revertedWithCustomError(d.tender, "InvalidMetadata");
      await expect(
        d.tender.connect(d.officialOtherWard).publishTender(p2, CID, now + DAY, now + 2 * DAY),
      ).to.be.revertedWithCustomError(d.tender, "NotInWard");

      await d.registry.connect(d.official).createProject(await newProjectParams({ contractor: d.contractor.address }));
      const withContractor = await d.registry.projectCount();
      await expect(o.publishTender(withContractor, CID, now + DAY, now + 2 * DAY))
        .to.be.revertedWithCustomError(d.tender, "InvalidProjectForTender")
        .withArgs(withContractor);
    });
  });

  describe("commit / reveal / award", function () {
    it("awards the lowest revealed bid and assigns the contractor on the registry", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await commit(d, d.contractor, d.tenderId, 900_000n, salt(1));
      await commit(d, d.contractor2, d.tenderId, 850_000n, salt(2));
      expect(await d.tender.getBidders(d.tenderId)).to.deep.equal([d.contractor.address, d.contractor2.address]);

      await expect(d.tender.connect(d.contractor).revealBid(d.tenderId, 900_000n, salt(1)))
        .to.be.revertedWithCustomError(d.tender, "NotInRevealPhase");
      await networkHelpers.time.increaseTo(d.commitDeadline + 1);
      await expect(d.tender.connect(d.contractor).commitBid(d.tenderId, h("late"))).to.be.revertedWithCustomError(
        d.tender,
        "CommitPhaseOver",
      );

      await expect(d.tender.connect(d.contractor).revealBid(d.tenderId, 900_000n, salt(1)))
        .to.emit(d.tender, "BidRevealed")
        .withArgs(d.tenderId, d.contractor.address, 900_000n);
      await d.tender.connect(d.contractor2).revealBid(d.tenderId, 850_000n, salt(2));

      await expect(d.tender.connect(d.official).awardTender(d.tenderId)).to.be.revertedWithCustomError(
        d.tender,
        "RevealPhaseNotOver",
      );
      await networkHelpers.time.increaseTo(d.revealDeadline + 1);
      await expect(d.tender.connect(d.official).awardTender(d.tenderId))
        .to.emit(d.tender, "TenderAwarded")
        .withArgs(d.tenderId, d.projectId, d.contractor2.address, 850_000n)
        .and.to.emit(d.registry, "ContractorAssigned")
        .withArgs(d.projectId, d.contractor2.address, await d.tender.getAddress());

      expect((await d.registry.getProject(d.projectId)).contractor).to.equal(d.contractor2.address);
      expect(await d.tender.hasOpenTender(d.projectId)).to.equal(false);
      const t = await d.tender.getTender(d.tenderId);
      expect(t.status).to.equal(T.AWARDED);
      expect(t.revealedCount).to.equal(2);
      await expect(d.tender.connect(d.official).awardTender(d.tenderId)).to.be.revertedWithCustomError(
        d.tender,
        "TenderNotOpen",
      );
    });

    it("keeps the earlier reveal on a tie and ignores higher bids", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await commit(d, d.contractor, d.tenderId, 700_000n, salt(1));
      await commit(d, d.contractor2, d.tenderId, 700_000n, salt(2));
      await networkHelpers.time.increaseTo(d.commitDeadline + 1);
      await d.tender.connect(d.contractor2).revealBid(d.tenderId, 700_000n, salt(2));
      await d.tender.connect(d.contractor).revealBid(d.tenderId, 700_000n, salt(1));
      expect((await d.tender.getTender(d.tenderId)).winner).to.equal(d.contractor2.address);
    });

    it("rejects bad reveals", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await commit(d, d.contractor, d.tenderId, 500_000n, salt(1));
      await commit(d, d.contractor2, d.tenderId, 2_000_000n, salt(2)); // above budget
      await networkHelpers.time.increaseTo(d.commitDeadline + 1);
      await expect(d.tender.connect(d.contractor).revealBid(d.tenderId, 400_000n, salt(1))).to.be.revertedWithCustomError(
        d.tender,
        "CommitmentMismatch",
      );
      await expect(d.tender.connect(d.outsider).revealBid(d.tenderId, 1n, salt(1))).to.be.revertedWithCustomError(
        d.tender,
        "NoCommitment",
      );
      await expect(d.tender.connect(d.contractor2).revealBid(d.tenderId, 2_000_000n, salt(2)))
        .to.be.revertedWithCustomError(d.tender, "InvalidBidAmount")
        .withArgs(2_000_000n);
      await d.tender.connect(d.contractor).revealBid(d.tenderId, 500_000n, salt(1));
      await expect(d.tender.connect(d.contractor).revealBid(d.tenderId, 500_000n, salt(1))).to.be.revertedWithCustomError(
        d.tender,
        "AlreadyRevealed",
      );
      await networkHelpers.time.increaseTo(d.revealDeadline + 1);
      await expect(d.tender.connect(d.contractor).revealBid(d.tenderId, 500_000n, salt(1))).to.be.revertedWithCustomError(
        d.tender,
        "NotInRevealPhase",
      );
    });

    it("a commitment can't be copied by another bidder", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const hash = await d.tender.computeCommitment(d.tenderId, d.contractor.address, 500_000n, salt(1));
      await d.tender.connect(d.contractor).commitBid(d.tenderId, hash);
      await d.tender.connect(d.contractor2).commitBid(d.tenderId, hash); // copy
      await networkHelpers.time.increaseTo(d.commitDeadline + 1);
      await expect(d.tender.connect(d.contractor2).revealBid(d.tenderId, 500_000n, salt(1))).to.be.revertedWithCustomError(
        d.tender,
        "CommitmentMismatch",
      );
    });

    it("restricts bidding to contractors other than the project's official, and allows re-commit", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await expect(d.tender.connect(d.outsider).commitBid(d.tenderId, h("x"))).to.be.revertedWithCustomError(
        d.tender,
        "Unauthorized",
      );
      await d.access.grantRole(d.roles.CONTRACTOR, d.official.address);
      await expect(d.tender.connect(d.official).commitBid(d.tenderId, h("x")))
        .to.be.revertedWithCustomError(d.tender, "ConflictOfInterest")
        .withArgs(d.official.address);
      await expect(d.tender.connect(d.contractor).commitBid(d.tenderId, ethers.ZeroHash)).to.be.revertedWithCustomError(
        d.tender,
        "CommitmentMismatch",
      );
      await d.tender.connect(d.contractor).commitBid(d.tenderId, h("first"));
      await d.tender.connect(d.contractor).commitBid(d.tenderId, h("second"));
      expect((await d.tender.getTender(d.tenderId)).bidCount).to.equal(1);
      expect((await d.tender.getBid(d.tenderId, d.contractor.address)).commitHash).to.equal(h("second"));
    });

    it("caps the number of bidders", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const max = Number(await d.tender.MAX_BIDDERS());
      for (let i = 0; i < max; i++) {
        const w = ethers.Wallet.createRandom().connect(ethers.provider);
        await networkHelpers.setBalance(w.address, ethers.parseEther("1"));
        await d.access.grantRole(d.roles.CONTRACTOR, w.address);
        await d.tender.connect(w).commitBid(d.tenderId, h(`bid-${i}`));
      }
      await expect(d.tender.connect(d.contractor).commitBid(d.tenderId, h("one too many"))).to.be.revertedWithCustomError(
        d.tender,
        "TooManyBidders",
      );
    });
  });

  describe("cancel & no-bid outcomes", function () {
    it("award fails without valid bids; official cancels and can re-tender", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await networkHelpers.time.increaseTo(d.revealDeadline + 1);
      await expect(d.tender.connect(d.official).awardTender(d.tenderId))
        .to.be.revertedWithCustomError(d.tender, "NoValidBids")
        .withArgs(d.tenderId);
      await expect(d.tender.connect(d.officialOtherWard).cancelTender(d.tenderId, h("x"))).to.be.revertedWithCustomError(
        d.tender,
        "NotInWard",
      );
      await expect(d.tender.connect(d.official).cancelTender(d.tenderId, h("no bids")))
        .to.emit(d.tender, "TenderCancelled")
        .withArgs(d.tenderId, d.projectId, h("no bids"));
      expect(await d.tender.hasOpenTender(d.projectId)).to.equal(false);
      await expect(d.tender.connect(d.official).cancelTender(d.tenderId, h("x"))).to.be.revertedWithCustomError(
        d.tender,
        "TenderNotOpen",
      );
      const now = await networkHelpers.time.latest();
      await d.tender.connect(d.official).publishTender(d.projectId, CID, now + DAY, now + 2 * DAY);
    });

    it("unknown tenders revert", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await expect(d.tender.getTender(9)).to.be.revertedWithCustomError(d.tender, "TenderNotFound");
      await expect(d.tender.getBid(9, d.contractor.address)).to.be.revertedWithCustomError(d.tender, "TenderNotFound");
      await expect(d.tender.getBidders(0)).to.be.revertedWithCustomError(d.tender, "TenderNotFound");
    });

    it("rejects a zero registry at initialization", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const { upgradesApi } = await import("./helpers/fixture.js");
      const Tender = await ethers.getContractFactory("TenderRegistry");
      await expect(
        upgradesApi.deployProxy(Tender, [await d.access.getAddress(), ethers.ZeroAddress], { kind: "uups" }),
      ).to.be.revertedWithCustomError(Tender, "ZeroAddress");
    });
  });
});
