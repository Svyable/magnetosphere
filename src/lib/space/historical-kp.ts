/** GFZ Potsdam definitive planetary Kp history. Historical observations, never a forecast. */
export type HistoricalKp={t:number;kp:number;status:string};
export function historicalKpUrl(start:string,end:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)throw new Error("Invalid historical Kp dates");
 const params=new URLSearchParams({start:start+"T00:00:00Z",end:end+"T23:59:59Z",index:"Kp",status:"def"});
 return "https://kp.gfz.de/app/json/?"+params.toString();
}
export function parseHistoricalKp(input:unknown):HistoricalKp[]{
 if(!input||typeof input!=="object")throw new Error("Invalid GFZ response");
 const o=input as Record<string,unknown>;
 if(!Array.isArray(o["datetime"])||!Array.isArray(o["Kp"])||o["datetime"].length!==o["Kp"].length||o["datetime"].length>1000)throw new Error("Invalid GFZ Kp arrays");
 const statuses=Array.isArray(o["status"])?o["status"]:[];
 const out:HistoricalKp[]=[];
 for(let i=0;i<o["datetime"].length;i++){
  const t=Date.parse(String(o["datetime"][i])),v=o["Kp"][i];
  if(!Number.isFinite(t)||typeof v!=="number"||!Number.isFinite(v)||v<0||v>9)continue;
  out.push({t,kp:v,status:String(statuses[i]??"unknown")});
 }
 return out.sort((a,b)=>a.t-b.t).filter((v,i,a)=>i===0||v.t!==a[i-1]!.t);
}
export const HISTORICAL_WINDOWS:Record<string,[string,string]>={
 "quebec-1989":["1989-03-10","1989-03-15"],
 "bastille-2000":["2000-07-13","2000-07-18"],
 "halloween-2003":["2003-10-27","2003-11-06"],
 "st-patricks-2015":["2015-03-14","2015-03-20"],
 "feb-2022":["2022-02-02","2022-02-07"],
 "may-2024":["2024-05-08","2024-05-14"]
};
