// Public source audit models. No API tokens or app/React runtime needed.
import { parseMag, parseWind, parseKp, parseOvation, type Ovation } from "./model";
import { parseXray } from "./xray";
import { parseEpic } from "./epic";
import { assessHealth, type HealthState } from "./health";

export type AuditId = "wind" | "mag" | "kp" | "ovation" | "xray" | "epic";
export interface AuditSpec {
  id: AuditId;
  label: string;
  url: string;
  origin: "measured" | "index" | "model forecast" | "photograph";
  maxAgeMinutes: number;
  required: boolean;
}
export const AUDIT_SPECS: readonly AuditSpec[] = [
  { id: "wind", label: "NOAA L1 solar-wind plasma", url: "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json", origin: "measured", maxAgeMinutes: 15, required: true },
  { id: "mag", label: "NOAA L1 IMF magnetometer", url: "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json", origin: "measured", maxAgeMinutes: 15, required: true },
  { id: "kp", label: "NOAA planetary Kp", url: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", origin: "index", maxAgeMinutes: 360, required: false },
  { id: "ovation", label: "NOAA OVATION aurora", url: "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", origin: "model forecast", maxAgeMinutes: 30, required: false },
  { id: "xray", label: "NOAA GOES X-ray long band", url: "https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json", origin: "measured", maxAgeMinutes: 15, required: false },
  { id: "epic", label: "NASA DSCOVR EPIC photographs", url: "https://epic.gsfc.nasa.gov/api/natural", origin: "photograph", maxAgeMinutes: 7 * 24 * 60, required: false },
];

export interface PayloadSummary { count: number; newest: number | null; forecastFor?: number | null }
export function summarizePayload(id: AuditId, payload: unknown): PayloadSummary {
  if (id === "wind") { const rows = parseWind(payload); return { count: rows.length, newest: rows.at(-1)?.t ?? null }; }
  if (id === "mag") { const rows = parseMag(payload); return { count: rows.length, newest: rows.at(-1)?.t ?? null }; }
  if (id === "kp") { const rows = parseKp(payload); return { count: rows.length, newest: rows.at(-1)?.t ?? null }; }
  if (id === "xray") { const rows = parseXray(payload).long; return { count: rows.length, newest: rows.at(-1)?.t ?? null }; }
  if (id === "epic") { const rows = parseEpic(payload); return { count: rows.length, newest: rows.at(-1)?.t ?? null }; }
  const ov: Ovation | null = parseOvation(payload);
  return { count: ov?.points.length ?? 0, newest: ov?.observed ?? null, forecastFor: ov?.forecast ?? null };
}

export type AuditStatus = HealthState | "schema-error" | "image-reachable-unverified" | "released" | "old-release";
export interface AuditResult {
  label: string; origin: string; url: string; required: boolean;
  status: AuditStatus; checkedAt: number; acquiredAt: number | null;
  ageMinutes: number | null; validCount: number; forecastFor?: number | null;
  responseStatus?: number; error?: string; note: string;
}
/** A recent EPIC capture is a *released* photograph, not a live camera feed. */
export function evaluateJson(spec: AuditSpec, payload: unknown, now: number, responseStatus = 200): AuditResult {
  const summary = summarizePayload(spec.id, payload);
  const valid = summary.newest !== null;
  const assessment = assessHealth({ now, observedAt: summary.newest, maxAgeMs: spec.maxAgeMinutes * 60_000 });
  return {
    label: spec.label, origin: spec.origin, url: spec.url, required: spec.required,
    status: !valid ? "schema-error" : spec.id === "epic" && assessment.state === "current" ? "released" : spec.id === "epic" && assessment.state === "stale" ? "old-release" : assessment.state,
    checkedAt: now, acquiredAt: summary.newest, ageMinutes: assessment.ageMinutes,
    validCount: summary.count, forecastFor: summary.forecastFor,
    responseStatus,
    note: spec.id === "epic" ? "Most recently released NASA capture; acquisition may lag by days; never a live image" :
      spec.id === "ovation" ? "Timestamp is model input observation; forecast target is separately recorded" :
      spec.id === "kp" ? "Ground-derived 3-hour index, not instantaneous" :
      "Source timestamp is the measurement time (not the HTTP fetch time)",
  };
}
export function failedAudit(spec: AuditSpec, now: number, error: string, responseStatus?: number): AuditResult {
  return { label: spec.label, origin: spec.origin, url: spec.url, required: spec.required,
    status: "disconnected", checkedAt: now, acquiredAt: null, ageMinutes: null, validCount: 0,
    responseStatus, error: error.slice(0, 250), note: "This runner could not validate the public source; not a claim of a worldwide outage" };
}
