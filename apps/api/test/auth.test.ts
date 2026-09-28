import { auditLog, otpSessions, users } from "@namma-seva/db";
import { Wallet } from "ethers";
import { SiweMessage } from "siwe";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { phoneHash } from "../src/lib/hash";
import { makeTestApp } from "./helpers/app";

type T = Awaited<ReturnType<typeof makeTestApp>>;
let t: T;

beforeEach(async () => {
  t = await makeTestApp();
});
afterEach(async () => {
  await t.close();
});

async function siweMessage(wallet: Pick<Wallet, "address" | "signMessage">, over: Partial<{ domain: string; chainId: number; nonce: string }> = {}) {
  const nonceRes = await request(t.app).post("/api/auth/siwe/nonce").expect(200);
  expect(nonceRes.body).toMatchObject({ domain: "app.test", chainId: 31337 });
  const message = new SiweMessage({
    domain: over.domain ?? nonceRes.body.domain,
    address: wallet.address,
    statement: "Sign in to Namma Seva",
    uri: "http://app.test",
    version: "1",
    chainId: over.chainId ?? nonceRes.body.chainId,
    nonce: over.nonce ?? nonceRes.body.nonce,
    issuedAt: new Date().toISOString(),
  }).prepareMessage();
  return { message, signature: await wallet.signMessage(message) };
}

describe("SIWE", () => {
  it("signs in with roles read from chain, and a nonce cannot be replayed", async () => {
    const wallet = Wallet.createRandom();
    t.roles.roles.set(wallet.address.toLowerCase(), ["GOVT_OFFICIAL"]);
    const body = await siweMessage(wallet);

    const res = await request(t.app).post("/api/auth/siwe/verify").send(body).expect(200);
    expect(res.body.user).toMatchObject({
      role: "GOVT_OFFICIAL",
      roles: ["GOVT_OFFICIAL"],
      walletAddress: wallet.address.toLowerCase(),
      citizenHash: null,
    });
    expect(res.body.expiresIn).toBe(900);
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toMatch(/^ns_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);

    const me = await request(t.app).get("/api/auth/me").set("authorization", `Bearer ${res.body.accessToken}`).expect(200);
    expect(me.body.walletAddress).toBe(wallet.address.toLowerCase());

    await request(t.app).post("/api/auth/siwe/verify").send(body).expect(401);
    expect(await t.db.select().from(auditLog)).toHaveLength(1);
  });

  it("rejects a message for another chain or domain, or a forged signature", async () => {
    const wallet = Wallet.createRandom();
    await request(t.app).post("/api/auth/siwe/verify").send(await siweMessage(wallet, { chainId: 1 })).expect(401);
    await request(t.app).post("/api/auth/siwe/verify").send(await siweMessage(wallet, { domain: "evil.test" })).expect(401);
    const forged = await siweMessage(wallet);
    forged.signature = await Wallet.createRandom().signMessage(forged.message);
    const res = await request(t.app).post("/api/auth/siwe/verify").send(forged).expect(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("wallets without an on-chain role sign in as PUBLIC", async () => {
    const res = await request(t.app).post("/api/auth/siwe/verify").send(await siweMessage(Wallet.createRandom())).expect(200);
    expect(res.body.user).toMatchObject({ role: "PUBLIC", roles: [] });
  });

  it("rotates the refresh cookie and re-reads roles from chain", async () => {
    const wallet = Wallet.createRandom();
    t.roles.roles.set(wallet.address.toLowerCase(), ["AUDITOR"]);
    const login = await request(t.app).post("/api/auth/siwe/verify").send(await siweMessage(wallet)).expect(200);
    const cookie = login.headers["set-cookie"][0].split(";")[0];

    t.roles.roles.set(wallet.address.toLowerCase(), []); // role revoked on-chain
    const refreshed = await request(t.app).post("/api/auth/refresh").set("cookie", cookie).expect(200);
    expect(refreshed.body.user.role).toBe("PUBLIC");

    await request(t.app).post("/api/auth/refresh").set("cookie", cookie).expect(401); // old token is spent
    const next = refreshed.headers["set-cookie"][0].split(";")[0];
    await request(t.app).post("/api/auth/logout").set("cookie", next).expect(204);
    await request(t.app).post("/api/auth/refresh").set("cookie", next).expect(401);
  });
});

describe("phone OTP", () => {
  it("signs a citizen in and stores only the phone hash", async () => {
    await request(t.app).post("/api/auth/otp/send").send({ phone: "98450 12345" }).expect(200);
    const code = t.otp.last.get("+919845012345")!;
    expect(code).toMatch(/^\d{6}$/);

    const wrong = code === "000000" ? "111111" : "000000";
    await request(t.app).post("/api/auth/otp/verify").send({ phone: "9845012345", code: wrong }).expect(401);
    const res = await request(t.app).post("/api/auth/otp/verify").send({ phone: "+91 98450 12345", code }).expect(200);

    const hash = phoneHash("+919845012345", "pepper");
    expect(res.body.user).toMatchObject({ role: "CITIZEN", citizenHash: hash, walletAddress: null });
    const rows = await t.db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("9845012345");
    expect(await t.db.select().from(otpSessions)).toHaveLength(0); // code consumed

    await request(t.app).post("/api/auth/otp/verify").send({ phone: "9845012345", code }).expect(401);
  });

  it("locks the code after 5 wrong attempts", async () => {
    await request(t.app).post("/api/auth/otp/send").send({ phone: "9845012345" }).expect(200);
    const code = t.otp.last.get("+919845012345")!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await request(t.app).post("/api/auth/otp/verify").send({ phone: "9845012345", code: wrong });
    await request(t.app).post("/api/auth/otp/verify").send({ phone: "9845012345", code }).expect(401);
  });

  it("validates input and rate-limits sends", async () => {
    const bad = await request(t.app).post("/api/auth/otp/send").send({ phone: "12345" }).expect(400);
    expect(bad.body.error).toBe("bad_request");
    await request(t.app).post("/api/auth/otp/send").send({}).expect(400);
    for (let i = 0; i < 3; i++) await request(t.app).post("/api/auth/otp/send").send({ phone: "9845012345" }).expect(200);
    // 5 per 10 min per IP at the edge (the 1st bad-format request above counts too).
    await request(t.app).post("/api/auth/otp/send").send({ phone: "9845012345" }).expect(429);
  });
});

describe("demo mode", () => {
  it("demo role cards are off unless NS_DEMO_MODE=true", async () => {
    await request(t.app).post("/api/auth/demo").send({ role: "AUDITOR" }).expect(404);
    const demo = await makeTestApp({ NS_DEMO_MODE: "true" });
    try {
      const res = await request(demo.app).post("/api/auth/demo").send({ role: "AUDITOR" }).expect(200);
      expect(res.body.user).toMatchObject({ role: "AUDITOR", demo: true });
      expect(res.headers["set-cookie"]).toBeUndefined();
    } finally {
      await demo.close();
    }
  });
});
