// IGRF-14 main field evaluation (pure TS). Geocentric spherical approximation, r = 6371.2 km.
import data from "./igrf14.json";

const N = 13;
const RE_KM = 6371.2;
type RowT = [string, number, number, number[], number];
const ROWS = data.rows as RowT[];
const EPOCHS = data.epochs as number[];

export interface Coeffs { g: number[][]; h: number[][]; year: number }

/** Schmidt factors applied once so Gauss-normalized Legendre recursion can be used. */
const S: number[][] = (() => {
  const s = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  s[0]![0] = 1;
  for (let n = 1; n <= N; n++) {
    s[n]![0] = (s[n - 1]![0]! * (2 * n - 1)) / n;
    for (let m = 1; m <= n; m++) s[n]![m] = s[n]![m - 1]! * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
  }
  return s;
})();
const K: number[][] = Array.from({ length: N + 1 }, (_, n) =>
  Array.from({ length: N + 1 }, (_, m) => (n > 1 ? ((n - 1) ** 2 - m ** 2) / ((2 * n - 1) * (2 * n - 3)) : 0)),
);

export const IGRF_FIRST = EPOCHS[0]!;
export const IGRF_LAST = EPOCHS[EPOCHS.length - 1]!;
export const IGRF_SV_END = IGRF_LAST + 5;

/** Linear interpolation between 5-year epochs; after the last epoch, linear secular variation (valid to +5 yr). */
export function coeffsAt(yearIn: number): Coeffs {
  const year = Math.min(Math.max(yearIn, IGRF_FIRST), IGRF_SV_END);
  const g = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  const h = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  let i = Math.min(Math.floor((year - IGRF_FIRST) / 5), EPOCHS.length - 1);
  const after = year >= IGRF_LAST;
  const f = after ? year - IGRF_LAST : (year - EPOCHS[i]!) / 5;
  for (const [gh, n, m, vals, sv] of ROWS) {
    let v: number;
    if (after) { v = vals[vals.length - 1]! + sv * f; }
    else { const a = vals[i]!, b = vals[i + 1] ?? a; v = a + (b - a) * f; }
    (gh === "g" ? g : h)[n]![m] = v * S[n]![m]!;
  }
  return { g, h, year };
}

export interface FieldValue { X: number; Y: number; Z: number; H: number; F: number; incl: number }

export function fieldAt(c: Coeffs, latDeg: number, lonDeg: number, rKm = RE_KM): FieldValue {
  const lat = Math.max(Math.min(latDeg, 89.999), -89.999);
  const th = ((90 - lat) * Math.PI) / 180;
  const ph = (lonDeg * Math.PI) / 180;
  const ct = Math.cos(th), st = Math.sin(th);
  const P = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  const dP = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  P[0]![0] = 1;
  let Br = 0, Bt = 0, Bp = 0;
  const ar = RE_KM / rKm;
  for (let n = 1; n <= N; n++) {
    const pw = ar ** (n + 2);
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        P[n]![m] = st * P[n - 1]![m - 1 < 0 ? 0 : m - 1]!;
        dP[n]![m] = st * dP[n - 1]![m - 1 < 0 ? 0 : m - 1]! + ct * P[n - 1]![m - 1 < 0 ? 0 : m - 1]!;
      } else {
        const p2 = n >= 2 ? P[n - 2]![m]! : 0, d2 = n >= 2 ? dP[n - 2]![m]! : 0;
        P[n]![m] = ct * P[n - 1]![m]! - K[n]![m]! * p2;
        dP[n]![m] = ct * dP[n - 1]![m]! - st * P[n - 1]![m]! - K[n]![m]! * d2;
      }
      const cm = Math.cos(m * ph), sm = Math.sin(m * ph);
      const gg = c.g[n]![m]!, hh = c.h[n]![m]!;
      const t = gg * cm + hh * sm;
      Br += (n + 1) * pw * t * P[n]![m]!;
      Bt -= pw * t * dP[n]![m]!;
      Bp -= (pw * m * (-gg * sm + hh * cm) * P[n]![m]!) / st;
    }
  }
  const X = -Bt, Y = Bp, Z = -Br;
  const H = Math.hypot(X, Y);
  return { X, Y, Z, H, F: Math.hypot(H, Z), incl: (Math.atan2(Z, H) * 180) / Math.PI };
}

