import { describe, expect, it } from "vitest";
import { groundDataUrl, groundStats, parseGroundH } from "./ground";

const now = Date.parse("2026-11-21T12:00:00Z");
const fixture = (times: string[], values: unknown[]) => ({
  metadata: { status: 200 },
  times,
  values: [{ metadata: { element: "F" }, values: times.map(() => 10000) }, { metadata: { element: "H" }, values }],
});
describe("USGS ground receipts", () => {
  it("requests bounded one-minute H variation in UTC", () => {
    const url = new URL(groundDataUrl("BOU", now));
    expect(url.searchParams.get("id")).toBe("BOU");
    expect(url.searchParams.get("elements")).toBe("H");
    expect(url.searchParams.get("starttime")).toBe("2026-11-20T12:00:00Z");
    expect(url.searchParams.get("endtime")).toBe("2026-11-21T12:00:00Z");
  });
  it("uses H rather than another magnetic channel and does not interpolate gaps", () => {
    const input = fixture(["2026-11-21T11:58:00Z", "2026-11-21T11:59:00Z"], [21000, 21004]);
    expect(parseGroundH(input, now)).toEqual([{t: now - 120000, h: 21000}, {t: now - 60000, h: 21004}]);
  });
  it("rejects USGS sentinel, bogus values, future timestamps and duplicates", () => {
    const input = fixture(["2026-11-21T11:55:00Z", "2026-11-21T11:56:00Z", "2026-11-21T11:56:00Z", "2026-11-21T12:10:00Z"], [99999, 23010, 23011, 23000]);
    expect(parseGroundH(input, now)).toEqual([{t: now - 240000, h: 23010}]);
  });
  it("fails closed when H is absent or arrays are mismatched", () => {
    expect(() => parseGroundH({times: ["2026-11-21T11:59:00Z"], values: []}, now)).toThrow();
    expect(() => parseGroundH({times: [], values: [], metadata: {status: 500}}, now)).toThrow();
  });
  it("does not show a one-hour range with sparse data or call stale points current", () => {
    const points = [{t:now - 3 * 3600_000, h:20000}, {t:now-2 * 3600_000,h:20040}];
    expect(groundStats(points, now)).toMatchObject({fresh:false, delta24:40, range60:null});
  });
  it("computes the one-hour raw H range when the coverage is adequate", () => {
    const points = Array.from({length:61}, (_,i)=>({t:now - (60-i)*60_000,h:20000 + i}));
    expect(groundStats(points,now)).toMatchObject({fresh:true,delta24:60,range60:60,count:61});
  });
});
