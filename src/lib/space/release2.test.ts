import { describe, expect, it } from "vitest";
import { parseEpic, formatAge } from "./epic";
import { parseXray, flareClass, peak } from "./xray";
import { validateTarget, explore, epochKind } from "./explorer";
import { freshness, parseOvation } from "./model";

describe("EPIC parser", () => {
  it("builds archive URLs from date + image and sorts", () => {
    const r = parseEpic([
      { identifier: "2", image: "epic_1b_20261114020000", date: "2026-11-14 02:00:00", centroid_coordinates: { lat: 1, lon: 2 } },
      { identifier: "1", image: "epic_1b_20261114004554", date: "2026-11-14 00:41:06" },
      { image: "../hack", date: "2026-11-14 00:41:06" },
      { image: "x", date: "bad" },
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]!.url).toBe("https://epic.gsfc.nasa.gov/archive/natural/2026/11/14/jpg/epic_1b_20261114004554.jpg");
    expect(r[0]!.t).toBe(Date.UTC(2026, 10, 14, 0, 41, 6));
    expect(r[1]!.lat).toBe(1);
  });
  it("non-array -> empty; age text is honest about days", () => {
    expect(parseEpic({ error: 1 })).toEqual([]);
    expect(formatAge(3 * 86400_000)).toBe("3.0 days old");
  });
});

describe("GOES X-ray", () => {
  const raw = [
    { time_tag: "2026-11-17T21:55:00Z", satellite: 18, flux: 2e-8, energy: "0.05-0.4nm" },
    { time_tag: "2026-11-17T21:55:00Z", satellite: 18, flux: 1.15e-6, energy: "0.1-0.8nm" },
    { time_tag: "2026-11-17T21:56:00Z", satellite: 18, flux: 3.2e-5, energy: "0.1-0.8nm" },
    { time_tag: "2026-11-17T21:57:00Z", satellite: 18, flux: -1, energy: "0.1-0.8nm" },
  ];
  it("splits bands by NOAA energy field and drops invalid flux", () => {
    const d = parseXray(raw);
    expect(d.long).toHaveLength(2);
    expect(d.short).toHaveLength(1);
  });
  it("classifies on long-band thresholds", () => {
    expect(flareClass(1.15e-6)).toBe("C1.1");
    expect(flareClass(3.2e-5)).toBe("M3.2");
    expect(flareClass(2.5e-4)).toBe("X2.5");
    expect(flareClass(5e-8)).toBe("A5.0");
  });
  it("peak picks max in window", () => {
    expect(peak(parseXray(raw).long, 0)!.flux).toBe(3.2e-5);
  });
  it("stale timestamps are flagged stale, not live", () => {
    const now = Date.UTC(2026, 10, 17, 22);
    expect(freshness(now - 30 * 60_000, now, 10 * 60_000, false)).toBe("stale");
    expect(freshness(null, now, 10 * 60_000, true)).toBe("disconnected");
  });
});

describe("OVATION absent", () => {
  it("returns null for missing payload and no points for empty coordinates", () => {
    expect(parseOvation(null)).toBeNull();
    expect(parseOvation({ "Observation Time": "2026-11-17T21:00:00Z" })!.points).toHaveLength(0);
  });
});

describe("Field explorer", () => {
  it("rejects out-of-range and non-numeric input", () => {
    expect(validateTarget(91, 0).ok).toBe(false);
    expect(validateTarget(0, 181).ok).toBe(false);
    expect(validateTarget("", 0).ok).toBe(false);
    expect(validateTarget("abc", 0).ok).toBe(false);
    expect(validateTarget("45.5", "-73.6").ok).toBe(true);
  });
  it("Boulder 2025: F ~ 51-54k nT, declination ~7-8 deg E, inclination ~65 deg", () => {
    const e = explore({ lat: 40.0, lon: -105.25 }, 2025.0);
    expect(e.F).toBeGreaterThan(50500);
    expect(e.F).toBeLessThan(54000);
    expect(e.D).toBeGreaterThan(6.5);
    expect(e.D).toBeLessThan(8.5);
    expect(e.I).toBeGreaterThan(63);
    expect(e.I).toBeLessThan(67);
  });
  it("São Paulo is inside the weak-field region", () => {
    expect(explore({ lat: -23.5, lon: -46.6 }, 2025).insideWeak).toBe(true);
  });
  it("epoch boundaries", () => {
    expect(epochKind(2020)).toBe("definitive");
    expect(epochKind(2025)).toBe("definitive");
    expect(epochKind(2027)).toBe("predicted");
    expect(epochKind(2031)).toBe("clamped");
    expect(explore({ lat: 0, lon: 0 }, 2040).year).toBe(2030);
  });
});