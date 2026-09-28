// Pure proof-integrity checks (plan §13). A failed check never blocks a submission — the route
// records the result and the anomaly engine turns failures into anomalies for auditors.

export type CheckResult = { ok: boolean; detail?: string };
export type ProofChecks = { capture: CheckResult; geofence: CheckResult; time: CheckResult; duplicate: CheckResult };

export const DEFAULT_GEOFENCE_M = 250;
/** Linear assets and open sites tolerate more drift than a single building plot. */
export const GEOFENCE_BY_CATEGORY_M: Record<string, number> = {
  ROAD: 400,
  DRAINAGE: 400,
  STREET_LIGHTING: 400,
  WATER_SUPPLY: 300,
  PARK: 250,
  BUILDING: 150,
};
export const EXIF_WINDOW_MS = 48 * 3600_000;
/** Hamming distance (of 64) at or below which two images are treated as the same photo. */
export const PHASH_DUPLICATE_DISTANCE = 6;

export const geofenceFor = (category: string) => GEOFENCE_BY_CATEGORY_M[category] ?? DEFAULT_GEOFENCE_M;

export function checkCapture(opts: { strict: boolean; source: "camera" | "gallery" | undefined; hasExifTime: boolean }): CheckResult {
  if (!opts.strict) return { ok: true };
  if (opts.source !== "camera") return { ok: false, detail: "Not captured with the in-app camera" };
  if (!opts.hasExifTime) return { ok: false, detail: "No EXIF capture time" };
  return { ok: true };
}

export function checkGeofence(distanceM: number | null, limitM: number): CheckResult {
  if (distanceM === null) return { ok: false, detail: "No EXIF GPS" };
  if (distanceM > limitM) return { ok: false, detail: `${Math.round(distanceM)} m from the site (limit ${limitM} m)` };
  return { ok: true, detail: `${Math.round(distanceM)} m from the site` };
}

export function checkTime(exifTime: Date | null, uploadedAt: Date, milestoneCreatedAt: Date): CheckResult {
  if (!exifTime) return { ok: false, detail: "No EXIF capture time" };
  if (Math.abs(uploadedAt.getTime() - exifTime.getTime()) > EXIF_WINDOW_MS) {
    return { ok: false, detail: "Captured more than 48 h from the upload" };
  }
  if (exifTime.getTime() < milestoneCreatedAt.getTime()) return { ok: false, detail: "Captured before the milestone existed" };
  return { ok: true };
}

/** Hamming distance between two 16-char hex pHashes. */
export function hamming(a: string, b: string): number {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

export function findDuplicate<T extends { phash: string | null }>(phash: string, others: T[]): { match: T; distance: number } | null {
  let best: { match: T; distance: number } | null = null;
  for (const o of others) {
    if (!o.phash) continue;
    const distance = hamming(phash, o.phash);
    if (distance <= PHASH_DUPLICATE_DISTANCE && (!best || distance < best.distance)) best = { match: o, distance };
  }
  return best;
}

export const allPassed = (c: Record<string, CheckResult>) => Object.values(c).every((r) => r.ok);
