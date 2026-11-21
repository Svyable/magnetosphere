import {describe,it,expect} from "vitest";
import {compareForecastSnapshots,forecastViewUrl,formatForecastTime,makeForecastSnapshot,parseForecastClock,
  parseForecastHorizon,parseForecastSnapshot,parseStormTarget,stormWindows,THREE_HOURS_MS} from "./forecast-ux";
import type{KpForecastSlot}from "./forecast";
const NOW=Date.UTC(2026,10,21,12);
const k=(h:number,kp:number,status:KpForecastSlot["status"]="predicted"):KpForecastSlot=>({t:NOW+h*3_600_000,kp,status,noaaScale:null});
describe("scientific storm window synthesis",()=>{
  it("uses only future NOAA predicted Kp and groups continuous 3-hour storm slots",()=>{
    const w=stormWindows([k(-6,8),k(3,5),k(6,6),k(9,4),k(12,7),k(15,9),k(18,7),k(21,8,"estimated")],NOW);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({start:NOW+3*3_600_000,end:NOW+9*3_600_000,peakKp:6,threshold:"G2",slots:2});
    expect(w[1]).toMatchObject({start:NOW+12*3_600_000,peakKp:9,threshold:"G5",slots:3});
    expect(stormWindows([k(3,5,"estimated"),k(6,5,"observed")],NOW)).toEqual([]);
  });
  it("does not bridge gaps or invent storm probability from Kp",()=>{
    const w=stormWindows([k(3,5),k(9,5),k(72,7)],NOW);
    expect(w).toHaveLength(2);
    expect(w[0]!.end).toBe(NOW+6*3_600_000);
  });
});
describe("browser saved NOAA forecast snapshots",()=>{
  it("captures only future predicted slots from recently fetched NOAA data",()=>{
    const s=makeForecastSnapshot([k(-3,6),k(3,5),k(6,4,"estimated"),k(12,7)],NOW,NOW-60_000);
    expect(s?.predicted).toEqual([{t:NOW+3*3_600_000,kp:5},{t:NOW+12*3_600_000,kp:7}]);
    expect(makeForecastSnapshot([k(3,5)],NOW,NOW-31*60_000)).toBeNull();
    expect(makeForecastSnapshot([k(3,5,"estimated")],NOW,NOW)).toBeNull();
    expect(parseForecastSnapshot(s)).toEqual(s);
    expect(parseForecastSnapshot({schemaVersion:1,savedAt:NOW,fetchedAt:NOW,predicted:[{t:NOW,kp:"7"}]})).toBeNull();
  });
  it("detects changes only across matching forecast windows; no retroactive accuracy claim",()=>{
    const saved=makeForecastSnapshot([k(3,5),k(6,6),k(9,2)],NOW,NOW)!;
    const newer=makeForecastSnapshot([k(3,7),k(6,4),k(12,3)],NOW,NOW)!;
    const d=compareForecastSnapshots(saved,newer);
    expect(d).toMatchObject({commonPeriods:2,changedPeriods:2,newPeriods:1,pastOrRemovedPeriods:1,increases:1,decreases:1});
    expect(d.changes[0]!.delta).toBe(2);
    expect(d.changes[1]!.delta).toBe(-2);
  });
  it("reports no comparable hours honestly when all earlier predicted windows elapsed",()=>{
    const saved=makeForecastSnapshot([k(3,5)],NOW,NOW)!;
    const later=makeForecastSnapshot([k(12,5)],NOW,NOW)!;
    expect(compareForecastSnapshots(saved,later).commonPeriods).toBe(0);
  });
});
describe("future forecast time and share links",()=>{
  it("formats UTC and real local timezone with DST offset rather than guessing",()=>{
    const t=Date.UTC(2026,10,1,5,30);
    expect(formatForecastTime(t,"utc")).toContain("11-01 05:30 UTC");
    expect(formatForecastTime(t,"local","America/New_York")).toContain("EDT");
    expect(formatForecastTime(t+3_600_000,"local","America/New_York")).toContain("EST");
    expect(parseForecastClock("bad")).toBeNull();
  });
  it("parses forecast tabs and valid 3-hour UTC target and preserves the rest of the view",()=>{
    expect(parseForecastHorizon("verify")).toBe("verify");
    expect(parseForecastHorizon("alert")).toBeNull();
    const u=forecastViewUrl("https://svyable.github.io/magnetosphere/?view=earth&detail=quiet","72h",NOW+3*3_600_000);
    expect(new URL(u).searchParams.get("view")).toBe("earth");
    expect(new URL(u).searchParams.get("forecast")).toBe("72h");
    expect(parseStormTarget(new URL(u).searchParams.get("storm"))).toBe(NOW+THREE_HOURS_MS);
    expect(new URL(forecastViewUrl(u,"incoming",null)).searchParams.has("storm")).toBe(false);
    expect(parseStormTarget("not-a-timestamp")).toBeNull();
  });
});
