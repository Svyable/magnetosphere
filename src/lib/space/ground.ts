/** USGS 1-minute ground H measurements; not a K index, storm grade or forecast. */
export const GROUND_STATIONS = [
  { code: "BOU", name: "Boulder", region: "Colorado" },
  { code: "FRD", name: "Fredericksburg", region: "Virginia" },
  { code: "SIT", name: "Sitka", region: "Alaska" },
  { code: "HON", name: "Honolulu", region: "Hawaii" },
] as const;
export type GroundStation = (typeof GROUND_STATIONS)[number]["code"];
export type GroundPoint = { t: number; h: number };

export function groundDataUrl(station: GroundStation, now: number): string {
  if (!GROUND_STATIONS.some((s) => s.code === station) || !Number.isFinite(now)) throw new Error("Invalid USGS request");
  const end = Math.floor(now / 60_000) * 60_000;
  const q = new URLSearchParams({
    id: station,
    elements: "H",
    sampling_period: "60",
    type: "variation",
    format: "json",
    starttime: new Date(end - 24 * 3600_000).toISOString().replace(".000Z", "Z"),
    endtime: new Date(end).toISOString().replace(".000Z", "Z"),
  });
  return "https://geomag.usgs.gov/ws/data/?" + q.toString();
}

/** Reject malformed payloads, element mix-ups, future readings and missing-value sentinels. */
export function parseGroundH(input: unknown, now: number): GroundPoint[] {
  if (!input || typeof input !== "object" || !Number.isFinite(now)) throw new Error("Invalid ground data");
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj["times"]) || !Array.isArray(obj["values"]) || obj["times"].length > 2000) throw new Error("Unexpected USGS response");
  const metadata = obj["metadata"] as Record<string, unknown> | undefined;
  if (metadata?["status"] !== undefined && String(metadata["status"]) !== "200") throw new Error("USGS source error");
  const hChannel = obj["values"].find((v: unknown) => {
    if (!v || typeof v !== "object") return false;
    const meta = (v as Record<string, unknown>)["metadata"] as Record<string, unknown> | undefined;
    return meta?["element"] === "H";
  }) as { values?: unknown } | undefined;
  if (!hChannel || !Array.isArray(hChannel["values"]) || hChannel["values"].length !== obj["times"].length) throw new Error("Missing H channel");
  const points: GroundPoint[] = [];
  for (let i = 0; i < obj["times"].length; i++) {
    const ts = obj["times"][i];
    const value = hChannel["values"][i];
    if (typeof ts !== "string" || typeof value !== "number" || !Number.isFinite(value)) continue;
    const t = Date.parse(ts);
    // Horizontal intensity in nT. The USGS missing-value sentinels are excluded.
    if (!Number.isFinite(t) || t > now + 120_000 || t < now - 24 * 3600_000 - 60_000 || value <= 0 || value >= 80_000) continue;
    points.push({ t, h: value });
  }
  points.sort((a, b) => a.t - b.t);
  return points.filter((p, i) => i === 0 || p.t !== points[i - 1]!.t);
}

export function groundStats(points: GroundPoint[], now: number) {
  const last = points.at(-1) ?? null;
  const first = points[0] ?? null;
  const fresh = !!last && last.t <= now + 120_000 && now - last.t <= 20 * 60_000;
  // A measured one-hour range, not the locally calibrated K index.
  const recent = last ? points.filter(p => p.t >= last.t - 60 * 60_000) : [];
  const coverage = recent.length > 1 && recent.at(-1)!.t - recent[0]!.t >= 45 * 60_000;
  return {
    last, fresh, count: points.length,
    delta24: first && last ? last.h - first.h : null,
    range60: coverage && recent.length >= 35 ? Math.max(...recent.map(p => p.h)) - Math.min(...recent.map(p => p.h)) : null,
  };
}
