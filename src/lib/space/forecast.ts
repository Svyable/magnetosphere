/**
 * NOAA's *published* forecasts. No local stochastic model or fabricated future Bz,
 * magnetopause location, aurora oval, or magnetic-field geometry.
 * Horizons: 3-hour planetary Kp bins, 3-day daily storm probabilities, weekly 27-day outlook.
 */
export const FORECAST_URLS = {
  kp: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
  geomag: "https://services.swpc.noaa.gov/text/3-day-geomag-forecast.txt",
  outlook: "https://services.swpc.noaa.gov/text/27-day-outlook.txt",
} as const;
export type KpCategory = "observed" | "estimated" | "predicted";
export interface KpForecastSlot {
  t: number;
  kp: number;
  status: KpCategory;
  noaaScale: string | null;
}
type Row = Record<string, unknown>;
const MONTH: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const periodMs = 3 * 3_600_000;
function asObj(v: unknown): Row | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null;
}
function isoTime(s: unknown): number | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z)?$/.test(s)) return null;
  const t = Date.parse(s.endsWith("Z") ? s : s + "Z");
  if (!Number.isFinite(t)) return null;
  const normalized = new Date(t).toISOString().slice(0, 19);
  return normalized === s.replace(/Z$/, "") ? t : null;
}
function utcDate(year: number, month: number, day: number, hour = 0, minute = 0): number | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || !Number.isInteger(month) || month < 0 || month > 11) return null;
  const t = Date.UTC(year, month, day, hour, minute);
  const dt = new Date(t);
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month && dt.getUTCDate() === day && dt.getUTCHours() === hour && dt.getUTCMinutes() === minute ? t : null;
}
export function parseKpForecast(raw: unknown): KpForecastSlot[] {
  if (!Array.isArray(raw)) throw new Error("NOAA Kp forecast is not a JSON array");
  const byTime = new Map<number, KpForecastSlot>();
  for (const entry of raw) {
    const obj = asObj(entry);
    if (!obj) continue;
    const t = isoTime(obj["time_tag"]);
    const kp = (typeof obj["kp"] === "number" || (typeof obj["kp"] === "string" && obj["kp"].trim() !== "")) ? Number(obj["kp"]) : NaN;
    const status = obj["observed"];
    if (t === null || !Number.isFinite(kp) || kp < 0 || kp > 9 || !["observed", "estimated", "predicted"].includes(String(status))) continue;
    byTime.set(t, {
      t, kp, status: status as KpCategory,
      noaaScale: typeof obj["noaa_scale"] === "string" && /^G[1-5]$/.test(obj["noaa_scale"]) ? obj["noaa_scale"] : null,
    });
  }
  const result = [...byTime.values()].sort((a,b) => a.t-b.t);
  if (!result.length) throw new Error("NOAA Kp forecast has no recognized timestamped records");
  return result;
}
export function gFromKp(kp: number): string | null {
  if (!Number.isFinite(kp) || kp < 5) return null;
  return "G" + Math.min(5, Math.floor(kp));
}
/** Only slots not already fully elapsed are included; observed values are not forecasts. */
export function upcomingKp(data: KpForecastSlot[], now: number, hours = 72): KpForecastSlot[] {
  return data.filter(r => r.status !== "observed" && r.t + periodMs > now && r.t < now + hours * 3_600_000);
}
export function forecastPeak(data: KpForecastSlot[], now: number): KpForecastSlot | null {
  return upcomingKp(data, now).filter(r => r.status === "predicted").reduce<KpForecastSlot | null>(
    (best, r) => !best || r.kp > best.kp ? r : best, null);
}
export interface DailyProbabilities {
  t: number;
  active: number;
  minor: number;
  moderate: number;
  strongExtreme: number;
}
export interface GeomagBulletin { issuedAt: number; probabilities: DailyProbabilities[] }
export function parseIssued(text: string): number | null {
  const m = text.match(/^:Issued:\s*(\d{4})\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2})(\d{2})\s+UTC\s*$/m);
  if (!m) return null;
  const month = MONTH[m[2]!];
  if (month === undefined) return null;
  return utcDate(Number(m[1]), month, Number(m[3]), Number(m[4]), Number(m[5]));
}
export function parseGeomagBulletin(text: string): GeomagBulletin {
  const issuedAt = parseIssued(text);
  if (issuedAt === null) throw new Error("NOAA geomagnetic bulletin has no valid issuance time");
  const dateHeader = text.match(/^NOAA Geomagnetic Activity Probabilities\s+(\d{1,2})\s+([A-Z][a-z]{2})\s*-\s*(\d{1,2})\s+([A-Z][a-z]{2})/m);
  if (!dateHeader) throw new Error("NOAA geomagnetic bulletin missing three-day date range");
  const startMonth = MONTH[dateHeader[2]!];
  if (startMonth === undefined) throw new Error("Unrecognized NOAA month");
  const issuedMonth = new Date(issuedAt).getUTCMonth();
  const year = new Date(issuedAt).getUTCFullYear() + (startMonth < issuedMonth - 6 ? 1 : 0);
  const start = utcDate(year, startMonth, Number(dateHeader[1]));
  if (start === null) throw new Error("Invalid forecast calendar day");
  const labels: [keyof Omit<DailyProbabilities, "t">, RegExp][] = [
    ["active", /^Active\s+(\d{1,3})\/(\d{1,3})\/(\d{1,3})\s*$/m],
    ["minor", /^Minor storm\s+(\d{1,3})\/(\d{1,3})\/(\d{1,3})\s*$/m],
    ["moderate", /^Moderate storm\s+(\d{1,3})\/(\d{1,3})\/(\d{1,3})\s*$/m],
    ["strongExtreme", /^Strong-Extreme storm\s+(\d{1,3})\/(\d{1,3})\/(\d{1,3})\s*$/m],
  ];
  const values: Record<string, number[]> = {};
  for (const [key, re] of labels) {
    const m = text.match(re);
    if (!m) throw new Error("NOAA probability row missing: " + key);
    values[key] = m.slice(1,4).map(Number);
    if (values[key]!.some(v=>!Number.isInteger(v)||v<0||v>100)) throw new Error("Invalid NOAA probability: " + key);
  }
  return { issuedAt, probabilities: [0,1,2].map(i=>({
    t: start + i * 86_400_000,
    active: values["active"]![i]!, minor: values["minor"]![i]!,
    moderate: values["moderate"]![i]!, strongExtreme: values["strongExtreme"]![i]!,
  })) };
}
export interface OutlookDay { t: number; flux107: number; ap: number; largestKp: number }
export interface Outlook27 { issuedAt: number; days: OutlookDay[] }
export function parse27DayOutlook(text: string): Outlook27 {
  const issuedAt = parseIssued(text);
  if (issuedAt === null) throw new Error("NOAA 27-day outlook missing valid issuance timestamp");
  const values = new Map<number, OutlookDay>();
  const lines = text.split(/\r?\n/);
  const row = /^(\d{4})\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2,3})\s+(\d{1,3})\s+(\d{1,2})\s*$/;
  for (const line of lines) {
    const m = line.trim().match(row);
    if (!m) continue;
    const month = MONTH[m[2]!];
    if (month === undefined) continue;
    const t = utcDate(Number(m[1]), month, Number(m[3]));
    const flux107=Number(m[4]), ap=Number(m[5]), largestKp=Number(m[6]);
    if (t===null || flux107<40 || flux107>500 || ap>400 || largestKp>9) continue;
    values.set(t,{t,flux107,ap,largestKp});
  }
  const days=[...values.values()].sort((a,b)=>a.t-b.t);
  if (days.length < 3) throw new Error("NOAA 27-day outlook has no usable daily forecast");
  return {issuedAt,days};
}
export function outlookAhead(outlook: Outlook27, now: number): OutlookDay[] {
  const day=Math.floor(now/86_400_000)*86_400_000;
  return outlook.days.filter(d=>d.t>=day).slice(0,27);
}
/** Product ages are not confidence intervals. */
export function issuanceStatus(issuedAt: number | null, now: number, maxAgeMs: number): "current" | "stale" | "unavailable" {
  if (issuedAt===null || !Number.isFinite(issuedAt) || !Number.isFinite(now)) return "unavailable";
  return issuedAt > now + 60_000 || now-issuedAt>maxAgeMs ? "stale" : "current";
}
