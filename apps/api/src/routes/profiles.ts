import { accountProfiles, asc, auditLog, eq } from "@namma-seva/db";
import { DeleteProfileParams, SetProfileBody, SetProfileParams } from "@namma-seva/api-zod";
import { Router, type IRouter } from "express";
import { requireAuth } from "../auth/middleware";
import type { AppContext } from "../context";
import { handler, parse } from "../lib/http";

/**
 * Display names for wallets — contractor firms, offices — so the UI can show "Sri Ganesh
 * Constructions" instead of 0x15d3…6a65. Names are public and set only by an admin; the address
 * remains the on-chain identity and is always shown alongside for verification.
 */
export default function profileRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const { db } = ctx;

  router.get(
    "/profiles",
    handler(async (_req, res) => {
      const rows = await db.select().from(accountProfiles).orderBy(asc(accountProfiles.name));
      res.json(rows.map(({ updatedBy: _u, ...p }) => p));
    }),
  );

  router.put(
    "/profiles/:address",
    requireAuth("ADMIN"),
    handler(async (req, res) => {
      const address = parse(SetProfileParams, req.params).address.toLowerCase();
      const body = parse(SetProfileBody, req.body);
      const values = {
        name: body.name.trim(),
        title: body.title?.trim() || null,
        updatedBy: req.user!.walletAddress,
        updatedAt: new Date(),
      };
      const [row] = await db
        .insert(accountProfiles)
        .values({ address, ...values })
        .onConflictDoUpdate({ target: accountProfiles.address, set: values })
        .returning();
      await db.insert(auditLog).values({
        actor: req.user!.walletAddress ?? req.user!.id,
        action: "profile.set",
        entity: "account",
        entityId: address,
        requestId: String(req.id ?? ""),
      });
      const { updatedBy: _u, ...profile } = row;
      res.json(profile);
    }),
  );

  router.delete(
    "/profiles/:address",
    requireAuth("ADMIN"),
    handler(async (req, res) => {
      const address = parse(DeleteProfileParams, req.params).address.toLowerCase();
      await db.delete(accountProfiles).where(eq(accountProfiles.address, address));
      await db.insert(auditLog).values({
        actor: req.user!.walletAddress ?? req.user!.id,
        action: "profile.delete",
        entity: "account",
        entityId: address,
        requestId: String(req.id ?? ""),
      });
      res.status(204).end();
    }),
  );

  return router;
}
