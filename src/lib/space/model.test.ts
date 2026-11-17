import { describe, expect, it } from "vitest";
import { dynamicPressure, shue, laggedSample, normalizeRows, parseWind, type L1Sample } from "./model";

describe("space model", () => {
  it("dynamic pressure n=5, v=400 is ~1.34 nPa", () => {
    expect(dynamicPressure(5, 400)).toBeCloseTo(1.338, 2);
  });
  it("Shue r0 for P=2 nPa, Bz=0 is ~10.2 RE", () => {
    const { r0 } = shue(2, 0);
    expect(r0).toBeGreaterThan(9.8);
    expect(r0).toBeLessThan(10.6);
  });
  it("southward Bz pulls magnetopause inward", () => {
    expect(shue(2, -10).r0).toBeLessThan(shue(2, 5).r0);
  });
  it("uses lagged sample, not the latest", () => {
    const now = Date.UTC(2026, 0, 1, 12);
    const mk = (minAgo: number): L1Sample => ({ t: now - minAgo * 60000, v: 500, n: 5, bz: 0, bt: 5, windSource: null, magSource: null });
    const s = [mk(120), mk(60), mk(40), mk(1)]; // 500 km/s => 50 min lag
    expect(laggedSample(s, now)?.t).toBe(now - 60 * 60000);
    expect(laggedSample([mk(1)], now)).toBeNull();
  });
  it("parses header-array format and drops missing values", () => {
    const rows = normalizeRows([["time_tag", "speed", "density"], ["2026-01-01 00:00:00", "400", "5"], ["2026-01-01 00:01:00", null, "5"]]);
    expect(rows).toHaveLength(2);
    expect(parseWind(rows)).toHaveLength(1);
  });
});