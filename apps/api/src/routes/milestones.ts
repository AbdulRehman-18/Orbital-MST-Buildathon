import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  milestoneApprovals,
  ne,
  milestones,
  projects,
  proofMedia,
  type SQL,
} from "@namma-seva/db";
import {
  GetMilestoneParams,
  GetMilestoneProofParams,
  ListMilestonesQueryParams,
  ListPendingMilestonesQueryParams,
  UploadMilestoneProofParams,
} from "@namma-seva/api-zod";
import exifr from "exifr";
import { Router, type IRouter } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../auth/middleware";
import type { AppContext } from "../context";
import { pinJson } from "../ipfs/metadata";
import { sha256Hex } from "../lib/hash";
import { allPassed, checkCapture, checkGeofence, checkTime, findDuplicate, geofenceFor, type ProofChecks } from "../proof/checks";
import { processImage } from "../proof/image";
import { badRequest, forbidden, handler, notFound, parse } from "../lib/http";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 10 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(badRequest(`Unsupported file type ${file.mimetype}`));
  },
});

const ProofFields = z.object({
  latE6: z.coerce.number().int().min(-90_000_000).max(90_000_000).optional(),
  lngE6: z.coerce.number().int().min(-180_000_000).max(180_000_000).optional(),
  note: z.string().max(1000).optional(),
  source: z.enum(["camera", "gallery"]).optional(),
});

export default function milestoneRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const { db } = ctx;

  /** Dashboard queues: milestones joined with their project and the current round's approvers. */
  router.get(
    "/milestones",
    handler(async (req, res) => {
      const q = parse(ListMilestonesQueryParams, req.query);
      const where: SQL[] = [];
      if (q.projectId !== undefined) where.push(eq(milestones.projectId, q.projectId));
      if (q.status) where.push(eq(milestones.status, q.status));
      if (q.contractor) where.push(eq(projects.contractorAddr, q.contractor.toLowerCase()));
      if (q.official) where.push(eq(projects.officialAddr, q.official.toLowerCase()));
      if (q.wardId !== undefined) where.push(eq(projects.wardId, q.wardId));
      const rows = await db
        .select({ m: milestones, p: projects })
        .from(milestones)
        .innerJoin(projects, eq(projects.id, milestones.projectId))
        .where(where.length ? and(...where) : undefined)
        .orderBy(asc(milestones.projectId), asc(milestones.id))
        .limit(500);
      const ids = rows.map((r) => r.m.id);
      const approvals = ids.length
        ? await db
            .select()
            .from(milestoneApprovals)
            .where(inArray(milestoneApprovals.milestoneId, ids))
        : [];
      res.json(
        rows.map(({ m, p }) => ({
          ...m,
          approvers: approvals.filter((a) => a.milestoneId === m.id && a.round === m.round).map((a) => a.auditorAddr),
          project: {
            id: p.id,
            title: p.title,
            status: p.status,
            wardId: p.wardId,
            latE6: p.latE6,
            lngE6: p.lngE6,
            officialAddr: p.officialAddr,
            contractorAddr: p.contractorAddr,
            approvalThreshold: p.approvalThreshold,
          },
        })),
      );
    }),
  );

  router.get(
    "/milestones/pending",
    handler(async (req, res) => {
      const q = parse(ListPendingMilestonesQueryParams, req.query);
      const where: SQL[] = [eq(milestones.status, "PROOF_SUBMITTED")];
      if (q.wardId !== undefined) where.push(eq(projects.wardId, q.wardId));
      const rows = await db
        .select({ m: milestones })
        .from(milestones)
        .innerJoin(projects, eq(projects.id, milestones.projectId))
        .where(and(...where))
        .orderBy(asc(milestones.submittedAt));
      res.json(rows.map((r) => r.m));
    }),
  );

  router.get(
    "/milestones/:id",
    handler(async (req, res) => {
      const { id } = parse(GetMilestoneParams, req.params);
      const [m] = await db.select().from(milestones).where(eq(milestones.id, id));
      if (!m) throw notFound("Milestone not indexed yet");
      res.json(m);
    }),
  );

  router.get(
    "/milestones/:id/proof",
    handler(async (req, res) => {
      const { id } = parse(GetMilestoneProofParams, req.params);
      const media = await db
        .select()
        .from(proofMedia)
        .where(eq(proofMedia.milestoneId, id))
        .orderBy(asc(proofMedia.createdAt));
      res.json(media.map(publicMedia));
    }),
  );

  /** Upload photos → EXIF/GPS check → pin photos + proof.json → args for `submitProof`. */
  router.post(
    "/milestones/:id/proof/upload",
    requireAuth("CONTRACTOR"),
    upload.array("photos", 5),
    handler(async (req, res) => {
      const { id } = parse(UploadMilestoneProofParams, req.params);
      const fields = parse(ProofFields, req.body);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) throw badRequest("Attach at least one photo");

      const [row] = await db
        .select({ m: milestones, p: projects })
        .from(milestones)
        .innerJoin(projects, eq(projects.id, milestones.projectId))
        .where(eq(milestones.id, id));
      if (!row) throw notFound("Milestone not indexed yet");
      const { m, p } = row;
      if (p.contractorAddr && req.user!.walletAddress !== p.contractorAddr) {
        throw forbidden("Only the project's assigned contractor can submit proof");
      }
      if (m.status !== "PENDING" && m.status !== "REJECTED") {
        throw badRequest(`Milestone is ${m.status}; proof can only be submitted while PENDING or REJECTED`);
      }

      const site = { lat: p.latE6 / 1e6, lng: p.lngE6 / 1e6 };
      const limitM = geofenceFor(p.category);
      const uploadedAt = new Date();
      const others = await db
        .select({ milestoneId: proofMedia.milestoneId, phash: proofMedia.phash })
        .from(proofMedia)
        .where(and(isNotNull(proofMedia.phash), ne(proofMedia.milestoneId, id)));
      const warnings: string[] = [];
      const media = [];
      for (const file of files) {
        // EXIF is read from the untouched upload; the pinned image is re-encoded without it.
        const exif = await readExif(file.buffer);
        let processed;
        try {
          processed = await processImage(file.buffer);
        } catch {
          throw badRequest(`${file.originalname}: not a readable image`);
        }
        const sha256 = sha256Hex(processed.image);
        const distance = exif.lat !== null && exif.lng !== null ? haversineM(site, { lat: exif.lat, lng: exif.lng }) : null;
        const dup = findDuplicate(processed.phash, others);
        const checks: ProofChecks = {
          capture: checkCapture({ strict: ctx.config.proofStrict, source: fields.source, hasExifTime: exif.time !== null }),
          geofence: checkGeofence(distance, limitM),
          time: checkTime(exif.time, uploadedAt, m.createdAt),
          duplicate: dup
            ? { ok: false, detail: `Matches a photo on milestone #${dup.match.milestoneId}` }
            : { ok: true },
        };
        for (const [name, r] of Object.entries(checks)) if (!r.ok) warnings.push(`${file.originalname}: ${name} — ${r.detail}`);
        const base = `proof-${id}-${sha256.slice(2, 14)}`;
        const cid = await ctx.ipfs.pin(processed.image, `${base}.jpg`, "image/jpeg");
        const thumbCid = await ctx.ipfs.pin(processed.thumbnail, `${base}-thumb.jpg`, "image/jpeg");
        media.push({
          cid,
          thumbCid,
          sha256,
          mime: "image/jpeg",
          width: processed.width,
          height: processed.height,
          exifLat: exif.lat,
          exifLng: exif.lng,
          exifTime: exif.time,
          gpsDistanceM: distance,
          phash: processed.phash,
          checks,
          flagged: !allPassed(checks),
        });
      }

      // Proof location: first photo with EXIF GPS, else the device fix sent with the form.
      const gps = media.find((x) => x.exifLat !== null && x.exifLng !== null);
      const latE6 = gps ? Math.round(gps.exifLat! * 1e6) : fields.latE6;
      const lngE6 = gps ? Math.round(gps.exifLng! * 1e6) : fields.lngE6;
      if (latE6 === undefined || lngE6 === undefined) {
        throw badRequest("No GPS in the photos — enable location and send latE6/lngE6 from the device");
      }
      if (latE6 === 0 && lngE6 === 0) throw badRequest("Invalid GPS fix (0, 0)");

      const proof = await pinJson(
        db,
        ctx.ipfs,
        "proof",
        {
          milestoneId: id,
          projectId: m.projectId,
          round: m.round,
          contractor: req.user!.walletAddress,
          latE6,
          lngE6,
          note: fields.note,
          capturedAt: media.find((x) => x.exifTime)?.exifTime?.toISOString() ?? null,
          images: media.map((x) => ({
            cid: x.cid,
            thumbCid: x.thumbCid,
            sha256: x.sha256,
            mime: x.mime,
            phash: x.phash,
            exifTime: x.exifTime?.toISOString() ?? null,
            checks: x.checks,
          })),
        },
        req.user!.walletAddress,
      );

      await db.insert(proofMedia).values(media.map((x) => ({ ...x, milestoneId: id, uploadedBy: req.user!.walletAddress })));

      res.status(201).json({
        milestoneId: id,
        proofCID: proof.cid,
        proofHash: proof.hash,
        latE6,
        lngE6,
        media: media.map(publicMedia),
        warnings,
      });
    }),
  );

  return router;
}

