/**
 * NOAA SWPC WSA–Enlil solar-wind model output at Earth.
 *
 * What it is: a heliospheric MHD model run (WSA coronal model + Enlil, with CME cones
 * inserted by forecasters) sampled at Earth's position. The file spans roughly a week:
 * days before the run (a *hindcast* we can check against measured L1 data) and days
 * ahead (a *forecast*).
 *
 * What it is not: an IMF Bz forecast. Enlil does not model a CME's internal flux-rope
 * field, so b_r / b_theta / b_phi must never be presented as predicted Bz. Speed and
 * density (hence dynamic pressure) are usable; the magnetopause is therefore shown as
 * Bz *scenarios*, not a single predicted boundary.
 */
import { dynamicPressure, L1_DISTANCE_KM, shue, type WindSample } from "./model";

export const ENLIL_URL = "https://services.swpc.noaa.gov/json/enlil_time_series.json";
export const ENLIL_INFO_URL = "https://www.swpc.noaa.gov/products/wsa-enlil-solar-wind-prediction";

const HOUR = 3_600_000;

export interface EnlilPoint {
  t: number;
  /** radial speed, km/s */ v: number;
  /** proton density, cm^-3 */ n: number;
  /** dynamic pressure, nPa (derived) */ p: number;
  /** CME material tracer, 0–1 (fraction of plasma that originated in an inserted CME) */ cloud: number;
  polarity: number | null;
}

