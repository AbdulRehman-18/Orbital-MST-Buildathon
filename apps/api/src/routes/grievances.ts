import { and, desc, eq, grievances, grievanceUpvotes, inArray, pinnedMetadata, projects, type SQL } from "@namma-seva/db";
import {
  FileGrievanceBody,
  GetGrievanceParams,
  GetRelayJobParams,
  ListGrievancesQueryParams,
  UpvoteGrievanceParams,
} from "@namma-seva/api-zod";
import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware";
import { GRIEVANCE_CATEGORY } from "../chain/contracts";
import type { AppContext } from "../context";
import { pinJson } from "../ipfs/metadata";
import { sha256Hex } from "../lib/hash";
import { geofenceFor } from "../proof/checks";
import { processImage } from "../proof/image";
import { haversineM, readExif, upload } from "./milestones";
import { badRequest, conflict, handler, HttpError, notFound, parse, unauthorized, unavailable } from "../lib/http";
import { RelayerError, type Relayer } from "../relayer/relayer";

const PhotoFields = z.object({
  projectId: z.coerce.number().int().min(1),
  /** Device location at capture time, used when the photo itself carries no GPS. */
  latE6: z.coerce.number().int().min(-90_000_000).max(90_000_000).optional(),
  lngE6: z.coerce.number().int().min(-180_000_000).max(180_000_000).optional(),
  source: z.enum(["camera", "gallery"]).optional(),
});

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
      // Photos must be records this server pinned for this project (their location check is ours, not the client's).
      const photoCids = [...new Set(body.photoCids ?? [])];
      if (photoCids.length) {
        const rows = await db
          .select({ body: pinnedMetadata.body })
          .from(pinnedMetadata)
          .where(and(inArray(pinnedMetadata.cid, photoCids), eq(pinnedMetadata.kind, "grievance-photo")));
        if (rows.length !== photoCids.length || rows.some((r) => r.body.projectId !== body.projectId)) {
          throw badRequest("Add photos with the app's photo button");
        }
      }
      const r = relayer();
      const [p] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, body.projectId));
      if (!p) throw notFound("Project not found");
      if (p.status === "CANCELLED") throw badRequest("This project is cancelled and no longer accepts grievances");

      // The text is pinned off-chain (it may identify the citizen); only its CID goes on-chain.
      const pinned = await pinJson(
        db,
        ctx.ipfs,
        "grievance",
        { projectId: body.projectId, category: body.category, text: body.text, lang: body.lang ?? "en", photoCids },
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

  /**
   * A citizen's photo of a site. Pins the re-encoded image (EXIF stripped) plus a small public record:
   * how far from the project site it was taken and whether that is within the site's geofence. The
   * raw coordinates are not published: a phone's fix can be the citizen's home.
   */
  router.post(
    "/grievances/photos",
    requireAuth("CITIZEN"),
    upload.single("photo"),
    handler(async (req, res) => {
      citizen(req);
      const f = parse(PhotoFields, req.body);
      if (!req.file) throw badRequest("Attach a photo");
      const [p] = await db
        .select({ latE6: projects.latE6, lngE6: projects.lngE6, category: projects.category })
        .from(projects)
        .where(eq(projects.id, f.projectId));
      if (!p) throw notFound("Project not found");

      const exif = await readExif(req.file.buffer);
      let img;
      try {
        img = await processImage(req.file.buffer);
      } catch {
        throw badRequest("That file is not a readable image");
      }
      const at =
        exif.lat !== null && exif.lng !== null
          ? { lat: exif.lat, lng: exif.lng, from: "photo" as const }
          : f.latE6 !== undefined && f.lngE6 !== undefined && (f.latE6 !== 0 || f.lngE6 !== 0)
            ? { lat: f.latE6 / 1e6, lng: f.lngE6 / 1e6, from: "device" as const }
            : null;
      const distanceM = at ? Math.round(haversineM({ lat: p.latE6 / 1e6, lng: p.lngE6 / 1e6 }, at)) : null;
      const sha256 = sha256Hex(img.image);
      const base = `grievance-photo-${sha256.slice(2, 14)}`;
      const record = {
        projectId: f.projectId,
        image: await ctx.ipfs.pin(img.image, `${base}.jpg`, "image/jpeg"),
        thumb: await ctx.ipfs.pin(img.thumbnail, `${base}-thumb.jpg`, "image/jpeg"),
        sha256,
        takenAt: exif.time?.toISOString() ?? null,
        source: f.source ?? null,
        locationFrom: at?.from ?? null,
        distanceM,
        nearSite: distanceM !== null && distanceM <= geofenceFor(p.category),
      };
      const pinned = await pinJson(db, ctx.ipfs, "grievance-photo", record, null);
      res.status(201).json({ cid: pinned.cid, ...record });
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
