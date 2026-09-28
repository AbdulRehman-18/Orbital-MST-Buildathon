const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const RoleManager = await hre.ethers.getContractFactory("RoleManager");
  const roleManager = await RoleManager.deploy();
  await roleManager.waitForDeployment();

  const ProjectRegistry = await hre.ethers.getContractFactory("ProjectRegistry");
  const projectRegistry = await ProjectRegistry.deploy(await roleManager.getAddress());
  await projectRegistry.waitForDeployment();

  const MilestoneEscrow = await hre.ethers.getContractFactory("MilestoneEscrow");
  const milestoneEscrow = await MilestoneEscrow.deploy(
    await projectRegistry.getAddress(),
    await roleManager.getAddress()
  );
  await milestoneEscrow.waitForDeployment();

  const GOVT_OFFICIAL = await roleManager.GOVT_OFFICIAL();
  const AUDITOR       = await roleManager.AUDITOR();
  const CONTRACTOR    = await roleManager.CONTRACTOR();
  const CITIZEN       = await roleManager.CITIZEN();

  // Predefined demo accounts matching frontend login page and backend seed users
  const accounts = [
    { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", role: GOVT_OFFICIAL, label: "Government Official" },
    { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", role: AUDITOR,       label: "Auditor" },
    { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", role: CONTRACTOR,    label: "Contractor 1" },
    { address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", role: CONTRACTOR,    label: "Contractor 2" },
    { address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", role: CITIZEN,       label: "Citizen 1" },
    { address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", role: CITIZEN,       label: "Citizen 2" },
  ];

  for (const account of accounts) {
    await roleManager.grantUserRole(account.address, account.role);
    console.log(`Granted ${account.label} role to ${account.address}`);
  }

  console.log("\nDeployed contract addresses:");
  console.table({
    RoleManager:      await roleManager.getAddress(),
    ProjectRegistry:  await projectRegistry.getAddress(),
    MilestoneEscrow:  await milestoneEscrow.getAddress(),
  });

  console.log("\nCopy these into your .env file:");
  console.log(`ROLE_MANAGER_ADDRESS=${await roleManager.getAddress()}`);
  console.log(`PROJECT_REGISTRY_ADDRESS=${await projectRegistry.getAddress()}`);
  console.log(`MILESTONE_ESCROW_ADDRESS=${await milestoneEscrow.getAddress()}`);
  console.log(`VITE_ROLE_MANAGER_ADDRESS=${await roleManager.getAddress()}`);
  console.log(`VITE_PROJECT_REGISTRY_ADDRESS=${await projectRegistry.getAddress()}`);
  console.log(`VITE_MILESTONE_ESCROW_ADDRESS=${await milestoneEscrow.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
