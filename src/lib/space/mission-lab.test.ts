import {describe,it,expect} from "vitest";
import {angularDistanceKm,solarElevation,localAurora,hypotheticalBoundary,detectL1Patterns,missionBrief} from "./mission-lab";
import type {L1Sample} from "./model";
const T=Date.UTC(2026,5,21,12);
const sample=(m:number,v=450,n=5,bz:number|null=-2):L1Sample=>({t:T+m*60_000,v,n,bz,bt:bz===null?null:Math.abs(bz),windSource:"SOLAR1",magSource:bz===null?null:"SOLAR1"});
describe("observer location and OVATION integrity",()=>{
 it("handles antimeridian and great circle distance",()=>{
   expect(angularDistanceKm({lat:65,lon:179},{lat:65,lon:-179})).toBeLessThan(100);
 });
 it("samples geographic OVATION map values; missing/zero are not fabricated viewing probabilities",()=>{
   const p:[[number,number,number],[number,number,number],[number,number,number]]=[[-20,70,0],[-21,70,55],[-20,75,95]];
   const s=localAurora(p,{lat:70,lon:-20},T);
   expect(s.value).toBe(0);expect(s.peakNearby).toBe(95);
   expect(localAurora([], {lat:40,lon:0},T).value).toBeNull();
   expect(localAurora(p,{lat:20,lon:-20},T).value).toBeNull();
 });
 it("reports daylight vs night using solar angle, explicitly approximate",()=>{
   expect(solarElevation(T,{lat:0,lon:0})).toBeGreaterThan(60);
   expect(localAurora([],{lat:0,lon:0},T).darkness).toBe("daylight");
   expect(localAurora([],{lat:0,lon:180},T).darkness).toBe("dark");
 });
});
describe("Shue what-if boundaries",()=>{
 it("shows sensitivity without manufacturing observed Bz",()=>{
   const p=hypotheticalBoundary({pressure:20,bz:-15},{pressure:2,bz:3});
   expect(p?.deltaNose).toBeLessThan(0);
   expect(hypotheticalBoundary({pressure:20,bz:-15},null)?.baselineNose).toBeNull();
   expect(hypotheticalBoundary({pressure:0,bz:-15},null)).toBeNull();
 });
});
describe("upstream observational watch patterns",()=>{
 it("detects sustained southward Bz and relative pressure jumps when both windows are populated",()=>{
   const samples=Array.from({length:40},(_,i)=>sample(i,i>=20?650:350,i>=20?12:3,i>=20?-8:2));
   const e=detectL1Patterns(samples,T+40*60_000);
   expect(e.some(x=>x.kind==="pressure-jump")).toBe(true);
   expect(e.some(x=>x.kind==="southward-bz")).toBe(true);
 });
 it("does not detect a storm or signal on sparse, unpaired data",()=>{
   expect(detectL1Patterns([sample(1)],T+5*60_000)).toEqual([]);
   const sparse=Array.from({length:25},(_,i)=>sample(i,450,3,null));
   expect(detectL1Patterns(sparse,T+26*60_000).some(e=>e.kind==="southward-bz")).toBe(false);
 });
});
describe("evidence-bearing brief",()=>{
 it("never fills missing Bz or stale telemetry and keeps provenance",()=>{
   const b=missionBrief({generatedAt:T,wind:sample(-3,450,4,null),kp:null,forecast:[],forecastFetchedAt:0,ovationTarget:null});
   expect(b).toContain("Bz missing");expect(b).toContain("No current valid future Kp prediction");
   const stale=missionBrief({generatedAt:T,wind:sample(-50),kp:null,forecast:[],forecastFetchedAt:0,ovationTarget:null});
   expect(stale).toContain("No sufficiently recent L1 measurement");
 });
});
