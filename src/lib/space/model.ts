// Pure scientific model + parsing. No React, no three.js.
export const L1_DISTANCE_KM = 1.5e6;
export const PROTON_FACTOR = 1.6726e-6; // nPa per (cm^-3 * (km/s)^2)

export type Row = Record<string, unknown>;

/** Accepts array-of-objects or header-array (first row = column names). */
export function normalizeRows(json: unknown): Row[] {
  if (!Array.isArray(json) || json.length === 0) return [];
  if (Array.isArray(json[0])) {
    const header = (json[0] as unknown[]).map((h) => String(h));
    return json.slice(1).filter(Array.isArray).map((r) => {
      const o: Row = {};
      header.forEach((h, i) => (o[h] = (r as unknown[])[i]));
      return o;
    });
  }
  return json.filter((r) => r && typeof r === "object") as Row[];
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** NOAA timestamps are UTC without suffix ("2026-11-17 21:00:00.000"). */
export function parseUtc(v: unknown): number | null {
  if (typeof v !== "string" || !v) return null;
  let s = v.trim().replace(" ", "T");
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += "Z";
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function preferActive(rows: Row[]): Row[] {
  const hasActive = rows.some((r) => "active" in r);
  if (!hasActive) return rows;
  const act = rows.filter((r) => r["active"] === true || r["active"] === "true" || r["active"] === 1);
  return act.length ? act : rows;
}

export interface MagSample { t: number; bz: number; bt: number | null; source: string | null }
export interface WindSample { t: number; v: number; n: number; source: string | null }

export function parseMag(json: unknown): MagSample[] {
  const out = new Map<number, MagSample>();
  for (const r of preferActive(normalizeRows(json))) {
    const t = parseUtc(r["time_tag"]);
    const bz = num(r["bz_gsm"]);
    if (t === null || bz === null || Math.abs(bz) > 200) continue;
    const btRaw = num(r["bt"]);
    const bt = btRaw !== null && btRaw >= 0 && btRaw < 300 ? btRaw : null;
    if (!out.has(t)) out.set(t, { t, bz, bt, source: r["source"] != null ? String(r["source"]) : null });
  }
  return [...out.values()].sort((a, b) => a.t - b.t);
}

export function parseWind(json: unknown): WindSample[] {
  const out = new Map<number, WindSample>();
  for (const r of preferActive(normalizeRows(json))) {
    const t = parseUtc(r["time_tag"]);
    const v = num(r["proton_speed"] ?? r["speed"]);
    const n = num(r["proton_density"] ?? r["density"]);
    if (t === null || v === null || n === null) continue;
    if (v < 150 || v > 3000 || n <= 0 || n > 200) continue; // physically implausible -> drop
    if (!out.has(t)) out.set(t, { t, v, n, source: r["source"] != null ? String(r["source"]) : null });
  }
  return [...out.values()].sort((a, b) => a.t - b.t);
}

export interface KpValue { t: number; kp: number }
export function parseKp(json: unknown): KpValue[] {
  return normalizeRows(json)
    .map((r) => ({ t: parseUtc(r["time_tag"]), kp: num(r["Kp"] ?? r["kp"] ?? r["kp_index"] ?? r["estimated_kp"]) }))
    .filter((x): x is KpValue => x.t !== null && x.kp !== null && x.kp >= 0 && x.kp <= 9)
    .sort((a, b) => a.t - b.t);
}

export interface Ovation { observed: number | null; forecast: number | null; points: [number, number, number][] }
export function parseOvation(json: unknown, minProb = 4): Ovation | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Row;
  const coords = Array.isArray(j["coordinates"]) ? j["coordinates"] : [];
  const points: [number, number, number][] = [];
  for (const c of coords) {
    if (!Array.isArray(c)) continue;
    const lon = num(c[0]), lat = num(c[1]), p = num(c[2]);
    if (lon === null || lat === null || p === null || p < minProb || Math.abs(lat) > 90) continue;
    points.push([lon > 180 ? lon - 360 : lon, lat, p]);
  }
  return { observed: parseUtc(j["Observation Time"]), forecast: parseUtc(j["Forecast Time"]), points };
}

export interface HpValue { t: number; hp: number }
export function parseHp30(json: unknown): HpValue[] {
  if (!json || typeof json !== "object") return [];
  const j = json as Row;
  const dt = Array.isArray(j["datetime"]) ? j["datetime"] : [];
  const hp = Array.isArray(j["Hp30"]) ? j["Hp30"] : [];
  const out: HpValue[] = [];
  dt.forEach((d, i) => {
    const t = parseUtc(d); const v = num(hp[i]);
    if (t !== null && v !== null && v >= 0 && v < 20) out.push({ t, hp: v });
  });
  return out.sort((a, b) => a.t - b.t);
}

/** Combined L1 sample: wind required; Bz only if a mag sample exists within 90 s. */
export interface L1Sample { t: number; v: number; n: number; bz: number | null; bt: number | null; windSource: string | null; magSource: string | null }
export function joinL1(wind: WindSample[], mag: MagSample[]): L1Sample[] {
  let j = 0;
  return wind.map((w) => {
    while (j < mag.length - 1 && Math.abs(mag[j + 1]!.t - w.t) <= Math.abs(mag[j]!.t - w.t)) j++;
    const mj = mag[j];
    const m = mj && Math.abs(mj.t - w.t) <= 90_000 ? mj : null;
    return { t: w.t, v: w.v, n: w.n, bz: m?.bz ?? null, bt: m?.bt ?? null, windSource: w.source, magSource: m?.source ?? null };
  });
}

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export function dynamicPressure(n: number, v: number): number {
  return n * PROTON_FACTOR * v * v;
}

/** Shue et al. (1998). Inputs clamped for numerical safety. */
export function shue(pressureNPa: number, bzNT: number) {
  const P = clamp(pressureNPa, 0.1, 100);
  const bz = clamp(bzNT, -50, 50);
  const r0 = (10.22 + 1.29 * Math.tanh(0.184 * (bz + 8.14))) * Math.pow(P, -1 / 6.6);
  const alpha = (0.58 - 0.007 * bz) * (1 + 0.024 * Math.log(P));
  return { r0: clamp(r0, 3, 20), alpha: clamp(alpha, 0.35, 0.95), P };
}

export function shueRadius(r0: number, alpha: number, theta: number) {
  return r0 * Math.pow(2 / (1 + Math.cos(theta)), alpha);
}

export function propagationSeconds(vKmS: number) {
  return L1_DISTANCE_KM / vKmS;
}

/** Latest L1 sample whose estimated arrival time is <= targetTime. null = insufficient lookback. */
export function laggedSample(samples: L1Sample[], targetTime: number): L1Sample | null {
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i]!;
    if (s.t + propagationSeconds(s.v) * 1000 <= targetTime) return s;
  }
  return null;
}

