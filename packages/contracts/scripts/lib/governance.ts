import type { NammaSevaAccess } from "../../types/ethers-contracts/index.js";

/**
 * Hand ADMIN and PAUSER to `newAdmin` (the timelock on mainnet) and have `deployer` renounce both.
 * Order matters: grant first, then renounce, so ADMIN is never unheld.
 */
export async function handOverAdmin(access: NammaSevaAccess, newAdmin: string, deployer: string) {
  const ADMIN = await access.DEFAULT_ADMIN_ROLE();
  const PAUSER = await access.PAUSER_ROLE();
  await (await access.grantRole(ADMIN, newAdmin)).wait();
  await (await access.grantRole(PAUSER, newAdmin)).wait();
  await (await access.renounceRole(PAUSER, deployer)).wait();
  await (await access.renounceRole(ADMIN, deployer)).wait();
}
