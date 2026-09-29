// Step 2 of an upgrade (docs/runbooks/upgrade.md): deploy a NEW IMPLEMENTATION for one proxy and
// print the calldata the multisig should schedule. The new implementation has no privileges, so any
// funded throw-away key can deploy it; nothing changes until ADMIN (the timelock) calls
// `upgradeToAndCall` after its delay.
//
//   UPGRADE_TARGET=ProjectRegistry pnpm --filter @namma-seva/contracts exec hardhat run scripts/prepareUpgrade.ts --network mstMainnet
//
// The OpenZeppelin upgrades plugin checks storage-layout compatibility against the proxy's recorded
// implementation before deploying; an incompatible layout aborts here, never on-chain.
import hre, { network } from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";
import { readDeployment } from "./lib/deployments.js";

const TARGETS = ["ProjectRegistry", "MilestoneEscrow", "GrievanceRegistry", "TenderRegistry"] as const;
const target = process.env.UPGRADE_TARGET as (typeof TARGETS)[number] | undefined;
if (!target || !TARGETS.includes(target)) throw new Error(`Set UPGRADE_TARGET to one of: ${TARGETS.join(", ")}`);

const connection = await network.create();
const { ethers, networkName } = connection;
const upgradesApi = await upgrades(hre, connection);

const d = readDeployment(networkName);
const proxy = d.contracts[target]?.address;
if (!proxy) throw new Error(`${target} is not in deployments/${networkName}.json`);

const factory = await ethers.getContractFactory(target);
const current = await upgradesApi.erc1967.getImplementationAddress(proxy);
console.log(`${target} proxy ${proxy}\n  current implementation ${current}`);

const next = (await upgradesApi.prepareUpgrade(proxy, factory, { kind: "uups", redeployImplementation: "onchange" })) as string;
if (next.toLowerCase() === current.toLowerCase()) {
  console.log("\nNo change: the compiled implementation equals the current one.");
  process.exit(0);
}

const calldata = factory.interface.encodeFunctionData("upgradeToAndCall", [next, "0x"]);
console.log(`\n✓ New implementation deployed: ${next}`);
console.log("  1. Verify it on the explorer (pnpm … verify) and publish the diff and audit note.");
console.log("  2. Schedule through the multisig + timelock:");
console.log(`     pnpm --filter @namma-seva/contracts multisig ${networkName} call ${{ ProjectRegistry: "registry", MilestoneEscrow: "escrow", GrievanceRegistry: "grievance", TenderRegistry: "tender" }[target]} "upgradeToAndCall(address,bytes)" '["${next}","0x"]' --timelock`);
console.log(`  (raw calldata: ${calldata})`);
