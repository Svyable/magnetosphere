/** Reproducible historical Kp receipt generator.
 * Run: bun scripts/snapshot-event-kp.mjs
 * Retrieves definitive GFZ three-hour Kp only; aborts on missing provenance or low coverage.
 * The CI log marker is public archival data, designed for auditable GitHub ingestion.
 */
import {mkdir,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {HISTORICAL_WINDOWS,historicalKpUrl,historicalKpSlots,parseHistoricalKp} from "../src/lib/space/historical-kp.ts";

const root=join(process.cwd(),"public","data","event-kp");
const accessedAtUtc=new Date().toISOString();
await mkdir(root,{recursive:true});
async function load(url){
 let last;
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(18_000),headers:{"accept":"application/json"}});
   if(!response.ok)throw new Error("GFZ "+response.status);
   return await response.json();
  }catch(err){last=err;if(attempt===0)await new Promise(resolve=>setTimeout(resolve,1200));}
 }
 throw last;
}
for(const [eventId,[start,end]] of Object.entries(HISTORICAL_WINDOWS)){
 const sourceUrl=historicalKpUrl(start,end);
 const parsed=await load(sourceUrl);
 const rows=parseHistoricalKp(parsed);
 const slots=historicalKpSlots(start,end,rows);
 const measured=slots.filter(s=>s.reading!==null);
 if(measured.length<Math.ceil(slots.length*0.9))throw new Error(eventId+": insufficient definitive GFZ coverage "+measured.length+"/"+slots.length);
 const data={
  schemaVersion:1,
  eventId,
  source:"GFZ Helmholtz Centre for Geosciences · definitive planetary Kp",
  sourceUrl,
  license:"CC BY 4.0",
  attribution:"GFZ Potsdam Kp index, https://doi.org/10.5880/Kp.0001",
  accessedAtUtc,
  startDate:start,
  endDate:end,
  timeBasis:"UTC start of three-hour Kp interval",
  expectedBins:slots.length,
  readings:measured.map(s=>({utc:new Date(s.t).toISOString().replace(".000Z","Z"),kp:s.reading.kp})),
 };
 const json=JSON.stringify(data);
 await writeFile(join(root,eventId+".json"),json+"\n","utf8");
 console.log("GFZ_ARCHIVE_JSON_BASE64:"+eventId+":"+Buffer.from(json,"utf8").toString("base64"));
 console.log("GFZ_ARCHIVE_OK "+eventId+" "+measured.length+"/"+slots.length+" definitive bins");
}
