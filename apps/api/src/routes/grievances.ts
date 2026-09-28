import { and, desc, eq, grievances, grievanceUpvotes, inArray, projects, type SQL } from "@namma-seva/db";
import {
  FileGrievanceBody,
  GetGrievanceParams,
  GetRelayJobParams,
  ListGrievancesQueryParams,
  UpvoteGrievanceParams,
} from "@namma-seva/api-zod";
import { Router, type IRouter, type Request } from "express";
import { requireAuth } from "../auth/middleware";
import { GRIEVANCE_CATEGORY } from "../chain/contracts";
import type { AppContext } from "../context";
import { pinJson } from "../ipfs/metadata";
import { badRequest, conflict, handler, HttpError, notFound, parse, unauthorized, unavailable } from "../lib/http";
import { RelayerError, type Relayer } from "../relayer/relayer";

export default function grievanceRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const { db } = ctx;

  const relayer = (): Relayer => {
    if (!ctx.relayer) throw unavailable("Gasless submissions are not configured (RELAYER_PRIVATE_KEY)");
    return ctx.relayer;
  };
  const citizen = (req: Request) => {
    const hash = req.user?.citizenHash;
    if (!hash) throw unauthorized("Sign in with your phone number first");
    if (req.user!.demo) throw badRequest("Demo sessions cannot submit on-chain");
    return hash;
  };

  function view(g: typeof grievances.$inferSelect, me: string | null | undefined, upvoted: Set<number>) {
    const { citizenHash, updatedBlock: _u, ...rest } = g;
    return { ...rest, mine: !!me && citizenHash === me, upvotedByMe: upvoted.has(g.id) };
  }

  async function myUpvotes(me: string | null | undefined, ids: number[]): Promise<Set<number>> {
    if (!me || ids.length === 0) return new Set();
    const rows = await db
      .select({ id: grievanceUpvotes.grievanceId })
      .from(grievanceUpvotes)
      .where(and(eq(grievanceUpvotes.citizenHash, me), inArray(grievanceUpvotes.grievanceId, ids)));
    return new Set(rows.map((r) => r.id));
  }

  router.get(
    "/grievances",
    handler(async (req, res) => {
      const q = parse(ListGrievancesQueryParams, req.query);
      const me = req.user?.citizenHash;
      const where: SQL[] = [];
      if (q.projectId !== undefined) where.push(eq(grievances.projectId, q.projectId));
      if (q.status) where.push(eq(grievances.status, q.status));
      if (q.mine) {
        if (!me) throw unauthorized();
        where.push(eq(grievances.citizenHash, me));
      }
      const rows = await db
        .select()
        .from(grievances)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(grievances.id))
        .limit(q.limit ?? 50)
        .offset(q.offset ?? 0);
      const upvoted = await myUpvotes(me, rows.map((r) => r.id));
      res.json(rows.map((g) => view(g, me, upvoted)));
    }),
  );

  router.get(
    "/grievances/:id",
    handler(async (req, res) => {
      const { id } = parse(GetGrievanceParams, req.params);
      const [g] = await db.select().from(grievances).where(eq(grievances.id, id));
      if (!g) throw notFound("Grievance not indexed yet");
      const me = req.user?.citizenHash;
      res.json(view(g, me, await myUpvotes(me, [id])));
    }),
  );

  router.post(
    "/grievances",
    requireAuth("CITIZEN"),
    handler(async (req, res) => {
      const me = citizen(req);
      const body = parse(FileGrievanceBody, req.body);
      const r = relayer();
      const [p] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, body.projectId));
      if (!p) throw notFound("Project not found");
      if (p.status === "CANCELLED") throw badRequest("This project is cancelled and no longer accepts grievances");

      // The text is pinned off-chain (it may identify the citizen); only its CID goes on-chain.
      const pinned = await pinJson(
        db,
        ctx.ipfs,
        "grievance",
        { projectId: body.projectId, category: body.category, text: body.text, lang: body.lang ?? "en", photoCids: body.photoCids ?? [] },
        null,
      );
      const job = await relay(() =>
        r.enqueueGrievance(req.user!.id, me, {
          projectId: body.projectId,
          category: GRIEVANCE_CATEGORY.indexOf(body.category),
          cid: pinned.cid,
        }),
      );
      res.status(202).json(job);
    }),
  );

  router.post(
    "/grievances/:id/upvote",
    requireAuth("CITIZEN"),
    handler(async (req, res) => {
      const me = citizen(req);
      const { id } = parse(UpvoteGrievanceParams, req.params);
      const r = relayer();
      const [g] = await db.select().from(grievances).where(eq(grievances.id, id));
      if (!g) throw notFound("Grievance not found");
      if (g.citizenHash === me) throw conflict("You cannot upvote your own grievance");
      if (g.status === "RESPONDED") throw conflict("This grievance has already been answered");
      if ((await myUpvotes(me, [id])).size) throw conflict("Already upvoted");
      res.status(202).json(await relay(() => r.enqueueUpvote(req.user!.id, me, id)));
    }),
  );

  router.get(
    "/relay/jobs/:jobId",
    requireAuth(),
    handler(async (req, res) => {
      const { jobId } = parse(GetRelayJobParams, req.params);
      const r = relayer();
      const owner = await r.jobOwner(jobId);
      if (!owner || owner !== req.user!.id) throw notFound("Unknown job");
      const job = await r.job(jobId);
      if (!job) throw notFound("Unknown job");
      res.json(job);
    }),
  );

  return router;
}

async function relay<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RelayerError) throw new HttpError(err.status, err.status === 429 ? "rate_limited" : "relayer", err.message);
    throw err;
  }
}
