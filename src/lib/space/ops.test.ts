import { describe, expect, it } from "vitest";
import {
  highestIssuedG, opsStatus, parseAlerts, parseSwpcMessage, parseSwpcTime, parseThreeDayForecast,
  THREE_DAY_MAX_AGE_MS,
} from "./ops";
import alertsFixture from "./fixtures/alerts-2026-11-19.json";
import threeDayText from "./fixtures/3-day-forecast-2026-11-19.txt?raw";

// Real NOAA SWPC products captured 2026-11-19 ~03:50 UTC (unmodified subsets).
const alertsRaw = alertsFixture as unknown[];
const at = (d: number, h: number, m = 0, mo = 10) => Date.UTC(2026, mo, d, h, m);
const msg = (product_id: string, message: string) => ({ product_id, issue_datetime: "2026-11-19 05:00:00.000", message });

describe("NOAA SWPC message times", () => {
  it("reads every UTC format NOAA has used and rejects impossible dates", () => {
    expect(parseSwpcTime("2026 Nov 19 0118 UTC")).toBe(at(19, 1, 18));
    expect(parseSwpcTime("2001 Sep 30 1500")).toBe(Date.UTC(2001, 8, 30, 15));
    expect(parseSwpcTime("2026-05-19T07:01:00")).toBe(Date.UTC(2026, 4, 19, 7, 1));
    expect(parseSwpcTime("2026-05-20 06:00")).toBe(Date.UTC(2026, 4, 20, 6));
    expect(parseSwpcTime("2026 Feb 30 0100 UTC")).toBeNull();
    expect(parseSwpcTime("2026 Nov 19 2460 UTC")).toBeNull();
    expect(parseSwpcTime("yesterday")).toBeNull();
  });
});

describe("NOAA alerts, watches and warnings (real alerts.json)", () => {
  const msgs = parseAlerts(alertsRaw);

  it("classifies product kinds, scales, validity and extension links", () => {
    expect(msgs).toHaveLength(alertsRaw.length);
    const ext = msgs.find(m => m.serial === 5457)!;
    expect(ext.kind).toBe("warning");
    expect(ext.headline).toBe("EXTENDED WARNING: Geomagnetic K-index of 4 expected");
    expect(ext.extends).toBe(5456);
    expect(ext.validFrom).toBe(at(19, 0, 40));
    expect(ext.validTo).toBe(at(19, 9));
    const k5a = msgs.find(m => m.code === "ALTK05")!;
    expect(k5a.kind).toBe("alert");
    expect(k5a.scale).toBe("G1");
    expect(k5a.thresholdAt).toBe(at(19, 1, 5));
    const watch = msgs.find(m => m.code === "WATA20")!;
    expect(watch.kind).toBe("watch");
    expect(watch.watchDays).toEqual([
      { t: at(16, 0), level: null }, { t: at(17, 0), level: "G1" }, { t: at(18, 0), level: "G1" },
    ]);
    expect(msgs.find(m => m.code === "ALTTP2")!.beginAt).toBe(at(14, 21, 27));
  });

  it("puts only unexpired, un-superseded warnings in effect", () => {
    const s = opsStatus(msgs, at(19, 2));
    expect(s.warnings.map(w => w.code + "#" + w.serial)).toEqual(["WARK05#2276", "WARK04#5457"]);
    expect(highestIssuedG(s, at(19, 2))).toBe("G1");
    const later = opsStatus(msgs, at(19, 4));
    expect(later.warnings.map(w => w.serial)).toEqual([5457]); // K5 expired at 03:00; 5456 superseded
    expect(highestIssuedG(later, at(19, 4))).toBeNull(); // K4 warnings carry no G scale
    expect(opsStatus(msgs, at(19, 9, 1)).warnings).toEqual([]);
  });

  it("reports recent threshold alerts as events, not predictions", () => {
    const s = opsStatus(msgs, at(19, 4));
    expect(s.recentAlerts.map(a => a.code)).toEqual(["ALTK05", "ALTK04"]);
    expect(opsStatus(msgs, at(20, 4)).recentAlerts).toEqual([]);
  });

  it("keeps a watch only while its predicted days are today or later", () => {
    expect(opsStatus(msgs, at(17, 12)).watches.map(w => w.serial)).toEqual([1138]);
    expect(highestIssuedG(opsStatus(msgs, at(17, 12)), at(17, 12))).toBe("G1");
    expect(opsStatus(msgs, at(19, 4)).watches).toEqual([]);
  });

  it("honours cancellations, and a newer watch supersedes older ones", () => {
    const cancelWarn = msg("K04W", "Space Weather Message Code: WARK04\r\nSerial Number: 5458\r\nIssue Time: 2026 Nov 19 0500 UTC\r\n\r\nCANCEL WARNING: Geomagnetic K-index of 4 expected\nCancel Serial Number: 5457\nOriginal Issue Time: 2026 Nov 19 0118 UTC\r\n");
    const s = opsStatus(parseAlerts([...alertsRaw, cancelWarn]), at(19, 6));
    expect(s.warnings).toEqual([]);
    const cancelWatch = msg("A20F", "Space Weather Message Code: WATA20\r\nSerial Number: 1139\r\nIssue Time: 2026 Nov 16 0100 UTC\r\n\r\nCANCEL WATCH: Geomagnetic Storm Category G1 Predicted\nCancel Serial Number: 1138\nOriginal Issue Time: 2026 Nov 15 1334 UTC\nComment: Conditions no longer warrant watch.\r\n");
    expect(opsStatus(parseAlerts([...alertsRaw, cancelWatch]), at(17, 12)).watches).toEqual([]);
    const newer = msg("A30F", "Space Weather Message Code: WATA30\r\nSerial Number: 140\r\nIssue Time: 2026 Nov 16 1200 UTC\r\n\r\nWATCH: Geomagnetic Storm Category G2 Predicted\nHighest Storm Level Predicted by Day:\nNov 17:  G2 (Moderate)   Nov 18:  G1 (Minor)   Nov 19:  None (Below G1)   \nTHIS SUPERSEDES ANY/ALL PRIOR WATCHES IN EFFECT\r\n");
    const w = opsStatus(parseAlerts([...alertsRaw, newer]), at(17, 12));
    expect(w.watches.map(x => x.code)).toEqual(["WATA30"]);
    expect(highestIssuedG(w, at(17, 12))).toBe("G2");
  });

  it("rejects non-arrays and unrecognizable payloads instead of claiming all-clear", () => {
    expect(() => parseAlerts({ alerts: [] })).toThrow();
    expect(() => parseAlerts([{ foo: 1 }])).toThrow();
    expect(parseAlerts([])).toEqual([]);
    expect(parseSwpcMessage({ product_id: "X", message: "no code here" })).toBeNull();
  });
});

