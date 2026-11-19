// Hourly forecast archive (runs in GitHub Actions; see .github/workflows/forecast-archive.yml).
//
// Why: NOAA's rolling products overwrite themselves, so nobody can later check how good a
// forecast issued yesterday was. This keeps every *issued* version (by its own issue time or a
// content hash) and a CORS-free copy of NASA CCMC's CME Scoreboard for the site.
// The 72-hour Kp forecast and observed Kp are NOT collected here: they are owned by the
// forecast-ledger collector (scripts/collect-kp-ledger.ts), which also scores them. Each product is independent: one failure never blocks the others,
// and nothing is ever filled in for a product that failed.
//
// Usage: bun scripts/archive-forecasts.ts <archive-dir>
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FORECAST_URLS, parse27DayOutlook, parseGeomagBulletin } from "../src/lib/space/forecast";
import { OPS_URLS, parseAlerts, parseThreeDayForecast } from "../src/lib/space/ops";
import { cmeWindows, ENLIL_URL, hourly, parseEnlil } from "../src/lib/space/enlil";
import { CCMC_SCOREBOARD_API, CCMC_SCOREBOARD_API_LEGACY, parseScoreboard, recentEvents } from "../src/lib/space/ccmc";

const OUT = process.argv[2] ?? "archive";
const NOW = Date.now();

const stamp = (t: number) => new Date(t).toISOString().slice(0, 16).replace(/:/g, "") + "Z"; // 2026-11-19T0530Z
const dayPath = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "/");     // 2026/11/19
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

async function get(url: string, kind: "json" | "text", timeoutMs = 45_000) {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "magnetosphere-forecast-archive (github.com/Svyable/magnetosphere)" } });
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
    // The full response is several MB (date parameters are not honoured), so allow a long timeout.
    let source = CCMC_SCOREBOARD_API, body: unknown;
    try { ({ body } = await get(`${source}?closeOutCMEsOnly=false`, "json", 150_000)); }
    catch (e) {
      source = CCMC_SCOREBOARD_API_LEGACY;
      try { ({ body } = await get(`${source}?closeOutCMEsOnly=false`, "json", 150_000)); }
      catch { throw e; }
    }
    const all = parseScoreboard(body);
    const events = recentEvents(all, NOW, 45);
    const newest = all[0]?.observedAt ?? null;
    const content = JSON.stringify({ fetchedAt: new Date(NOW).toISOString(), source, windowDays: 45, newestCmeInSource: newest !== null ? new Date(newest).toISOString() : null, events });
    await put("latest/ccmc-cme.json", content);
    await snapshotIfChanged("ccmc-cme", `snapshots/ccmc-cme/${dayPath(NOW)}/${stamp(NOW)}.json`, content, wrote, JSON.stringify(events));
    return `${events.length} CMEs in the last 45 days from ${new URL(source).host}; newest in source ${newest !== null ? stamp(newest) : "none"}`;
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
    "- `snapshots/<product>/…` — every issued NOAA 3-day forecast, 3-day geomagnetic bulletin and 27-day outlook (named by their own issue time), WSA–Enlil hourly summaries (when the model content changes), CCMC CME Scoreboard snapshots, and all NOAA alerts/watches/warnings by month.",
    "- Kp forecasts and observed Kp live on the separate `forecast-ledger` branch, which also scores them.",
    "- `latest/` — newest copies for the website, plus `manifest.json` with per-product success/failure.",
    "",
    "Sources: NOAA SWPC (public domain) and NASA CCMC CME Scoreboard (public). Archive times are when this job fetched a product; issue times come from the products themselves.",
  ].join("\n") + "\n");
}
for (const r of results) console.log(`${r.ok ? "OK  " : "FAIL"} ${r.id.padEnd(15)} ${r.ok ? r.note ?? "" : r.error} ${r.wrote.length ? `(+${r.wrote.length} file${r.wrote.length > 1 ? "s" : ""})` : ""}`);
if (results.every(r => !r.ok)) process.exit(1);
