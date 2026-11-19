// Hourly forecast archive (runs in GitHub Actions; see .github/workflows/forecast-archive.yml).
//
// Why: NOAA's rolling products overwrite themselves, so nobody can later check how good a
// forecast issued yesterday was. This keeps every *issued* version (by its own issue time or a
// content hash), plus observed Kp to verify against, and a CORS-free copy of NASA CCMC's CME
// Scoreboard for the site. Each product is independent: one failure never blocks the others,
// and nothing is ever filled in for a product that failed.
//
// Usage: bun scripts/archive-forecasts.ts <archive-dir>
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FORECAST_URLS, parse27DayOutlook, parseGeomagBulletin, parseKpForecast } from "../src/lib/space/forecast";
import { OPS_URLS, parseAlerts, parseThreeDayForecast } from "../src/lib/space/ops";
import { cmeWindows, ENLIL_URL, hourly, parseEnlil } from "../src/lib/space/enlil";
import { CCMC_SCOREBOARD_API, parseScoreboard, recentEvents } from "../src/lib/space/ccmc";
import { parseKp } from "../src/lib/space/model";

const OUT = process.argv[2] ?? "archive";
const NOW = Date.now();
const KP_OBSERVED_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

const stamp = (t: number) => new Date(t).toISOString().slice(0, 16).replace(/:/g, "") + "Z"; // 2026-11-19T0530Z
const dayPath = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "/");     // 2026/11/19
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

async function get(url: string, kind: "json" | "text") {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45_000), headers: { "user-agent": "magnetosphere-forecast-archive (github.com/Svyable/magnetosphere)" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return { body: kind === "json" ? await r.json() : await r.text(), lastModified: Date.parse(r.headers.get("last-modified") ?? "") };
    } catch (e) { last = e; await new Promise(res => setTimeout(res, 1500 * (i + 1))); }
  }
  throw last;
}
async function put(rel: string, data: string) {
  const p = join(OUT, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, data);
  return rel;
}
async function readJson<T>(rel: string): Promise<T | null> {
  try { return JSON.parse(await readFile(join(OUT, rel), "utf8")) as T; } catch { return null; }
}
/** Write a snapshot only when the content differs from the previous one. */
async function snapshotIfChanged(id: string, rel: string, content: string, wrote: string[], hashOf = content) {
  const state = (await readJson<Record<string, string>>("latest/hashes.json")) ?? {};
  const h = sha(hashOf);
  if (state[id] === h) return false;
  wrote.push(await put(rel, content));
  state[id] = h;
  await put("latest/hashes.json", JSON.stringify(state, null, 1));
  return true;
}
/** Issue-dated products: one file per NOAA issue time; never overwritten. */
async function issued(dir: string, issuedAt: number, ext: string, content: string, wrote: string[]) {
  const rel = `snapshots/${dir}/${stamp(issuedAt)}.${ext}`;
  if (!existsSync(join(OUT, rel))) wrote.push(await put(rel, content));
}

