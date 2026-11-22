import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {MAY_GROUND_STATIONS,MAY_GROUND_EXPECTED,MAY_GROUND_START,MAY_GROUND_END,usgsHistoricalUrl,parseUsGsHistoricalH,parseGroundArchive,groundArchiveUrl,groundReference,groundAtCursor} from "./may-2024-ground";
const start=Date.parse(MAY_GROUND_START);
function sample(){return {schemaVersion:1,eventId:"may-2024",station:"BOU",sourceUrl:usgsHistoricalUrl("BOU"),source:"U.S. Geological Survey Geomagnetism Program",accessedAtUtc:"2026-11-22T21:35:03Z",start:MAY_GROUND_START,endExclusive:MAY_GROUND_END,element:"H",unit:"nT",processingLevel:"quasi-definitive",originalCadenceSeconds:60,retainedCadenceSeconds:300,timeBasis:"UTC sample timestamps",expectedSamples:MAY_GROUND_EXPECTED,rawCount:4320,samples:Array.from({length:MAY_GROUND_EXPECTED},(_,i)=>({utc:new Date(start+i*300000).toISOString().replace(".000Z","Z"),h:21000+i/10}))};}
describe("source-verified May 2024 USGS station H histories",()=>{
 it("validates actual committed receipts and preserves source coverage",()=>{
  const counts:Record<string,number>={BOU:864,FRD:844,SIT:864};
  const raw:Record<string,number>={BOU:4320,FRD:4219,SIT:4317};
  expect(MAY_GROUND_STATIONS).toHaveLength(3);
  for(const station of MAY_GROUND_STATIONS){
   const data=JSON.parse(readFileSync(resolve(process.cwd(),"public/data/may-2024-ground",station.code+".json"),"utf8"));
   const archive=parseGroundArchive(data,station.code);
   expect(archive.samples).toHaveLength(counts[station.code]);
   expect(archive.rawCount).toBe(raw[station.code]);
   expect(archive.samples[0]?.t).toBe(start);
   expect(archive.samples.at(-1)?.t).toBeLessThan(Date.parse(MAY_GROUND_END));
   expect(groundReference(archive.samples)).not.toBeNull();
  }
 });
 it("does not invent field samples in documented Fredericksburg gaps",()=>{
  const data=JSON.parse(readFileSync(resolve(process.cwd(),"public/data/may-2024-ground/FRD.json"),"utf8"));
  const archive=parseGroundArchive(data,"FRD");
  expect(archive.samples).toHaveLength(844);
  expect(archive.samples.length).toBeLessThan(MAY_GROUND_EXPECTED);
 });
 it("uses a same-origin archive and a specific USGS processing level",()=>{
  expect(groundArchiveUrl("FRD","/magnetosphere")).toBe("/magnetosphere/data/may-2024-ground/FRD.json");
  expect(new URL(usgsHistoricalUrl("BOU")).searchParams.get("type")).toBe("quasi-definitive");
  expect(()=>groundArchiveUrl("../secret" as never)).toThrow();
 });
 it("rejects switched stations, processing levels, duplicate timestamps and impossible magnitudes",()=>{
  const fixture=sample();
  expect(parseGroundArchive(fixture,"BOU").samples).toHaveLength(864);
  expect(()=>parseGroundArchive({...fixture,station:"SIT"},"BOU")).toThrow();
  expect(()=>parseGroundArchive({...fixture,processingLevel:"definitive"},"BOU")).toThrow();
  expect(()=>parseGroundArchive({...fixture,samples:[...fixture.samples.slice(0,-1),fixture.samples[0]]},"BOU")).toThrow();
  expect(()=>parseGroundArchive({...fixture,samples:fixture.samples.map((s,i)=>i===2?{...s,h:99999.9}:s)},"BOU")).toThrow();
 });
 it("parses one-minute H timestamps and never fills missing source values",()=>{
  const body={metadata:{status:200},times:[
    "2024-05-10T00:00:00.000Z","2024-05-10T00:01:00.000Z",
    "2024-05-10T00:05:00.000Z","2024-05-10T00:10:00.000Z"
  ],values:[{metadata:{element:"H"},values:[20100,null,20110,99999]}]};
  const actual=parseUsGsHistoricalH(body);
  expect(actual.rawCount).toBe(2);
  expect(actual.samples.map(s=>s.h)).toEqual([20100,20110]);
  expect(groundAtCursor(actual.samples,start+300000)?.h).toBe(20110);
  expect(groundAtCursor(actual.samples,start+600000)).toBeNull();
  expect(()=>parseUsGsHistoricalH({...body,values:[]})).toThrow();
 });
});
