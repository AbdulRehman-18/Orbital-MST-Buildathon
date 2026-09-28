import sharp from "sharp";

export type ProcessedImage = {
  /** Re-encoded JPEG with all metadata (device serials, makernotes, GPS) stripped. */
  image: Buffer;
  thumbnail: Buffer;
  phash: string;
  width: number;
  height: number;
};

/**
 * Re-encode (drops device-identifying EXIF; GPS and capture time are carried in `proof.json`
 * instead), make a thumbnail and compute a 64-bit DCT perceptual hash.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const base = sharp(input, { failOn: "error" }).rotate();
  const image = await base.clone().jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  const thumbnail = await base.clone().resize({ width: 320, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  const meta = await sharp(image).metadata();
  return { image, thumbnail, phash: await perceptualHash(image), width: meta.width ?? 0, height: meta.height ?? 0 };
}

const N = 32;
const COS = Array.from({ length: 8 }, (_, u) => Array.from({ length: N }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N))));

/** pHash: 32×32 greyscale → 2-D DCT → top-left 8×8 (DC excluded from the median) → bits above the median. */
export async function perceptualHash(image: Buffer): Promise<string> {
  const { data } = await sharp(image).greyscale().resize(N, N, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  // Separable DCT restricted to the 8 lowest frequencies on each axis.
  const rows: number[][] = [];
  for (let y = 0; y < N; y++) {
    rows.push(COS.map((c) => c.reduce((s, cx, x) => s + cx * data[y * N + x], 0)));
  }
  const coeffs: number[] = [];
  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) coeffs.push(COS[v].reduce((s, cy, y) => s + cy * rows[y][u], 0));
  }
  const sorted = coeffs.slice(1).sort((a, b) => a - b);
  const median = (sorted[31] + sorted[32]) / 2;
  let bits = 0n;
  for (const c of coeffs) bits = (bits << 1n) | (c > median ? 1n : 0n);
  return bits.toString(16).padStart(16, "0");
}
