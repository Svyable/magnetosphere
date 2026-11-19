/**
 * Auditably captured NOAA forecast receipts, later scored against the
 * same SWPC product's "observed" Kp values. Do not claim final Kp
 * ground truth, statistical calibration, or independent observations.
 *
 * The NOAA JSON does NOT carry an independent forecast-issued timestamp:
 * capturedAt records WHEN OUR RUNNER FETCHED the rolling SWPC product.
 */
import { type KpForecastSlot } from "./forecast";

export const LEDGER_SOURCE_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";
export const PUBLIC_LEDGER_URL =
  "https://raw.githubusercontent.com/Svyable/magnetosphere/forecast-ledger/forecast-ledger/summary.json";
const PERIOD_MS = 3 * 3_600_000;
const CAPTURE_BUCKET_MS = 6 * 3_600_000;
const HOUR_MS = 3_600_000;

export interface ForecastReceipt {
  /** Timestamp of *our* retrieval, NOT NOAA's forecast-issued timestamp. */
  capturedAt: number;
  /** Last NOAA product record then labeled observed, copied at time of fetch. */
  persistenceKp: number | null;
  persistenceObservedAt: number | null;
  /** Strictly future slots NOAA labeled predicted at capture time. */
  predicted: { t: number; kp: number }[];
}
export interface ObservedReceipt {
  t: number;
  kp: number;
  /** First collection of this source-labelled observed value. */
  seenAt: number;
}
export interface LedgerMonth {
  schemaVersion: 1;
  captures: ForecastReceipt[];
  observations: ObservedReceipt[];
}
export type LeadBand = "0–6h" | "6–24h" | "24–48h" | "48–72h";
export const LEAD_BANDS: LeadBand[] = ["0–6h", "6–24h", "24–48h", "48–72h"];
export interface LedgerPair {
  targetAt: number;
  fetchedAt: number;
  leadHours: number;
  band: LeadBand;
  forecastKp: number;
  observedKp: number;
  observationSeenAt: number;
  persistenceKp: number | null;
}
export interface SkillRow {
  band: LeadBand;
  pairedPeriods: number;
  /** Mean absolute difference versus source-labelled observed NOAA Kp. */
  maeKp: number | null;
  /** Average signed error (forecast minus observed). */
  biasKp: number | null;
  persistenceMaeKp: number | null;
  persistencePairedPeriods: number;
  observedStormPeriods: number;
  predictedStormPeriods: number;
  hits: number;
  falseAlarms: number;
  missedStorms: number;
  trueNegatives: number;
}
export interface LedgerSummary {
  schemaVersion: 1;
  updatedAt: number;
  earliestCaptureAt: number | null;
  latestCaptureAt: number | null;
  captures: number;
  archivedPredictions: number;
  sourceObservedRecords: number;
  verifiedTargetPeriods: number;
  rows: SkillRow[];
  recentPairs: LedgerPair[];
  provenance: {
    forecastSource: string;
    archiveBranch: "forecast-ledger";
    timestampType: string;
    verifyingSource: string;
    caveat: string;
  };
}

export function blankLedgerMonth(): LedgerMonth {
  return { schemaVersion: 1, captures: [], observations: [] };
}
export function appendKpCapture(
  archive: LedgerMonth, source: KpForecastSlot[], capturedAt: number,
): LedgerMonth {
  if (!Number.isFinite(capturedAt) || capturedAt < Date.UTC(2020, 0, 1)) throw new RangeError("Invalid collection timestamp");
  const entries = source.filter(s=>Number.isFinite(s.t) && Number.isFinite(s.kp) && s.kp>=0 && s.kp<=9);
  const future = entries
    .filter(s=>s.status==="predicted" && s.t>capturedAt && s.t<=capturedAt+72*HOUR_MS)
    .map(s=>({t:s.t,kp:s.kp}));
  if (!future.length) throw new Error("No future NOAA-predicted Kp slots; refuse empty verification receipt");
  const oldObserved = entries
    .filter(s=>s.status==="observed" && s.t+PERIOD_MS<=capturedAt && s.t<=capturedAt)
    .sort((a,b)=>b.t-a.t);
  const newest = oldObserved[0] ?? null;
  const persistence = newest && capturedAt-newest.t<=12*HOUR_MS ? newest : null;
  const bucket=Math.floor(capturedAt/CAPTURE_BUCKET_MS);
  const already=archive.captures.some(s=>Math.floor(s.capturedAt/CAPTURE_BUCKET_MS)===bucket);
  const captured: ForecastReceipt[] = already ? [] : [{
    capturedAt, persistenceKp:persistence?.kp??null,
    persistenceObservedAt:persistence?.t??null, predicted:future,
  }];
  const known=new Set(archive.observations.map(s=>s.t+":"+s.kp));
  const observations: ObservedReceipt[]=[];
  for(const s of oldObserved){
    const key=s.t+":"+s.kp;
    if(known.has(key))continue;
    known.add(key);
    observations.push({t:s.t,kp:s.kp,seenAt:capturedAt});
  }
  return {
    schemaVersion:1,
    captures:[...archive.captures,...captured].sort((a,b)=>a.capturedAt-b.capturedAt),
    observations:[...archive.observations,...observations].sort((a,b)=>a.seenAt-b.seenAt || a.t-b.t),
  };
}
export function bandForHours(h:number):LeadBand|null{
  if(!Number.isFinite(h)||h<0||h>72)return null;
  return h<6?"0–6h":h<24?"6–24h":h<48?"24–48h":"48–72h";
}
const round=(v:number)=>Math.round(v*100)/100;

