import { expect } from "chai";
import type { Wallet } from "ethers";
import { activeProject, CID, DAY, deployWithRoles, ethers, h, networkHelpers, newProjectParams, Status, type Deployed } from "./helpers/fixture.js";

const G = { OPEN: 0, ESCALATED: 1, RESPONDED: 2 } as const;
const Action = { NONE: 0, PAUSE_PROJECT: 1, DISMISS: 2 } as const;
const Cat = { QUALITY: 0, DELAY: 1, SAFETY: 2 } as const;

// Citizens are salted phone hashes computed off-chain (plan §15); these stand in for them.
const citizen = (n: number) => h(`citizen-${n}`);

async function fixture() {
  const d = await deployWithRoles("LEDGER"); // escalationThreshold = 3 in the fixture
  const projectId = await activeProject(d);
  return { ...d, projectId };
}

/** Sign an ERC-2771 ForwardRequest with `signer` and execute it through the forwarder as `relayer`. */
async function forward(d: Deployed, signer: Wallet, data: string) {
  const forwarderAddr = await d.forwarder.getAddress();
  const { chainId } = await ethers.provider.getNetwork();
  const request = {
    from: signer.address,
    to: await d.grievance.getAddress(),
    value: 0n,
    gas: 500_000n,
    nonce: await d.forwarder.nonces(signer.address),
    deadline: (await networkHelpers.time.latest()) + 3600,
    data,
  };
  const signature = await signer.signTypedData(
    { name: "NammaSevaForwarder", version: "1", chainId, verifyingContract: forwarderAddr },
    {
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
        { name: "data", type: "bytes" },
      ],
    },
    request,
  );
  const { nonce: _nonce, ...rest } = request;
  return d.forwarder.connect(d.relayer).execute({ ...rest, signature });
}

