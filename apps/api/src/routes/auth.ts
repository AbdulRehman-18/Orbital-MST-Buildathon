import { auditLog, consents, desc, eq, users, type Db } from "@namma-seva/db";
import {
  DemoLoginBody,
  SendOtpBody,
  VerifyOtpBody,
  VerifySiweBody,
} from "@namma-seva/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware";
import { sendOtp, verifyOtp, OTP_TTL_SECONDS } from "../auth/otp";
import { primaryRole, sessionUserById, upsertCitizenUser, upsertWalletUser } from "../auth/roles";
import { issueNonce, SiweError, verifySiwe } from "../auth/siwe";
import { ACCESS_TTL_SECONDS, SESSION_COOKIE, type Role, type SessionUser } from "../auth/tokens";
import type { AppContext } from "../context";
import { ipHash, normalizePhone, phoneHash } from "../lib/hash";
import { badRequest, handler, notFound, parse, tooMany, unauthorized } from "../lib/http";

export default function authRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const { db, tokens, config } = ctx;

  async function issue(res: Response, user: SessionUser, withSession = true) {
    if (withSession) await tokens.startSession(db, res, user.id);
    res.json({ accessToken: await tokens.signAccess(user), expiresIn: ACCESS_TTL_SECONDS, user });
  }

  async function audit(req: Request, actor: string, action: string) {
    await db.insert(auditLog).values({
      actor,
      action,
      entity: "session",
      requestId: String(req.id ?? ""),
      ipHash: ipHash(req.ip, config.auth.phonePepper),
    });
  }

  // ─── SIWE (officials, auditors, contractors, admins) ───────────────────
  router.post(
    "/auth/siwe/nonce",
    handler(async (_req, res) => {
      const { nonce, expiresAt } = await issueNonce(db);
      res.json({ nonce, domain: config.auth.siweDomain, chainId: config.network.id, expiresAt });
    }),
  );

  router.post(
    "/auth/siwe/verify",
    handler(async (req, res) => {
      const body = parse(VerifySiweBody, req.body);
      let address: string;
      try {
        address = await verifySiwe(db, body.message, body.signature, {
          domain: config.auth.siweDomain,
          chainId: config.network.id,
          provider: ctx.chain?.provider,
        });
      } catch (err) {
        if (err instanceof SiweError) throw unauthorized(err.message);
        throw err;
      }
      const user = await upsertWalletUser(db, ctx.roles, address);
      await audit(req, address, "login.siwe");
      await issue(res, user);
    }),
  );

  /** DPDP Act 2023: no OTP is sent, and no citizen is signed in, without the current notice accepted. */
  function requireCurrentNotice(version: string) {
    if (version !== config.consentVersion) {
      throw badRequest("The Privacy Notice was updated — reload the page and accept the current notice.");
    }
  }

  // ─── Phone OTP (citizens) ──────────────────────────────────────────────
  router.post(
    "/auth/otp/send",
    handler(async (req, res) => {
      const { phone, consentVersion } = parse(SendOtpBody, req.body);
      requireCurrentNotice(consentVersion);
      const e164 = normalizePhone(phone);
      if (!e164) throw badRequest("Enter a valid mobile number");
      const hash = phoneHash(e164, config.auth.phonePepper);
      const result = await sendOtp(db, ctx.otp, e164, hash, config.demoMode ? 1000 : undefined);
      if (!result.ok) throw tooMany("Too many codes requested — try again in an hour");
      // Demo mode shows the code on screen so anyone can try the citizen flow (never in production).
      res.json({ sent: true, expiresIn: OTP_TTL_SECONDS, ...(config.demoMode ? { devCode: result.code } : {}) });
    }),
  );

  router.post(
    "/auth/otp/verify",
    handler(async (req, res) => {
      const { phone, code, consentVersion, lang } = parse(VerifyOtpBody, req.body);
      requireCurrentNotice(consentVersion);
      const e164 = normalizePhone(phone);
      if (!e164) throw badRequest("Enter a valid mobile number");
      const hash = phoneHash(e164, config.auth.phonePepper);
      if (!(await verifyOtp(db, hash, code))) throw unauthorized("Wrong or expired code");
      const user = await upsertCitizenUser(db, hash);
      // One row per notice version: log in again with the same notice and nothing new is written.
      const [latest] = await db.select().from(consents).where(eq(consents.userId, user.id)).orderBy(desc(consents.acceptedAt)).limit(1);
      if (latest?.version !== consentVersion || latest.withdrawnAt) {
        await db.insert(consents).values({ userId: user.id, version: consentVersion, lang: lang ?? "en" });
      }
      await audit(req, `citizen:${hash.slice(0, 10)}`, "login.otp");
      await issue(res, user);
    }),
  );

  // ─── Session ───────────────────────────────────────────────────────────
  router.post(
    "/auth/refresh",
    handler(async (req, res) => {
      const userId = await tokens.consumeSession(db, req.cookies?.[SESSION_COOKIE]);
      const user = userId ? await sessionUserById(db, ctx.roles, userId) : null;
      if (!user) {
        tokens.clearCookie(res);
        throw unauthorized("Session expired");
      }
      await issue(res, user);
    }),
  );

  router.post(
    "/auth/logout",
    handler(async (req, res) => {
      await tokens.consumeSession(db, req.cookies?.[SESSION_COOKIE]);
      tokens.clearCookie(res);
      res.status(204).end();
    }),
  );

  router.get("/auth/me", requireAuth(), (req, res) => {
    res.json(req.user);
  });

  // ─── Demo role cards (NS_DEMO_MODE only, plan §10) ─────────────────────
  router.post(
    "/auth/demo",
    handler(async (req, res) => {
      if (!config.demoMode) throw notFound();
      const { role } = parse(DemoLoginBody, req.body);
      const user = await demoUser(db, role as Role);
      await issue(res, user, false);
    }),
  );

  return router;
}

async function demoUser(db: Db, role: Role): Promise<SessionUser> {
  const [row] = await db
    .insert(users)
    .values({ role, displayName: `DEMO ${role}` })
    .returning();
  const roles = role === "PUBLIC" ? [] : [role];
  return {
    id: row.id,
    role: role === "CITIZEN" ? "CITIZEN" : primaryRole(roles),
    roles,
    walletAddress: null,
    citizenHash: role === "CITIZEN" ? `0x${"de".repeat(32)}` : null,
    wards: [],
    preferredLang: "en",
    demo: true,
  };
}