/** One pre-event forecast per verified 3-hour period per horizon band.
 * Reruns and adjacent archive captures cannot artificially inflate sample counts.
 * Latest *captured* forecast in each lead band is selected, deterministically.
 */
export function verifyForecasts(months:LedgerMonth[], now:number):LedgerSummary{
  const receipts=months.flatMap(m=>m.captures).sort((a,b)=>a.capturedAt-b.capturedAt);
  const observations=months.flatMap(m=>m.observations).sort((a,b)=>a.seenAt-b.seenAt);
  const observed=new Map<number,ObservedReceipt>();
  for(const o of observations)if(o.seenAt>=o.t+PERIOD_MS && o.seenAt<=now)observed.set(o.t,o);
  const chosen=new Map<string,LedgerPair>();
  for(const r of receipts){
    if(r.capturedAt>now)continue;
    for(const p of r.predicted){
      const leadHours=(p.t-r.capturedAt)/HOUR_MS;
      const band=bandForHours(leadHours), o=observed.get(p.t);
      if(!band||!o||r.capturedAt>=p.t)continue;
      const key=p.t+":"+band;
      const prior=chosen.get(key);
      if(!prior || prior.fetchedAt<r.capturedAt){
        chosen.set(key,{
          targetAt:p.t,fetchedAt:r.capturedAt,leadHours:round(leadHours),
          band,forecastKp:p.kp,observedKp:o.kp,
          observationSeenAt:o.seenAt,
          persistenceKp:r.persistenceKp,
        });
      }
    }
  }
  const pairs=[...chosen.values()].sort((a,b)=>b.targetAt-a.targetAt||LEAD_BANDS.indexOf(a.band)-LEAD_BANDS.indexOf(b.band));
  const rows=LEAD_BANDS.map(band=>{
    const p=pairs.filter(x=>x.band===band);
    const n=p.length;
    const persist=p.filter(x=>x.persistenceKp!==null);
    const errors=p.map(x=>x.forecastKp-x.observedKp);
    return {
      band,pairedPeriods:n,maeKp:n?round(errors.reduce((a,v)=>a+Math.abs(v),0)/n):null,
      biasKp:n?round(errors.reduce((a,v)=>a+v,0)/n):null,
      persistenceMaeKp:persist.length?round(persist.reduce((a,v)=>a+Math.abs(v.persistenceKp!-v.observedKp),0)/persist.length):null,
      persistencePairedPeriods:persist.length,
      observedStormPeriods:p.filter(x=>x.observedKp>=5).length,
      predictedStormPeriods:p.filter(x=>x.forecastKp>=5).length,
      hits:p.filter(x=>x.forecastKp>=5&&x.observedKp>=5).length,
      falseAlarms:p.filter(x=>x.forecastKp>=5&&x.observedKp<5).length,
      missedStorms:p.filter(x=>x.forecastKp<5&&x.observedKp>=5).length,
      trueNegatives:p.filter(x=>x.forecastKp<5&&x.observedKp<5).length,
    } satisfies SkillRow;
  });
  const distinct=new Set(pairs.map(x=>x.targetAt));
  return{
    schemaVersion:1,updatedAt:now,
    earliestCaptureAt:receipts[0]?.capturedAt??null,
    latestCaptureAt:receipts.at(-1)?.capturedAt??null,
    captures:receipts.length,
    archivedPredictions:receipts.reduce((n,r)=>n+r.predicted.length,0),
    sourceObservedRecords:observed.size,
    verifiedTargetPeriods:distinct.size,
    rows,recentPairs:pairs.slice(0,12),
    provenance:{
      forecastSource:LEDGER_SOURCE_URL,
      archiveBranch:"forecast-ledger",
      timestampType:"automated GitHub runner retrieval, not NOAA issuance",
      verifyingSource:"NOAA Kp forecast JSON records later labeled observed; revisions possible",
      caveat:"Performance is descriptive and not independently validated, probabilistically calibrated, or an operational forecast guarantee. Pending estimates are excluded. Paired bins are overlapping in time across lead bands; not independent event counts.",
    },
  };
}