function isoUtc(s: unknown): number | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/.test(s)) return null;
  const t = Date.parse(s.endsWith("Z") ? s : s + "Z");
  return Number.isFinite(t) ? t : null;
}
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseEnlil(raw: unknown): EnlilPoint[] {
  if (!Array.isArray(raw)) throw new Error("NOAA Enlil time series is not a JSON array");
  const byT = new Map<number, EnlilPoint>();
  for (const r of raw) {
    if (r === null || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const t = isoUtc(o["time_tag"]);
    const v = finite(o["v_r"]);
    const n = finite(o["earth_particles_per_cm3"]);
    const cloud = finite(o["cloud"]) ?? 0;
    // Physical range checks; reject rather than clamp.
    if (t === null || v === null || n === null || v < 150 || v > 3500 || n <= 0 || n > 300 || cloud < -1e-6 || cloud > 1 + 1e-6) continue;
    byT.set(t, { t, v, n, p: dynamicPressure(n, v), cloud: Math.max(0, Math.min(1, cloud)), polarity: finite(o["polarity"]) });
  }
  const out = [...byT.values()].sort((a, b) => a.t - b.t);
  if (out.length < 24) throw new Error("NOAA Enlil time series has too few valid model samples");
  return out;
}

export interface HourBin { t: number; v: number; n: number; p: number; cloud: number; count: number }
/** Hour-mean bins keyed by the start of the UTC hour. */
export function hourly<T extends { t: number; v: number; n: number }>(rows: T[], timeOf: (r: T) => number = r => r.t): HourBin[] {
  const bins = new Map<number, { v: number; n: number; p: number; cloud: number; count: number }>();
  for (const r of rows) {
    const h = Math.floor(timeOf(r) / HOUR) * HOUR;
    const b = bins.get(h) ?? { v: 0, n: 0, p: 0, cloud: 0, count: 0 };
    b.v += r.v; b.n += r.n; b.p += dynamicPressure(r.n, r.v);
    b.cloud = Math.max(b.cloud, (r as unknown as { cloud?: number }).cloud ?? 0);
    b.count++;
    bins.set(h, b);
  }
  return [...bins.entries()].sort((a, b) => a[0] - b[0])
    .map(([t, b]) => ({ t, v: b.v / b.count, n: b.n / b.count, p: b.p / b.count, cloud: b.cloud, count: b.count }));
}

export interface CmeWindow { start: number; end: number; peakCloud: number; peakT: number; maxV: number; maxP: number }
/**
 * Intervals where the model's CME tracer is at least `threshold` (default 1%).
 * Gaps shorter than `mergeGapMs` are bridged so one CME is not split by tracer noise.
 */
export function cmeWindows(points: EnlilPoint[], threshold = 0.01, mergeGapMs = 3 * HOUR): CmeWindow[] {
  const out: CmeWindow[] = [];
  let cur: CmeWindow | null = null;
  for (const p of points) {
    if (p.cloud < threshold) continue;
    if (cur && p.t - cur.end <= mergeGapMs) {
      cur.end = p.t;
      if (p.cloud > cur.peakCloud) { cur.peakCloud = p.cloud; cur.peakT = p.t; }
      cur.maxV = Math.max(cur.maxV, p.v); cur.maxP = Math.max(cur.maxP, p.p);
    } else {
      if (cur) out.push(cur);
      cur = { start: p.t, end: p.t, peakCloud: p.cloud, peakT: p.t, maxV: p.v, maxP: p.p };
    }
  }
  if (cur) out.push(cur);
  return out;
}

export interface Coverage { start: number; end: number; hoursPast: number; hoursAhead: number }
export function coverage(points: EnlilPoint[], now: number): Coverage {
  const start = points[0]!.t, end = points[points.length - 1]!.t;
  return { start, end, hoursPast: Math.max(0, (Math.min(now, end) - start) / HOUR), hoursAhead: Math.max(0, (end - Math.max(now, start)) / HOUR) };
}

/** Estimated time a sample measured at L1 reaches Earth (flat-delay, same assumption as the live nowcast). */
export const earthArrival = (s: { t: number; v: number }) => s.t + (L1_DISTANCE_KM / s.v) * 1000;

export interface Skill {
  hours: number; start: number; end: number;
  speedMae: number; speedBias: number;
  densityMae: number; densityBias: number;
  /** model peak pressure / measured peak pressure over the window */ pressureRatio: number;
}
/**
 * Hindcast check: the part of the model run that is already in the past, compared hour by hour
 * with NOAA's measured L1 plasma shifted to estimated Earth arrival. Bias = model − measured.
 * Returns null with fewer than `minHours` matched hours (no score is better than a fake one).
 */
export function hindcastSkill(model: EnlilPoint[], measured: WindSample[], now: number, windowHours = 24, minHours = 6): Skill | null {
  const from = now - windowHours * HOUR;
  const m = new Map(hourly(model).map(b => [b.t, b]));
  const pairs = hourly(measured.filter(s => earthArrival(s) >= from && earthArrival(s) < now), earthArrival)
    .filter(b => b.count >= 10 && b.t + HOUR <= now)
    .map(obs => ({ obs, mod: m.get(obs.t) }))
    .filter((x): x is { obs: HourBin; mod: HourBin } => x.mod !== undefined);
  if (pairs.length < minHours) return null;
  const mean = (f: (x: { obs: HourBin; mod: HourBin }) => number) => pairs.reduce((a, x) => a + f(x), 0) / pairs.length;
  const peak = (f: (x: { obs: HourBin; mod: HourBin }) => number) => Math.max(...pairs.map(f));
  return {
    hours: pairs.length, start: pairs[0]!.obs.t, end: pairs[pairs.length - 1]!.obs.t + HOUR,
    speedMae: mean(x => Math.abs(x.mod.v - x.obs.v)), speedBias: mean(x => x.mod.v - x.obs.v),
    densityMae: mean(x => Math.abs(x.mod.n - x.obs.n)), densityBias: mean(x => x.mod.n - x.obs.n),
    pressureRatio: peak(x => x.mod.p) / peak(x => x.obs.p),
  };
}

export interface StandoffScenario { bz: number; r0: number }
/** Shue (1998) standoff for the modelled pressure under stated Bz assumptions; Enlil supplies no usable Bz. */
export const STANDOFF_BZ_SCENARIOS = [0, -10] as const;
export function standoffScenarios(pressureNPa: number): StandoffScenario[] {
  return STANDOFF_BZ_SCENARIOS.map(bz => ({ bz, r0: shue(pressureNPa, bz).r0 }));
}

export interface Outlook {
  maxV: { t: number; v: number } | null;
  maxP: { t: number; p: number } | null;
  /** standoff at the time of peak modelled pressure, per Bz scenario */
  tightest: StandoffScenario[];
  nextCme: CmeWindow | null;
  activeCme: CmeWindow | null;
}
export function outlook(points: EnlilPoint[], now: number): Outlook {
  const ahead = points.filter(p => p.t >= now);
  const maxV = ahead.reduce<EnlilPoint | null>((a, p) => (!a || p.v > a.v ? p : a), null);
  const maxP = ahead.reduce<EnlilPoint | null>((a, p) => (!a || p.p > a.p ? p : a), null);
  const wins = cmeWindows(points);
  return {
    maxV: maxV && { t: maxV.t, v: maxV.v },
    maxP: maxP && { t: maxP.t, p: maxP.p },
    tightest: maxP ? standoffScenarios(maxP.p) : [],
    nextCme: wins.find(w => w.start > now) ?? null,
    activeCme: wins.find(w => w.start <= now && w.end >= now) ?? null,
  };
}
