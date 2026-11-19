import { describe, expect, it } from "vitest";
import { dipoleAt, dipoleSeries, dipoleChanges, percentChange, temporalCsv, eventsAtMa, DEEP_TIME_EVENTS, igrfEvidence } from "./temporal";

describe("geomagnetic time atlas (IGRF-14)", () => {
  it("reconstructs the independently published 2025 dipole moment and known trend", () => {
    expect(dipoleAt(1900).momentZAm2).toBeGreaterThan(83);
    expect(dipoleAt(2025).momentZAm2).toBeCloseTo(76.90, 1);
    expect(percentChange(1900, 2025)).toBeCloseTo(-7.59, 1);
    expect(percentChange(2012, 2025)).toBeCloseTo(-0.614, 1);
  });
  it("does not invent a post-2012 discontinuity", () => {
    const a = dipoleAt(2012), b = dipoleAt(2010), c = dipoleAt(2015);
    expect(a.momentZAm2).toBeLessThan(b.momentZAm2);
    expect(a.momentZAm2).toBeGreaterThan(c.momentZAm2);
    expect(a.momentZAm2).toBeCloseTo(b.momentZAm2 * 0.6 + c.momentZAm2 * 0.4, 3);
  });
  it("shows 5-year vector change, not daily storm volatility", () => {
    const rate = dipoleChanges();
    expect(rate).toHaveLength(26);
    expect(rate.every(v => v.vectorNTPeryear > 0)).toBe(true);
    expect(rate.at(-1)!.predicted).toBe(true);
    expect(rate[0]!.predicted).toBe(false);
  });
  it("distinguishes historical, DGRF, non-definitive 2025 and 2030 forecast", () => {
    expect(igrfEvidence(1900)).toBe("historical-model");
    expect(igrfEvidence(1980)).toBe("definitive");
    expect(igrfEvidence(2025)).toBe("non-definitive");
    expect(igrfEvidence(2026)).toBe("forecast");
    expect(dipoleSeries()).toHaveLength(27);
    expect(() => dipoleAt(1899)).toThrow();
    expect(() => dipoleAt(2031)).toThrow();
  });
  it("exports exact provenance with a separate predicted segment", () => {
    const csv = temporalCsv();
    expect(csv).toContain("year,main_field_dipole_zetta_ampere_m2");
    expect(csv).toContain("2030,");
    expect(csv).toContain(",forecast,");
    expect(csv.trim().split("\n")).toHaveLength(28);
  });
});
describe("500-million-year evidence boundaries", () => {
  it("does not pretend an unknown period has measured global field", () => {
    expect(eventsAtMa(370)).toEqual([]);
    expect(eventsAtMa(490)).toEqual([]);
    expect(eventsAtMa(501)).toEqual([]);
  });
  it("retains model-vs-rock distinction and overlap of excursions/chrons", () => {
    expect(eventsAtMa(0.042).map(e=>e.id)).toEqual(expect.arrayContaining(["laschamp", "brunhes"]));
    expect(eventsAtMa(100).map(e=>e.id)).toContain("cretaceous");
    expect(eventsAtMa(160).map(e=>e.id)).toContain("jurassic");
    expect(eventsAtMa(300).map(e=>e.id)).toContain("kiaman");
    expect(eventsAtMa(470).map(e=>e.id)).toContain("moyero");
    expect(DEEP_TIME_EVENTS.every(e=>e.source.startsWith("https://"))).toBe(true);
  });
});
