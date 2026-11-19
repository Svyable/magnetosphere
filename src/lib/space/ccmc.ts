/**
 * NASA CCMC CME Scoreboard: community CME arrival-time predictions at Earth (L1).
 * Each CME carries predictions from many independent methods (WSA–Enlil runs at NOAA,
 * NASA M2M and the Met Office, drag-based models, ML methods, human forecasters...).
 *
 * The spread between methods is the honest uncertainty. We never collapse it into one
 * "official" arrival time; CCMC's own auto-generated average/median entries are kept
 * separate from the independent members.
 */
// CCMC moved the Scoreboard in September 2026 (same parameters and JSON schema); the old kauai
// endpoint stopped updating. The legacy URL is kept only as an archive-collector fallback.
export const CCMC_SCOREBOARD_API = "https://ccmc.gsfc.nasa.gov/CMESB-Earth/WS/get/predictions";
export const CCMC_SCOREBOARD_API_LEGACY = "https://kauai.ccmc.gsfc.nasa.gov/CMEscoreboard/WS/get/predictions";
export const CCMC_SCOREBOARD_PAGE = "https://ccmc.gsfc.nasa.gov/CMESB-Earth/";

const H = 3_600_000;

export interface CmePrediction {
  method: string;
  submittedAt: number;
  arrivalAt: number;
  minusH: number | null;
  plusH: number | null;
  confidence: number | null;
  kpLo: number | null;
  kpHi: number | null;
  /** CCMC "Average/Median of all Methods" entries */
  aggregate: boolean;
}
export interface CmeEvent {
  id: string;
  observedAt: number;
  /** observed shock arrival at L1, once CCMC records it */
  arrivalAt: number | null;
  noArrivalObserved: boolean;
  maxKp: number | null;
  note: string | null;
  predictions: CmePrediction[];
}

/** CCMC times look like "2026-08-25T14:53Z" (minutes, Z). */
export function ccmcTime(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?Z$/);
  if (!m) return null;
  const t = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, m[6] ? +m[6] : 0);
  return new Date(t).getUTCDate() === +m[3]! ? t : null;
}
const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

