// Pure, deterministic source-health and temporal-coverage calculations.
export type HealthState = "current" | "stale" | "disconnected" | "loading" | "future";
export interface HealthInput {
  now: number;
  observedAt: number | null;
  maxAgeMs: number;
  failed?: boolean;
  /** Server-clock tolerance, not an excuse to call future records current. */
  futureToleranceMs?: number;
}
export interface HealthAssessment {
  state: HealthState;
  ageMinutes: number | null;
  observedAt: number | null;
}
export function assessHealth({ now, observedAt, maxAgeMs, failed = false, futureToleranceMs = 60_000 }: HealthInput): HealthAssessment {
  if (observedAt === null || !Number.isFinite(observedAt)) return { state: failed ? "disconnected" : "loading", ageMinutes: null, observedAt: null };
  const age = now - observedAt;
  const ageMinutes = Math.round((age / 60_000) * 10) / 10;
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return { state: "stale", ageMinutes, observedAt };
  if (age < -futureToleranceMs) return { state: "future", ageMinutes, observedAt };
  return { state: age <= maxAgeMs ? "current" : "stale", ageMinutes, observedAt };
}
export interface PointAt { t: number; bz: number | null }
export interface Coverage {
  windowStart: number;
  windowEnd: number;
  samples: number;
  observedMinutes: number;
  possibleMinutes: number;
  percentage: number;
  bzMatched: number;
  bzMatchedPercentage: number;
  oldest: number | null;
  newest: number | null;
}
/** A coverage figure for a chosen clock window, not a spacecraft uptime claim. */
export function coverage4h(samples: PointAt[], now: number, hours = 4): Coverage {
  const windowStart = now - hours * 3_600_000;
  const inWindow = samples.filter((s) => Number.isFinite(s.t) && s.t >= windowStart && s.t <= now + 60_000);
  const buckets = new Set(inWindow.map((s) => Math.floor(s.t / 60_000)));
  const possibleMinutes = Math.round(hours * 60);
  const bzMatched = inWindow.filter(s => s.bz !== null && Number.isFinite(s.bz)).length;
  const times = inWindow.map(s => s.t);
  return {
    windowStart, windowEnd: now,
    samples: inWindow.length,
    observedMinutes: buckets.size, possibleMinutes,
    percentage: Math.round((Math.min(buckets.size, possibleMinutes) / possibleMinutes) * 100),
    bzMatched, bzMatchedPercentage: inWindow.length ? Math.round(100 * bzMatched / inWindow.length) : 0,
    oldest: times.length ? Math.min(...times) : null,
    newest: times.length ? Math.max(...times) : null,
  };
}
