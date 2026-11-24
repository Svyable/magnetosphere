/**
 * NOAA SWPC / USGS geoelectric field maps: the electric field that geomagnetic activity
 * induces in the ground, the driver of geomagnetically induced currents (GIC) in power lines,
 * pipelines and railways.
 *
 * Product used: "InterMagEarthScope" — the empirical EMTF 3D model. It combines USGS/INTERMAGNET
 * magnetometer data with magnetotelluric transfer functions measured by the NSF EarthScope
 * survey (via IRIS), on a 0.5° grid over the contiguous US, every minute, in mV/km.
 *
 * Integrity: this is a model output built on measurements, not a measured E-field. NOAA states
 * the maps still need validation against geoelectric/GIC measurements. Accuracy degrades with
 * distance from the nearest magnetometer, which every point reports and the UI shows.
 */
export const EFIELD_BASE = "https://services.swpc.noaa.gov";
export const EFIELD_INDEX_URL = EFIELD_BASE + "/json/lists/rgeojson/rgeojson.json";
export const EFIELD_PRODUCT = "InterMagEarthScope";
export const EFIELD_INFO_URL = "https://www.swpc.noaa.gov/products/geoelectric-field-models-1-minute";
export const EFIELD_IMPACTS_URL = "https://www.swpc.noaa.gov/impacts/electric-power-transmission";
/** NERC TPL-007 benchmark GMD event: 8 V/km peak at 60° geomagnetic latitude on a reference
 * (Québec) Earth model — a 1-in-100-year planning case, not a threshold for this map. */
export const NERC_BENCHMARK_MV_KM = 8000;

export interface EPoint { lon: number; lat: number; ex: number; ey: number; mag: number; quality: number | null; distKm: number | null }
export interface EMap { t: number; url: string; product: string; points: EPoint[] }

/** File names carry the only minute-resolution time: ".../20261124T184830-16-Efield-...json". */
export function efieldTimeFromUrl(url: string): number | null {
  const m = url.match(/\/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})-[^/]*\.json$/);
  if (!m) return null;
  const t = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
  const d = new Date(t);
  return d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]! && +m[4]! < 24 && +m[5]! < 60 && +m[6]! < 60 ? t : null;
}

/** Newest-first map URLs for one product from NOAA's rolling index. */
export function efieldUrls(index: unknown, product = EFIELD_PRODUCT): { url: string; t: number }[] {
  if (!Array.isArray(index)) throw new Error("NOAA geoelectric index is not a JSON array");
  const out: { url: string; t: number }[] = [];
  for (const e of index) {
    const u = e && typeof e === "object" ? (e as Record<string, unknown>)["url"] : null;
    if (typeof u !== "string" || !u.includes(`/${product}/`)) continue;
    const t = efieldTimeFromUrl(u);
    if (t !== null) out.push({ url: u.startsWith("http") ? u : EFIELD_BASE + u, t });
  }
  return out.sort((a, b) => b.t - a.t);
}

const fin = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseEfield(raw: unknown, url: string): EMap {
  const t = efieldTimeFromUrl(url);
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (t === null || !o || !Array.isArray(o["features"])) throw new Error("NOAA geoelectric map has an unexpected shape");
  const points: EPoint[] = [];
  for (const f of o["features"] as unknown[]) {
    const g = (f as { geometry?: { coordinates?: unknown } } | null)?.geometry?.coordinates;
    const p = (f as { properties?: Record<string, unknown> } | null)?.properties;
    if (!Array.isArray(g) || !p) continue;
    const lon = fin(g[0]), lat = fin(g[1]), ex = fin(p["Ex"]), ey = fin(p["Ey"]);
    // Range checks: CONUS-ish grid, and |E| beyond 100 V/km would exceed any recorded storm by an order of magnitude.
    if (lon === null || lat === null || ex === null || ey === null || lon < -180 || lon > 180 || lat < -90 || lat > 90) continue;
    const mag = Math.hypot(ex, ey);
    if (mag > 100_000) continue;
    points.push({ lon, lat, ex, ey, mag, quality: fin(p["quality_flag"]), distKm: fin(p["distance_nearest_station"]) });
  }
  if (points.length < 100) throw new Error("NOAA geoelectric map has too few valid grid points");
  return { t, url, product: typeof o["product_version"] === "string" ? o["product_version"] : EFIELD_PRODUCT, points };
}

export interface EStats {
  count: number;
  max: EPoint;
  median: number;
  p95: number;
  /** grid points at or above each level, mV/km */
  above: { level: number; count: number }[];
  /** share of grid points more than 1000 km from a magnetometer */
  farShare: number;
}
export const E_LEVELS = [100, 500, 1000] as const;
export function efieldStats(m: EMap): EStats {
  const mags = m.points.map(p => p.mag).sort((a, b) => a - b);
  const q = (f: number) => mags[Math.min(mags.length - 1, Math.floor(f * (mags.length - 1)))]!;
  return {
    count: m.points.length,
    max: m.points.reduce((a, p) => (p.mag > a.mag ? p : a)),
    median: q(0.5), p95: q(0.95),
    above: E_LEVELS.map(level => ({ level, count: mags.filter(v => v >= level).length })),
    farShare: m.points.filter(p => p.distKm !== null && p.distKm >= 1000).length / m.points.length,
  };
}

/** Plain-language band for the map maximum (descriptive, not an NOAA scale). */
export function efieldBand(maxMvKm: number): "quiet" | "elevated" | "strong" | "severe" {
  return maxMvKm < 100 ? "quiet" : maxMvKm < 500 ? "elevated" : maxMvKm < 2000 ? "strong" : "severe";
}

/** Colour position 0–1 on a log scale from 1 to 2000 mV/km (field spans >3 orders of magnitude). */
export const efieldColorT = (mag: number) => Math.min(1, Math.max(0, Math.log10(Math.max(1, mag)) / Math.log10(2000)));

/** Evenly spaced picks from a newest-first list, for a light "last hour" pulse. */
export function pickEvery<T extends { t: number }>(list: T[], spanMs: number, n: number): T[] {
  if (!list.length) return [];
  const newest = list[0]!.t, out: T[] = [];
  for (let k = 0; k < n; k++) {
    const target = newest - (k * spanMs) / Math.max(1, n - 1);
    const best = list.reduce((a, x) => (Math.abs(x.t - target) < Math.abs(a.t - target) ? x : a));
    if (Math.abs(best.t - target) <= spanMs / Math.max(1, n - 1) / 2 + 60_000 && !out.includes(best)) out.push(best);
  }
  return out.sort((a, b) => a.t - b.t);
}
