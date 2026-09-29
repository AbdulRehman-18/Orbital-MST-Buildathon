import { createHmac } from "node:crypto";
import { accountRoles, auditLog, authNonces, authSessions, consents, grievances, indexerCursor, otpSessions, users } from "@namma-seva/db";
import { SigningKey, Transaction, Wallet, getBytes, keccak256, verifyMessage, verifyTypedData, type Signature } from "ethers";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { en } from "../../../packages/i18n/src/locales/en";
import { loadConfig } from "../src/config";
import { phoneHash } from "../src/lib/hash";
import { MIN_LOG_RETENTION_DAYS, runRetention } from "../src/retention";
import { metrics } from "../src/lib/metrics";
import { deriveCitizenWallet, HmacCitizenKeys, KmsCitizenKeys } from "../src/relayer/forwarder";
import { addressFromSpki, KmsSigner, parseDerSignature, type KmsClient } from "../src/relayer/kms";
import { makeTestApp, TEST_ENV } from "./helpers/app";
import type { FakeChain } from "./helpers/fake-chain";

const CONSENT = "2026-10-01";
type T = Awaited<ReturnType<typeof makeTestApp>>;
let t: T;

afterEach(async () => {
  await t?.close();
  t = undefined as unknown as T;
});

async function citizenLogin(phone = "9845012345", lang: string | undefined = "kn") {
  await request(t.app).post("/api/auth/otp/send").send({ phone, consentVersion: CONSENT }).expect(200);
  const code = t.otp.last.get("+91" + phone.replace(/\D/g, "").slice(-10))!;
  const res = await request(t.app).post("/api/auth/otp/verify").send({ phone, code, consentVersion: CONSENT, lang }).expect(200);
  return { token: res.body.accessToken as string, cookie: res.headers["set-cookie"][0].split(";")[0] as string, user: res.body.user };
}

describe("DPDP consent, access and erasure", () => {
  beforeEach(async () => {
    t = await makeTestApp();
  });

  it("the server's notice version matches the one the web app shows", () => {
    expect(loadConfig({ ...TEST_ENV } as NodeJS.ProcessEnv).consentVersion).toBe(en.consent.version);
  });

  it("refuses to send a code, or sign in, without the current notice", async () => {
    await request(t.app).post("/api/auth/otp/send").send({ phone: "9845012345" }).expect(400);
    const stale = await request(t.app).post("/api/auth/otp/send").send({ phone: "9845012345", consentVersion: "2020-01-01" }).expect(400);
    expect(stale.body.message).toMatch(/updated/i);
    await request(t.app).post("/api/auth/otp/verify").send({ phone: "9845012345", code: "123456", consentVersion: "2020-01-01" }).expect(400);
  });

  it("records the accepted notice once per version, in the language it was shown", async () => {
    await citizenLogin("9845012345", "kn");
    await citizenLogin("9845012345", "kn");
    const rows = await t.db.select().from(consents);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: CONSENT, lang: "kn", purpose: "phone-verification" });
  });

  it("exports the citizen's off-chain data, including grievances under their anonymous code", async () => {
    await request(t.app).get("/api/me/data").expect(401);
    const { token, user } = await citizenLogin();
    await t.db.insert(grievances).values({
      id: 7,
      projectId: 1,
      citizenHash: user.citizenHash,
      category: "DELAY",
      cid: "bafy",
      status: "OPEN",
      createdAt: new Date(),
      createdTx: "0x" + "ab".repeat(32),
      updatedBlock: 1,
    });
    const res = await request(t.app).get("/api/me/data").set("authorization", `Bearer ${token}`).expect(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.body.account).toMatchObject({ role: "CITIZEN", hasPhone: true, walletAddress: null });
    expect(res.body.consents).toHaveLength(1);
    expect(res.body.grievances).toEqual([expect.objectContaining({ id: 7, projectId: 1, category: "DELAY" })]);
    // The phone number itself is never in the export — nor in the database.
    expect(JSON.stringify(res.body)).not.toContain("9845012345");
  });

  it("erases the account, consents and sessions, and the session cannot be revived", async () => {
    const { token, cookie, user } = await citizenLogin();
    const res = await request(t.app).delete("/api/me/data").set("authorization", `Bearer ${token}`).expect(200);
    expect(res.body).toEqual({ erased: true, consentsDeleted: 1, sessionsRevoked: 1 });
    expect(await t.db.select().from(users)).toHaveLength(0);
    expect(await t.db.select().from(consents)).toHaveLength(0);
    expect(await t.db.select().from(authSessions)).toHaveLength(0);
    await request(t.app).post("/api/auth/refresh").set("cookie", cookie).expect(401);
    expect(user.citizenHash).toBe(phoneHash("+919845012345", "pepper"));
  });

  it("wallet roles cannot be erased here (they live on-chain)", async () => {
    const wallet = Wallet.createRandom();
    const token = await t.ctx.tokens.signAccess({
      id: "00000000-0000-4000-8000-000000000001",
      role: "AUDITOR",
      roles: ["AUDITOR"],
      walletAddress: wallet.address.toLowerCase(),
      citizenHash: null,
      wards: [],
      preferredLang: "en",
      demo: false,
    });
    await request(t.app).delete("/api/me/data").set("authorization", `Bearer ${token}`).expect(409);
  });
});

