import { describe, expect, it } from "vitest";
import { AUDIT_SPECS, summarizePayload, evaluateJson, failedAudit } from "./feed-audit";
const t = Date.UTC(2026, 10, 17, 22, 0, 0);
const spec = (id: typeof AUDIT_SPECS[number]["id"]) => AUDIT_SPECS.find(s => s.id === id)!;
describe("public feed audit: deterministic payload parsing", () => {
  it("understands NOAA L1 wind header arrays and marks source clocks", () => {
    const data = [["time_tag","proton_speed","proton_density"],["2026-11-17 21:53:00.000","420","6.2"]];
    const a = evaluateJson(spec("wind"), data, t);
    expect(a.validCount).toBe(1);
    expect(a.status).toBe("current");
    expect(a.ageMinutes).toBe(7);
    expect(a.acquiredAt).toBe(t - 7 * 60_000);
  });
  it("detects NOAA schema change despite HTTP 200", () => {
    const a = evaluateJson(spec("mag"), { changed: "field names" }, t);
    expect(a.status).toBe("schema-error");
    expect(a.acquiredAt).toBeNull();
  });
  it("treats OVATION no-aurora grid as valid forecast input when dated", () => {
    const a = evaluateJson(spec("ovation"), { "Observation Time":"2026-11-17T21:50:00Z","Forecast Time":"2026-11-17T22:20:00Z","coordinates":[] }, t);
    expect(a.status).toBe("current");
    expect(a.validCount).toBe(0);
    expect(a.forecastFor).toBe(t + 20 * 60_000);
  });
  it("EPIC is an image released with a delay, never an instantaneous measurement", () => {
    const a = evaluateJson(spec("epic"), [{ image:"epic_1b_20261114010000",date:"2026-11-14 01:00:00" }], t);
    expect(a.status).toBe("released");
    expect(a.note).toMatch(/never a live image/);
    expect(a.ageMinutes).toBeGreaterThan(3 * 24 * 60);
  });
  it("classifies unreachable source as runner check failure, not global outage", () => {
    const a = failedAudit(spec("wind"), t, "Network timeout");
    expect(a.status).toBe("disconnected");
    expect(a.note).toMatch(/not a claim/);
  });
  it("rejects zero-length GOES X-ray and parses measured long band", () => {
    expect(summarizePayload("xray", [{ time_tag:"2026-11-17T21:59:00Z",energy:"0.1-0.8nm",flux:0,satellite:19 }]).newest).toBeNull();
    expect(summarizePayload("xray", [{ time_tag:"2026-11-17T21:59:00Z",energy:"0.1-0.8nm",flux:1.2e-6,satellite:19 }]).count).toBe(1);
  });
});
