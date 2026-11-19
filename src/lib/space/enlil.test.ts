import { describe, expect, it } from "vitest";
import {
  cmeWindows, coverage, earthArrival, hindcastSkill, hourly, outlook, parseEnlil, standoffScenarios,
  type EnlilPoint,
} from "./enlil";
import { parseWind, shue } from "./model";
// Real NOAA products captured 2026-11-19 ~05:25 UTC. Enlil: every 10th sample of the full
// file (all fields kept). RTSW wind: active-source rows, every 2nd minute, unused fields removed.
import enlilFixture from "./fixtures/enlil-2026-11-19.json";
import windFixture from "./fixtures/rtsw-wind-2026-11-19.json";

const H = 3_600_000;
const now = Date.UTC(2026, 10, 19, 5);
const pt = (h: number, v: number, n: number, cloud = 0): EnlilPoint => ({ t: now + h * H, v, n, p: n * 1.6726e-6 * v * v, cloud, polarity: null });

describe("WSA–Enlil parsing (real NOAA file)", () => {
  const model = parseEnlil(enlilFixture);
  it("sorts newest-first NOAA rows into a validated ascending series", () => {
    expect(model).toHaveLength(enlilFixture.length);
    expect(model[0]!.t).toBeLessThan(model[1]!.t);
    expect(model[0]!.t).toBe(Date.UTC(2026, 10, 16, 18, 1, 14));
    const c = coverage(model, now);
    expect(Math.round(c.hoursPast)).toBe(59);
    expect(Math.round(c.hoursAhead)).toBe(109);
    expect(model.every(p => p.p > 0 && p.cloud >= 0 && p.cloud <= 1)).toBe(true);
  });
  it("finds the modelled CME material arriving around Nov 22, not before", () => {
    const wins = cmeWindows(model);
    expect(wins.length).toBeGreaterThanOrEqual(1);
    const main = wins.reduce((a, w) => (w.peakCloud > a.peakCloud ? w : a));
    expect(main.start).toBeGreaterThan(Date.UTC(2026, 10, 21, 12));
    expect(main.start).toBeLessThan(Date.UTC(2026, 10, 22, 6));
    expect(main.peakCloud).toBeGreaterThan(0.5);
    const o = outlook(model, now);
    expect(o.activeCme).toBeNull();
    expect(o.nextCme?.start).toBe(wins.find(w => w.start > now)!.start);
    expect(o.tightest.map(s => s.bz)).toEqual([0, -10]);
  });
  it("rejects malformed or implausible payloads instead of drawing them", () => {
    expect(() => parseEnlil({ rows: [] })).toThrow();
    expect(() => parseEnlil([{ time_tag: "2026-11-19T00:00:00", v_r: 400, earth_particles_per_cm3: 5 }])).toThrow(/too few/);
    const bad = Array.from({ length: 30 }, (_, i) => ({ time_tag: `2026-11-19T${String(i % 24).padStart(2, "0")}:00:00`, v_r: i === 0 ? 9000 : 400, earth_particles_per_cm3: 5, cloud: 0 }));
    expect(parseEnlil(bad).every(p => p.v === 400)).toBe(true);
  });
});

describe("hindcast skill: model vs measured L1 (real data)", () => {
  const model = parseEnlil(enlilFixture);
  const measured = parseWind(windFixture);
  it("matches an independent hour-by-hour calculation", () => {
    const s = hindcastSkill(model, measured, now)!;
    expect(s).not.toBeNull();
    expect(s.hours).toBe(23);
    // Independent Python check on the same fixtures: speed bias -85.16, density bias +4.25.
    expect(s.speedBias).toBeCloseTo(-85.16, 1);
    expect(s.speedMae).toBeCloseTo(85.16, 1);
    expect(s.densityBias).toBeCloseTo(4.25, 1);
    expect(s.end).toBeLessThanOrEqual(now);
  });
  it("uses estimated Earth arrival, and refuses to score thin overlap", () => {
    expect(earthArrival({ t: 0, v: 500 })).toBe(3_000_000);
    expect(hindcastSkill(model, measured.slice(-40), now)).toBeNull();
    expect(hindcastSkill(model, [], now)).toBeNull();
  });
});

describe("derived quantities", () => {
  it("hour bins average speed and density and keep the peak CME tracer", () => {
    const b = hourly([pt(0, 400, 4, 0.2), { ...pt(0, 600, 6, 0.5), t: now + 30 * 60_000 }]);
    expect(b).toHaveLength(1);
    expect(b[0]!.v).toBe(500);
    expect(b[0]!.n).toBe(5);
    expect(b[0]!.cloud).toBe(0.5);
  });
  it("merges tracer gaps under 3 h and splits longer ones", () => {
    const w = cmeWindows([pt(1, 400, 5, 0.02), pt(2, 500, 9, 0.3), pt(4, 450, 7, 0.05), pt(9, 420, 6, 0.04)]);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ start: now + H, end: now + 4 * H, peakCloud: 0.3, peakT: now + 2 * H, maxV: 500 });
  });
  it("magnetopause scenarios come straight from Shue (1998) at stated Bz", () => {
    const s = standoffScenarios(2);
    expect(s[0]!.r0).toBeCloseTo(shue(2, 0).r0, 10);
    expect(s[1]!.r0).toBeCloseTo(shue(2, -10).r0, 10);
    expect(s[1]!.r0).toBeLessThan(s[0]!.r0);
  });
});
