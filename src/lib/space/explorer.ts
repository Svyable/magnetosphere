// Surface field explorer built on IGRF-14 fieldAt (internal core field only).
import { coeffsAt, fieldAt, greatCircleKm, IGRF_FIRST, IGRF_LAST, IGRF_SV_END, type FieldGrid } from "./igrf";

export interface Target { lat: number; lon: number }

export function validateTarget(lat: unknown, lon: unknown): { ok: true; target: Target } | { ok: false; error: string } {
  const la = typeof lat === "number" ? lat : Number(lat);
  const lo = typeof lon === "number" ? lon : Number(lon);
  if (lat === "" || lon === "" || !Number.isFinite(la) || !Number.isFinite(lo)) return { ok: false, error: "Enter numeric latitude and longitude." };
  if (la < -90 || la > 90) return { ok: false, error: "Latitude must be between −90 and 90." };
  if (lo < -180 || lo > 180) return { ok: false, error: "Longitude must be between −180 and 180." };
  return { ok: true, target: { lat: la, lon: lo } };
}

export type EpochKind = "definitive" | "predicted" | "clamped";
export function epochKind(year: number): EpochKind {
  if (year < IGRF_FIRST || year > IGRF_SV_END) return "clamped";
  return year > IGRF_LAST ? "predicted" : "definitive";
}

export interface Exploration {
  F: number; H: number; X: number; Y: number; Z: number; D: number; I: number;
  dF: number; dD: number; dI: number; year: number; epoch: EpochKind;
  saaKm: number | null; insideWeak: boolean;
}

export function explore(t: Target, year: number, grid?: FieldGrid | null): Exploration {
  const y = Math.min(Math.max(year, IGRF_FIRST + 1), IGRF_SV_END);
  const now = fieldAt(coeffsAt(y), t.lat, t.lon);
  const prev = fieldAt(coeffsAt(y - 1), t.lat, t.lon);
  const D = (Math.atan2(now.Y, now.X) * 180) / Math.PI;
  const Dp = (Math.atan2(prev.Y, prev.X) * 180) / Math.PI;
  let dD = D - Dp; if (dD > 180) dD -= 360; if (dD < -180) dD += 360;
  return {
    F: now.F, H: now.H, X: now.X, Y: now.Y, Z: now.Z, D, I: now.incl,
    dF: now.F - prev.F, dD, dI: now.incl - prev.incl, year: y, epoch: epochKind(year),
    saaKm: grid ? greatCircleKm(t, grid.min) : null, insideWeak: now.F < 32000,
  };
}