describe("GrievanceRegistry", function () {
  describe("relayer path", function () {
    it("files a grievance for a citizen hash and emits it for the indexer", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await expect(d.grievance.connect(d.relayer).fileGrievance(d.projectId, Cat.QUALITY, CID, citizen(1)))
        .to.emit(d.grievance, "GrievanceFiled")
        .withArgs(1n, d.projectId, citizen(1), Cat.QUALITY, CID);
      const g = await d.grievance.getGrievance(1);
      expect(g.status).to.equal(G.OPEN);
      expect(g.citizenHash).to.equal(citizen(1));
    });

    it("requires a citizen hash, content, and a project that is not cancelled", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const r = d.grievance.connect(d.relayer);
      await expect(r.fileGrievance(d.projectId, Cat.QUALITY, CID, ethers.ZeroHash)).to.be.revertedWithCustomError(
        d.grievance,
        "InvalidCitizen",
      );
      await expect(r.fileGrievance(d.projectId, Cat.QUALITY, "", citizen(1))).to.be.revertedWithCustomError(
        d.grievance,
        "InvalidContent",
      );
      await expect(r.fileGrievance(99, Cat.QUALITY, CID, citizen(1))).to.be.revertedWithCustomError(
        d.registry,
        "ProjectNotFound",
      );
      await d.registry.connect(d.official).createProject(await newProjectParams());
      const pending = await d.registry.projectCount();
      await r.fileGrievance(pending, Cat.DELAY, CID, citizen(1)); // pending projects accept grievances
      await d.registry.connect(d.auditor1).rejectProject(pending, h("x"));
      await expect(r.fileGrievance(pending, Cat.DELAY, CID, citizen(1)))
        .to.be.revertedWithCustomError(d.grievance, "ProjectClosedForGrievances")
        .withArgs(pending, Status.CANCELLED);
    });

    it("rejects callers that are neither relayer nor registered citizen signer", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await expect(d.grievance.connect(d.outsider).fileGrievance(d.projectId, Cat.QUALITY, CID, citizen(1)))
        .to.be.revertedWithCustomError(d.grievance, "NotACitizen")
        .withArgs(d.outsider.address);
    });

    it("limits each citizen to maxGrievancesPerDay per UTC day", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const r = d.grievance.connect(d.relayer);
      for (let i = 0; i < 3; i++) await r.fileGrievance(d.projectId, Cat.QUALITY, CID, citizen(1));
      await expect(r.fileGrievance(d.projectId, Cat.QUALITY, CID, citizen(1)))
        .to.be.revertedWithCustomError(d.grievance, "DailyLimitReached")
        .withArgs(citizen(1));
      await r.fileGrievance(d.projectId, Cat.QUALITY, CID, citizen(2)); // other citizens unaffected
      await networkHelpers.time.increase(DAY);
      await r.fileGrievance(d.projectId, Cat.QUALITY, CID, citizen(1));
    });
  });

  describe("upvotes & escalation", function () {
    it("counts one upvote per citizen and escalates at the threshold", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const r = d.grievance.connect(d.relayer);
      await r.fileGrievance(d.projectId, Cat.SAFETY, CID, citizen(1));
      await expect(r.upvote(1, citizen(1))).to.be.revertedWithCustomError(d.grievance, "OwnGrievance");
      await expect(r.upvote(1, citizen(2)))
        .to.emit(d.grievance, "GrievanceUpvoted")
        .withArgs(1n, d.projectId, citizen(2), 1);
      await expect(r.upvote(1, citizen(2))).to.be.revertedWithCustomError(d.grievance, "AlreadyUpvoted");
      await r.upvote(1, citizen(3));
      const tx = r.upvote(1, citizen(4));
      await expect(tx).to.emit(d.grievance, "GrievanceThresholdReached");
      const g = await d.grievance.getGrievance(1);
      expect(g.status).to.equal(G.ESCALATED);
      expect(g.upvotes).to.equal(3);
      await r.upvote(1, citizen(5)); // still accepted after escalation, no second event
      expect((await d.grievance.getGrievance(1)).upvotes).to.equal(4);
      await expect(r.upvote(9, citizen(5))).to.be.revertedWithCustomError(d.grievance, "GrievanceNotFound");
    });

    it("flags escalated grievances that pass the response SLA", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const r = d.grievance.connect(d.relayer);
      await r.fileGrievance(d.projectId, Cat.SAFETY, CID, citizen(1));
      for (const c of [2, 3, 4]) await r.upvote(1, citizen(c));
      expect(await d.grievance.isOverdue(1)).to.equal(false);
      await networkHelpers.time.increase(7 * DAY + 1);
      expect(await d.grievance.isOverdue(1)).to.equal(true);
    });
  });

  describe("auditor response", function () {
    it("PAUSE_PROJECT pauses the project through the registry", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await d.grievance.connect(d.relayer).fileGrievance(d.projectId, Cat.SAFETY, CID, citizen(1));
      await expect(d.grievance.connect(d.auditor1).respond(1, CID, Action.PAUSE_PROJECT))
        .to.emit(d.grievance, "GrievanceResponded")
        .withArgs(1n, d.projectId, d.auditor1.address, Action.PAUSE_PROJECT, CID)
        .and.to.emit(d.registry, "ProjectPaused")
        .withArgs(d.projectId, await d.grievance.getAddress(), ethers.ZeroHash, 1n);
      expect((await d.registry.getProject(d.projectId)).status).to.equal(Status.PAUSED);
      const g = await d.grievance.getGrievance(1);
      expect(g.status).to.equal(G.RESPONDED);
      await expect(d.grievance.connect(d.relayer).upvote(1, citizen(2))).to.be.revertedWithCustomError(
        d.grievance,
        "InvalidGrievanceStatus",
      );
      await expect(d.grievance.connect(d.auditor2).respond(1, CID, Action.DISMISS)).to.be.revertedWithCustomError(
        d.grievance,
        "InvalidGrievanceStatus",
      );
    });

    it("validates the responder, action and content", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await d.grievance.connect(d.relayer).fileGrievance(d.projectId, Cat.SAFETY, CID, citizen(1));
      await expect(d.grievance.connect(d.official).respond(1, CID, Action.DISMISS)).to.be.revertedWithCustomError(
        d.grievance,
        "Unauthorized",
      );
      await expect(d.grievance.connect(d.auditor1).respond(1, CID, Action.NONE)).to.be.revertedWithCustomError(
        d.grievance,
        "InvalidAction",
      );
      await expect(d.grievance.connect(d.auditor1).respond(1, "", Action.DISMISS)).to.be.revertedWithCustomError(
        d.grievance,
        "InvalidContent",
      );
      await d.grievance.connect(d.auditor1).respond(1, CID, Action.DISMISS);
      expect((await d.registry.getProject(d.projectId)).status).to.equal(Status.ACTIVE);
    });
  });

  describe("per-citizen signer via ERC-2771 forwarder", function () {
    it("lets a registered citizen key file and upvote gaslessly", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const alice = ethers.Wallet.createRandom().connect(ethers.provider) as unknown as Wallet;
      const bob = ethers.Wallet.createRandom().connect(ethers.provider) as unknown as Wallet;
      await expect(d.grievance.connect(d.relayer).setCitizenSigner(alice.address, citizen(10)))
        .to.emit(d.grievance, "CitizenSignerSet")
        .withArgs(alice.address, citizen(10));
      await d.grievance.connect(d.relayer).setCitizenSigner(bob.address, citizen(11));

      // alice has no balance at all — the relayer pays for execution
      expect(await ethers.provider.getBalance(alice.address)).to.equal(0n);
      const file = d.grievance.interface.encodeFunctionData("fileGrievance", [d.projectId, Cat.QUALITY, CID, ethers.ZeroHash]);
      await expect(forward(d, alice, file))
        .to.emit(d.grievance, "GrievanceFiled")
        .withArgs(1n, d.projectId, citizen(10), Cat.QUALITY, CID);

      const vote = d.grievance.interface.encodeFunctionData("upvote", [1, citizen(11)]);
      await expect(forward(d, bob, vote)).to.emit(d.grievance, "GrievanceUpvoted").withArgs(1n, d.projectId, citizen(11), 1);
    });

    it("rejects a signer claiming someone else's citizen hash, and revoked signers", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const alice = ethers.Wallet.createRandom().connect(ethers.provider) as unknown as Wallet;
      await d.grievance.connect(d.relayer).setCitizenSigner(alice.address, citizen(10));
      await networkHelpers.setBalance(alice.address, ethers.parseEther("1"));
      await expect(
        d.grievance.connect(alice).fileGrievance(d.projectId, Cat.QUALITY, CID, citizen(99)),
      ).to.be.revertedWithCustomError(d.grievance, "CitizenMismatch");
      await d.grievance.connect(alice).fileGrievance(d.projectId, Cat.QUALITY, CID, citizen(10)); // direct, matching
      await d.grievance.connect(d.relayer).setCitizenSigner(alice.address, ethers.ZeroHash);
      await expect(
        d.grievance.connect(alice).fileGrievance(d.projectId, Cat.QUALITY, CID, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(d.grievance, "NotACitizen");
    });

    it("only the relayer registers signers", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await expect(
        d.grievance.connect(d.outsider).setCitizenSigner(d.outsider.address, citizen(1)),
      ).to.be.revertedWithCustomError(d.grievance, "Unauthorized");
      await expect(
        d.grievance.connect(d.relayer).setCitizenSigner(ethers.ZeroAddress, citizen(1)),
      ).to.be.revertedWithCustomError(d.grievance, "ZeroAddress");
    });
  });

  describe("settings", function () {
    it("ADMIN updates settings; zero values are rejected", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      await expect(d.grievance.setSettings(25, 3, 7 * DAY)).to.emit(d.grievance, "SettingsUpdated").withArgs(25, 3, 7 * DAY);
      await expect(d.grievance.setSettings(0, 3, DAY)).to.be.revertedWithCustomError(d.grievance, "InvalidSettings");
      await expect(d.grievance.setSettings(1, 0, DAY)).to.be.revertedWithCustomError(d.grievance, "InvalidSettings");
      await expect(d.grievance.setSettings(1, 1, 0)).to.be.revertedWithCustomError(d.grievance, "InvalidSettings");
      await expect(d.grievance.connect(d.auditor1).setSettings(1, 1, 1)).to.be.revertedWithCustomError(
        d.grievance,
        "Unauthorized",
      );
    });

    it("rejects a zero registry at initialization", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const { upgradesApi } = await import("./helpers/fixture.js");
      const Grievance = await ethers.getContractFactory("GrievanceRegistry");
      await expect(
        upgradesApi.deployProxy(Grievance, [await d.access.getAddress(), ethers.ZeroAddress, 1, 1, 1], {
          kind: "uups",
          constructorArgs: [await d.forwarder.getAddress()],
        }),
      ).to.be.revertedWithCustomError(Grievance, "ZeroAddress");
    });
  });
});
