// DPDP Act 2023 data-principal rights (plan §17): access (export) and erasure of the off-chain
// personal data of a citizen account. Wallet roles are governed on-chain and are not erasable here.
import { EraseMyDataResponse, ExportMyDataResponse } from "@namma-seva/api-zod";
import {
  authSessions,
  consents,
  auditLog,
  eq,
  grievanceUpvotes,
  grievances,
  otpSessions,
  pendingTxs,
  relayerTxs,
  users,
} from "@namma-seva/db";
import { Router, type IRouter } from "express";
import { requireAuth } from "../auth/middleware";
import type { AppContext } from "../context";
import { conflict, handler, notFound } from "../lib/http";

export const PRIVACY_NOTICE_EXPORT =
  "Blockchain records (grievances and upvotes) are public and permanent. They carry only the anonymous code shown here, never your name or phone number.";

export default function privacyRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const { db } = ctx;

  router.get(
    "/me/data",
    requireAuth(),
    handler(async (req, res) => {
      const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
      if (!user) throw notFound("Account not found");
      const hash = user.phoneHash;
      const [myConsents, myGrievances, myUpvotes] = await Promise.all([
        db.select().from(consents).where(eq(consents.userId, user.id)).orderBy(consents.acceptedAt),
        hash ? db.select().from(grievances).where(eq(grievances.citizenHash, hash)).orderBy(grievances.id) : [],
        hash ? db.select({ id: grievanceUpvotes.grievanceId }).from(grievanceUpvotes).where(eq(grievanceUpvotes.citizenHash, hash)) : [],
      ]);
      const body = ExportMyDataResponse.parse({
        exportedAt: new Date(),
        account: {
          id: user.id,
          role: user.role,
          walletAddress: user.walletAddress,
          hasPhone: Boolean(hash),
          preferredLang: user.preferredLang,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        },
        consents: myConsents.map((c) => ({
          purpose: c.purpose,
          version: c.version,
          lang: c.lang,
          acceptedAt: c.acceptedAt,
          withdrawnAt: c.withdrawnAt,
        })),
        grievances: myGrievances.map((g) => ({
          id: g.id,
          projectId: g.projectId,
          category: g.category,
          status: g.status,
          createdAt: g.createdAt,
        })),
        upvotes: myUpvotes.length,
        notice: PRIVACY_NOTICE_EXPORT,
      });
      res.setHeader("content-disposition", 'attachment; filename="namma-seva-my-data.json"');
      res.json(body);
    }),
  );

  router.delete(
    "/me/data",
    requireAuth(),
    handler(async (req, res) => {
      const me = req.user!;
      // Officials, auditors and contractors act under on-chain roles — nothing off-chain to erase but a session.
      if (!me.citizenHash) throw conflict("Wallet roles are governed on-chain; sign out to end your session.");

      const result = await db.transaction(async (tx) => {
        const deletedConsents = await tx.delete(consents).where(eq(consents.userId, me.id)).returning({ id: consents.id });
        const revoked = await tx.delete(authSessions).where(eq(authSessions.userId, me.id)).returning({ id: authSessions.id });
        await tx.delete(otpSessions).where(eq(otpSessions.phoneHash, me.citizenHash!));
        // Break the link from operational records to the account; the anonymous code itself stays,
        // because it is part of public on-chain grievances.
        await tx.update(relayerTxs).set({ userId: null }).where(eq(relayerTxs.userId, me.id));
        await tx.update(pendingTxs).set({ userId: null }).where(eq(pendingTxs.userId, me.id));
        await tx.delete(users).where(eq(users.id, me.id));
        await tx.insert(auditLog).values({
          actor: "citizen:erased",
          action: "privacy.erase",
          entity: "user",
          requestId: req.id ? String(req.id) : null,
        });
        return { consentsDeleted: deletedConsents.length, sessionsRevoked: revoked.length };
      });

      ctx.tokens.clearCookie(res);
      res.json(EraseMyDataResponse.parse({ erased: true, ...result }));
    }),
  );

  return router;
}
