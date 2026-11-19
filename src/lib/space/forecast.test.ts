import {describe,expect,it} from "vitest";
import {
  FORECAST_URLS, parseKpForecast, upcomingKp, forecastPeak, gFromKp,
  parseGeomagBulletin, parse27DayOutlook, outlookAhead, issuanceStatus,
} from "./forecast";
const now=Date.UTC(2026,10,19,3,30);
describe("NOAA official geomagnetic future predictions",()=>{
  it("preserves observed vs estimated vs predicted, never invents future observations",()=>{
    const raw=[
      {time_tag:"2026-11-18T21:00:00",kp:5,observed:"observed",noaa_scale:"G1"},
      {time_tag:"2026-11-19T03:00:00",kp:3.33,observed:"estimated",noaa_scale:null},
      {time_tag:"2026-11-20T00:00:00",kp:5.67,observed:"predicted",noaa_scale:null},
      {time_tag:"2026-11-20T03:00:00",kp:2,observed:"predicted",noaa_scale:null},
      {time_tag:"2026-11-99T03:00:00",kp:8,observed:"predicted"},
      {time_tag:"2026-11-20T09:00:00",kp:99,observed:"predicted"},
    ];
    const p=parseKpForecast(raw), future=upcomingKp(p,now);
    expect(p).toHaveLength(4);
    expect(p[0]!.status).toBe("observed");
    expect(future.map(v=>v.status)).toEqual(["estimated","predicted","predicted"]);
    expect(forecastPeak(p,now)?.kp).toBe(5.67);
    expect(gFromKp(5.67)).toBe("G1");
    expect(gFromKp(6.12)).toBe("G2");
    expect(gFromKp(7)).toBe("G3");
    expect(gFromKp(8)).toBe("G4");
    expect(gFromKp(4.99)).toBeNull();
    expect(gFromKp(9)).toBe("G5");
    expect(gFromKp(NaN)).toBeNull();
  });
  it("rejects unknown schema and malformed data rather than pretending a zero forecast",()=>{
    expect(()=>parseKpForecast({rows:[]})).toThrow();
    expect(()=>parseKpForecast([{kp:0,observed:"predicted"}])).toThrow();
    expect(upcomingKp([],now)).toEqual([]);
    expect(forecastPeak([],now)).toBeNull();
  });
  it("reads dated NOAA storm probabilities, which are NOT derived from Kp bins",()=>{
    const txt=":Product: Geomagnetic Forecast\n:Issued: 2026 Nov 18 2205 UTC\nNOAA Geomagnetic Activity Probabilities 19 Nov-21 Nov\nActive 25/25/25\nMinor storm 10/05/05\nModerate storm 01/01/01\nStrong-Extreme storm 01/01/01\n";
    const b=parseGeomagBulletin(txt);
    expect(b.issuedAt).toBe(Date.UTC(2026,10,18,22,5));
    expect(b.probabilities.map(x=>x.minor)).toEqual([10,5,5]);
    expect(b.probabilities[0]!.t).toBe(Date.UTC(2026,10,19));
    expect(issuanceStatus(b.issuedAt,now,36*3_600_000)).toBe("current");
    expect(issuanceStatus(b.issuedAt,now+72*3_600_000,36*3_600_000)).toBe("stale");
  });
  it("rolls December to January without treating future probabilities as observations",()=>{
    const txt=":Issued: 2026 Dec 31 2205 UTC\nNOAA Geomagnetic Activity Probabilities 01 Jan-03 Jan\nActive 25/25/25\nMinor storm 10/05/05\nModerate storm 01/01/01\nStrong-Extreme storm 01/01/01\n";
    expect(parseGeomagBulletin(txt).probabilities[0]!.t).toBe(Date.UTC(2027,0,1));
    expect(()=>parseGeomagBulletin(":Issued: yesterday")).toThrow();
  });
  it("parses NOAA 27-day outlook with a distinct lower-confidence horizon",()=>{
    const text=":Product: 27-day Space Weather Outlook Table 27DO.txt\n:Issued: 2026 Nov 16 0233 UTC\n2026 Nov 18 108 18 5\n2026 Nov 19 106 8 3\n2026 Nov 20 105 12 4\n2026 Nov 21 100 15 4\n2026 Nov 22 95 8 3\n";
    const p=parse27DayOutlook(text), future=outlookAhead(p,now);
    expect(p.days).toHaveLength(5);
    expect(future.map(x=>x.largestKp)).toEqual([3,4,4,3]);
    expect(p.issuedAt).toBe(Date.UTC(2026,10,16,2,33));
    expect(FORECAST_URLS.outlook).toContain("27-day-outlook");
  });
});
