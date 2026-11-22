/** Fetch and freeze quasi-definitive May 2024 H readings from the USGS observatory service.
 * No synthetic fallback. Preserve raw 1-minute coverage and actual five-minute samples.
 * Command: bun scripts/snapshot-may-2024-ground.mjs
 */
import {mkdir,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {MAY_GROUND_STATIONS,MAY_GROUND_EXPECTED,MAY_GROUND_START,MAY_GROUND_END,usgsHistoricalUrl,parseUsGsHistoricalH,groundReference} from "../src/lib/space/may-2024-ground.ts";
const root=join(process.cwd(),"public","data","may-2024-ground");
await mkdir(root,{recursive:true});
const accessedAtUtc=new Date().toISOString();
for(const s of MAY_GROUND_STATIONS){
 const url=usgsHistoricalUrl(s.code);
 let body=null,lastError=null;
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(45_000),headers:{accept:"application/json"}});
   if(!response.ok)throw new Error("USGS HTTP "+response.status);
   body=await response.json();
   break;
  }catch(e){lastError=e;if(!attempt)await new Promise(resolve=>setTimeout(resolve,1800));}
 }
 if(!body)throw new Error(s.code+": unable to retrieve quasi-definitive H ("+String(lastError)+")");
 const data=parseUsGsHistoricalH(body);
 const meta=body.metadata?.intermagnet;
 if(meta?.data_type!=="quasi-definitive"||meta?.imo?.iaga_code!==s.code)throw new Error(s.code+": unexpected USGS source type or station");

 const coverage=data.samples.length/MAY_GROUND_EXPECTED;
 if(coverage<.75||data.rawCount/data.expectedRaw<.75)throw new Error(s.code+": inadequate USGS quasi-definitive coverage "+data.samples.length+"/"+MAY_GROUND_EXPECTED);
 if(groundReference(data.samples)===null)throw new Error(s.code+": first six-hour reference unavailable");
 const archive={
  schemaVersion:1,eventId:"may-2024",station:s.code,source:"U.S. Geological Survey Geomagnetism Program",
  sourceUrl:url,documentation:"https://www.usgs.gov/tools/web-service-geomagnetism-data",
  accessedAtUtc,start:MAY_GROUND_START,endExclusive:MAY_GROUND_END,
  element:"H",unit:"nT",processingLevel:"quasi-definitive",
  originalCadenceSeconds:60,retainedCadenceSeconds:300,
  timeBasis:"UTC sample timestamps",expectedSamples:MAY_GROUND_EXPECTED,
  rawCount:data.rawCount,rawExpected:data.expectedRaw,
  samples:data.samples.map(p=>({utc:new Date(p.t).toISOString().replace(".000Z","Z"),h:p.h})),
 };
 const raw=JSON.stringify(archive);
 await writeFile(join(root,s.code+".json"),raw+"\n","utf8");
 console.log("USGS_GROUND_ARCHIVE_BASE64:"+s.code+":"+Buffer.from(raw).toString("base64"));
 console.log("USGS_GROUND_OK "+s.code+" "+data.samples.length+"/"+MAY_GROUND_EXPECTED+" 5min, "+data.rawCount+"/"+data.expectedRaw+" 1min");
}
