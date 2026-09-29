// Deploys the Namma Seva contract system (plan §8.3):
//   NammaSevaAccess → TrustedForwarder → ProjectRegistry → MilestoneEscrow → GrievanceRegistry
//   → TenderRegistry (UUPS proxies), wires the registry, optionally deploys multisig + timelock
//   and hands ADMIN over, then writes deployments/<network>.json (+ @namma-seva/chain mirror).
//
//   pnpm --filter @namma-seva/contracts deploy:local        (against `hardhat node`)
//   pnpm --filter @namma-seva/contracts deploy:mst-testnet  (needs DEPLOYER_PRIVATE_KEY, MST_TESTNET_RPC)
import hre, { network } from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";
import { NETWORK_SETTINGS } from "../config/networks.js";
import { deploySystem } from "./lib/system.js";
import { addressLink, gitCommit, writeDeployment, type Deployment } from "./lib/deployments.js";

const connection = await network.create();
const { ethers, networkName } = connection;
const upgradesApi = await upgrades(hre, connection);

const settings = NETWORK_SETTINGS[networkName];
if (!settings) throw new Error(`No settings for network "${networkName}" in config/networks.ts`);

const [deployer] = await ethers.getSigners();
const { chainId } = await ethers.provider.getNetwork();
const balance = await ethers.provider.getBalance(deployer.address);
const startBlock = await ethers.provider.getBlockNumber();
const treasury = settings.treasury === "deployer" ? deployer.address : settings.treasury;
if (treasury === ethers.ZeroAddress) throw new Error(`Set a treasury for ${networkName} (config/networks.ts, or NS_TREASURY on mainnet)`);

// Mainnet go/no-go guards (plan §8.4 / §16.2): 3-of-5 multisig, distinct owners, none of them the deployer.
if (networkName === "mstMainnet") {
  const g = settings.governance;
  const owners = (g?.owners ?? []).map((a) => a.toLowerCase());
  if (!g || owners.length < 5) throw new Error("Mainnet needs ≥ 5 multisig owners in NS_GOVERNANCE_OWNERS (3-of-5).");
  if (g.threshold < 3 || g.threshold > owners.length) throw new Error(`Mainnet multisig threshold must be 3..${owners.length}.`);
  if (new Set(owners).size !== owners.length) throw new Error("NS_GOVERNANCE_OWNERS contains duplicates.");
  if (owners.some((a) => !ethers.isAddress(a))) throw new Error("NS_GOVERNANCE_OWNERS contains an invalid address.");
  if (owners.includes(deployer.address.toLowerCase())) {
    throw new Error("The deployer must not be a multisig owner: it renounces ADMIN after handover and must not be reused.");
  }
  if (g.timelockDelaySeconds < 48 * 60 * 60) throw new Error("Mainnet timelock delay must be ≥ 48 h.");
}

console.log(`\nNamma Seva deploy → ${networkName} (chain ${chainId})`);
console.log(`Deployer ${deployer.address}  balance ${ethers.formatEther(balance)}`);
console.log(`Mode ${settings.mode} · treasury ${treasury} · start block ${startBlock}\n`);

const sys = await deploySystem(ethers, upgradesApi, {
  admin: deployer.address,
  mode: settings.mode,
  treasury,
  grievance: settings.grievance,
  log: (m) => console.log(`  ${m}`),
});

const impl = (proxy: { getAddress(): Promise<string> }) =>
  proxy.getAddress().then((a) => upgradesApi.erc1967.getImplementationAddress(a));

const forwarderAddr = await sys.forwarder.getAddress();
const contracts: Deployment["contracts"] = {
  NammaSevaAccess: {
    address: await sys.access.getAddress(),
    constructorArgs: [deployer.address],
    fqn: "contracts/NammaSevaAccess.sol:NammaSevaAccess",
  },
  TrustedForwarder: {
    address: forwarderAddr,
    constructorArgs: [],
    fqn: "contracts/governance/Imports.sol:TrustedForwarder",
  },
  ProjectRegistry: {
    address: await sys.registry.getAddress(),
    implementation: await impl(sys.registry),
    constructorArgs: [],
    fqn: "contracts/ProjectRegistry.sol:ProjectRegistry",
  },
  MilestoneEscrow: {
    address: await sys.escrow.getAddress(),
    implementation: await impl(sys.escrow),
    constructorArgs: [],
    fqn: "contracts/MilestoneEscrow.sol:MilestoneEscrow",
  },
  GrievanceRegistry: {
    address: await sys.grievance.getAddress(),
    implementation: await impl(sys.grievance),
    constructorArgs: [forwarderAddr],
    fqn: "contracts/GrievanceRegistry.sol:GrievanceRegistry",
  },
  TenderRegistry: {
    address: await sys.tender.getAddress(),
    implementation: await impl(sys.tender),
    constructorArgs: [],
    fqn: "contracts/TenderRegistry.sol:TenderRegistry",
  },
};

if (settings.governance) {
  const g = settings.governance;
  if (g.owners.length < g.threshold) throw new Error(`governance.owners for ${networkName} must have ≥ ${g.threshold} addresses`);
  const multisig = await ethers.deployContract("NammaSevaMultisig", [g.owners, g.threshold]);
  await multisig.waitForDeployment();
  const msAddr = await multisig.getAddress();
  const timelock = await ethers.deployContract("NammaSevaTimelock", [
    g.timelockDelaySeconds,
    [msAddr],
    [msAddr],
    ethers.ZeroAddress,
  ]);
  await timelock.waitForDeployment();
  const tlAddr = await timelock.getAddress();
  console.log(`  NammaSevaMultisig ${msAddr} (${g.threshold}-of-${g.owners.length})`);
  console.log(`  NammaSevaTimelock ${tlAddr} (${g.timelockDelaySeconds / 3600} h)`);
  contracts.NammaSevaMultisig = {
    address: msAddr,
    constructorArgs: [g.owners, g.threshold],
    fqn: "contracts/governance/NammaSevaMultisig.sol:NammaSevaMultisig",
  };
  contracts.NammaSevaTimelock = {
    address: tlAddr,
    constructorArgs: [g.timelockDelaySeconds, [msAddr], [msAddr], ethers.ZeroAddress],
    fqn: "contracts/governance/Imports.sol:NammaSevaTimelock",
  };
  if (g.handOver) {
    // Roles must be granted (scripts/grantRoles.ts) BEFORE handover — afterwards every role
    // change is a multisig proposal through the timelock.
    console.log("\n  Next: grant initial roles (grantRoles), then move ADMIN to the timelock (handover).");
  }
}

const deployment: Deployment = {
  network: networkName,
  chainId: Number(chainId),
  blockNumber: startBlock,
  commit: gitCommit(),
  deployedAt: new Date().toISOString(),
  deployer: deployer.address,
  mode: settings.mode,
  contracts,
};
writeDeployment(deployment);

console.log(`\n✓ Deployed. Manifest: deployments/${networkName}.json (indexer start block ${startBlock})`);
for (const [name, c] of Object.entries(contracts)) console.log(`  ${name.padEnd(18)} ${addressLink(Number(chainId), c.address)}`);
console.log(`\nSpent ${ethers.formatEther(balance - (await ethers.provider.getBalance(deployer.address)))} in gas.`);

