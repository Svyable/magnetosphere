import {describe,it,expect} from "vitest";
import {
 incomingOutlook, incomingCsv, estimatedArrival, SOURCE_MAX_AGE_MINUTES,
} from "./incoming";
import type {L1Sample} from "./model";
const now=Date.UTC(2026,10,19,4);
const mk=(minutesAgo:number, bz:number|null, v=500, n=5, source="SOLAR1"):L1Sample=>({
 t:now-minutesAgo*60000, v, n, bz, bt:bz===null?null:Math.abs(bz), windSource:source, magSource:bz===null?null:"SOLAR1",
});
describe("incoming L1 advection / empirical Shue projection",()=>{
  it("uses real measurement timestamps and a nominal 50-minute lead at 500 km/s",()=>{
    const p=mk(5,-8);
    expect(estimatedArrival(p)).toBe(now+45*60000);
    const out=incomingOutlook([mk(60,2),p],now);
    expect(out.freshness).toBe("current");
    expect(out.allPulses).toHaveLength(1);
    expect(out.pulses[0]!.leadMinutes).toBe(45);
    expect(out.pulses[0]!.nominalTravelMinutes).toBe(50);
    expect(out.pulses[0]!.shueNoseRE).not.toBeNull();
    expect(out.pulses[0]!.changeFromNowRE).toBeLessThan(0);
  });
  it("never calculates future Shue geometry when Bz is missing",()=>{
    const o=incomingOutlook([mk(55,null),mk(4,null)],now);
    expect(o.minimumBz).toBeNull();
    expect(o.lowestModeledNoseRE).toBeNull();
    expect(o.pulses[0]!.shueNoseRE).toBeNull();
    expect(o.pulses[0]!.changeFromNowRE).toBeNull();
    const csv=incomingCsv(o);
    expect(csv).toContain("measured_L1_plus_estimated_advection_and_empirical_model");
    expect(csv).not.toContain("NaN");
  });
  it("refuses to call stale upstream data current even if arrival is in the future",()=>{
    const o=incomingOutlook([mk(SOURCE_MAX_AGE_MINUTES+2,-7,250)],now);
    expect(o.freshness).toBe("stale");
    expect(o.allPulses).toHaveLength(1);
  });
  it("stays unavailable without valid measured data; never infers tomorrow from Kp",()=>{
    const o=incomingOutlook([mk(5,-5,99),mk(1,-5,400,0)],now);
    expect(o.freshness).toBe("missing");
    expect(o.pulses).toHaveLength(0);
    expect(o.currentModeledNoseRE).toBeNull();
  });
  it("excludes already-arrived and far-future samples; does not silently backfill null Bz",()=>{
    const samples=[mk(90,-10),mk(7,null),mk(6,1),mk(1,3)];
    const o=incomingOutlook(samples,now);
    expect(o.allPulses.some(p=>p.observedAt===samples[0]!.t)).toBe(false);
    expect(o.minimumBz).toBe(1);
    expect(o.allPulses.find(p=>p.observedAt===samples[1]!.t)?.shueNoseRE).toBeNull();
  });
  it("coarsens chart to five-minute buckets but CSV retains every real observation",()=>{
    const o=incomingOutlook([mk(3,-4),mk(2,-5),mk(1,-6)],now);
    expect(o.allPulses).toHaveLength(3);
    expect(o.pulses.length).toBeLessThan(3);
    expect(incomingCsv(o).trim().split("\r\n")).toHaveLength(4);
  });
});
