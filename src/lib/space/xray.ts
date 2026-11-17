// NOAA GOES X-ray flux (1-minute, primary satellite). Measurement, not forecast.
export const XRAY_URL = "https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json";
export const LONG_BAND = "0.1-0.8nm";
export const SHORT_BAND = "0.05-0.4nm";

export interface XraySample { t: number; flux: number; satellite: number | null }
export interface XrayData { long: XraySample[]; short: XraySample[] }

export function parseXray(json: unknown): XrayData {
  const long: XraySample[] = [], short: XraySample[] = [];
  if (!Array.isArray(json)) return { long, short };
  for (const r of json) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const ts = typeof o["time_tag"] === "string" ? Date.parse(o["time_tag"].endsWith("Z") ? o["time_tag"] : o["time_tag"] + "Z") : NaN;
    const flux = typeof o["flux"] === "number" ? o["flux"] : Number(o["flux"]);
    if (!Number.isFinite(ts) || !Number.isFinite(flux) || flux <= 0 || flux > 1e-1) continue;
    const s = { t: ts, flux, satellite: typeof o["satellite"] === "number" ? o["satellite"] : null };
    if (o["energy"] === LONG_BAND) long.push(s);
    else if (o["energy"] === SHORT_BAND) short.push(s);
  }
  long.sort((a, b) => a.t - b.t); short.sort((a, b) => a.t - b.t);
  return { long, short };
}

/** Conventional GOES class from the 0.1–0.8 nm (long) band flux in W/m². */
export function flareClass(flux: number): string {
  if (!(flux > 0)) return "—";
  const bands: [string, number][] = [["X", 1e-4], ["M", 1e-5], ["C", 1e-6], ["B", 1e-7], ["A", 1e-8]];
  for (const [l, th] of bands) if (flux >= th) return `${l}${(Math.floor((flux / th) * 10 + 1e-9) / 10).toFixed(1)}`; // NOAA truncates
  return `<A1.0`;
}

export function peak(samples: XraySample[], sinceMs: number): XraySample | null {
  let best: XraySample | null = null;
  for (const s of samples) if (s.t >= sinceMs && (!best || s.flux > best.flux)) best = s;
  return best;
}