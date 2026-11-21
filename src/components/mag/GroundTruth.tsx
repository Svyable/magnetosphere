import { useEffect, useMemo, useState } from "react";
import { GROUND_STATIONS, groundDataUrl, groundStats, parseGroundH, type GroundPoint, type GroundStation } from "@/lib/space/ground";

const utc = (n: number | null) => n === null ? "—" : new Date(n).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const signed = (n: number | null, digits = 1) => n === null ? "—" : (n > 0 ? "+" : "") + n.toFixed(digits) + " nT";

function paths(points: GroundPoint[]) {
  if (points.length < 2) return [] as string[];
  const t0 = points[0]!.t, t1 = points.at(-1)!.t, baseline = points[0]!.h;
  const offsets = points.map(p => p.h - baseline);
  const low = Math.min(0, ...offsets), high = Math.max(0, ...offsets), span = Math.max(10, high - low);
  const y = (h: number) => 224 - (h - baseline - low + span * .05) * (190 / (span * 1.1));
  const x = (t: number) => 28 + (t - t0) / Math.max(1, t1 - t0) * 844;
  const result: string[] = [];
  let d = "";
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const xy = x(p.t).toFixed(1) + "," + y(p.h).toFixed(1);
    if (i && p.t - points[i - 1]!.t > 3 * 60_000) {
      if (d) result.push(d);
      d = "M" + xy;
    } else d += (d ? " L" : "M") + xy;
  }
  if (d) result.push(d);
  return result;
}

function downloadCsv(station: GroundStation, points: GroundPoint[]) {
  if (!points.length) return;
  const content = "timestamp_utc,station,h_nT,delta_from_first_sample_nT\n" +
    points.map(p => [new Date(p.t).toISOString(), station, p.h, (p.h - points[0]!.h).toFixed(2)].join(",")).join("\n") + "\n";
  const url = URL.createObjectURL(new Blob([content], {type:"text/csv;charset=utf-8"}));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = "magnetosphere-usgs-ground-" + station.toLowerCase() + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1200); }
}

