import { describe, expect, it } from "vitest";
import { assessHealth, coverage4h } from "./health";

describe("source freshness", () => {
  const now = Date.UTC(2026, 10, 17, 22, 0, 0);
  it("keeps measured age separate from last fetch", () => {
    const a = assessHealth({ now, observedAt: now - 7 * 60_000, maxAgeMs: 10 * 60_000 });
    expect(a).toEqual({ state: "current", ageMinutes: 7, observedAt: now - 7 * 60_000 });
    expect(assessHealth({ now, observedAt: now - 12 * 60_000, maxAgeMs: 10 * 60_000 }).state).toBe("stale");
  });
  it("marks missing or future observations without calling them live", () => {
    expect(assessHealth({ now, observedAt: null, maxAgeMs: 1000, failed: true }).state).toBe("disconnected");
    expect(assessHealth({ now, observedAt: null, maxAgeMs: 1000 }).state).toBe("loading");
    expect(assessHealth({ now, observedAt: now + 10 * 60_000, maxAgeMs: 1000 }).state).toBe("future");
  });
  it("counts unique measured minute buckets, and missing Bz as unmatched", () => {
    const points = [
      { t: now - 3 * 60_000, bz: 1 },
      { t: now - 3 * 60_000 + 1000, bz: 1 },
      { t: now - 2 * 60_000, bz: null },
      { t: now - 5 * 3_600_000, bz: 3 },
      { t: now + 3 * 60_000, bz: 4 },
    ];
    const s = coverage4h(points, now);
    expect(s.samples).toBe(3);
    expect(s.observedMinutes).toBe(2);
    expect(s.bzMatched).toBe(2);
    expect(s.bzMatchedPercentage).toBe(67);
    expect(s.percentage).toBe(1);
  });
  it("empty coverage never implies a zero reading", () => {
    const s = coverage4h([], now);
    expect(s.samples).toBe(0);
    expect(s.oldest).toBeNull();
    expect(s.bzMatchedPercentage).toBe(0);
  });
});
