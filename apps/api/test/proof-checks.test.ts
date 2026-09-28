import exifr from "exifr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  allPassed,
  checkCapture,
  checkGeofence,
  checkTime,
  DEFAULT_GEOFENCE_M,
  findDuplicate,
  geofenceFor,
  hamming,
} from "../src/proof/checks";
import { perceptualHash, processImage } from "../src/proof/image";
import { picture } from "./helpers/picture";

describe("proof checks", () => {
  it("uses per-category geofences with a 250 m default", () => {
    expect(geofenceFor("PARK")).toBe(250);
    expect(geofenceFor("BUILDING")).toBe(150);
    expect(geofenceFor("ROAD")).toBe(400);
    expect(geofenceFor("SOMETHING_NEW")).toBe(DEFAULT_GEOFENCE_M);
  });

  it("geofence: passes inside, fails outside or without GPS", () => {
    expect(checkGeofence(120, 250)).toMatchObject({ ok: true });
    expect(checkGeofence(250, 250).ok).toBe(true);
    expect(checkGeofence(251, 250)).toMatchObject({ ok: false, detail: expect.stringContaining("251 m") });
    expect(checkGeofence(null, 250)).toMatchObject({ ok: false, detail: "No EXIF GPS" });
  });

  it("time: within ±48 h of upload and after the milestone was created", () => {
    const upload = new Date("2026-10-10T12:00:00Z");
    const created = new Date("2026-10-01T00:00:00Z");
    const at = (h: number) => new Date(upload.getTime() + h * 3600_000);
    expect(checkTime(at(-47), upload, created).ok).toBe(true);
    expect(checkTime(at(-49), upload, created).ok).toBe(false);
    expect(checkTime(at(+49), upload, created).ok).toBe(false);
    expect(checkTime(new Date("2026-09-30T23:00:00Z"), new Date("2026-10-01T12:00:00Z"), created)).toMatchObject({
      ok: false,
      detail: "Captured before the milestone existed",
    });
    expect(checkTime(null, upload, created).ok).toBe(false);
  });

  it("capture: only enforced in strict mode", () => {
    expect(checkCapture({ strict: false, source: "gallery", hasExifTime: false }).ok).toBe(true);
    expect(checkCapture({ strict: true, source: "camera", hasExifTime: true }).ok).toBe(true);
    expect(checkCapture({ strict: true, source: "gallery", hasExifTime: true }).ok).toBe(false);
    expect(checkCapture({ strict: true, source: undefined, hasExifTime: true }).ok).toBe(false);
    expect(checkCapture({ strict: true, source: "camera", hasExifTime: false }).ok).toBe(false);
  });

  it("hamming distance and duplicate lookup", () => {
    expect(hamming("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hamming("00000000000000ff", "0000000000000000")).toBe(8);
    const pool = [
      { phash: null, id: 0 },
      { phash: "ffffffffffffffff", id: 1 },
      { phash: "0000000000000003", id: 2 },
    ];
    expect(findDuplicate("0000000000000001", pool)).toMatchObject({ match: { id: 2 }, distance: 1 });
    expect(findDuplicate("00000000ffff0000", pool)).toBeNull();
    expect(allPassed({ a: { ok: true }, b: { ok: true } })).toBe(true);
    expect(allPassed({ a: { ok: true }, b: { ok: false } })).toBe(false);
  });
});

describe("image processing", () => {
  it("phash is stable under re-encoding/resizing and differs between pictures", async () => {
    const a = await (await picture(1)).jpeg({ quality: 95 }).toBuffer();
    const aSmall = await sharp(a).resize(120).jpeg({ quality: 60 }).toBuffer();
    const b = await (await picture(9)).jpeg().toBuffer();
    const [ha, haSmall, hb] = await Promise.all([perceptualHash(a), perceptualHash(aSmall), perceptualHash(b)]);
    expect(ha).toMatch(/^[0-9a-f]{16}$/);
    expect(hamming(ha, haSmall)).toBeLessThanOrEqual(6);
    expect(hamming(ha, hb)).toBeGreaterThan(6);
  });

  it("re-encodes without device EXIF, and makes a smaller thumbnail", async () => {
    const withExif = await (await picture(2))
      .withExif({ IFD0: { Make: "AcmeCam", Model: "X1", SerialNumber: "SN-12345" } })
      .jpeg()
      .toBuffer();
    expect((await exifr.parse(withExif, { tiff: true })) as Record<string, unknown>).toMatchObject({ Make: "AcmeCam" });
    const out = await processImage(withExif);
    expect(out.image.includes(Buffer.from("AcmeCam"))).toBe(false);
    expect(out.image.includes(Buffer.from("SN-12345"))).toBe(false);
    expect(out).toMatchObject({ width: 256, height: 256 });
    expect(out.thumbnail.length).toBeLessThan(out.image.length);
  });

  it("rejects bytes that are not an image", async () => {
    await expect(processImage(Buffer.from("not an image"))).rejects.toThrow();
  });
});
