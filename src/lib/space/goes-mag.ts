/**
 * GOES geostationary magnetometers (NOAA SWPC): the field measured at 6.6 Earth radii.
 *
 * Why it matters here: the site's magnetopause is the empirical Shue model. GOES is a direct
 * measurement at a fixed distance. When the dayside Hp component drops to near zero or below,
 * NOAA notes the magnetopause may have been compressed inside geosynchronous orbit, exposing
 * satellites to the solar wind's field. That is a measured test of the modelled standoff.
 *
 * Integrity: Hp near zero can also have other causes (substorm dipolarisation signatures are
 * nightside; strong currents can depress the field). We therefore call a negative dayside Hp a
 * "possible magnetopause crossing", require ≥ 2 consecutive minutes, exclude arcjet-flagged
 * samples, and never infer anything from nightside data.
 */
export const GOES_MAG_URLS = {
  primary: "https://services.swpc.noaa.gov/json/goes/primary/magnetometers-1-day.json",
  secondary: "https://services.swpc.noaa.gov/json/goes/secondary/magnetometers-1-day.json",
  longitudes: "https://services.swpc.noaa.gov/json/goes/satellite-longitudes.json",
  info: "https://www.swpc.noaa.gov/products/goes-magnetometer",
} as const;

export interface GoesMagSample { t: number; sat: number; hp: number; he: number | null; hn: number | null; total: number | null; arcjet: boolean }

const fin = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseGoesMag(raw: unknown): GoesMagSample[] {
  if (!Array.isArray(raw)) throw new Error("NOAA GOES magnetometer product is not a JSON array");
  const out: GoesMagSample[] = [];
  for (const r of raw) {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
    if (!o) continue;
    const ts = typeof o["time_tag"] === "string" ? o["time_tag"] : "";
    const t = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(ts) ? Date.parse(ts) : NaN;
    const sat = fin(o["satellite"]), hp = fin(o["Hp"]);
    // Geosynchronous field magnitudes stay well within ±1000 nT; anything beyond is not physical data.
    if (!Number.isFinite(t) || sat === null || hp === null || Math.abs(hp) > 1000) continue;
    out.push({ t, sat, hp, he: fin(o["He"]), hn: fin(o["Hn"]), total: fin(o["total"]), arcjet: o["arcjet_flag"] === true });
  }
  if (raw.length && !out.length) throw new Error("NOAA GOES magnetometer product has no valid samples");
  return out.sort((a, b) => a.t - b.t);
}

/** NOAA lists longitudes as positive degrees west; null means no current slot. */
export function parseGoesLongitudes(raw: unknown): Map<number, number> {
  if (!Array.isArray(raw)) throw new Error("NOAA GOES longitude list is not a JSON array");
  const m = new Map<number, number>();
  for (const r of raw) {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
    const sat = fin(o?.["satellite"]), lonW = fin(o?.["longitude"]);
    if (sat !== null && lonW !== null && lonW >= 0 && lonW <= 360) m.set(sat, lonW);
  }
  return m;
}

/** Local solar time (hours, 0–24) at a geostationary longitude given in degrees west. */
export function localTimeHours(t: number, lonWest: number): number {
  const utcH = (t % 86_400_000) / 3_600_000;
  return (((utcH - lonWest / 15) % 24) + 24) % 24;
}
export const isDayside = (lt: number) => lt >= 6 && lt < 18;

export interface Crossing { start: number; end: number; minHp: number; minutes: number; lt: number }
/** Runs of ≥ minMinutes consecutive dayside, non-arcjet samples with Hp < 0. */
export function possibleCrossings(samples: GoesMagSample[], lonWest: number, minMinutes = 2): Crossing[] {
  const out: Crossing[] = [];
  let run: GoesMagSample[] = [];
  const flush = () => {
    if (run.length >= minMinutes) {
      const minHp = Math.min(...run.map(s => s.hp));
      out.push({ start: run[0]!.t, end: run.at(-1)!.t, minHp, minutes: run.length, lt: localTimeHours(run[0]!.t, lonWest) });
    }
    run = [];
  };
  for (const s of samples) {
    const ok = !s.arcjet && s.hp < 0 && isDayside(localTimeHours(s.t, lonWest));
    if (ok && run.length && s.t - run.at(-1)!.t > 90_000) flush();
    if (ok) run.push(s); else flush();
  }
  flush();
  return out;
}

export type GeoState = "inside" | "near-boundary" | "possible-crossing" | "nightside" | "no-data";
export interface SatStatus {
  sat: number; lonWest: number; latest: GoesMagSample | null; lt: number | null; state: GeoState;
  /** lowest dayside Hp in the window (nT) */ minDaysideHp: number | null;
  crossings: Crossing[]; ageMs: number | null;
}
/**
 * Current state of one geostationary magnetometer. "near-boundary" = dayside Hp below 10 nT
 * (NOAA: "near zero"), which is not a crossing by itself.
 */
export function satStatus(samples: GoesMagSample[], sat: number, lonWest: number, now: number, staleMs = 20 * 60_000): SatStatus {
  const mine = samples.filter(s => s.sat === sat);
  const latest = mine.at(-1) ?? null;
  const fresh = latest !== null && now - latest.t <= staleMs;
  const lt = latest ? localTimeHours(latest.t, lonWest) : null;
  const day = mine.filter(s => !s.arcjet && isDayside(localTimeHours(s.t, lonWest)));
  const crossings = possibleCrossings(mine, lonWest);
  const recentCross = crossings.some(c => now - c.end <= 10 * 60_000);
  const state: GeoState = !fresh || !latest ? "no-data"
    : !isDayside(lt!) ? "nightside"
    : recentCross ? "possible-crossing"
    : latest.hp < 10 ? "near-boundary" : "inside";
  return {
    sat, lonWest, latest, lt, state, crossings,
    minDaysideHp: day.length ? Math.min(...day.map(s => s.hp)) : null,
    ageMs: latest ? now - latest.t : null,
  };
}
