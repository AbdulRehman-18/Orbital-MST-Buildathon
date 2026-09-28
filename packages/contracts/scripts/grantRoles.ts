// Grants roles and ward access from config/roles.<network>.json (plan §8.3 step 5, fix L-1).
// Idempotent: existing grants are skipped. Must run while the deployer still holds ADMIN.
//   pnpm --filter @namma-seva/contracts roles:mst-testnet
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { network } from "hardhat";
import { CONTRACTS_ROOT, readDeployment, txLink } from "./lib/deployments.js";

type Entry = { address: string; wards?: (number | "ALL")[] };
type RolesFile = Partial<Record<"GOVT_OFFICIAL" | "AUDITOR" | "CONTRACTOR" | "RELAYER" | "PAUSER", Entry[]>>;

const { ethers, networkName } = await network.create();
const file = path.join(CONTRACTS_ROOT, "config", `roles.${networkName}.json`);
if (!existsSync(file)) throw new Error(`Missing ${file} — copy config/roles.example.json`);
const roles = JSON.parse(readFileSync(file, "utf8")) as RolesFile;

const d = readDeployment(networkName);
const access = await ethers.getContractAt("NammaSevaAccess", d.contracts.NammaSevaAccess.address);
const ALL = await access.ALL_WARDS();

let changes = 0;
for (const [roleName, entries] of Object.entries(roles)) {
  if (roleName.startsWith("$") || !Array.isArray(entries)) continue;
  const role = await access.getFunction(`${roleName}_ROLE`)();
  for (const { address, wards = [] } of entries) {
    if (!ethers.isAddress(address)) throw new Error(`${roleName}: invalid address ${address}`);
    if (!(await access.hasRole(role, address))) {
      const tx = await access.grantRole(role, address);
      await tx.wait();
      console.log(`+ ${roleName.padEnd(13)} ${address}  ${txLink(d.chainId, tx.hash)}`);
      changes++;
    }
    for (const w of wards) {
      const wardId = w === "ALL" ? ALL : BigInt(w);
      if (await access.hasWardAccess(address, wardId)) continue;
      const tx = await access.setWardAccess(address, wardId, true);
      await tx.wait();
      console.log(`  ward ${String(w).padEnd(5)} → ${address}  ${txLink(d.chainId, tx.hash)}`);
      changes++;
    }
  }
}
console.log(changes ? `\n✓ ${changes} change(s) applied on ${networkName}` : `\n✓ Roles already up to date on ${networkName}`);
