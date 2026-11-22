import {describe,it,expect} from "vitest";
import {HISTORICAL_WINDOWS} from "./historical-kp";
import {OMNI_INTERVAL_MS,omniCoverage,omniDataset,omniReadingNear,omniUrl,parseOmniHapi} from "./historical-omni";
const from=Date.parse("2024-05-10T00:00:00Z"),until=Date.parse("2024-05-11T00:00:00Z");
const response=(data:unknown[])=>({
 HAPI:"2.0",
 status:{code:1200,message:"OK"},
 // Intentional different order from the selected variable request: parse by named columns.
 parameters:[
  {name:"Time",type:"isotime"},
  {name:"flow_speed",type:"double",fill:"99999.9"},
  {name:"BZ_GSM",type:"double",fill:"9999.99"},
 ],
 data,
});
describe("NASA CDAWeb/HAPI OMNI historical solar wind",()=>{
 it("selects old HRO for 1989 and definitive Wind/SWE HRO2 for later events",()=>{
  expect(omniDataset("quebec-1989")).toBe("OMNI_HRO_5MIN");
  expect(omniDataset("may-2024")).toBe("OMNI_HRO2_5MIN");
  for(const id of Object.keys(HISTORICAL_WINDOWS)){
   const url=new URL(omniUrl(id));
   expect(url.origin).toBe("https://cdaweb.gsfc.nasa.gov");
   expect(url.pathname).toBe("/hapi/data");
   expect(url.searchParams.get("parameters")).toBe("BZ_GSM,flow_speed");
   expect(url.searchParams.get("format")).toBe("json");
   const start=Date.parse(url.searchParams.get("time.min")!),end=Date.parse(url.searchParams.get("time.max")!);
   expect(end-start).toBeLessThanOrEqual(14*86400000);
  }
  expect(()=>omniUrl("not-an-event")).toThrow();
 });
 it("maps HAPI values by parameter metadata and drops fill sentinels",()=>{
  const pts=parseOmniHapi(response([
   ["2024-05-10T00:05:00.000Z",650,-17.5],
   ["2024-05-10T00:00:00.000Z",99999.9,9999.99],
   ["2024-05-10T00:10:00.000Z",99999.9,-21],
   ["2024-05-10T00:15:00.000Z",800,9999.99],
   ["2024-05-10T00:15:00.000Z",790,9999.99], // duplicate
   ["2024-05-11T00:00:00.000Z",700,-10], // end-exclusive
   ["2024-05-10T00:01:00.000Z",700,-11], // not a 5-minute bin
  ]),from,until);
  expect(pts).toHaveLength(3);
  expect(pts[0]).toEqual({t:from+OMNI_INTERVAL_MS,bz:-17.5,speed:650});
  expect(pts[1]).toEqual({t:from+2*OMNI_INTERVAL_MS,bz:-21,speed:null});
  expect(pts[2]).toEqual({t:from+3*OMNI_INTERVAL_MS,bz:null,speed:800});
  expect(omniCoverage(pts,from,until)).toEqual({expected:288,bz:2,speed:2});
  expect(omniReadingNear(pts,from+2*OMNI_INTERVAL_MS)?.bz).toBe(-21);
  expect(omniReadingNear(pts,from+OMNI_INTERVAL_MS*4)).toBeNull();
 });
 it("rejects schema ambiguity, out-of-range inputs and unexpectedly large results",()=>{
  expect(()=>parseOmniHapi({data:[["2024-05-10T00:00:00Z",400,-10]]},from,until)).toThrow();
  expect(()=>parseOmniHapi({...response([]),parameters:[{name:"Time"},{name:"flow_speed"}]},from,until)).toThrow();
  expect(()=>parseOmniHapi(response(new Array(5001).fill([])),from,until)).toThrow();
  expect(()=>parseOmniHapi(response([]),from,from)).toThrow();
 });
});