export function parseScoreboard(raw: unknown): CmeEvent[] {
  if (!Array.isArray(raw)) throw new Error("CCMC CME Scoreboard response is not a JSON array");
  const out: CmeEvent[] = [];
  for (const r of raw) {
    if (r === null || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = typeof o["cmeID"] === "string" ? o["cmeID"] : null;
    const observedAt = ccmcTime(o["observedTime"]);
    if (!id || observedAt === null) continue;
    const preds: CmePrediction[] = [];
    for (const p of Array.isArray(o["predictions"]) ? o["predictions"] : []) {
      if (p === null || typeof p !== "object") continue;
      const q = p as Record<string, unknown>;
      const method = typeof q["predictedMethodName"] === "string" ? q["predictedMethodName"].trim() : "";
      const arrivalAt = ccmcTime(q["predictedArrivalTime"]);
      const submittedAt = ccmcTime(q["submissionTime"]);
      // A prediction must come after the CME and arrive after it (physically: >~12 h transit is not required, > 0 is).
      if (!method || arrivalAt === null || submittedAt === null || arrivalAt <= observedAt) continue;
      preds.push({
        method, submittedAt, arrivalAt,
        minusH: num(q["uncertaintyMinusInHrs"], 0, 240), plusH: num(q["uncertaintyPlusInHrs"], 0, 240),
        confidence: num(q["confidenceInPercentage"], 0, 100),
        kpLo: num(q["predictedMaxKpLowerRange"], 0, 9), kpHi: num(q["predictedMaxKpUpperRange"], 0, 9),
        aggregate: /\b(average|median) of all methods\b/i.test(method),
      });
    }
    out.push({
      id, observedAt, arrivalAt: ccmcTime(o["arrivalTime"]), noArrivalObserved: o["noArrivalObserved"] === true,
      maxKp: num(o["maxKP"], 0, 9), note: typeof o["cmeNote"] === "string" ? o["cmeNote"] : null,
      predictions: preds.sort((a, b) => a.arrivalAt - b.arrivalAt),
    });
  }
  return out.sort((a, b) => b.observedAt - a.observedAt);
}

/** Latest submission per independent method (methods revise; the newest is their current call). */
export function members(e: CmeEvent): CmePrediction[] {
  const latest = new Map<string, CmePrediction>();
  for (const p of e.predictions) {
    if (p.aggregate) continue;
    const prev = latest.get(p.method);
    if (!prev || p.submittedAt > prev.submittedAt) latest.set(p.method, p);
  }
  return [...latest.values()].sort((a, b) => a.arrivalAt - b.arrivalAt);
}

export interface Ensemble {
  n: number;
  median: number;
  earliest: number;
  latest: number;
  /** spread including each member's own stated error bars */
  envelopeStart: number;
  envelopeEnd: number;
  kpLo: number | null;
  kpHi: number | null;
  meanConfidence: number | null;
}
export function ensemble(e: CmeEvent): Ensemble | null {
  const m = members(e);
  if (!m.length) return null;
  const t = m.map(p => p.arrivalAt).sort((a, b) => a - b);
  const mid = t.length % 2 ? t[(t.length - 1) / 2]! : (t[t.length / 2 - 1]! + t[t.length / 2]!) / 2;
  const kl = m.map(p => p.kpLo).filter((v): v is number => v !== null);
  const kh = m.map(p => p.kpHi).filter((v): v is number => v !== null);
  const conf = m.map(p => p.confidence).filter((v): v is number => v !== null);
  return {
    n: m.length, median: mid, earliest: t[0]!, latest: t[t.length - 1]!,
    envelopeStart: Math.min(...m.map(p => p.arrivalAt - (p.minusH ?? 0) * H)),
    envelopeEnd: Math.max(...m.map(p => p.arrivalAt + (p.plusH ?? 0) * H)),
    kpLo: kl.length ? Math.min(...kl) : null, kpHi: kh.length ? Math.max(...kh) : null,
    meanConfidence: conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null,
  };
}

export type CmeState = "incoming" | "arrived" | "no-arrival" | "overdue";
/**
 * incoming: no arrival recorded and the latest member's window (incl. error bar) has not passed.
 * overdue: every member's window has passed with no arrival recorded yet (CCMC may still be analysing).
 */
export function cmeState(e: CmeEvent, now: number): CmeState {
  if (e.arrivalAt !== null) return "arrived";
  if (e.noArrivalObserved) return "no-arrival";
  const ens = ensemble(e);
  return ens && ens.envelopeEnd < now ? "overdue" : "incoming";
}

/** For arrived CMEs: each member's signed error (predicted − observed, hours). */
export function memberErrors(e: CmeEvent): { method: string; errorH: number; leadH: number }[] {
  if (e.arrivalAt === null) return [];
  return members(e).map(p => ({ method: p.method, errorH: (p.arrivalAt - e.arrivalAt!) / H, leadH: (e.arrivalAt! - p.submittedAt) / H }));
}

/** Trim to CMEs observed in the last `days` (the archive keeps the full history separately). */
export function recentEvents(events: CmeEvent[], now: number, days = 30): CmeEvent[] {
  return events.filter(e => e.observedAt >= now - days * 86_400_000);
}

/** Base URL of the hourly archive branch written by .github/workflows/forecast-archive.yml. */
export const ARCHIVE_BASE = "https://raw.githubusercontent.com/Svyable/magnetosphere/forecast-archive/";
export const ARCHIVE_TREE = "https://github.com/Svyable/magnetosphere/tree/forecast-archive";

export interface CmeArchive { fetchedAt: number; events: CmeEvent[] }
/** Re-validate the archived (already normalized) CCMC file; the browser never trusts it blindly. */
export function parseCmeArchive(raw: unknown): CmeArchive {
  const o = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const fetchedAt = o && typeof o["fetchedAt"] === "string" ? Date.parse(o["fetchedAt"]) : NaN;
  if (!o || !Number.isFinite(fetchedAt) || !Array.isArray(o["events"])) throw new Error("CME archive file has an unexpected shape");
  const okNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const events = (o["events"] as unknown[]).filter((e): e is CmeEvent => {
    if (e === null || typeof e !== "object") return false;
    const x = e as Record<string, unknown>;
    return typeof x["id"] === "string" && okNum(x["observedAt"]) && (x["arrivalAt"] === null || okNum(x["arrivalAt"])) &&
      Array.isArray(x["predictions"]) && (x["predictions"] as unknown[]).every(p => {
        const q = p as Record<string, unknown> | null;
        return !!q && typeof q["method"] === "string" && okNum(q["arrivalAt"]) && okNum(q["submittedAt"]) && typeof q["aggregate"] === "boolean";
      });
  });
  return { fetchedAt, events };
}
