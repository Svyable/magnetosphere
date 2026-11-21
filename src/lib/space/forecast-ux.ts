/**
 * Visitor-facing forecast tools: storm windows, explicit saved snapshot comparisons,
 * calendar conversion and reproducible links. All rely on official NOAA *predicted*
 * Kp records, not Kp->probability inference or invented weather model output.
 */
import {type KpForecastSlot} from "./forecast";

export type ForecastHorizon = "incoming" | "72h" | "verify" | "27d";
export type ForecastClock = "utc" | "local";
export const THREE_HOURS_MS = 3 * 3_600_000;
export const FORECAST_SNAPSHOT_KEY = "magnetosphere.noaa-forecast-snapshot.v1";

export function parseForecastHorizon(value:string|null):ForecastHorizon|null {
  return value==="incoming" || value==="72h" || value==="verify" || value==="27d" ? value:null;
}
export function parseForecastClock(value:string|null):ForecastClock|null {
  return value==="utc" || value==="local" ? value:null;
}
export function parseStormTarget(value:string|null):number|null {
  if(!value || !/^\d{13}$/.test(value))return null;
  const t=Number(value);
  if(!Number.isSafeInteger(t) || t<Date.UTC(2020,0,1) || t>Date.UTC(2100,0,1) || t%THREE_HOURS_MS!==0)return null;
  return t;
}

export interface StormWindow {
  start:number;
  end:number;
  peakAt:number;
  peakKp:number;
  /** Directly derived from NOAA's Kp forecast, NOT an issued NOAA alert. */
  threshold:"G1"|"G2"|"G3"|"G4"|"G5";
  slots:number;
}
const level=(kp:number):StormWindow["threshold"]=>("G"+Math.min(5,Math.floor(kp)-4)) as StormWindow["threshold"];
/** Consecutive Kp>=5 *predicted* 3-hour periods only; never bridge gaps or estimates. */
export function stormWindows(slots:KpForecastSlot[],now:number):StormWindow[] {
  if(!Number.isFinite(now))return [];
  const future=slots.filter(s=>s.status==="predicted" && Number.isFinite(s.t) &&
    Number.isFinite(s.kp) && s.kp>=5 && s.kp<=9 &&
    s.t+THREE_HOURS_MS>now && s.t<now+72*3_600_000)
    .sort((a,b)=>a.t-b.t);
  const windows:StormWindow[]=[];
  for(const s of future){
    const prev=windows.at(-1);
    if(prev && prev.end===s.t){
      prev.end=s.t+THREE_HOURS_MS;
      prev.slots++;
      if(s.kp>prev.peakKp){prev.peakKp=s.kp;prev.peakAt=s.t;prev.threshold=level(s.kp);}
    }else windows.push({start:s.t,end:s.t+THREE_HOURS_MS,peakAt:s.t,peakKp:s.kp,threshold:level(s.kp),slots:1});
  }
  return windows;
}
export function formatForecastTime(t:number,clock:ForecastClock,zone?:string):string {
  if(!Number.isFinite(t))return "—";
  if(clock==="utc")return new Date(t).toISOString().slice(5,16).replace("T"," ")+" UTC";
  return new Intl.DateTimeFormat("en-US",{
    timeZone:zone,month:"short",day:"numeric",hour:"numeric",minute:"2-digit",
    hour12:true,timeZoneName:"short",
  }).format(new Date(t));
}
export interface ForecastSnapshot {
  schemaVersion:1;
  /** Browser snapshot save time, not the NOAA source issuance time. */
  savedAt:number;
  /** TanStack fetch completion time, NOT NOAA issue time. */
  fetchedAt:number;
  /** Only NOAA slots explicitly labelled predicted at time of save. */
  predicted:{t:number;kp:number}[];
}
export function makeForecastSnapshot(slots:KpForecastSlot[],now:number,fetchedAt:number):ForecastSnapshot|null{
  if(!Number.isFinite(now)||!Number.isFinite(fetchedAt)||fetchedAt>now+60_000||
     now-fetchedAt>30*60_000)return null;
  const predictions=slots.filter(s=>s.status==="predicted" && Number.isFinite(s.kp) &&
    s.kp>=0 && s.kp<=9 && s.t>now && s.t<now+72*3_600_000)
    .map(s=>({t:s.t,kp:s.kp})).sort((a,b)=>a.t-b.t);
  if(!predictions.length)return null;
  return {schemaVersion:1,savedAt:now,fetchedAt,predicted:predictions};
}
export function parseForecastSnapshot(raw:unknown):ForecastSnapshot|null{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const s=raw as Partial<ForecastSnapshot>;
  if(s.schemaVersion!==1||!Number.isFinite(s.savedAt)||!Number.isFinite(s.fetchedAt)||
    !Array.isArray(s.predicted)||s.predicted.length===0||s.predicted.length>50)return null;
  const p=s.predicted as unknown[];
  if(!p.every(v=>{
    if(!v||typeof v!=="object"||Array.isArray(v))return false;
    const r=v as Record<string,unknown>;
    return typeof r["t"]==="number" && Number.isFinite(r["t"]) &&
      typeof r["kp"]==="number" && Number.isFinite(r["kp"]) &&
      r["kp"]>=0 && r["kp"]<=9;
  }))return null;
  return s as ForecastSnapshot;
}
export interface ForecastDelta {
  t:number;
  before:number;
  after:number;
  delta:number;
}
export interface ForecastDifference {
  commonPeriods:number;
  changedPeriods:number;
  newPeriods:number;
  pastOrRemovedPeriods:number;
  increases:number;
  decreases:number;
  changes:ForecastDelta[];
}
/** This is a comparison of browser-saved NOAA forecasts, NOT observed forecast skill. */
export function compareForecastSnapshots(saved:ForecastSnapshot,current:ForecastSnapshot):ForecastDifference{
  const before=new Map(saved.predicted.map(s=>[s.t,s.kp]));
  const after=new Map(current.predicted.map(s=>[s.t,s.kp]));
  const changes:ForecastDelta[]=[];
  let commonPeriods=0;
  for(const [t,kp] of after){
    const old=before.get(t);
    if(old===undefined)continue;
    commonPeriods++;
    const delta=Math.round((kp-old)*100)/100;
    if(Math.abs(delta)>=0.01)changes.push({t,before:old,after:kp,delta});
  }
  changes.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.t-b.t);
  return {
    commonPeriods,changedPeriods:changes.length,
    newPeriods:[...after.keys()].filter(t=>!before.has(t)).length,
    pastOrRemovedPeriods:[...before.keys()].filter(t=>!after.has(t)).length,
    increases:changes.filter(x=>x.delta>0).length,decreases:changes.filter(x=>x.delta<0).length,
    changes,
  };
}
export function forecastViewUrl(href:string,horizon:ForecastHorizon,stormAt:number|null):string{
  const u=new URL(href);
  u.searchParams.set("forecast",horizon);
  if(horizon==="72h" && stormAt!==null && parseStormTarget(String(stormAt))!==null)
    u.searchParams.set("storm",String(stormAt));
  else u.searchParams.delete("storm");
  return u.toString();
}
