/**
 * Incoming L1 solar-wind observations, propagated to a *nominal* Earth-arrival time.
 *
 * This is an advection thought-experiment based on measured upstream values,
 * not NOAA's official CME arrival forecast or a simulation of interplanetary shocks.
 * Shue is an empirical fit and requires BOTH measured density/speed and a matched Bz.
 * An uncertain travel time has no calibrated probability interval here.
 */
import {
  dynamicPressure, laggedSample, propagationSeconds, shue, type L1Sample,
} from "./model";

export const INCOMING_HORIZON_MINUTES = 130;
export const SOURCE_MAX_AGE_MINUTES = 12;
export const INCOMING_BUCKET_MINUTES = 5;
const MINUTE = 60_000;

export interface IncomingPulse {
  sample: L1Sample;
  observedAt: number;
  arrivalAt: number;
  leadMinutes: number;
  nominalTravelMinutes: number;
  pressureNPa: number;
  /** Null if a matching in-situ GSM Bz was not observed; never assumed to be zero. */
  shueNoseRE: number | null;
  /** Differences are calculated from currently *arrived* L1 inputs, not from tomorrow's Kp. */
  changeFromNowRE: number | null;
}
export type IncomingFreshness = "current" | "stale" | "missing";
export interface IncomingOutlook {
  freshness: IncomingFreshness;
  latestObservationAt: number | null;
  latestMagObservationAt: number | null;
  magneticFreshness: IncomingFreshness;
  sampledCount: number;
  allPulses: IncomingPulse[];
  /** Latest observed sample per nominal 5-minute arrival bucket. */
  pulses: IncomingPulse[];
  minimumBz: number | null;
  maximumPressureNPa: number | null;
  lowestModeledNoseRE: number | null;
  currentModeledNoseRE: number | null;
}

function validSample(s: L1Sample): boolean {
  return Number.isFinite(s.t) && Number.isFinite(s.v) && Number.isFinite(s.n) &&
    s.v >= 150 && s.v <= 3000 && s.n > 0 && s.n <= 200 &&
    (s.bz === null || (Number.isFinite(s.bz) && Math.abs(s.bz) <= 200));
}

export function estimatedArrival(s: L1Sample): number {
  return s.t + propagationSeconds(s.v) * 1000;
}

export function incomingOutlook(samples: L1Sample[], now: number): IncomingOutlook {
  const valid = samples.filter(validSample).filter(s => s.t <= now + MINUTE).sort((a,b) => a.t-b.t);
  const latestObservationAt = valid.at(-1)?.t ?? null;
  const age = latestObservationAt === null ? null : now - latestObservationAt;
  const freshness: IncomingFreshness = age === null ? "missing"
    : age < -MINUTE || age > SOURCE_MAX_AGE_MINUTES * MINUTE ? "stale" : "current";

  const latestMagObservationAt = valid.filter(s=>s.bz!==null).at(-1)?.t ?? null;
  const magAge = latestMagObservationAt === null ? null : now-latestMagObservationAt;
  const magneticFreshness: IncomingFreshness = magAge===null?"missing" :
    magAge < -MINUTE || magAge > SOURCE_MAX_AGE_MINUTES*MINUTE ? "stale" : "current";

  // Current propagated state is an independent reference, not a backfilled Bz.
  const currentlyArrived = laggedSample(valid, now);
  const currentModeledNoseRE = currentlyArrived?.bz == null ? null :
    shue(dynamicPressure(currentlyArrived.n, currentlyArrived.v), currentlyArrived.bz).r0;
  const allPulses: IncomingPulse[] = [];
  for (const sample of valid) {
    const arrivalAt = estimatedArrival(sample);
    if (arrivalAt <= now || arrivalAt > now + INCOMING_HORIZON_MINUTES * MINUTE) continue;
    const pressureNPa = dynamicPressure(sample.n, sample.v);
    const shueNoseRE = sample.bz === null ? null : shue(pressureNPa, sample.bz).r0;
    allPulses.push({
      sample, observedAt: sample.t, arrivalAt,
      leadMinutes: (arrivalAt-now)/MINUTE,
      nominalTravelMinutes: (arrivalAt-sample.t)/MINUTE,
      pressureNPa, shueNoseRE,
      changeFromNowRE: shueNoseRE === null || currentModeledNoseRE === null ? null : shueNoseRE-currentModeledNoseRE,
    });
  }
  allPulses.sort((a,b) => a.arrivalAt-b.arrivalAt || a.observedAt-b.observedAt);
  const grouped = new Map<number, IncomingPulse>();
  for (const p of allPulses) {
    const bucket = Math.floor((p.arrivalAt-now)/(INCOMING_BUCKET_MINUTES*MINUTE));
    // Late-arriving observation in a bucket wins; no smoothing/interpolation of Bz.
    const prev = grouped.get(bucket);
    if (!prev || p.observedAt > prev.observedAt) grouped.set(bucket,p);
  }
  const withBz = allPulses.filter(p=>p.sample.bz!==null);
  return {
    freshness, latestObservationAt, latestMagObservationAt, magneticFreshness, sampledCount: allPulses.length, allPulses,
    pulses:[...grouped.values()].sort((a,b)=>a.arrivalAt-b.arrivalAt),
    minimumBz: withBz.length ? Math.min(...withBz.map(p=>p.sample.bz!)) : null,
    maximumPressureNPa: allPulses.length ? Math.max(...allPulses.map(p=>p.pressureNPa)) : null,
    lowestModeledNoseRE: withBz.length ? Math.min(...withBz.map(p=>p.shueNoseRE!)) : null,
    currentModeledNoseRE,
  };
}
export function incomingCsv(outlook: IncomingOutlook): string {
  const cols = [
    "L1_observed_UTC","nominal_Earth_arrival_UTC","lead_minutes_at_export","speed_km_s",
    "density_cm_minus3","measured_Bz_GSM_nT","derived_dynamic_pressure_nPa",
    "empirical_Shue_nose_Earth_radii","wind_instrument","magnetometer","classification",
  ];
  const cell = (v: string | number | null) =>
    v === null ? "" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") :
    '"' + (/^[=+@\-\t\r]/.test(v) ? "'" : "") + v.replace(/"/g,'""') + '"';
  const rows = outlook.allPulses.map(p => [
    new Date(p.observedAt).toISOString(), new Date(p.arrivalAt).toISOString(),
    Number(p.leadMinutes.toFixed(2)), p.sample.v, p.sample.n, p.sample.bz,
    Number(p.pressureNPa.toFixed(4)), p.shueNoseRE == null ? null : Number(p.shueNoseRE.toFixed(3)),
    p.sample.windSource, p.sample.magSource, "measured_L1_plus_estimated_advection_and_empirical_model",
  ] as (string|number|null)[]);
  return [cols.join(","),...rows.map(row=>row.map(cell).join(","))].join("\r\n")+"\r\n";
}
