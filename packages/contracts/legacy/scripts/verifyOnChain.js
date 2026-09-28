const hre = require("hardhat");

async function main() {
  const rpcUrl =
    process.env.HARDHAT_RPC_URL ||
    process.env.POLYGON_AMOY_RPC ||
    "http://127.0.0.1:8545";

  const roleManagerAddress = process.env.ROLE_MANAGER_ADDRESS;
  const projectRegistryAddress = process.env.PROJECT_REGISTRY_ADDRESS;
  const milestoneEscrowAddress = process.env.MILESTONE_ESCROW_ADDRESS;

  if (!roleManagerAddress || !projectRegistryAddress || !milestoneEscrowAddress) {
    throw new Error("Missing one or more contract addresses in environment.");
  }

  const provider = new hre.ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const latestBlock = await provider.getBlockNumber();

  const roleManager = await hre.ethers.getContractAt("RoleManager", roleManagerAddress, provider);
  const projectRegistry = await hre.ethers.getContractAt("ProjectRegistry", projectRegistryAddress, provider);
  const milestoneEscrow = await hre.ethers.getContractAt("MilestoneEscrow", milestoneEscrowAddress, provider);

  const [official, auditor, contractor1, contractor2] = await hre.ethers.getSigners();

  const GOVT_OFFICIAL = await roleManager.GOVT_OFFICIAL();
  const AUDITOR = await roleManager.AUDITOR();
  const CONTRACTOR = await roleManager.CONTRACTOR();

  const checks = await Promise.all([
    roleManager.hasRole(official.address, GOVT_OFFICIAL),
    roleManager.hasRole(auditor.address, AUDITOR),
    roleManager.hasRole(contractor1.address, CONTRACTOR),
    roleManager.hasRole(contractor2.address, CONTRACTOR),
    projectRegistry.roleManager(),
    milestoneEscrow.projectRegistry(),
    milestoneEscrow.roleManager(),
  ]);

  const [
    officialOk,
    auditorOk,
    contractor1Ok,
    contractor2Ok,
    registryRoleManager,
    escrowProjectRegistry,
    escrowRoleManager,
  ] = checks;

  console.log("\nOn-chain verification summary");
  console.table({
    rpcUrl,
    network: `${network.name} (${network.chainId})`,
    latestBlock,
    roleManagerAddress,
    projectRegistryAddress,
    milestoneEscrowAddress,
  });

  console.log("\nContract wiring");
  console.table({
    "ProjectRegistry.roleManager": registryRoleManager,
    "MilestoneEscrow.projectRegistry": escrowProjectRegistry,
    "MilestoneEscrow.roleManager": escrowRoleManager,
  });

  console.log("\nRole assignments");
  console.table({
    [official.address]: officialOk ? "GOVT_OFFICIAL OK" : "MISSING",
    [auditor.address]: auditorOk ? "AUDITOR OK" : "MISSING",
    [contractor1.address]: contractor1Ok ? "CONTRACTOR OK" : "MISSING",
    [contractor2.address]: contractor2Ok ? "CONTRACTOR OK" : "MISSING",
  });

  const wiringOk =
    registryRoleManager.toLowerCase() === roleManagerAddress.toLowerCase() &&
    escrowProjectRegistry.toLowerCase() === projectRegistryAddress.toLowerCase() &&
    escrowRoleManager.toLowerCase() === roleManagerAddress.toLowerCase();

  const rolesOk = officialOk && auditorOk && contractor1Ok && contractor2Ok;

  if (!wiringOk || !rolesOk) {
    process.exitCode = 1;
    console.error("\nVerification failed. Review the mismatched entries above.");
    return;
  }

  console.log("\nVerification passed. Contracts and seeded roles are aligned.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