describe("GET /api/transparency", () => {
  beforeEach(async () => {
    t = await makeTestApp({
      GRIEVANCE_OFFICER_NAME: "A. Officer",
      GRIEVANCE_OFFICER_EMAIL: "grievance@ward.example",
      AUDIT_REPORT_URL: "https://example.org/audit.pdf",
      PILOT_NAME: "Ward 150",
    });
  });

  it("publishes deployed addresses, the trust assumption and the disclosure block", async () => {
    const res = await request(t.app).get("/api/transparency").expect(200);
    expect(res.body.network).toMatchObject({ chainId: 31337, consensus: "PoSA" });
    expect(res.body.contracts.map((c: { name: string }) => c.name)).toEqual(
      expect.arrayContaining(["NammaSevaAccess", "ProjectRegistry", "MilestoneEscrow", "GrievanceRegistry", "TenderRegistry"]),
    );
    expect(res.body.contracts[0].address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(res.body.disclosure).toEqual({
      grievanceOfficer: { name: "A. Officer", email: "grievance@ward.example", phone: null },
      auditReportUrl: "https://example.org/audit.pdf",
      pilot: "Ward 150",
    });
    expect(res.body.consentVersion).toBe(CONSENT);
    // Governance is read from chain; an unreachable node degrades to UNKNOWN rather than failing the page.
    expect(res.body.governance).toMatchObject({ adminKind: expect.stringMatching(/EOA|UNKNOWN|MULTISIG_TIMELOCK/) });
  });

  it("works with no chain connection and no disclosure configured", async () => {
    await t.close();
    t = await makeTestApp({}, { withChain: false });
    const res = await request(t.app).get("/api/transparency").expect(200);
    expect(res.body.contracts).toEqual([]);
    expect(res.body.governance.adminKind).toBe("UNKNOWN");
    expect(res.body.disclosure.grievanceOfficer).toBeNull();
  });
});

describe("Transparency: who holds the keys", () => {
  const EOA = "0x00000000000000000000000000000000000000e1";
  const MULTISIG = "0x00000000000000000000000000000000000000b1";
  const TIMELOCK = "0x00000000000000000000000000000000000000b2";
  const OWNERS = [1, 2, 3, 4, 5].map((n) => `0x000000000000000000000000000000000000000${n}`);

  async function grant(role: "ADMIN" | "PAUSER", ...addresses: string[]) {
    for (const address of addresses) await t.db.insert(accountRoles).values({ address, role, grantedBlock: 1 });
  }
  const stubRoles = (chain: FakeChain, holds: (role: string, who: string) => boolean = () => true) => {
    chain.stubCall("NammaSevaAccess", "paused", () => [false]);
    chain.stubCall("NammaSevaAccess", "hasRole", ([role, who]) => [holds(String(role), String(who).toLowerCase())]);
  };

  beforeEach(async () => {
    t = await makeTestApp();
  });

  it("flags a single wallet holding ADMIN (acceptable on testnet and pilot only)", async () => {
    stubRoles(t.chain!);
    await grant("ADMIN", EOA);
    await grant("PAUSER", EOA);
    const res = await request(t.app).get("/api/transparency").expect(200);
    expect(res.body.governance).toMatchObject({ adminKind: "EOA", adminHolder: EOA, multisig: null, paused: false, pausers: [EOA] });
  });

  it("reports a 3-of-5 multisig behind a 48 h timelock, and that the multisig can pause instantly", async () => {
    stubRoles(t.chain!);
    t.chain!.withGovernance({ multisig: MULTISIG, timelock: TIMELOCK, owners: OWNERS, threshold: 3, delaySeconds: 48 * 3600 });
    await grant("ADMIN", TIMELOCK);
    await grant("PAUSER", TIMELOCK, MULTISIG);
    const res = await request(t.app).get("/api/transparency").expect(200);
    expect(res.body.governance).toMatchObject({
      adminKind: "MULTISIG_TIMELOCK",
      adminHolder: TIMELOCK,
      timelockDelaySeconds: 172800,
      multisig: { address: MULTISIG, threshold: 3, owners: OWNERS },
    });
    expect(res.body.governance.pausers.sort()).toEqual([MULTISIG, TIMELOCK]);
  });

  it("ignores holders the chain says have lost the role (stale index)", async () => {
    stubRoles(t.chain!, (_role, who) => who === EOA);
    await grant("ADMIN", EOA, "0x00000000000000000000000000000000000000e2");
    const res = await request(t.app).get("/api/transparency").expect(200);
    expect(res.body.governance).toMatchObject({ adminKind: "EOA", adminHolder: EOA });
  });

  it("does not guess when there is more than one ADMIN", async () => {
    stubRoles(t.chain!);
    await grant("ADMIN", EOA, "0x00000000000000000000000000000000000000e2");
    const res = await request(t.app).get("/api/transparency").expect(200);
    expect(res.body.governance).toMatchObject({ adminKind: "UNKNOWN", adminHolder: null });
  });
});

describe("GET /metrics", () => {
  it("is guarded by a bearer token and exposes the four alerting signals", async () => {
    t = await makeTestApp({ METRICS_TOKEN: "s3cret-s3cret" });
    metrics.reset();
    await t.db.insert(indexerCursor).values({ network: "local", lastBlock: 90, lastBlockHash: "0x" + "00".repeat(32), headBlock: 100, updatedAt: new Date() });
    await request(t.app).get("/metrics").expect(401);
    await request(t.app).get("/metrics").set("authorization", "Bearer wrong").expect(401);
    await request(t.app).get("/api/health").expect(200);

    const res = await request(t.app).get("/metrics").set("authorization", "Bearer s3cret-s3cret").expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toMatch(/^indexer_lag_blocks 10$/m);
    expect(res.text).toMatch(/^tx_failures_total 0$/m);
    expect(res.text).toContain("# TYPE rpc_latency_ms histogram");
    expect(res.text).toContain("# TYPE relayer_balance gauge");
    expect(res.text).toMatch(/http_requests_total\{method="GET",route="\/api\/health",status="200"\} 1/);
    // Public path prefix must never serve it.
    await request(t.app).get("/api/metrics").expect(404);
  });

  it("is disabled in production unless a token is configured", async () => {
    t = await makeTestApp({});
    const off = loadConfig({
      ...TEST_ENV,
      NODE_ENV: "production",
      DATABASE_URL: "postgres://x",
      REDIS_URL: "redis://x",
      OTP_PROVIDER: "msg91",
    } as NodeJS.ProcessEnv);
    expect(off.metricsToken).toBeUndefined();
    expect(off.production).toBe(true);
  });

  it("counts failed relayer jobs by kind", async () => {
    metrics.reset();
    metrics.txFailures.inc({ kind: "grievance" });
    metrics.txFailures.inc({ kind: "grievance" });
    metrics.txFailures.inc({ kind: "upvote" });
    const out = metrics.render();
    expect(out).toContain('tx_failures_total{kind="grievance"} 2');
    expect(out).toContain('tx_failures_total{kind="upvote"} 1');
  });
});

// ─── KMS key custody ─────────────────────────────────────────────────────

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

function derInt(v: bigint): number[] {
  let hex = v.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const bytes = [...Buffer.from(hex, "hex")];
  if (bytes[0] & 0x80) bytes.unshift(0);
  return [0x02, bytes.length, ...bytes];
}
const derSig = (r: bigint, s: bigint) => {
  const body = [...derInt(r), ...derInt(s)];
  return Uint8Array.from([0x30, body.length, ...body]);
};

/** In-memory stand-in for AWS KMS. `highS` makes it return the non-canonical (high-s) form KMS may emit. */
function fakeKms(privateKey: string, hmacKey: Uint8Array, highS: boolean): KmsClient & { signs: number } {
  const key = new SigningKey(privateKey);
  const point = getBytes(key.publicKey); // 0x04 ‖ X ‖ Y
  const spki = Uint8Array.from([...Buffer.from("3056301006072a8648ce3d020106052b8104000a034200", "hex"), ...point]);
  const client = {
    signs: 0,
    async getPublicKey() {
      return spki;
    },
    async sign(_id: string, digest: Uint8Array) {
      client.signs++;
      const sig: Signature = key.sign(digest);
      const s = BigInt(sig.s);
      return derSig(BigInt(sig.r), highS ? N - s : s);
    },
    async generateMac(_id: string, message: Uint8Array) {
      return createHmac("sha256", hmacKey).update(message).digest();
    },
  };
  return client;
}

describe("KmsSigner", () => {
  const priv = "0x" + "11".repeat(32);
  const expected = new Wallet(priv).address;

  it("derives the Ethereum address from the KMS public key", async () => {
    const kms = fakeKms(priv, Buffer.alloc(32, 1), false);
    expect(addressFromSpki(await kms.getPublicKey("k"))).toBe(expected);
    expect((await KmsSigner.create(kms, "k")).address).toBe(expected);
  });

  it("parses DER signatures including ones with leading-zero padding", () => {
    const r = 0xf0000000000000000000000000000000000000000000000000000000000000ffn;
    const s = 0x01n;
    expect(parseDerSignature(derSig(r, s))).toEqual({ r, s });
  });

  for (const highS of [false, true]) {
    it(`signs messages, typed data and transactions that recover to the KMS address (KMS returns ${highS ? "high" : "low"}-s)`, async () => {
      const signer = await KmsSigner.create(fakeKms(priv, Buffer.alloc(32, 1), highS), "k");

      const message = "namma seva";
      expect(verifyMessage(message, await signer.signMessage(message))).toBe(expected);

      const domain = { name: "T", version: "1", chainId: 31337, verifyingContract: "0x" + "22".repeat(20) };
      const types = { Ping: [{ name: "n", type: "uint256" }] };
      expect(verifyTypedData(domain, types, { n: 7n }, await signer.signTypedData(domain, types, { n: 7n }))).toBe(expected);

      const raw = await signer.signTransaction({
        to: "0x" + "33".repeat(20),
        value: 1n,
        nonce: 5,
        gasLimit: 21_000,
        chainId: 31337,
        type: 2,
        maxFeePerGas: 2_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      });
      const tx = Transaction.from(raw);
      expect(tx.from).toBe(expected);
      // EIP-2: the signature must be canonical (low-s) no matter what KMS returned.
      expect(BigInt(tx.signature!.s) <= N / 2n).toBe(true);
    });
  }

  it("refuses a KMS signature that does not belong to the key", async () => {
    const good = fakeKms(priv, Buffer.alloc(32, 1), false);
    const other = new SigningKey("0x" + "22".repeat(32));
    const signer = await KmsSigner.create({ ...good, sign: async (_i, d) => derSig(BigInt(other.sign(d).r), BigInt(other.sign(d).s)) }, "k");
    await expect(signer.signMessage("x")).rejects.toThrow(/does not recover/);
  });

  it("rejects a transaction whose `from` is another address", async () => {
    const signer = await KmsSigner.create(fakeKms(priv, Buffer.alloc(32, 1), false), "k");
    await expect(signer.signTransaction({ from: Wallet.createRandom().address, to: "0x" + "33".repeat(20), chainId: 1 })).rejects.toThrow(/from address mismatch/);
  });
});

describe("citizen key derivation", () => {
  const hash = keccak256("0x1234");

  it("KMS HMAC derivation equals the local one when the KMS holds the same secret", async () => {
    const root = "0x" + "44".repeat(32);
    const kms = fakeKms("0x" + "11".repeat(32), getBytes(root), false);
    const viaKms = await new KmsCitizenKeys(kms, "hmac").derive(hash);
    expect(viaKms.address).toBe(deriveCitizenWallet(root, hash).address);
    expect((await new HmacCitizenKeys(root).derive(hash)).address).toBe(viaKms.address);
  });

  it("differs per citizen and per secret", async () => {
    const a = new KmsCitizenKeys(fakeKms("0x" + "11".repeat(32), Buffer.alloc(32, 1), false), "h");
    const b = new KmsCitizenKeys(fakeKms("0x" + "11".repeat(32), Buffer.alloc(32, 2), false), "h");
    expect((await a.derive(hash)).address).not.toBe((await a.derive(keccak256("0x5678"))).address);
    expect((await a.derive(hash)).address).not.toBe((await b.derive(hash)).address);
  });
});

describe("relayer key custody config", () => {
  const base = { ...TEST_ENV } as Record<string, string>;
  const load = (env: Record<string, string>) => loadConfig({ ...base, ...env } as NodeJS.ProcessEnv);

  it("accepts a KMS pair", () => {
    const c = load({ RELAYER_KMS_KEY_ID: "alias/relayer", RELAYER_KMS_HMAC_KEY_ID: "alias/relayer-hmac", AWS_REGION: "ap-south-1" });
    expect(c.relayer.kms).toEqual({ keyId: "alias/relayer", hmacKeyId: "alias/relayer-hmac", region: "ap-south-1", endpoint: undefined });
  });

  it("requires the signing and HMAC key ids together, and not alongside a hot key", () => {
    expect(() => load({ RELAYER_KMS_KEY_ID: "a" })).toThrow(/together/);
    expect(() => load({ RELAYER_KMS_HMAC_KEY_ID: "b" })).toThrow(/together/);
    expect(() => load({ RELAYER_KMS_KEY_ID: "a", RELAYER_KMS_HMAC_KEY_ID: "b", RELAYER_PRIVATE_KEY: "0x" + "11".repeat(32) })).toThrow(/either/);
  });

  it("refuses a hot relayer key on MST mainnet", () => {
    expect(() => load({ NS_CHAIN: "mstMainnet", RELAYER_PRIVATE_KEY: "0x" + "11".repeat(32) })).toThrow(/KMS/);
    expect(load({ NS_CHAIN: "mstMainnet", RELAYER_KMS_KEY_ID: "a", RELAYER_KMS_HMAC_KEY_ID: "b" }).relayer.kms).toBeDefined();
  });
});


describe("retention (CERT-In 180-day logs, data minimisation)", () => {
  const day = 24 * 60 * 60 * 1000;
  const NOW = new Date("2026-10-01T00:00:00Z");
  const ago = (days: number) => new Date(NOW.getTime() - days * day);

  beforeEach(async () => {
    t = await makeTestApp();
  });

  it("keeps audit rows for 180 days and deletes older ones", async () => {
    await t.db.insert(auditLog).values([
      { actor: "a", action: "login.siwe", at: ago(179) },
      { actor: "b", action: "login.siwe", at: ago(181) },
    ]);
    const r = await runRetention(t.db, { auditLogDays: 180, now: NOW });
    expect(r.auditLog).toBe(1);
    expect((await t.db.select().from(auditLog)).map((x) => x.actor)).toEqual(["a"]);
  });

  it("purges spent credentials but keeps live ones", async () => {
    const user = (await t.db.insert(users).values({ role: "CITIZEN", phoneHash: "0xaa" }).returning())[0];
    await t.db.insert(otpSessions).values([
      { phoneHash: "0x01", codeHash: "x", expiresAt: ago(2), windowStart: ago(2) },
      { phoneHash: "0x02", codeHash: "x", expiresAt: NOW, windowStart: ago(0) },
    ]);
    await t.db.insert(authNonces).values([
      { nonce: "old", expiresAt: ago(2) },
      { nonce: "fresh", expiresAt: new Date(NOW.getTime() + 60_000) },
    ]);
    await t.db.insert(authSessions).values([
      { userId: user.id, tokenHash: "0xe1", expiresAt: ago(1) }, // expired
      { userId: user.id, tokenHash: "0xe2", expiresAt: new Date(NOW.getTime() + day), revokedAt: ago(45) }, // revoked long ago
      { userId: user.id, tokenHash: "0xe3", expiresAt: new Date(NOW.getTime() + day), revokedAt: ago(2) }, // recently revoked: kept for forensics
      { userId: user.id, tokenHash: "0xe4", expiresAt: new Date(NOW.getTime() + day) }, // live
    ]);
    const r = await runRetention(t.db, { auditLogDays: 180, now: NOW });
    expect(r).toMatchObject({ otpSessions: 1, nonces: 1, sessions: 2 });
    expect((await t.db.select().from(authSessions)).map((s) => s.tokenHash).sort()).toEqual(["0xe3", "0xe4"]);
  });

  it("refuses a retention window shorter than CERT-In's 180 days", () => {
    expect(MIN_LOG_RETENTION_DAYS).toBe(180);
    expect(() => loadConfig({ ...TEST_ENV, AUDIT_LOG_RETENTION_DAYS: "90" } as NodeJS.ProcessEnv)).toThrow(/180/);
    expect(loadConfig({ ...TEST_ENV } as NodeJS.ProcessEnv).auditLogRetentionDays).toBe(180);
  });
});
