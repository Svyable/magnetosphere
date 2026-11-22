import {describe,it,expect} from "vitest";
import {HISTORICAL_WINDOWS,historicalKpSlots,historicalKpUrl,parseHistoricalKp} from "./historical-kp";
describe("GFZ historical Kp",()=>{
 it("constructs a bounded definitive archive request",()=>{
  const url=new URL(historicalKpUrl("2024-05-08","2024-05-14"));
  expect(url.host).toBe("kp.gfz.de");
  expect(url.searchParams.get("index")).toBe("Kp");
  expect(url.searchParams.get("status")).toBe("def");
  expect(()=>historicalKpUrl("2024-05-15","2024-05-08")).toThrow();
 });
 it("filters missing values and sorts historical observations",()=>{
  const rows=parseHistoricalKp({datetime:["2024-05-11T03:00:00Z","2024-05-11T00:00:00Z","2024-05-11T06:00:00Z"],Kp:[8,7,-1],status:["def","def","def"]});
  expect(rows.map(x=>x.kp)).toEqual([7,8]);
  expect(rows.every(x=>x.status==="def")).toBe(true);
 });
 it("retains explicit gaps instead of compressing the historical timeline",()=>{
  const data=parseHistoricalKp({datetime:["2024-05-10T00:00:00Z","2024-05-10T06:00:00Z"],Kp:[7,8.333],status:["def","def"]});
  const slots=historicalKpSlots("2024-05-10","2024-05-10",data);
  expect(slots).toHaveLength(8);
  expect(slots[0]!.reading?.kp).toBe(7);
  expect(slots[1]!.reading).toBeNull();
  expect(slots[2]!.reading?.kp).toBeCloseTo(8.333);
 });
 it("rejects preliminary and malformed records even if the service returns them",()=>{
  const data=parseHistoricalKp({datetime:["2024-05-10T00:00:00Z","2024-05-10T03:00:00Z","2024-05-10T06:00:00Z","2024-05-10T09:00:00Z"],Kp:[9,6,99,5],status:["pre","def","def","pre"]});
  expect(data.map(p=>p.kp)).toEqual([6]);
  expect(()=>parseHistoricalKp({datetime:["2024-05-10T00:00:00Z"],Kp:[5]})).toThrow();
 });
 it("has a bounded data window for every curated event",()=>{
  expect(Object.keys(HISTORICAL_WINDOWS)).toHaveLength(6);
  for(const [start,end] of Object.values(HISTORICAL_WINDOWS))expect(Date.parse(end)-Date.parse(start)).toBeLessThan(15*86400000);
 });
});
