import { describe, expect, it } from "vitest";
import { isDayside, localTimeHours, parseGoesLongitudes, parseGoesMag, possibleCrossings, satStatus, type GoesMagSample } from "./goes-mag";
// Real NOAA SWPC GOES-19 (primary) and GOES-18 (secondary) magnetometer data, captured
// 2026-11-24 ~19:00 UTC, every 3rd sample, unmodified; satellite-longitudes.json as served.
import g19 from "./fixtures/goes19-mag-2026-11-24.json";
import g18 from "./fixtures/goes18-mag-2026-11-24.json";
import lons from "./fixtures/goes-longitudes-2026-11-24.json";

const at = (h: number, m = 0) => Date.UTC(2026, 10, 24, h, m);

describe("GOES magnetometers at geosynchronous orbit (real data)", () => {
  const samples = parseGoesMag([...g19, ...g18]);
  const lon = parseGoesLongitudes(lons);
  it("parses both satellites and NOAA's west-longitude slots", () => {
    expect(samples.filter(s => s.sat === 19)).toHaveLength(480);
    expect(samples.filter(s => s.sat === 18)).toHaveLength(480);
    expect(lon.get(18)).toBe(137);
    expect(lon.get(19)).toBe(72.5);
    expect(lon.has(15)).toBe(false); // null longitude = no slot
  });
  it("computes local time from UTC and west longitude", () => {
    expect(localTimeHours(at(18, 57), 72.5)).toBeCloseTo(14.1167, 3);
    expect(localTimeHours(at(19, 0), 137)).toBeCloseTo(9.8667, 3);
    expect(localTimeHours(at(2), 137)).toBeCloseTo(16.8667, 3);
    expect([isDayside(5.9), isDayside(6), isDayside(17.99), isDayside(18)]).toEqual([false, true, true, false]);
  });
  it("finds no crossing on a quiet day and reports the measured dayside minimum", () => {
    const s19 = satStatus(samples, 19, 72.5, at(19, 5));
    const s18 = satStatus(samples, 18, 137, at(19, 5));
    expect(s19.state).toBe("inside");
    expect(s18.state).toBe("inside");
    expect(s19.crossings).toEqual([]);
    // Independent Python check on the same fixture.
    expect(s19.minDaysideHp).toBeCloseTo(97.828, 2);
    expect(s18.minDaysideHp).toBeCloseTo(99.804, 2);
    expect(s19.latest!.hp).toBeCloseTo(128.1016, 3);
  });
  it("flags only sustained, dayside, non-arcjet negative Hp as a possible crossing", () => {
    const mk = (min: number, hp: number, arcjet = false): GoesMagSample => ({ t: at(17, min), sat: 99, hp, he: null, hn: null, total: null, arcjet });
    // 17:00 UTC at 72.5°W is ~12:10 local: noon sector.
    const run = [mk(0, 40), mk(1, -5), mk(2, -20), mk(3, -8), mk(4, 30), mk(5, -3), mk(6, 25), mk(7, -9, true), mk(8, -9, true)];
    const c = possibleCrossings(run, 72.5);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ start: at(17, 1), end: at(17, 3), minHp: -20, minutes: 3 });
    expect(possibleCrossings(run, 72.5 + 180)).toEqual([]); // same data on the nightside: never a crossing
    const st = satStatus(run, 99, 72.5, at(17, 9));
    expect(st.state).toBe("possible-crossing");
  });
  it("reports stale and missing data instead of an all-clear", () => {
    expect(satStatus(samples, 19, 72.5, at(23)).state).toBe("no-data");
    expect(satStatus(samples, 17, 89.5, at(19, 5)).state).toBe("no-data");
    expect(() => parseGoesMag({})).toThrow();
    expect(() => parseGoesMag([{ time_tag: "x", satellite: 19, Hp: 5 }])).toThrow();
  });
});
