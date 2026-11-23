import {describe,expect,it} from "vitest";
import alertsFixture from "./fixtures/alerts-2026-11-19.json";
import {parseAlerts} from "./ops";
import {issuedBroadcastBulletin} from "./broadcast-bulletin";
const alerts=parseAlerts(alertsFixture);
const date=(d:number,h:number,m=0)=>Date.UTC(2026,10,d,h,m);
describe("NOAA official bulletin for continuous broadcast",()=>{
 it("only shows an unexpired, not-superseded official warning in its validity window",()=>{
  const now=date(19,2);
  const item=issuedBroadcastBulletin(alerts,now,now-60_000);
  expect(item.kind).toBe("warning");
  expect(item.heading).toContain("CURRENT VALIDITY");
  expect(item.message).toMatch(/Geomagnetic K-index/i);
  expect(item.issuance).toContain("Issued 2026-11-19");
  expect(item.productId?.startsWith("WAR")).toBe(true);
 });
 it("distinguishes issued future watch from observed geomagnetic conditions",()=>{
  const watches=alerts.filter(x=>x.kind==="watch");
  const now=date(17,12);
  const item=issuedBroadcastBulletin(watches,now,now-60_000);
  expect(item.kind).toBe("watch");
  expect(item.heading).toContain("FORECAST");
  expect(item.message).toMatch(/Storm Category G1 Predicted/i);
 });
 it("recent NOAA threshold alerts are explicitly past events, never forecasts",()=>{
  const threshold=alerts.filter(x=>x.kind==="alert");
  const now=date(19,1,14);
  const item=issuedBroadcastBulletin(threshold,now,now-60_000);
  expect(item.kind).toBe("recent-alert");
  expect(item.heading).toContain("OBSERVED");
 });
 it("empty fresh feed never becomes a space-weather all-clear",()=>{
  const now=date(23,12);
  const item=issuedBroadcastBulletin([],now,now-120_000);
  expect(item.kind).toBe("none");
  expect(item.message).toContain("Not an all-clear");
  expect(item.productId).toBeNull();
 });
 it("stale, missing and impossible browser fetch timestamps suppress cached warnings",()=>{
  const now=date(19,2);
  for(const fetched of [now-10*60_000-1,now+120_000,null]){
   const item=issuedBroadcastBulletin(alerts,now,fetched);
   expect(item.kind).toBe("offline");
   expect(item.message).toContain("cannot be verified");
  }
  expect(issuedBroadcastBulletin(null,now,now).kind).toBe("offline");
 });
});
