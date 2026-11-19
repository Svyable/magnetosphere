import{describe,it,expect}from "vitest";
import {appendKpCapture,blankLedgerMonth,verifyForecasts,bandForHours} from "./ledger";
import type{KpForecastSlot}from "./forecast";
const T=Date.UTC(2026,10,19,0);
const slot=(offsetHours:number,kp:number,status:KpForecastSlot["status"]):KpForecastSlot=>({
 t:T+offsetHours*3_600_000,kp,status,noaaScale:null,
});
describe("immutable forecast receipts, never retroactive backtests",()=>{
 it("captures NOAA predicted slots only if future at the time our runner fetched",()=>{
   const feed=[slot(-6,2,"observed"),slot(0,2,"estimated"),slot(3,4,"predicted"),slot(12,5,"predicted"),slot(30,3,"predicted"),slot(90,8,"predicted")];
   const ledger=appendKpCapture(blankLedgerMonth(),feed,T);
   expect(ledger.captures).toHaveLength(1);
   expect(ledger.captures[0]!.predicted.map(s=>s.t)).toEqual([T+3*3_600_000,T+12*3_600_000,T+30*3_600_000]);
   expect(ledger.captures[0]!.persistenceKp).toBe(2);
   expect(ledger.observations).toHaveLength(1);
   expect(ledger.observations[0]!.seenAt).toBe(T);
   const rerun=appendKpCapture(ledger,feed,T+10_000);
   expect(rerun.captures).toHaveLength(1);
   expect(rerun.observations).toHaveLength(1);
 });
 it("refuses empty predictions and malformed runner timestamps",()=>{
   expect(()=>appendKpCapture(blankLedgerMonth(),[slot(-3,1,"observed")],T)).toThrow(/No future/);
   expect(()=>appendKpCapture(blankLedgerMonth(),[slot(3,4,"predicted")],NaN)).toThrow();
 });
 it("scores only actual later source-observed Kp, never estimated or future",()=>{
   const m=appendKpCapture(blankLedgerMonth(),[slot(-3,2,"observed"),slot(12,5,"predicted"),slot(24,4,"predicted")],T);
   const early=verifyForecasts([m],T+15*3_600_000);
   expect(early.verifiedTargetPeriods).toBe(0);
   const later=appendKpCapture(m,[slot(12,6,"observed"),slot(24,4,"estimated"),slot(30,3,"predicted")],T+16*3_600_000);
   const s=verifyForecasts([later],T+16*3_600_000);
   expect(s.verifiedTargetPeriods).toBe(1);
   expect(s.rows.find(x=>x.band==="6–24h")!.maeKp).toBe(1);
   expect(s.rows.find(x=>x.band==="6–24h")!.persistenceMaeKp).toBe(4);
   expect(s.rows.find(x=>x.band==="6–24h")!.missedStorms).toBe(0);
 });
 it("uses one latest pre-event forecast per target and lead band, not duplicate reruns",()=>{
   const one=appendKpCapture(blankLedgerMonth(),[slot(-3,3,"observed"),slot(30,8,"predicted")],T);
   const two=appendKpCapture(one,[slot(-3,3,"observed"),slot(30,4,"predicted")],T+6*3_600_000);
   const three=appendKpCapture(two,[slot(-3,3,"observed"),slot(30,5,"predicted")],T+12*3_600_000);
   const truth=appendKpCapture(three,[slot(30,5,"observed"),slot(36,4,"predicted")],T+34*3_600_000);
   const s=verifyForecasts([truth],T+35*3_600_000);
   expect(s.verifiedTargetPeriods).toBe(1);
   expect(s.rows.find(x=>x.band==="24–48h")!.maeKp).toBe(1);
   expect(s.rows.find(x=>x.band==="6–24h")!.maeKp).toBe(0);
 });
 it("tracks later NOAA revisions and never overwrites original snapshots",()=>{
   const first=appendKpCapture(blankLedgerMonth(),[slot(-6,2,"observed"),slot(12,3,"predicted")],T);
   const later=appendKpCapture(first,[slot(-6,4,"observed"),slot(18,3,"predicted")],T+6*3_600_000);
   expect(later.observations.filter(x=>x.t===T-6*3_600_000)).toHaveLength(2);
   expect(later.captures[0]!.persistenceKp).toBe(2);
   expect(later.captures[1]!.persistenceKp).toBe(4);
 });
 it("boundaries and absent observations do not manufacture forecast skill",()=>{
   expect(bandForHours(-1)).toBeNull();
   expect(bandForHours(6)).toBe("6–24h");
   expect(bandForHours(24)).toBe("24–48h");
   expect(bandForHours(48)).toBe("48–72h");
   expect(bandForHours(73)).toBeNull();
   const empty=verifyForecasts([],T);
   expect(empty.rows.every(x=>x.maeKp===null && x.pairedPeriods===0)).toBe(true);
   expect(empty.captures).toBe(0);
 });
});
