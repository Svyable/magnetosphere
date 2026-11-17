import { describe, expect, it } from "vitest";
import { measuredWindCsv, EXPORT_COLUMNS } from "./export";
import type { L1Sample } from "./model";

const mk = (n: number, bz: number | null, source: string | null = "DSCOVR"): L1Sample => ({
  t: Date.UTC(2026, 10, 17, 20, n), v: 500, n: 5, bz, bt: bz === null ? null : 6,
  windSource: source, magSource: "ACE",
});

describe("upstream research export", () => {
  it("retains observation and distinct estimated Earth-arrival timestamps", () => {
    const csv = measuredWindCsv([mk(1, 0)]);
    expect(csv).toContain("2026-11-17T20:01:00.000Z");
    expect(csv).toContain("2026-11-17T20:51:00.000Z"); // 1.5 million km / 500 km/s
    expect(csv).toContain("estimated_earth_arrival_utc");
    expect(csv).toContain("NOAA SWPC RTSW");
  });
  it("preserves absent Bz rather than manufacturing zeros", () => {
    const lines = measuredWindCsv([mk(2, null)]).trim().split("\r\n");
    const cols = lines[1]!.split(",");
    expect(cols[4]).toBe("");
    expect(cols[8]).toBe('"missing"');
    expect(lines[1]).not.toContain('"measured"');
  });
  it("escapes external spreadsheet formula strings and sorts rows", () => {
    const csv = measuredWindCsv([mk(2, -6, "=HYPERLINK(1)"), mk(1, 4)]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv.indexOf("20:01")).toBeLessThan(csv.indexOf("20:02"));
    expect(EXPORT_COLUMNS).toHaveLength(12);
  });
  it("filters invalid rows without substituting fake data", () => {
    const s = mk(3, null);
    s.v = NaN;
    expect(measuredWindCsv([s]).trim().split("\r\n")).toHaveLength(1);
  });
});
