/** May 2024 quasi-definitive USGS observatory H field receipts (not Kp or Dst).
 * Observatory H is absolute horizontal intensity in nT; delta H uses a local reference,
 * so different station baselines and extrema MUST NOT be interpreted as planetary indices.
 */
export const MAY_GROUND_START="2024-05-10T00:00:00Z";
export const MAY_GROUND_END="2024-05-13T00:00:00Z"; // exclusive
export const MAY_GROUND_STATIONS=[
 {code:"BOU",name:"Boulder",region:"Colorado",context:"Midlatitude US interior"},
 {code:"FRD",name:"Fredericksburg",region:"Virginia",context:"Midlatitude US east"},
 {code:"SIT",name:"Sitka",region:"Alaska",context:"Higher-latitude Alaska"},
] as const;
export type MayStation=typeof MAY_GROUND_STATIONS[number]["code"];
export type MayGroundSample={t:number;h:number};
export type MayGroundArchive={station:MayStation;sourceUrl:string;accessedAtUtc:string;rawCount:number;expectedRaw:number;samples:MayGroundSample[]};
const MINUTE=60_000,FIVE_MINUTES=5*MINUTE;
const start=Date.parse(MAY_GROUND_START),end=Date.parse(MAY_GROUND_END);
export const MAY_GROUND_EXPECTED=(end-start)/FIVE_MINUTES;
export function usgsHistoricalUrl(station:MayStation){
 if(!MAY_GROUND_STATIONS.some(s=>s.code===station))throw new Error("Unsupported historical observatory");
 const query=new URLSearchParams({id:station,elements:"H",sampling_period:"60",type:"quasi-definitive",format:"json",starttime:MAY_GROUND_START,endtime:MAY_GROUND_END});
 return "https://geomag.usgs.gov/ws/data/?"+query;
}
export function groundArchiveUrl(station:MayStation,basePath="/"){
 usgsHistoricalUrl(station);
 return (basePath.endsWith("/")?basePath:basePath+"/")+"data/may-2024-ground/"+station+".json";
}
function object(v:unknown):v is Record<string,unknown>{return v!==null&&typeof v==="object"&&!Array.isArray(v);}
function timestamp(value:unknown){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value))return null;
 const t=Date.parse(value);
 return Number.isFinite(t)?t:null;
}
function validH(v:unknown){return typeof v==="number"&&Number.isFinite(v)&&v>0&&v<80_000;}
/** One-minute USGS JSON input. Sparse readings remain gaps, never filled or interpolated.
 * Only exact :00/:05/:10 five-minute observations are retained for compact display.
 */
export function parseUsGsHistoricalH(input:unknown):{rawCount:number;expectedRaw:number;samples:MayGroundSample[]}{
 if(!object(input)||!Array.isArray(input["times"])||!Array.isArray(input["values"]))throw new Error("Invalid USGS JSON");
 const times=input["times"] as unknown[],channels=input["values"] as unknown[];
 const expectedRaw=(end-start)/MINUTE;
 if(times.length>expectedRaw+2)throw new Error("Excess USGS samples");
 const md=input["metadata"];
 if(object(md)&&md["status"]!==undefined&&String(md["status"])!=="200")throw new Error("USGS source status not OK");
 const h=channels.find(c=>object(c)&&object(c["metadata"])&&c["metadata"]["element"]==="H");
 if(!object(h)||!Array.isArray(h["values"])||h["values"].length!==times.length)throw new Error("USGS H channel absent or mismatched");
 const validRaw=new Set<number>(),points:MayGroundSample[]=[];
 for(let i=0;i<times.length;i++){
  const t=timestamp(times[i]),v=h["values"][i];
  if(t===null||t<start||t>=end||t%MINUTE!==0||!validH(v)||validRaw.has(t))continue;
  validRaw.add(t);
  if(t%FIVE_MINUTES===0)points.push({t,h:v as number});
 }
 points.sort((a,b)=>a.t-b.t);
 return {rawCount:validRaw.size,expectedRaw,samples:points};
}
export function parseGroundArchive(input:unknown,station:MayStation):MayGroundArchive{
 if(!object(input)||input["schemaVersion"]!==1||input["eventId"]!=="may-2024"||
    input["station"]!==station||input["sourceUrl"]!==usgsHistoricalUrl(station)||
    input["element"]!=="H"||input["processingLevel"]!=="quasi-definitive"||
    input["originalCadenceSeconds"]!==60||input["retainedCadenceSeconds"]!==300||
    input["timeBasis"]!=="UTC sample timestamps"||input["start"]!==MAY_GROUND_START||
    input["endExclusive"]!==MAY_GROUND_END||input["expectedSamples"]!==MAY_GROUND_EXPECTED||
    !Array.isArray(input["samples"])||input["samples"].length>MAY_GROUND_EXPECTED||
    typeof input["accessedAtUtc"]!=="string"||timestamp(input["accessedAtUtc"])===null||
    typeof input["rawCount"]!=="number"||input["rawCount"]>=(end-start)/MINUTE+2||input["rawCount"]<0
 )throw new Error("Invalid USGS archive provenance");
 const samples:MayGroundSample[]=[];
 const seen=new Set<number>();
 for(const row of input["samples"] as unknown[]){
  if(!object(row)||typeof row["utc"]!=="string"||!validH(row["h"]))throw new Error("Invalid USGS archive sample");
  const t=timestamp(row["utc"]);
  if(t===null||t<start||t>=end||t%FIVE_MINUTES!==0||seen.has(t))throw new Error("Invalid USGS sample time");
  seen.add(t);samples.push({t,h:row["h"] as number});
 }
 if(samples.length>input["rawCount"]||samples.length<Math.ceil(MAY_GROUND_EXPECTED*.75))throw new Error("Insufficient historical USGS coverage");
 samples.sort((a,b)=>a.t-b.t);
 return {station,sourceUrl:usgsHistoricalUrl(station),accessedAtUtc:input["accessedAtUtc"],rawCount:input["rawCount"],expectedRaw:(end-start)/MINUTE,samples};
}
export function groundReference(samples:MayGroundSample[]){
 // Baseline: median observed H in first 6 hours of the 72h archive, not a quiet-day reference.
 const values=samples.filter(x=>x.t>=start&&x.t<start+6*3_600_000).map(x=>x.h).sort((a,b)=>a-b);
 if(values.length<48)return null; // >= 2/3 coverage of 72 five-minute slots
 const n=values.length;return n%2?values[(n-1)/2]!:(values[n/2-1]!+values[n/2]!)/2;
}
export function groundAtCursor(samples:MayGroundSample[],cursor:number){
 const t=Math.floor(cursor/FIVE_MINUTES)*FIVE_MINUTES;
 return samples.find(s=>s.t===t)??null;
}
