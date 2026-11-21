/**
 * Mission Lab: observational diagnostics and clearly hypothetical Shue sensitivity.
 * All scientific calculations are pure and source-qualified.
 */
import {dynamicPressure,shue,sunGeometry,type L1Sample} from "./model";
import type {Target} from "./explorer";
import type {KpForecastSlot} from "./forecast";

export type ScenarioInput={pressure:number;bz:number};
export type LocalAurora={
  value:number|null;distanceKm:number|null;peakNearby:number|null;peakDistanceKm:number|null;
  sunElevationDeg:number; darkness:"daylight"|"twilight"|"dark";
};
export function angularDistanceKm(a:Target,b:Target):number {
  const r=Math.PI/180;
  const dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;
  return 6371.2*2*Math.asin(Math.min(1,Math.sqrt(Math.max(0,h))));
}
export function solarElevation(t:number,target:Target):number {
  const sun=sunGeometry(t),r=Math.PI/180;
  const cosZ=Math.sin(target.lat*r)*Math.sin(sun.declDeg*r)+
    Math.cos(target.lat*r)*Math.cos(sun.declDeg*r)*Math.cos((target.lon-sun.subsolarLonDeg)*r);
  return Math.asin(Math.max(-1,Math.min(1,cosZ)))/r;
}
/** NOAA OVATION points are sampled spatial map values, NOT actual sky visibility.
 * Keep absent/below-display-threshold distinct from zero model value.
 */
export function localAurora(points:[number,number,number][],target:Target,now:number):LocalAurora {
  let nearestDist=Infinity,nearest:number|null=null,peak:number|null=null,peakDist:number|null=null;
  for(const [lon,lat,val] of points){
    if(!Number.isFinite(lon)||!Number.isFinite(lat)||!Number.isFinite(val)||val<0||val>100)continue;
    const d=angularDistanceKm(target,{lat,lon});
    if(d<nearestDist){nearestDist=d;nearest=val;}
    if(d<=1000 && (peak===null || val>peak)){peak=val;peakDist=d;}
  }
  const sunElevationDeg=solarElevation(now,target);
  return {
    value:nearestDist<=160?nearest:null,
    distanceKm:nearestDist<=160?nearestDist:null,
    peakNearby:peak,peakDistanceKm:peakDist,
    sunElevationDeg,
    darkness:sunElevationDeg>0?"daylight":sunElevationDeg>-12?"twilight":"dark",
  };
}
export function hypotheticalBoundary(input:ScenarioInput,baseline:{pressure:number;bz:number}|null) {
  if(!Number.isFinite(input.pressure)||input.pressure<0.2||input.pressure>30||!Number.isFinite(input.bz)||input.bz < -25||input.bz>25)
    return null;
  const projected=shue(input.pressure,input.bz);
  const actual=baseline && Number.isFinite(baseline.pressure)&&baseline.pressure>0&&Number.isFinite(baseline.bz)
    ? shue(baseline.pressure,baseline.bz):null;
  return {...projected,baselineNose:actual?.r0??null,deltaNose:actual?projected.r0-actual.r0:null};
}
export type EventKind="pressure-jump"|"southward-bz";
export interface DetectedEvent{kind:EventKind;at:number;metric:number;baseline:number|null;count:number}
/**
 * Transparent exploration heuristic, NOT shock detection certified by NOAA.
 * Require enough paired one-minute coverage; detect pressure jump against prior 10m,
 * and 8/10-minute sustained southward GSM Bz <= -5 nT.
 */
