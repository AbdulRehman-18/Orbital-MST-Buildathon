const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DecentraliTrack", function () {
  async function deployAll() {
    const [admin, official, contractor, auditor1, auditor2] = await ethers.getSigners();
    const RoleManager = await ethers.getContractFactory("RoleManager");
    const roleManager = await RoleManager.deploy();
    const ProjectRegistry = await ethers.getContractFactory("ProjectRegistry");
    const projectRegistry = await ProjectRegistry.deploy(await roleManager.getAddress());
    const MilestoneEscrow = await ethers.getContractFactory("MilestoneEscrow");
    const milestoneEscrow = await MilestoneEscrow.deploy(await projectRegistry.getAddress(), await roleManager.getAddress());

    await roleManager.grantUserRole(official.address, await roleManager.GOVT_OFFICIAL());
    await roleManager.grantUserRole(auditor1.address, await roleManager.AUDITOR());
    await roleManager.grantUserRole(auditor2.address, await roleManager.AUDITOR());

    return { roleManager, projectRegistry, milestoneEscrow, admin, official, contractor, auditor1, auditor2 };
  }

  it("creates a project, receives proof, and releases funds after two approvals", async function () {
    const { projectRegistry, milestoneEscrow, official, contractor, auditor1, auditor2 } = await deployAll();
    await projectRegistry.connect(official).createProject("Road", "Ward road", "Pune", 18520400, 73856700, ethers.parseEther("2"), 1, 9999999999, contractor.address);
    await milestoneEscrow.connect(official).fundProject(1, { value: ethers.parseEther("1") });
    await milestoneEscrow.connect(official).createMilestone(1, "Base", "Base course", ethers.parseEther("1"));
    await milestoneEscrow.connect(contractor).submitProof(1, "bafyproof", 18520400, 73856700);
    await milestoneEscrow.connect(auditor1).approveMilestone(1);
    await expect(milestoneEscrow.connect(auditor2).approveMilestone(1)).to.changeEtherBalance(contractor, ethers.parseEther("1"));
    const milestone = await milestoneEscrow.getMilestone(1);
    expect(milestone.status).to.equal(4);
  });
});