type Result = { id: string; ok: boolean; wrote: string[]; note?: string; error?: string };
const jobs: Record<string, (wrote: string[]) => Promise<string | void>> = {
  async "kp-forecast"(wrote) {
    const { body } = await get(FORECAST_URLS.kp, "json");
    const slots = parseKpForecast(body);
    const content = JSON.stringify({ fetchedAt: new Date(NOW).toISOString(), source: FORECAST_URLS.kp, note: "No issue time in this product; fetchedAt is the archive time.", slots });
    await put("latest/kp-forecast.json", content);
    // Hash only the slot values so a refetch of identical content is not a new forecast version.
    await snapshotIfChanged("kp-forecast", `snapshots/kp-forecast/${dayPath(NOW)}/${stamp(NOW)}.json`, content, wrote, JSON.stringify(slots));
    return `${slots.filter(s => s.status === "predicted").length} predicted slots`;
  },
  async "3-day-forecast"(wrote) {
    const { body } = await get(OPS_URLS.threeDay, "text");
    const f = parseThreeDayForecast(body as string);
    await issued("3-day-forecast", f.issuedAt, "txt", body as string, wrote);
    return "issued " + stamp(f.issuedAt);
  },
  async "3-day-geomag"(wrote) {
    const { body } = await get(FORECAST_URLS.geomag, "text");
    const b = parseGeomagBulletin(body as string);
    await issued("3-day-geomag", b.issuedAt, "txt", body as string, wrote);
    return "issued " + stamp(b.issuedAt);
  },
  async "27-day-outlook"(wrote) {
    const { body } = await get(FORECAST_URLS.outlook, "text");
    const o = parse27DayOutlook(body as string);
    await issued("27-day-outlook", o.issuedAt, "txt", body as string, wrote);
    return "issued " + stamp(o.issuedAt);
  },
  async "enlil"(wrote) {
    const { body, lastModified } = await get(ENLIL_URL, "json");
    const pts = parseEnlil(body);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const summary = JSON.stringify({
      fileUpdatedAt: Number.isFinite(lastModified) ? new Date(lastModified).toISOString() : null,
      fetchedAt: new Date(NOW).toISOString(), source: ENLIL_URL,
      note: "Hourly means of NOAA WSA-Enlil at Earth. Model run time is not stated in the source file.",
      hourly: hourly(pts).map(b => [new Date(b.t).toISOString().slice(0, 13), r1(b.v), r1(b.n), Math.round(b.p * 100) / 100, Math.round(b.cloud * 1000) / 1000]),
      columns: ["hourUTC", "v_kms", "n_cm3", "p_nPa", "cloudMax"],
      cmeWindows: cmeWindows(pts).map(w => ({ start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString(), peakCloud: r1(w.peakCloud * 100) / 100, maxV: r1(w.maxV) })),
    });
    await put("latest/enlil-summary.json", summary);
    // NOAA rewrites this file every few minutes with an unchanged run; snapshot only when the model content changes.
    const parsed = JSON.parse(summary) as { hourly: unknown; cmeWindows: unknown };
    await snapshotIfChanged("enlil", `snapshots/enlil/${dayPath(NOW)}/${stamp(NOW)}.json`, summary, wrote, JSON.stringify([parsed.hourly, parsed.cmeWindows]));
    return `${pts.length} samples, file updated ${Number.isFinite(lastModified) ? stamp(lastModified) : "unknown"}`;
  },
  async "kp-observed"(wrote) {
    const { body } = await get(KP_OBSERVED_URL, "json");
    const rows = parseKp(body);
    const byMonth = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const m = new Date(r.t).toISOString().slice(0, 7);
      if (!byMonth.has(m)) byMonth.set(m, (await readJson<Record<string, number>>(`observed/kp/${m}.json`)) ?? {});
      byMonth.get(m)![new Date(r.t).toISOString().slice(0, 13)] = r.kp; // latest NOAA value wins (estimates get finalised)
    }
    for (const [m, v] of byMonth) {
      const sorted = Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
      await snapshotIfChanged("kp-observed-" + m, `observed/kp/${m}.json`, JSON.stringify(sorted, null, 0), wrote);
    }
    return `${rows.length} observed 3-hour values merged`;
  },
  async "alerts"(wrote) {
    const { body } = await get(OPS_URLS.alerts, "json");
    const msgs = parseAlerts(body);
    await put("latest/alerts.json", JSON.stringify(body));
    // NOAA's list only spans ~30 days; keep every message permanently, keyed by code#serial.
    const byMonth = new Map<string, Record<string, unknown>>();
    for (const m of msgs) {
      const mo = new Date(m.issuedAt).toISOString().slice(0, 7);
      if (!byMonth.has(mo)) byMonth.set(mo, (await readJson<Record<string, unknown>>(`snapshots/alerts/${mo}.json`)) ?? {});
      byMonth.get(mo)![`${m.code}#${m.serial}`] = { issuedAt: new Date(m.issuedAt).toISOString(), productId: m.productId, message: m.text };
    }
    for (const [mo, v] of byMonth) await snapshotIfChanged("alerts-" + mo, `snapshots/alerts/${mo}.json`, JSON.stringify(v, null, 1), wrote);
    return `${msgs.length} messages`;
  },
  async "ccmc-cme"(wrote) {
    const start = new Date(NOW - 45 * 86_400_000).toISOString().slice(0, 10);
    const { body } = await get(`${CCMC_SCOREBOARD_API}?closeOutCMEsOnly=false&startDate=${start}`, "json");
    const events = recentEvents(parseScoreboard(body), NOW, 45);
    const content = JSON.stringify({ fetchedAt: new Date(NOW).toISOString(), source: CCMC_SCOREBOARD_API, windowDays: 45, events });
    await put("latest/ccmc-cme.json", content);
    await snapshotIfChanged("ccmc-cme", `snapshots/ccmc-cme/${dayPath(NOW)}/${stamp(NOW)}.json`, content, wrote, JSON.stringify(events));
    return `${events.length} CMEs in the last 45 days`;
  },
};

const results: Result[] = [];
for (const [id, job] of Object.entries(jobs)) {
  const wrote: string[] = [];
  try { const note = await job(wrote); results.push({ id, ok: true, wrote, ...(note ? { note } : {}) }); }
  catch (e) { results.push({ id, ok: false, wrote, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }); }
}
await put("latest/manifest.json", JSON.stringify({ updatedAt: new Date(NOW).toISOString(), results }, null, 1));
if (!existsSync(join(OUT, "README.md"))) {
  await put("README.md", [
    "# Magnetosphere forecast archive",
    "",
    "Written hourly by `.github/workflows/forecast-archive.yml` on `main`. Do not edit by hand.",
    "",
    "- `snapshots/<product>/…` — every issued NOAA forecast (named by its own issue time), Kp forecast versions (by content change), WSA–Enlil hourly summaries (when the model content changes), CCMC CME Scoreboard snapshots, and all NOAA alerts/watches/warnings by month.",
    "- `observed/kp/<YYYY-MM>.json` — observed/estimated planetary Kp to verify forecasts against (NOAA's latest value wins as estimates are finalised).",
    "- `latest/` — newest copies for the website, plus `manifest.json` with per-product success/failure.",
    "",
    "Sources: NOAA SWPC (public domain) and NASA CCMC CME Scoreboard (public). Archive times are when this job fetched a product; issue times come from the products themselves.",
  ].join("\n") + "\n");
}
for (const r of results) console.log(`${r.ok ? "OK  " : "FAIL"} ${r.id.padEnd(15)} ${r.ok ? r.note ?? "" : r.error} ${r.wrote.length ? `(+${r.wrote.length} file${r.wrote.length > 1 ? "s" : ""})` : ""}`);
if (results.every(r => !r.ok)) process.exit(1);
