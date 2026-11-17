// NASA DSCOVR EPIC natural-color metadata parsing (pure TS).
export const EPIC_API = "https://epic.gsfc.nasa.gov/api/natural";
export const EPIC_SITE = "https://epic.gsfc.nasa.gov/";

export interface EpicImage { id: string; image: string; t: number; lat: number | null; lon: number | null; url: string; thumb: string }

function parseEpicDate(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const t = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  // Date.UTC normalizes invalid calendar dates; reject instead of silently shifting a capture.
  if (d.getUTCFullYear() !== +m[1]! || d.getUTCMonth() + 1 !== +m[2]! || d.getUTCDate() !== +m[3]! ||
    d.getUTCHours() !== +m[4]! || d.getUTCMinutes() !== +m[5]! || d.getUTCSeconds() !== +m[6]!) return null;
  return t;
}

export function parseEpic(json: unknown): EpicImage[] {
  if (!Array.isArray(json)) return [];
  const out: EpicImage[] = [];
  for (const r of json) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const image = typeof o["image"] === "string" && /^[\w-]+$/.test(o["image"]) ? o["image"] : null;
    const t = parseEpicDate(o["date"]);
    if (!image || t === null) continue;
    const d = new Date(t);
    const p = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
    const c = (o["centroid_coordinates"] ?? {}) as Record<string, unknown>;
    const lat = typeof c["lat"] === "number" ? c["lat"] : null;
    const lon = typeof c["lon"] === "number" ? c["lon"] : null;
    out.push({
      id: String(o["identifier"] ?? image), image, t, lat, lon,
      url: `https://epic.gsfc.nasa.gov/archive/natural/${p}/jpg/${image}.jpg`,
      thumb: `https://epic.gsfc.nasa.gov/archive/natural/${p}/thumbs/${image}.jpg`,
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function formatAge(ms: number) {
  if (ms < 0) return "in the future (clock skew?)";
  const h = ms / 3600_000;
  if (h < 1) return `${Math.round(ms / 60000)} min old`;
  if (h < 48) return `${h.toFixed(1)} h old`;
  return `${(h / 24).toFixed(1)} days old`;
}