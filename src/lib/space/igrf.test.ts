import { describe, expect, it } from "vitest";
import { coeffsAt, dipPole, fieldAt, geomagneticPole, intensityGrid, poleMotion } from "./igrf";

describe("IGRF-14", () => {
  const c = coeffsAt(2025);
  it("equatorial field near 0N 0E is ~30-35k nT", () => {
    const f = fieldAt(c, 0, 0).F;
    expect(f).toBeGreaterThan(28000);
    expect(f).toBeLessThan(36000);
  });
  it("SAA minimum lies over South America / South Atlantic and is ~22k nT", () => {
    const g = intensityGrid(c, 2);
    expect(g.min.F).toBeGreaterThan(21000);
    expect(g.min.F).toBeLessThan(23500);
    expect(g.min.lat).toBeLessThan(-10);
    expect(g.min.lon).toBeGreaterThan(-80);
    expect(g.min.lon).toBeLessThan(-20);
  });
  it("north dip pole 2025 is above 84N toward Siberia", () => {
    const p = dipPole(c, true);
    expect(p.lat).toBeGreaterThan(84);
    expect(p.lon).toBeGreaterThan(100);
  });
  it("south dip pole 2025 is near 64S off Antarctica", () => {
    const p = dipPole(c, false);
    expect(p.lat).toBeLessThan(-62);
    expect(p.lat).toBeGreaterThan(-66);
  });
  it("north dip pole moves ~30-45 km/yr, south ~5-15", () => {
    expect(poleMotion(2025.9, true).speedKmYr).toBeGreaterThan(25);
    expect(poleMotion(2025.9, true).speedKmYr).toBeLessThan(50);
    const s = poleMotion(2025.9, false).speedKmYr;
    expect(s).toBeGreaterThan(3);
    expect(s).toBeLessThan(18);
  });
  it("1900 boundary uses available forward secular variation, not a synthetic zero", () => {
    expect(poleMotion(1900, true).speedKmYr).toBeGreaterThan(0);
  });
  it("geomagnetic north pole ~80.8N", () => {
    expect(geomagneticPole(c).lat).toBeCloseTo(80.8, 0);
  });
});