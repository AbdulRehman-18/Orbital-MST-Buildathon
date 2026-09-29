import type { NammaSevaAccess } from "../../types/ethers-contracts/index.js";

/**
 * Hand ADMIN and PAUSER to `newAdmin` (the timelock on mainnet) and have `deployer` renounce both.
 * Order matters: grant first, then renounce, so ADMIN is never unheld.
 *
 * `guardian` (the multisig) also receives PAUSER. Without it an emergency `pause()` would have to be
 * scheduled through the timelock and wait out its full delay (48 h) — useless in an incident. The
 * guardian can only *stop* the system (3-of-5 signatures, no delay); resuming (`unpause`, ADMIN) and
 * every other change still goes through the timelock.
 */
export async function handOverAdmin(access: NammaSevaAccess, newAdmin: string, deployer: string, guardian?: string) {
  const ADMIN = await access.DEFAULT_ADMIN_ROLE();
  const PAUSER = await access.PAUSER_ROLE();
  await (await access.grantRole(ADMIN, newAdmin)).wait();
  await (await access.grantRole(PAUSER, newAdmin)).wait();
  if (guardian) await (await access.grantRole(PAUSER, guardian)).wait();
  await (await access.renounceRole(PAUSER, deployer)).wait();
  await (await access.renounceRole(ADMIN, deployer)).wait();
}
