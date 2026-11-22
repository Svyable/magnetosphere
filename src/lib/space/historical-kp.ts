/** GFZ Potsdam definitive planetary Kp history. Historical observations, never a forecast. */
export type HistoricalKp={t:number;kp:number;status:"def"};
export type HistoricalSlot={t:number;reading:HistoricalKp|null};
export const HISTORICAL_WINDOWS:Record<string,readonly [string,string]>={
 "quebec-1989":["1989-03-06","1989-03-15"],
 "bastille-2000":["2000-07-13","2000-07-18"],
 "halloween-2003":["2003-10-27","2003-11-06"],
 "st-patricks-2015":["2015-03-14","2015-03-20"],
 "feb-2022":["2022-02-02","2022-02-07"],
 "may-2024":["2024-05-08","2024-05-14"]
};
const THREE_HOURS=3*60*60*1000;
const DAY=24*60*60*1000;
const isoDay=/^\d{4}-\d{2}-\d{2}$/;
export function historicalKpUrl(start:string,end:string){
 if(!isoDay.test(start)||!isoDay.test(end)||!Number.isFinite(Date.parse(start+"T00:00:00Z"))||!Number.isFinite(Date.parse(end+"T00:00:00Z"))||start>end)throw new Error("Invalid historical Kp dates");
 const params=new URLSearchParams({start:start+"T00:00:00Z",end:end+"T23:59:59Z",index:"Kp",status:"def"});
 return "https://kp.gfz.de/app/json/?"+params.toString();
}
/** Explicitly preserve missing bins. GFZ stamps the START of each 3h interval. */
export function historicalKpSlots(start:string,end:string,data:HistoricalKp[]):HistoricalSlot[]{
 historicalKpUrl(start,end);
 const first=Date.parse(start+"T00:00:00Z"),last=Date.parse(end+"T00:00:00Z")+DAY-THREE_HOURS;
 if(last-first>14*DAY)throw new Error("Historical window too large");
 const byTime=new Map(data.map(row=>[row.t,row]));
 const slots:HistoricalSlot[]=[];
 for(let t=first;t<=last;t+=THREE_HOURS)slots.push({t,reading:byTime.get(t)??null});
 return slots;
}
/** Never turn preliminary, malformed, or out-of-range values into definitive readings. */
export function parseHistoricalKp(input:unknown):HistoricalKp[]{
 if(!input||typeof input!=="object")throw new Error("Invalid GFZ response");
 const o=input as Record<string,unknown>;
 if(!Array.isArray(o["datetime"])||!Array.isArray(o["Kp"])||!Array.isArray(o["status"])||
    o["datetime"].length!==o["Kp"].length||o["datetime"].length!==o["status"].length||
    o["datetime"].length>1000)throw new Error("Invalid GFZ Kp arrays");
 const out:HistoricalKp[]=[];
 for(let i=0;i<o["datetime"].length;i++){
  const iso=o["datetime"][i],v=o["Kp"][i],status=o["status"][i];
  if(typeof iso!=="string"||! /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/.test(iso)||status!=="def")continue;
  const t=Date.parse(iso);
  if(!Number.isFinite(t)||t%THREE_HOURS!==0||typeof v!=="number"||!Number.isFinite(v)||v<0||v>9)continue;
  out.push({t,kp:v,status:"def"});
 }
 return out.sort((a,b)=>a.t-b.t).filter((v,i,a)=>i===0||v.t!==a[i-1]!.t);
}
