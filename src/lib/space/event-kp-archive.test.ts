import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {HISTORICAL_WINDOWS,historicalKpSlots,historicalKpUrl} from "./historical-kp";
import {archiveKpAssetUrl,parseArchivedKp} from "./event-kp-archive";
const mayStart=Date.parse("2024-05-08T00:00:00Z");
function validMayFixture(){
 return {
  schemaVersion:1,eventId:"may-2024",
  source:"GFZ Helmholtz Centre for Geosciences · definitive planetary Kp",
  sourceUrl:historicalKpUrl("2024-05-08","2024-05-14"),
  license:"CC BY 4.0",
  accessedAtUtc:"2026-11-22T13:59:54.414Z",
  startDate:"2024-05-08",endDate:"2024-05-14",
  timeBasis:"UTC start of three-hour Kp interval",
  expectedBins:56,
  readings:Array.from({length:56},(_,i)=>({utc:new Date(mayStart+i*3*3600_000).toISOString().replace(".000Z","Z"),kp:i%9})),
 };
}
describe("verified static GFZ Kp event receipts",()=>{
 it("validates the six real committed historical archives, not invented test values",()=>{
  let total=0;
  for(const [id,[start,end]] of Object.entries(HISTORICAL_WINDOWS)){
   const saved=JSON.parse(readFileSync(resolve(process.cwd(),"public/data/event-kp",id+".json"),"utf8"));
   const archive=parseArchivedKp(saved,id);
   const expected=historicalKpSlots(start,end,[]).length;
   expect(archive.rows).toHaveLength(expected);
   expect(archive.sourceUrl).toBe(historicalKpUrl(start,end));
   expect(Date.parse(archive.accessedAtUtc)).toBeGreaterThan(Date.parse(end+"T00:00:00Z"));
   total+=archive.rows.length;
  }
  expect(total).toBe(376);
 });
 it("uses a same-origin path and rejects IDs not in the library",()=>{
  expect(archiveKpAssetUrl("may-2024","/magnetosphere/")).toBe("/magnetosphere/data/event-kp/may-2024.json");
  expect(()=>archiveKpAssetUrl("../../secret")).toThrow();
 });
 it("rejects substituted provenance, missing bins, duplication and implausible measurements",()=>{
  const original=validMayFixture();
  expect(parseArchivedKp(original,"may-2024").rows).toHaveLength(56);
  expect(()=>parseArchivedKp({...original,sourceUrl:"https://example.com/forged"},"may-2024")).toThrow();
  expect(()=>parseArchivedKp({...original,readings:original.readings.slice(0,3)},"may-2024")).toThrow();
  expect(()=>parseArchivedKp({...original,readings:[...original.readings.slice(0,55),original.readings[0]]},"may-2024")).toThrow();
  expect(()=>parseArchivedKp({...original,readings:original.readings.map((r,i)=>i===3?{...r,kp:9999.99}:r)},"may-2024")).toThrow();
  expect(()=>parseArchivedKp(original,"quebec-1989")).toThrow();
 });
});