export default function GroundTruth({ now }: { now: number }) {
  const [station, setStation] = useState<GroundStation>("BOU");
  const [revision, setRevision] = useState(0);
  const [points, setPoints] = useState<GroundPoint[]>([]);
  const [url, setUrl] = useState("");
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const startedAt = Date.now();
    const source = groundDataUrl(station, startedAt);
    setLoading(true); setError(false); setPoints([]); setCursor(null); setFetchedAt(null); setUrl(source);
    void (async () => {
      try {
        const response = await fetch(source, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("USGS source unavailable");
        const parsed = parseGroundH(await response.json() as unknown, startedAt);
        if (!controller.signal.aborted) { setPoints(parsed); setFetchedAt(Date.now()); }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [station, revision]);

  const stats = useMemo(() => groundStats(points, now), [points, now]);
  const graph = useMemo(() => paths(points), [points]);
  const selected = cursor === null ? points.at(-1) ?? null : points[cursor] ?? null;
  const site = GROUND_STATIONS.find(s => s.code === station)!;
  return <section className="ground-truth" aria-label="USGS observed ground magnetometers">
    <div className="ground-lead">
      <span>EARTH RECEIPTS / WHAT THE GROUND ACTUALLY MEASURED</span>
      <h3>Space weather, measured underfoot.</h3>
      <p>Trace a real USGS magnetic observatory's one-minute horizontal field (H). These are <strong>ground observations</strong>—not L1 predictions, a storm score, or an artist's simulation.</p>
    </div>
    <div className="ground-stations" role="group" aria-label="Choose USGS observatory">
      {GROUND_STATIONS.map(s => <button className="btn" type="button" aria-pressed={station === s.code}
        key={s.code} onClick={() => setStation(s.code)}>{s.name}<small>{s.region} · {s.code}</small></button>)}
    </div>
    <div className="ground-meta"><strong>{site.name} ({station})</strong> · USGS variation data · 1-minute H · observation timestamps UTC
      <button className="btn" type="button" onClick={() => setRevision(n => n + 1)} disabled={loading}>Refresh station</button>
    </div>
    {loading && <p className="ground-empty" role="status">Requesting measured ground data directly from the USGS…</p>}
    {error && <p className="ground-empty" role="status"><strong>Ground readings unavailable.</strong> The USGS service may be down or may block cross-origin browser access. This says nothing about whether a magnetic storm is occurring. <a href={url} target="_blank" rel="noreferrer">Inspect the source directly ↗</a></p>}
    {!loading && !error && points.length < 2 && <p className="ground-empty" role="status">USGS did not return enough valid H measurements for this station and 24-hour window. No chart or disturbance value has been inferred. <a href={url} target="_blank" rel="noreferrer">Source ↗</a></p>}
    {!loading && !error && points.length >= 2 && <>
      <div className="ground-kpis">
        <div><span>Latest measured H</span><strong>{stats.last!.h.toFixed(1)} <small>nT</small></strong><small>{utc(stats.last!.t)} · {stats.fresh ? "recent" : "stale, not live"}</small></div>
        <div><span>Change since first sample</span><strong>{signed(stats.delta24)}</strong><small>Not a quiet-day baseline · not a storm index</small></div>
        <div><span>H range / latest 60 min</span><strong>{stats.range60 === null ? "Insufficient coverage" : stats.range60.toFixed(1) + " nT"}</strong><small>Raw max − min; not Kp, dB/dt or a hazard rating</small></div>
      </div>
      {!stats.fresh && <p className="ground-stale" role="status">This observatory's latest returned measurement is older than 20 minutes. The trace is historical context, not a current ground reading.</p>}
      <div className="ground-chart-wrap">
        <div className="ground-chart-heading"><span>H OFFSET · nT relative to first valid sample</span><span>{points.length} valid minutes · gaps preserved</span></div>
        <svg viewBox="0 0 900 246" preserveAspectRatio="none" role="img" aria-label={`Observed horizontal magnetic field at ${site.name}, ${points.length} samples; gaps of more than three minutes are not connected`} className="ground-chart">
          <line x1="28" y1="224" x2="872" y2="224" stroke="currentColor" strokeOpacity=".24" strokeDasharray="4 5"/>
          {graph.map((d,i) => <path key={i} d={d} fill="none" stroke="var(--cyan)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round"/>)}
        </svg>
        <div className="ground-time-axis"><span>{utc(points[0]!.t)}</span><span>{utc(stats.last!.t)}</span></div>
      </div>
      <label className="ground-scrub">Inspect an observed minute: <input type="range" min={0} max={points.length - 1} step={1} value={cursor ?? points.length - 1}
        onChange={e => setCursor(Number(e.target.value))} aria-label="Select a measured ground sample"/></label>
      <div className="ground-selected">{selected && <><strong>{utc(selected.t)}</strong><span>H {selected.h.toFixed(1)} nT</span><span>{signed(selected.h - points[0]!.h)} from first sample</span></>}</div>
      <div className="ground-actions">
        <button className="btn" type="button" onClick={() => downloadCsv(station, points)}>Download observed minute CSV</button>
        <a href={url} target="_blank" rel="noreferrer">Open exact USGS request ↗</a>
      </div>
    </>}
    <div className="ground-method">
      <strong>Ground truth is local, not a global storm diagnosis.</strong> The horizontal component H varies with latitude, local time, regular daily solar-driven currents, instrumental effects and disturbances. This 24-hour trace subtracts only its first valid sample for plotting; it is <em>not</em> quiet-day-corrected. A large swing is not automatically caused by the latest L1 event, nor can this trace yield a standardized local K or global Kp. Variation data are provisional and may be revised. Source fetch {utc(fetchedAt)} · last measurement {utc(stats.last?.t ?? null)} · <a href="https://www.usgs.gov/tools/web-service-geomagnetism-data" target="_blank" rel="noreferrer">USGS data service and methodology ↗</a>.
    </div>
  </section>;
}
