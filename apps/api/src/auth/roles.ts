import { eq, users, wardAccess, type Db } from "@namma-seva/db";
import { id as keccakId, type Contract } from "ethers";
import type { Role, SessionUser } from "./tokens";

/** Reads roles from `NammaSevaAccess` — the chain, not the DB, decides who is an official (plan §10). */
export interface RoleReader {
  rolesOf(address: string): Promise<Role[]>;
}

const ON_CHAIN_ROLES: [Role, string][] = [
  ["ADMIN", "0x" + "00".repeat(32)],
  ["GOVT_OFFICIAL", keccakId("GOVT_OFFICIAL")],
  ["AUDITOR", keccakId("AUDITOR")],
  ["CONTRACTOR", keccakId("CONTRACTOR")],
];

export class ChainRoleReader implements RoleReader {
  constructor(private readonly access: Contract) {}

  async rolesOf(address: string): Promise<Role[]> {
    const has = await Promise.all(ON_CHAIN_ROLES.map(([, roleId]) => this.access.hasRole(roleId, address) as Promise<boolean>));
    return ON_CHAIN_ROLES.filter((_, i) => has[i]).map(([role]) => role);
  }
}

/** Primary role for UI routing when a wallet holds several. */
const PRIORITY: Role[] = ["ADMIN", "AUDITOR", "GOVT_OFFICIAL", "CONTRACTOR"];
export const primaryRole = (roles: Role[]): Role => PRIORITY.find((r) => roles.includes(r)) ?? "PUBLIC";

/** Ward scoping from the indexed `WardAccessSet` events (4294967295 = all wards). */
async function wardsOf(db: Db, address: string): Promise<number[]> {
  const rows = await db.select({ wardId: wardAccess.wardId }).from(wardAccess).where(eq(wardAccess.address, address));
  return rows.map((r) => r.wardId).sort((a, b) => a - b);
}

export async function upsertWalletUser(db: Db, reader: RoleReader, address: string): Promise<SessionUser> {
  const wallet = address.toLowerCase();
  const roles = await reader.rolesOf(wallet);
  const role = primaryRole(roles);
  const [row] = await db
    .insert(users)
    .values({ walletAddress: wallet, role, lastLoginAt: new Date() })
    .onConflictDoUpdate({ target: users.walletAddress, set: { role, lastLoginAt: new Date() } })
    .returning();
  return {
    id: row.id,
    role,
    roles,
    walletAddress: wallet,
    citizenHash: null,
    wards: await wardsOf(db, wallet),
    preferredLang: row.preferredLang,
    demo: false,
  };
}

export async function upsertCitizenUser(db: Db, citizenHash: string): Promise<SessionUser> {
  const [row] = await db
    .insert(users)
    .values({ phoneHash: citizenHash, role: "CITIZEN", lastLoginAt: new Date() })
    .onConflictDoUpdate({ target: users.phoneHash, set: { lastLoginAt: new Date() } })
    .returning();
  return {
    id: row.id,
    role: "CITIZEN",
    roles: ["CITIZEN"],
    walletAddress: null,
    citizenHash,
    wards: [],
    preferredLang: row.preferredLang,
    demo: false,
  };
}

/** Rebuild the session user on refresh — wallet roles are re-read from chain every time. */
export async function sessionUserById(db: Db, reader: RoleReader, userId: string): Promise<SessionUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) return null;
  if (row.walletAddress) return upsertWalletUser(db, reader, row.walletAddress);
  if (row.phoneHash) return upsertCitizenUser(db, row.phoneHash);
  return null;
}
