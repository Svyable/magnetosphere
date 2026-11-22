/** NASA SPDF CDAWeb/HAPI high-resolution OMNI, propagated to the bow-shock nose.
 * Observed near-Earth measurements; NOT flare emission times, raw L1 clocks, or forecasts.
 * Dataset 2 uses definitive Wind/SWE plasma; 1989 uses original OMNI HRO.
 */
import {HISTORICAL_WINDOWS} from "./historical-kp";
export type OmniPoint={t:number;bz:number|null;speed:number|null};
export const OMNI_INTERVAL_MS=5*60_000;
const DAY=24*60*60_000;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
export function omniDataset(eventId:string){
 return eventId==="quebec-1989"?"OMNI_HRO_5MIN":"OMNI_HRO2_5MIN";
}
export function omniUrl(eventId:string):string{
 const dates=HISTORICAL_WINDOWS[eventId];
 if(!dates)throw new Error("Unknown historical event");
 const [start,end]=dates;
 if(!DATE.test(start)||!DATE.test(end))throw new Error("Invalid OMNI dates");
 const begin=Date.parse(start+"T00:00:00Z"),exclusiveEnd=Date.parse(end+"T00:00:00Z")+DAY;
 if(!Number.isFinite(begin)||!Number.isFinite(exclusiveEnd)||exclusiveEnd<=begin||exclusiveEnd-begin>14*DAY)throw new Error("OMNI window too large");
 const params=new URLSearchParams({
  id:omniDataset(eventId),
  parameters:"BZ_GSM,flow_speed",
  "time.min":new Date(begin).toISOString().replace(".000Z","Z"),
  "time.max":new Date(exclusiveEnd).toISOString().replace(".000Z","Z"),
  format:"json",
 });
 return "https://cdaweb.gsfc.nasa.gov/hapi/data?"+params;
}
type OmniParameter={name:string;fill?:string|number|null};
const isObject=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
function value(x:unknown,fill:unknown,low:number,high:number):number|null{
 if(typeof x!=="number"||!Number.isFinite(x)||x<low||x>high||x===fill)return null;
 return x;
}
/** Parses HAPI JSON by parameter name, rejecting reordered, missing, and malformed records.
 * Per-parameter fill sentinels are authoritative; physical safety ranges guard unexpected fills.
 */
export function parseOmniHapi(input:unknown,start:number,endExclusive:number):OmniPoint[]{
 if(!isObject(input)||!Array.isArray(input["data"])||!Array.isArray(input["parameters"]))throw new Error("Malformed NASA HAPI response");
 if(!Number.isFinite(start)||!Number.isFinite(endExclusive)||endExclusive<=start||endExclusive-start>14*DAY)throw new Error("Invalid OMNI range");
 const header=input["parameters"] as unknown[];
 if(header.some(p=>!isObject(p)||typeof p["name"]!=="string"))throw new Error("Malformed NASA HAPI parameters");
 const params=header as OmniParameter[];
 const names=params.map(p=>p.name);
 const ti=names.indexOf("Time"),bi=names.indexOf("BZ_GSM"),si=names.indexOf("flow_speed");
 if(ti<0||bi<0||si<0||new Set(names).size!==names.length)throw new Error("NASA HAPI variables missing");
 const rows=input["data"] as unknown[];
 if(rows.length>5000)throw new Error("NASA HAPI response too large");
 const out:OmniPoint[]=[];
 for(const row of rows){
  if(!Array.isArray(row)||row.length!==params.length||typeof row[ti]!=="string")continue;
  const t=Date.parse(row[ti]);
  if(!Number.isFinite(t)||t<start||t>=endExclusive||t%OMNI_INTERVAL_MS!==0)continue;
  const bz=value(row[bi],params[bi]!.fill,-300,300);
  const speed=value(row[si],params[si]!.fill,100,3000);
  // An unfilled time bin is not evidence; retain a record if at least one driver is valid.
  if(bz===null&&speed===null)continue;
  out.push({t,bz,speed});
 }
 out.sort((a,b)=>a.t-b.t);
 return out.filter((p,i)=>i===0||p.t!==out[i-1]!.t);
}
export function omniCoverage(points:OmniPoint[],start:number,endExclusive:number){
 const expected=Math.floor((endExclusive-start)/OMNI_INTERVAL_MS);
 return {expected,bz:points.filter(p=>p.bz!==null).length,speed:points.filter(p=>p.speed!==null).length};
}
/** A marker on this date is only a calendar-day milestone, not a measured shock arrival. */
export function omniReadingNear(points:OmniPoint[],at:number){
 const rounded=Math.floor(at/OMNI_INTERVAL_MS)*OMNI_INTERVAL_MS;
 return points.find(p=>p.t===rounded)??null;
}