export interface LatLon { lat: number; lon: number }
const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Dip (magnetic) pole: where the field is vertical (H -> 0). Coarse grid + shrinking refinement. */
export function dipPole(c: Coeffs, north: boolean): LatLon {
  const sgn = north ? 1 : -1;
  let best = { lat: 80 * sgn, lon: 0, h: Infinity };
  for (let la = 60; la <= 89.5; la += 2) for (let lo = -180; lo < 180; lo += 10) {
    const h = fieldAt(c, la * sgn, lo).H;
    if (h < best.h) best = { lat: la * sgn, lon: lo, h };
  }
  let dLat = 2, dLon = 10;
  for (let it = 0; it < 14; it++) {
    const c0 = best;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const la = Math.max(-89.99, Math.min(89.99, c0.lat + (i * dLat) / 2));
      const lo = wrap(c0.lon + (j * dLon) / 2);
      const h = fieldAt(c, la, lo).H;
      if (h < best.h) best = { lat: la, lon: lo, h };
    }
    dLat *= 0.6; dLon *= 0.6;
  }
  return { lat: best.lat, lon: best.lon };
}

/** Geomagnetic (centred-dipole) north pole from degree-1 terms. */
export function geomagneticPole(c: Coeffs): LatLon & { momentNT: number } {
  const g10 = c.g[1]![0]!, g11 = c.g[1]![1]!, h11 = c.h[1]![1]!;
  const B0 = Math.hypot(g10, g11, h11);
  return { lat: (Math.asin(-g10 / B0) * 180) / Math.PI, lon: (Math.atan2(-h11, -g11) * 180) / Math.PI, momentNT: B0 };
}

export function greatCircleKm(a: LatLon, b: LatLon) {
  const r = Math.PI / 180;
  const s = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * RE_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDeg(a: LatLon, b: LatLon) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

export interface PoleMotion { now: LatLon; speedKmYr: number; bearing: number; path: { year: number; p: LatLon }[] }

export function poleMotion(year: number, north: boolean): PoleMotion {
  const y = Math.min(year, IGRF_SV_END);
  const now = dipPole(coeffsAt(y), north);
  const prev = dipPole(coeffsAt(y - 1), north);
  const path: { year: number; p: LatLon }[] = [];
  for (let yr = IGRF_FIRST; yr < y; yr += 5) path.push({ year: yr, p: dipPole(coeffsAt(yr), north) });
  path.push({ year: y, p: now });
  return { now, speedKmYr: greatCircleKm(prev, now), bearing: bearingDeg(prev, now), path };
}

export interface FieldGrid { w: number; h: number; F: Float32Array; min: { lat: number; lon: number; F: number }; lowFraction: number }

/** Surface total intensity on an equirectangular grid (row 0 = 90N, col 0 = 180W). */
export function intensityGrid(c: Coeffs, stepDeg = 2, lowThresholdNT = 32000): FieldGrid {
  const w = Math.round(360 / stepDeg), h = Math.round(180 / stepDeg) + 1;
  const F = new Float32Array(w * h);
  let min = { lat: 0, lon: 0, F: Infinity }, low = 0, tot = 0;
  for (let i = 0; i < h; i++) {
    const lat = 90 - i * stepDeg;
    const wgt = Math.cos((lat * Math.PI) / 180);
    for (let j = 0; j < w; j++) {
      const lon = -180 + j * stepDeg;
      const f = fieldAt(c, lat, lon).F;
      F[i * w + j] = f;
      tot += wgt; if (f < lowThresholdNT) low += wgt;
      if (f < min.F) min = { lat, lon, F: f };
    }
  }
  return { w, h, F, min, lowFraction: low / tot };
}

export function decimalYear(t: number) {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const a = Date.UTC(y, 0, 1), b = Date.UTC(y + 1, 0, 1);
  return y + (t - a) / (b - a);
}