/** Most recent non-null Bz at or before t, within 5 min. */
export function bzNear(samples: L1Sample[], s: L1Sample): number | null {
  if (s.bz !== null) return s.bz;
  for (let i = samples.indexOf(s); i >= 0; i--) {
    const p = samples[i]!;
    if (s.t - p.t > 300_000) break;
    if (p.bz !== null) return p.bz;
  }
  return null;
}

export type Freshness = "live" | "stale" | "disconnected" | "loading";
export function freshness(latest: number | null, now: number, liveMs: number, error: boolean): Freshness {
  if (error) return "disconnected";
  if (latest === null) return "loading";
  // Clock skew or a future timestamp must never count as a fresh observation.
  return latest <= now + 60_000 && now - latest <= liveMs ? "live" : "stale";
}

/** Approximate sun geometry (no equation of time; ±4° lon). */
export function sunGeometry(t: number) {
  const d = new Date(t);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const doy = (t - start) / 86_400_000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  let lon = -15 * (hours - 12);
  lon = ((lon + 540) % 360) - 180;
  return { declDeg: decl, subsolarLonDeg: lon };
}

export function kpLabel(kp: number) {
  if (kp >= 9) return "G5 extreme storm";
  if (kp >= 8) return "G4 severe storm";
  if (kp >= 7) return "G3 strong storm";
  if (kp >= 6) return "G2 moderate storm";
  if (kp >= 5) return "G1 minor storm";
  if (kp >= 4) return "active";
  return "quiet / unsettled";
}