describe("NOAA 3-day forecast: S and R scales (real bulletin)", () => {
  it("reads dated S1+, R1–R2 and R3+ probabilities as separate scales", () => {
    const f = parseThreeDayForecast(threeDayText);
    expect(f.issuedAt).toBe(at(19, 0, 30));
    expect(f.days.map(d => d.t)).toEqual([at(19, 0), at(20, 0), at(21, 0)]);
    expect(f.days.map(d => d.s1)).toEqual([5, 1, 1]);
    expect(f.days.map(d => d.r12)).toEqual([25, 15, 15]);
    expect(f.days.map(d => d.r3)).toEqual([5, 5, 5]);
    expect(f.sRationale).toMatch(/^No S1 \(Minor\)/);
    expect(f.rRationale).toMatch(/R1-R2/);
    expect(THREE_DAY_MAX_AGE_MS).toBeLessThan(24 * 3_600_000);
  });

  it("handles a year boundary and rejects missing tables or issue time", () => {
    const yearEnd = threeDayText
      .replace(":Issued: 2026 Nov 19 0030 UTC", ":Issued: 2026 Dec 31 1230 UTC")
      .replace(/Nov 19-Nov 21 2026/g, "Dec 31-Jan 02 2027");
    expect(parseThreeDayForecast(yearEnd).days.map(d => d.t)).toEqual([Date.UTC(2026, 11, 31), Date.UTC(2027, 0, 1), Date.UTC(2027, 0, 2)]);
    expect(() => parseThreeDayForecast(threeDayText.replace(/^:Issued:.*$/m, ""))).toThrow(/issuance/);
    expect(() => parseThreeDayForecast(threeDayText.replace(/^R3 or greater.*$/m, ""))).toThrow(/R3/);
    expect(() => parseThreeDayForecast(threeDayText.replace("S1 or greater    5%", "S1 or greater  105%"))).toThrow();
  });
});
