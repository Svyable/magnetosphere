import { describe, expect, it } from "vitest";
import { ccmcTime, cmeState, ensemble, memberErrors, members, parseCmeArchive, parseScoreboard, recentEvents } from "./ccmc";
// Values transcribed from CCMC's public prediction pages for the 2026-01-01T19:36Z CME.
import fixture from "./fixtures/ccmc-2026-01-01-cme.json";

const H = 3_600_000;
const T = (s: string) => ccmcTime(s)!;

describe("CCMC CME Scoreboard", () => {
  const [e] = parseScoreboard(fixture);
  it("parses events and keeps CCMC's own average out of the independent members", () => {
    expect(e!.id).toBe("2026-01-01T19:36:00-CME-001");
    expect(e!.arrivalAt).toBe(T("2026-01-04T20:41Z"));
    expect(e!.predictions).toHaveLength(3);
    expect(members(e!).map(p => p.method)).toEqual(["WSA-ENLIL + Cone (Met Office)", "CMEFM v.0.1"]);
  });
  it("summarizes the ensemble spread including each member's error bars", () => {
    const s = ensemble(e!)!;
    expect(s.n).toBe(2);
    expect(s.earliest).toBe(T("2026-01-04T12:00Z"));
    expect(s.latest).toBe(T("2026-01-04T21:23Z"));
    expect(s.median).toBe((T("2026-01-04T12:00Z") + T("2026-01-04T21:23Z")) / 2);
    expect(s.envelopeStart).toBe(T("2026-01-04T12:00Z") - 6 * H);
    expect(s.envelopeEnd).toBeCloseTo(T("2026-01-04T21:23Z") + 10.93 * H, -3);
    expect([s.kpLo, s.kpHi]).toEqual([4, 6]);
  });
  it("member errors agree with CCMC's published differences (CCMC sign = observed − predicted)", () => {
    const errs = memberErrors(e!);
    expect(errs.find(x => x.method.includes("Met Office"))!.errorH).toBeCloseTo(-8.68, 2);
    expect(errs.find(x => x.method.includes("CMEFM"))!.errorH).toBeCloseTo(0.70, 2);
    expect(errs.find(x => x.method.includes("Met Office"))!.leadH).toBeCloseTo(51.38, 2);
  });
  it("classifies incoming, arrived, overdue and no-arrival states", () => {
    expect(cmeState(e!, T("2026-01-03T00:00Z"))).toBe("arrived");
    const pending = { ...e!, arrivalAt: null };
    expect(cmeState(pending, T("2026-01-03T00:00Z"))).toBe("incoming");
    expect(cmeState(pending, T("2026-01-06T00:00Z"))).toBe("overdue");
    expect(cmeState({ ...pending, noArrivalObserved: true }, T("2026-01-03T00:00Z"))).toBe("no-arrival");
  });
  it("uses the newest submission when a method revises its call, and rejects bad rows", () => {
    const revised = parseScoreboard([{ ...fixture[0], predictions: [
      ...fixture[0]!.predictions,
      { ...fixture[0]!.predictions[0], submissionTime: "2026-01-03T09:00Z", predictedArrivalTime: "2026-01-04T18:00Z" },
      { ...fixture[0]!.predictions[0], predictedMethodName: "Bogus", predictedArrivalTime: "2025-12-31T00:00Z" },
    ] }])[0]!;
    expect(members(revised).find(p => p.method.includes("Met Office"))!.arrivalAt).toBe(T("2026-01-04T18:00Z"));
    expect(members(revised).some(p => p.method === "Bogus")).toBe(false);
    expect(() => parseScoreboard({})).toThrow();
    expect(ccmcTime("2026-02-30T00:00Z")).toBeNull();
    expect(recentEvents([e!], T("2026-03-01T00:00Z"))).toEqual([]);
  });
  it("round-trips the archive file and drops malformed archived events", () => {
    const file = JSON.parse(JSON.stringify({ fetchedAt: "2026-01-05T00:17:00.000Z", events: [e!, { id: 5 }] }));
    const a = parseCmeArchive(file);
    expect(a.fetchedAt).toBe(T("2026-01-05T00:17Z"));
    expect(a.events).toHaveLength(1);
    expect(ensemble(a.events[0]!)!.n).toBe(2);
    expect(() => parseCmeArchive({ events: [] })).toThrow();
  });
});