export function detectL1Patterns(samples:L1Sample[],now:number):DetectedEvent[]{
  const ordered=samples.filter(s=>s.t<=now+60_000&&s.t>=now-4*3_600_000&&
    Number.isFinite(s.t)&&Number.isFinite(s.v)&&Number.isFinite(s.n)&&s.v>150&&s.n>0)
    .sort((a,b)=>a.t-b.t);
  const events:DetectedEvent[]=[];
  if(ordered.length<16)return events;
  for(let j=0;j<ordered.length;j+=5){
    const t=ordered[j]!.t;
    const recent=ordered.filter(s=>s.t>t-10*60_000&&s.t<=t);
    const previous=ordered.filter(s=>s.t>t-20*60_000&&s.t<=t-10*60_000);
    if(recent.length<8||previous.length<8||new Set(recent.map(s=>Math.round(s.t/60_000))).size<8)continue;
    const avg=(arr:L1Sample[])=>arr.reduce((sum,s)=>sum+dynamicPressure(s.n,s.v),0)/arr.length;
    const p=avg(recent),prev=avg(previous);
    if(prev>0&&p>=prev*1.6&&p-prev>=1.2){
      events.push({kind:"pressure-jump",at:t,metric:p,baseline:prev,count:recent.length});
    }
    const magnetic=recent.filter(s=>s.bz!==null&&Number.isFinite(s.bz));
    const south=magnetic.filter(s=>s.bz!<=-5);
    if(magnetic.length>=8&&south.length>=8){
      events.push({kind:"southward-bz",at:t,metric:south.reduce((a,s)=>a+s.bz!,0)/south.length,baseline:null,count:south.length});
    }
  }
  // Reduce repeated detections to one event per type within 20min.
  const distinct:DetectedEvent[]=[];
  for(const e of events.reverse()){
    if(distinct.some(x=>x.kind===e.kind&&Math.abs(x.at-e.at)<20*60_000))continue;
    distinct.push(e);
  }
  return distinct.sort((a,b)=>b.at-a.at).slice(0,8);
}

export interface BriefInput{
  generatedAt:number; wind:L1Sample|null; kp:{t:number;kp:number}|null;
  forecast:KpForecastSlot[]; forecastFetchedAt:number; ovationTarget:number|null;
}
export function missionBrief(x:BriefInput):string{
  const iso=(t:number)=>new Date(t).toISOString();
  const validL1=x.wind && x.wind.t<=x.generatedAt+60_000&&x.generatedAt-x.wind.t<=12*60_000?x.wind:null;
  const forecastCurrent=x.forecastFetchedAt>0 && x.forecastFetchedAt<=x.generatedAt+60_000 &&
    x.generatedAt-x.forecastFetchedAt<=30*60_000;
  const future=forecastCurrent?x.forecast.filter(s=>s.status==="predicted"&&s.t>x.generatedAt&&s.t<x.generatedAt+72*3_600_000):[];
  const peak=future.reduce<KpForecastSlot|null>((best,s)=>!best||s.kp>best.kp?s:best,null);
  return [
    "# MAGNETOSPHERE / EARTH NOW — mission brief",
    "Generated (browser UTC): "+iso(x.generatedAt),
    "",
    "## Upstream NOAA L1 spacecraft measurements",
    validL1
      ? "Measured: "+iso(validL1.t)+"; speed "+validL1.v.toFixed(1)+" km/s; density "+validL1.n.toFixed(2)+" cm^-3; GSM Bz "+
        (validL1.bz===null?"missing":validL1.bz.toFixed(2)+" nT")+
        "; derived dynamic pressure "+dynamicPressure(validL1.n,validL1.v).toFixed(2)+" nPa."
      : "No sufficiently recent L1 measurement available. Not an all-clear.",
    "",
    "## NOAA planetary Kp (ground-derived, 3-hour index)",
    x.kp&&x.kp.t<=x.generatedAt+60_000&&x.generatedAt-x.kp.t<6*3_600_000
      ? "Latest NOAA Kp "+x.kp.kp.toFixed(2)+" at "+iso(x.kp.t)+"."
      : "Recent NOAA Kp unavailable.",
    "",
    "## Official NOAA forecast (predicted Kp slots only)",
    peak?"Highest predicted Kp "+peak.kp.toFixed(2)+" for UTC slot starting "+iso(peak.t)+".":"No current valid future Kp prediction.",
    "Forecast fetched (browser UTC): "+(forecastCurrent?iso(x.forecastFetchedAt):"unavailable or stale")+"; the NOAA Kp JSON does not provide an independent issue timestamp.",
    "Aurora OVATION model forecast target: "+(x.ovationTarget?iso(x.ovationTarget):"unavailable")+".",
    "",
    "## Science limits",
    "Upstream measurements are not yet an observed impact at Earth. L1-to-Earth propagation is approximate. Shue magnetopause estimates are empirical. Kp is a time-averaged planetary activity index. OVATION is a short-horizon model, not a night-sky image. No independent confidence or warning is inferred.",
    "",
    "Sources:",
    "- https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json",
    "- https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json",
    "- https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
    "- https://www.swpc.noaa.gov/products/aurora-30-minute-forecast",
    "",
    "Automatically generated from source data available in this browser, without independent verification of NOAA's measurements.",
  ].join("\n");
}
