import sharp from "sharp";

/** A deterministic, structured test picture (gradients + blocks) — not noise, so pHash is meaningful. */
export async function picture(seed: number, size = 256) {
  const raw = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      const block = ((x >> 5) * (seed + 3) + (y >> 5) * (seed * 7 + 1)) % 2 ? 200 : 40;
      raw[i] = (block + (x * seed) / 4) % 256;
      raw[i + 1] = (block + y / 2) % 256;
      raw[i + 2] = (x + y + seed * 31) % 256;
    }
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } });
}
