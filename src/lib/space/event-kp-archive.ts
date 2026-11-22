/** Source-verified, same-origin GFZ definitive Kp snapshots for historical events.
 * Files are produced by scripts/snapshot-event-kp.mjs from GFZ's official JSON API.
 * This bypasses GFZ's browser CORS limitation without introducing a third-party proxy.
 */
import {HISTORICAL_WINDOWS,historicalKpSlots,historicalKpUrl,parseHistoricalKp,type HistoricalKp} from "./historical-kp";
export type ArchivedKp={rows:HistoricalKp[];sourceUrl:string;accessedAtUtc:string;expectedBins:number};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
export function archiveKpAssetUrl(eventId:string,basePath="/"){
 if(!Object.prototype.hasOwnProperty.call(HISTORICAL_WINDOWS,eventId))throw new Error("Unknown archived Kp event");
 return (basePath.endsWith("/")?basePath:basePath+"/")+"data/event-kp/"+eventId+".json";
}
export function parseArchivedKp(input:unknown,eventId:string):ArchivedKp{
 const dates=HISTORICAL_WINDOWS[eventId];
 if(!dates||!object(input))throw new Error("Unknown historical Kp archive");
 const sourceUrl=historicalKpUrl(dates[0],dates[1]);
 const expected=historicalKpSlots(dates[0],dates[1],[]).length;
 if(input["schemaVersion"]!==1||input["eventId"]!==eventId||input["sourceUrl"]!==sourceUrl||
    input["license"]!=="CC BY 4.0"||input["expectedBins"]!==expected||
    typeof input["source"]!=="string"||!input["source"].includes("GFZ")||
    typeof input["accessedAtUtc"]!=="string"||!Number.isFinite(Date.parse(input["accessedAtUtc"]))||
    !Array.isArray(input["readings"])||input["readings"].length>expected||
    input["timeBasis"]!=="UTC start of three-hour Kp interval")throw new Error("Invalid GFZ provenance or archive schema");
 const inputRows=input["readings"] as unknown[];
 if(inputRows.length<Math.ceil(expected*.9))throw new Error("GFZ archive has inadequate coverage");
 const times:string[]=[],values:number[]=[];
 for(const row of inputRows){
  if(!object(row)||typeof row["utc"]!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/.test(row["utc"])||
      typeof row["kp"]!=="number")throw new Error("Malformed GFZ archive reading");
  times.push(row["utc"]);values.push(row["kp"]);
 }
 const rows=parseHistoricalKp({datetime:times,Kp:values,status:times.map(()=>"def")});
 if(rows.length!==inputRows.length)throw new Error("GFZ archive includes duplicated or invalid bins");
 const slots=historicalKpSlots(dates[0],dates[1],rows);
 if(slots.filter(s=>s.reading!==null).length!==rows.length)throw new Error("GFZ reading outside the event window");
 return {rows,sourceUrl,accessedAtUtc:input["accessedAtUtc"],expectedBins:expected};
}