function publicMedia(x: {
  cid: string;
  sha256: string;
  mime: string;
  exifLat: number | null;
  exifLng: number | null;
  exifTime: Date | null;
  gpsDistanceM: number | null;
  flagged: boolean;
  thumbCid: string | null;
  checks: Record<string, { ok: boolean; detail?: string }> | null;
}) {
  return {
    cid: x.cid,
    sha256: x.sha256,
    mime: x.mime,
    exifLat: x.exifLat,
    exifLng: x.exifLng,
    exifTime: x.exifTime,
    gpsDistanceM: x.gpsDistanceM,
    flagged: x.flagged,
    thumbCid: x.thumbCid,
    checks: x.checks,
  };
}

export async function readExif(buffer: Buffer) {
  try {
    const tags = (await exifr.parse(buffer, { gps: true, exif: true, tiff: true })) as Record<string, unknown> | undefined;
    const lat = typeof tags?.latitude === "number" ? tags.latitude : null;
    const lng = typeof tags?.longitude === "number" ? tags.longitude : null;
    const time = tags?.DateTimeOriginal instanceof Date ? tags.DateTimeOriginal : null;
    const width = typeof tags?.ExifImageWidth === "number" ? tags.ExifImageWidth : null;
    const height = typeof tags?.ExifImageHeight === "number" ? tags.ExifImageHeight : null;
    return { lat, lng, time, width, height };
  } catch {
    return { lat: null, lng: null, time: null, width: null, height: null };
  }
}

/** Great-circle distance in metres. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
