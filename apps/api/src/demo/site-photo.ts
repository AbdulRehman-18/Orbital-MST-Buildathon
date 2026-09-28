// Illustrated "site photo" placeholders for seeded proofs (real uploads are JPEG/PNG with EXIF).
const PALETTE: Record<string, [string, string, string]> = {
  ROAD: ["#9ca3af", "#374151", "#fbbf24"],
  DRAINAGE: ["#7dd3fc", "#475569", "#0ea5e9"],
  WATER_SUPPLY: ["#93c5fd", "#1e3a8a", "#60a5fa"],
  STREET_LIGHTING: ["#1e293b", "#334155", "#fde047"],
  PARK: ["#bbf7d0", "#15803d", "#f97316"],
  BUILDING: ["#e5e7eb", "#78716c", "#c2410c"],
  OTHER: ["#e7e5e4", "#57534e", "#0d9488"],
};

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

export function sitePhotoSvg(opts: { category: string; caption: string; lat: number; lng: number; takenAt: Date }): string {
  const [sky, ground, accent] = PALETTE[opts.category] ?? PALETTE.OTHER;
  const stamp = `${opts.lat.toFixed(5)}°N ${opts.lng.toFixed(5)}°E · ${opts.takenAt.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
<rect width="800" height="600" fill="${sky}"/>
<circle cx="660" cy="110" r="46" fill="${accent}" opacity="0.85"/>
<path d="M0 360 L180 250 L330 330 L480 230 L640 320 L800 260 L800 600 L0 600Z" fill="${ground}" opacity="0.55"/>
<rect y="400" width="800" height="200" fill="${ground}"/>
<path d="M0 520 L800 470" stroke="${accent}" stroke-width="10" stroke-dasharray="46 30"/>
<rect x="90" y="300" width="120" height="100" fill="${accent}" opacity="0.9"/>
<rect x="250" y="330" width="60" height="70" fill="#fff" opacity="0.7"/>
<rect y="540" width="800" height="60" fill="#000" opacity="0.55"/>
<text x="24" y="566" font-family="sans-serif" font-size="22" fill="#fff">${esc(opts.caption)}</text>
<text x="24" y="590" font-family="monospace" font-size="15" fill="#fde68a">${esc(stamp)}</text>
</svg>`;
}
