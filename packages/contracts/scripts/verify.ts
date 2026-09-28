// Verifies every contract in deployments/<network>.json on mstscan (Blockscout, ADR 0007).
// For UUPS proxies the implementation is verified; Blockscout links the proxy automatically.
//   pnpm --filter @namma-seva/contracts verify:mst-testnet
import hre, { network } from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { addressLink, readDeployment } from "./lib/deployments.js";

const { networkName } = await network.create();
const d = readDeployment(networkName);

let failed = 0;
for (const [name, c] of Object.entries(d.contracts)) {
  const address = c.implementation ?? c.address;
  const label = c.implementation ? `${name} (implementation)` : name;
  try {
    await verifyContract(
      { address, contract: c.fqn, constructorArgs: c.constructorArgs ?? [], provider: "blockscout" },
      hre,
    );
    console.log(`✓ ${label.padEnd(34)} ${addressLink(d.chainId, address)}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${label}: ${(err as Error).message}`);
  }
}
if (failed) {
  console.error(`\n${failed} contract(s) failed to verify. ADR 0007 fallback: Blockscout /api/v2 verification.`);
  process.exit(1);
}
