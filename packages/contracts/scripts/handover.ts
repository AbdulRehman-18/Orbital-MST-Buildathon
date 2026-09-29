// Moves ADMIN + PAUSER from the deployer to the NammaSevaTimelock recorded in the manifest, gives
// PAUSER to the NammaSevaMultisig too (instant emergency stop), and renounces the deployer's roles
// (plan §8.4). Irreversible: afterwards every admin action is a
// multisig proposal with a timelock delay. Run grantRoles first.
//   pnpm --filter @namma-seva/contracts handover:mst-mainnet
import { network } from "hardhat";
import { handOverAdmin } from "./lib/governance.js";
import { readDeployment } from "./lib/deployments.js";

const { ethers, networkName } = await network.create();
const d = readDeployment(networkName);
const timelock = d.contracts.NammaSevaTimelock?.address;
const multisig = d.contracts.NammaSevaMultisig?.address;
if (!timelock || !multisig) throw new Error(`No NammaSevaTimelock/NammaSevaMultisig in deployments/${networkName}.json — set governance in config/networks.ts`);

const [deployer] = await ethers.getSigners();
const access = await ethers.getContractAt("NammaSevaAccess", d.contracts.NammaSevaAccess.address);
if (!(await access.hasRole(await access.DEFAULT_ADMIN_ROLE(), deployer.address))) {
  throw new Error(`${deployer.address} is not ADMIN on ${networkName} — already handed over?`);
}
if (process.env.CONFIRM_HANDOVER !== networkName) {
  throw new Error(`Irreversible. Re-run with CONFIRM_HANDOVER=${networkName} to move ADMIN to ${timelock}.`);
}
await handOverAdmin(access, timelock, deployer.address, multisig);
console.log(`✓ ADMIN + PAUSER now held by timelock ${timelock}; PAUSER also by multisig ${multisig} (instant emergency stop).`);
console.log(`  Deployer ${deployer.address} renounced both roles — it is no longer needed and must not be reused.`);
