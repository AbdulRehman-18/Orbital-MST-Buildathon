import type { Db } from "@namma-seva/db";
import { createTestDb } from "@namma-seva/db/testing";
import { seedReferenceData } from "@namma-seva/db/seed";
import pino from "pino";
import { createApp } from "../../src/app";
import type { OtpSender } from "../../src/auth/otp";
import type { RoleReader } from "../../src/auth/roles";
import { TokenService, type Role } from "../../src/auth/tokens";
import { loadConfig } from "../../src/config";
import type { AppContext } from "../../src/context";
import { LocalIpfs } from "../../src/ipfs/ipfs";
import { FakeChain } from "./fake-chain";

export const TEST_ENV = {
  NODE_ENV: "test",
  NS_CHAIN: "local",
  SIWE_DOMAIN: "app.test",
  JWT_SECRET: "test-secret-test-secret-test-secret-123",
  PHONE_HASH_PEPPER: "pepper",
  CORS_ORIGINS: "http://app.test",
};

export class CapturingOtp implements OtpSender {
  last = new Map<string, string>();
  async send(e164: string, code: string) {
    this.last.set(e164, code);
  }
}

export class StubRoles implements RoleReader {
  roles = new Map<string, Role[]>();
  async rolesOf(address: string) {
    return this.roles.get(address.toLowerCase()) ?? [];
  }
}

export async function makeTestApp(env: Record<string, string> = {}, opts: { withChain?: boolean } = {}) {
  const { db, close } = await createTestDb();
  await seedReferenceData(db);
  const config = loadConfig({ ...TEST_ENV, ...env } as NodeJS.ProcessEnv);
  const otp = new CapturingOtp();
  const roles = new StubRoles();
  const chain = opts.withChain === false ? undefined : new FakeChain();
  const ctx: AppContext = {
    config,
    db: db as Db,
    logger: pino({ level: "silent" }),
    tokens: new TokenService(config.auth.jwtSecret, false),
    otp,
    roles,
    ipfs: new LocalIpfs("http://api.test"),
    chain: chain ? { provider: chain.provider, contracts: chain.contracts } : undefined,
  };
  return { app: createApp(ctx), ctx, db: db as Db, otp, roles, chain, close };
}
