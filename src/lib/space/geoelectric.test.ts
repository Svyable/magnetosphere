import { describe, expect, it } from "vitest";
import { efieldBand, efieldColorT, efieldStats, efieldTimeFromUrl, efieldUrls, parseEfield, pickEvery } from "./geoelectric";
// Real NOAA SWPC products captured 2026-11-24 ~18:50 UTC. The map keeps every 3rd grid point
// plus the map maximum (all fields unmodified); the index keeps its newest 15 entries (NOAA's
// main index lists only this product, and skips some minutes, e.g. 18:42 is absent).
import mapFixture from "./fixtures/efield-InterMagEarthScope-20261124T184830.json";
import indexFixture from "./fixtures/efield-index-2026-11-24.json";

const URL_ = "https://services.swpc.noaa.gov/json/lists/rgeojson/InterMagEarthScope/20261124T184830-16-Efield-empirical-EMTF-2024.07-0.5x0.5.json";

describe("NOAA/USGS geoelectric field maps (real data)", () => {
  it("reads the minute timestamp from the file name, the only place NOAA puts it", () => {
    expect(efieldTimeFromUrl(URL_)).toBe(Date.UTC(2026, 10, 24, 18, 48, 30));
    expect(efieldTimeFromUrl("/x/20261324T184830-16-Efield.json")).toBeNull();
    expect(efieldTimeFromUrl("/x/latest.json")).toBeNull();
  });
  it("lists one product's maps newest first with absolute URLs", () => {
    const urls = efieldUrls(indexFixture);
    expect(urls).toHaveLength(15);
    expect(urls[0]!.url).toBe("https://services.swpc.noaa.gov/json/lists/rgeojson/InterMagEarthScope/20261124T184730-16-Efield-empirical-EMTF-2024.07-0.5x0.5.json");
    expect(urls[0]!.t).toBeGreaterThan(urls[1]!.t);
    expect(urls.some(u => u.t === Date.UTC(2026, 10, 24, 18, 42, 30))).toBe(false);
    expect(efieldUrls(indexFixture, "US-Canada-1D")).toHaveLength(0); // separate NOAA index
    expect(() => efieldUrls({})).toThrow();
  });
  it("parses the grid and matches an independent calculation of its statistics", () => {
    const m = parseEfield(mapFixture, URL_);
    expect(m.points).toHaveLength(1191);
    const s = efieldStats(m);
    // Independent Python check on the same fixture.
    expect(s.max.mag).toBeCloseTo(52.604, 3);
    expect([s.max.lon, s.max.lat]).toEqual([-77.5, 37.5]);
    expect(s.max.distKm).toBeCloseTo(78.65, 2);
    expect(s.median).toBeCloseTo(2.0583, 3);
    expect(s.p95).toBeCloseTo(7.1159, 3);
    expect(s.farShare).toBeCloseTo(0.0445, 3);
    expect(s.above.map(a => a.count)).toEqual([0, 0, 0]);
    expect(efieldBand(s.max.mag)).toBe("quiet");
  });
  it("rejects malformed maps and impossible values rather than drawing them", () => {
    expect(() => parseEfield({ features: [] }, URL_)).toThrow(/too few/);
    expect(() => parseEfield(mapFixture, "/no-time.json")).toThrow();
    const bad = { ...mapFixture, features: [...(mapFixture as { features: unknown[] }).features, { type: "Feature", geometry: { type: "Point", coordinates: [-100, 40] }, properties: { Ex: 5e6, Ey: 0 } }] };
    expect(parseEfield(bad, URL_).points.every(p => p.mag < 1e5)).toBe(true);
  });
  it("bands and colours span quiet to severe on a log scale", () => {
    expect([efieldBand(50), efieldBand(200), efieldBand(1500), efieldBand(5000)]).toEqual(["quiet", "elevated", "strong", "severe"]);
    expect(efieldColorT(1)).toBe(0);
    expect(efieldColorT(2000)).toBe(1);
    expect(efieldColorT(44.7)).toBeCloseTo(0.5, 2);
  });
  it("picks evenly spaced maps for a light one-hour pulse", () => {
    const list = Array.from({ length: 61 }, (_, i) => ({ t: 3_600_000 - i * 60_000 }));
    const p = pickEvery(list, 3_600_000, 7);
    expect(p.map(x => x.t / 60_000)).toEqual([0, 10, 20, 30, 40, 50, 60]);
    expect(pickEvery([], 1, 3)).toEqual([]);
  });
});
