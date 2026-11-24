import { useMemo } from "react";
import { useGeoelectricHour, useGeoelectricLatest, useGoesMag } from "@/lib/space/data";
import {
  EFIELD_IMPACTS_URL, EFIELD_INFO_URL, E_LEVELS, efieldBand, efieldColorT, efieldStats, NERC_BENCHMARK_MV_KM,
} from "@/lib/space/geoelectric";
import { GOES_MAG_URLS, isDayside, localTimeHours, satStatus, type GoesMagSample, type SatStatus } from "@/lib/space/goes-mag";
import { fmtAgo, fmtUtc, useNarrow } from "./ui";

const GEO_RE = 6.6;
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
const deg = (lat: number, lon: number) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
const mvkm = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} V/km` : `${v < 10 ? v.toFixed(1) : Math.round(v)} mV/km`);
const STATE_TEXT: Record<string, string> = {
  inside: "Inside the magnetosphere", "near-boundary": "Field near zero · close to the boundary",
  "possible-crossing": "Possible magnetopause crossing", nightside: "Nightside · not a magnetopause test", "no-data": "No current data",
};
// Published GOES-R operational slots (NOAA OSPO). Shown next to the SWPC feed's own value.
const OSPO_SLOT_W: Record<number, number> = { 19: 75.2, 18: 137.0 };

function rampColor(t: number) {
  const mix = (a: number[], b: number[], f: number) => a.map((v, i) => Math.round(v + (b[i]! - v) * f));
  const c = t < 0.6 ? mix([29, 59, 143], [255, 179, 71], t / 0.6) : mix([255, 179, 71], [255, 45, 85], (t - 0.6) / 0.4);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Equirectangular map of the CONUS grid; independent of the 3D globe so values are readable. */
function EMap({ points, max }: { points: { lon: number; lat: number; mag: number }[]; max: { lon: number; lat: number } }) {
  const narrow = useNarrow();
  const W = narrow ? 360 : 720, H = narrow ? 190 : 330;
  const lo0 = -125.5, lo1 = -66, la0 = 24.5, la1 = 49.5;
  const x = (lon: number) => ((lon - lo0) / (lo1 - lo0)) * W, y = (lat: number) => H - ((lat - la0) / (la1 - la0)) * H;
  const cw = (0.5 / (lo1 - lo0)) * W + 0.6, ch = (0.5 / (la1 - la0)) * H + 0.6;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="efield-map" role="img" aria-label={`Geoelectric field over the contiguous US; strongest at ${deg(max.lat, max.lon)}`}>
      {points.map((p, i) => <rect key={i} x={x(p.lon) - cw / 2} y={y(p.lat) - ch / 2} width={cw} height={ch} fill={rampColor(efieldColorT(p.mag))} />)}
      <circle cx={x(max.lon)} cy={y(max.lat)} r={narrow ? 6 : 8} className="efield-max-ring" />
      <text x={Math.min(W - 4, x(max.lon) + 10)} y={y(max.lat) - 8} className="efield-max-label" textAnchor={x(max.lon) > W * 0.7 ? "end" : "start"}>strongest</text>
    </svg>
  );
}

function Trace({ samples, statuses, now }: { samples: GoesMagSample[]; statuses: SatStatus[]; now: number }) {
  const narrow = useNarrow();
  const W = narrow ? 360 : 720, H = 150, t0 = now - 24 * 3_600_000;
  const lo = Math.min(-20, ...samples.map(s => s.hp)), hi = Math.max(160, ...samples.map(s => s.hp));
  const x = (t: number) => ((t - t0) / (now - t0)) * W, y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (H - 26);
  const colors = ["var(--cyan)", "var(--sun)"];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="goes-trace" role="img" aria-label="GOES Hp magnetic field over the last 24 hours with the zero line">
      {statuses.map((st, k) => {
        // shade each satellite's local daytime (06–18 LT) on its own row band
        const bands: [number, number][] = [];
        for (let t = t0; t < now; t += 600_000) if (isDayside(localTimeHours(t, st.lonWest))) {
          const last = bands.at(-1);
          if (last && last[1] === t) last[1] = t + 600_000; else bands.push([t, t + 600_000]);
        }
        return bands.map(([a, b]) => <rect key={st.sat + "-" + a} x={x(a)} y={H - 16 + k * 6} width={x(b) - x(a)} height={4} fill={colors[k]} opacity={0.45} />);
      })}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="goes-zero" />
      <text x={4} y={y(0) - 3} className="enlil-tick">Hp = 0 nT</text>
      <text x={4} y={14} className="enlil-tick">{Math.round(hi)} nT</text>
      {statuses.map((st, k) => {
        const pts = samples.filter(s => s.sat === st.sat && s.t >= t0);
        const d = pts.reduce((acc, s, i) => acc + (i && s.t - pts[i - 1]!.t <= 5 * 60_000 ? "L" : "M") + x(s.t).toFixed(1) + "," + y(s.hp).toFixed(1), "");
        return <path key={st.sat} d={d} fill="none" stroke={colors[k]} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

export default function GridGeo({ now, r0, onShowGrid, onShowGoes }: { now: number; r0: number | null; onShowGrid: () => void; onShowGoes: () => void }) {
  const ef = useGeoelectricLatest(true);
  const hour = useGeoelectricHour(ef.data?.index, true);
  const goes = useGoesMag(true);
  const stats = ef.data ? efieldStats(ef.data.map) : null;
  const statuses = useMemo(() => {
    if (!goes.data) return [];
    return [19, 18].filter(s => goes.data!.longitudes.has(s)).map(s => satStatus(goes.data!.samples, s, goes.data!.longitudes.get(s)!, now));
  }, [goes.data, now]);
  const mapAge = ef.data ? now - ef.data.map.t : 0;
  const dayInside = statuses.filter(s => s.state === "inside" || s.state === "near-boundary");
  const crossingNow = statuses.some(s => s.state === "possible-crossing");

  return (
    <div className="gridgeo">
      <p className="forecast-explain gridgeo-lede">Two NOAA products that almost no public site shows: the <strong>electric field that space weather is driving through the ground under the power grid right now</strong>, and the <strong>magnetometers on the GOES weather satellites</strong>, which measure directly whether the magnetopause has been pushed inside their orbit.</p>
      <div className="ev-tabs gridgeo-actions">
        <button type="button" className="btn" onClick={onShowGrid}>⚡ Grid field on the 3D globe →</button>
        <button type="button" className="btn" onClick={onShowGoes}>🛰 GOES in orbit on the 3D globe →</button>
      </div>

      <section className="ops-section" aria-label="Geoelectric field under the power grid">
        <h3>⚡ Power-grid geoelectric field · contiguous US · every minute</h3>
        <p className="forecast-source-line">
          Map {ef.data ? fmtUtc(ef.data.map.t) : "—"}{ef.data ? ` (${fmtAgo(Math.max(0, mapAge))})` : ""}{mapAge > 20 * 60_000 ? <b className="warn"> · stale map</b> : null} · fetched {ef.dataUpdatedAt ? fmtUtc(ef.dataUpdatedAt) : "—"} · NOAA SWPC + USGS, EMTF 3D model ·{" "}
          <a href={EFIELD_INFO_URL} target="_blank" rel="noreferrer">product ↗</a> · <a href={EFIELD_IMPACTS_URL} target="_blank" rel="noreferrer">why grids care ↗</a>
        </p>
        {ef.isError ? <p className="forecast-empty">NOAA's geoelectric map could not be loaded or validated. Nothing is drawn in its place, and this is not an all-clear.</p>
          : !stats || !ef.data ? <p className="forecast-empty">Loading NOAA's latest geoelectric map…</p>
          : <>
            <div className="forecast-overview">
              <div><span>Strongest field now</span><strong className={"efield-band-" + efieldBand(stats.max.mag)}>{mvkm(stats.max.mag)}</strong>
                <small>{deg(stats.max.lat, stats.max.lon)} · nearest magnetometer {stats.max.distKm !== null ? Math.round(stats.max.distKm) + " km" : "unknown"} · {efieldBand(stats.max.mag)}</small></div>
              <div><span>Typical across the grid</span><strong>{mvkm(stats.median)}</strong>
                <small>median · 95th percentile {mvkm(stats.p95)} · {stats.count.toLocaleString()} grid cells</small></div>
              <div><span>Cells above thresholds</span><strong>{stats.above.map(a => a.count).join(" / ")}</strong>
                <small>at ≥ {E_LEVELS.map(l => l).join(" / ")} mV/km · for scale, the NERC 1-in-100-year planning benchmark is {NERC_BENCHMARK_MV_KM / 1000} V/km</small></div>
            </div>
            <EMap points={ef.data.map.points} max={stats.max} />
            <div className="forecast-legend efield-legend">
              <span><i style={{ background: rampColor(0) }} /> ≤ 1 mV/km</span>
              <span><i style={{ background: rampColor(efieldColorT(45)) }} /> ~45</span>
              <span><i style={{ background: rampColor(efieldColorT(300)) }} /> ~300</span>
              <span><i style={{ background: rampColor(1) }} /> ≥ 2 V/km</span>
            </div>
            <h4 className="ops-sub">Last hour · strongest cell per sampled minute <span className="prov">model on measured inputs</span></h4>
            {hour.isPending ? <p className="forecast-empty">Loading seven maps across the last hour…</p>
              : hour.data ? <div className="efield-pulse" role="list">
                {hour.data.map(h => <div role="listitem" key={h.t} title={h.stats ? mvkm(h.stats.max.mag) : "map unavailable"}>
                  <i style={{ height: h.stats ? `${8 + 72 * efieldColorT(h.stats.max.mag)}px` : "3px", background: h.stats ? rampColor(efieldColorT(h.stats.max.mag)) : "var(--border)" }} />
                  <b>{h.stats ? mvkm(h.stats.max.mag) : "—"}</b>
                  <small>{new Date(h.t).toISOString().slice(11, 16)}</small>
                </div>)}
              </div> : <p className="forecast-empty">The last-hour maps could not be loaded.</p>}
            <p className="caveat">A <b>model built on measurements</b>: USGS/INTERMAGNET magnetometer variations combined with ground-conductivity transfer functions measured by the NSF EarthScope magnetotelluric survey. NOAA notes the maps still need validation against measured geoelectric fields and GIC. Accuracy falls with distance from the nearest magnetometer ({Math.round(stats.farShare * 100)}% of cells are ≥ 1000 km away). The induced current in any line also depends on its length, orientation and grounding, so a high field is not by itself an outage. The NERC benchmark uses a different reference Earth model and is shown only for scale.</p>
          </>}
      </section>

      <section className="ops-section" aria-label="GOES magnetometers at geosynchronous orbit">
        <h3>🛰 Is the magnetopause inside geosynchronous orbit? · GOES magnetometers</h3>
        <p className="forecast-source-line">
          {goes.data ? <>Latest {fmtUtc(Math.max(...statuses.map(s => s.latest?.t ?? 0)))} · fetched {fmtUtc(goes.dataUpdatedAt)}{goes.data.partial ? <b className="warn"> · one satellite feed unavailable</b> : null} · </> : null}
          <a href={GOES_MAG_URLS.info} target="_blank" rel="noreferrer">NOAA GOES magnetometer ↗</a>
        </p>
        {goes.isError ? <p className="forecast-empty">GOES magnetometer data could not be loaded. This is not an all-clear.</p>
          : !goes.data ? <p className="forecast-empty">Loading GOES-18 and GOES-19 magnetometers…</p>
          : <>
            <div className="forecast-overview">
              {statuses.map(s => <div key={s.sat} className={"goes-card goes-" + s.state}>
                <span>GOES-{s.sat} · {s.lonWest.toFixed(1)}°W{OSPO_SLOT_W[s.sat] && OSPO_SLOT_W[s.sat] !== s.lonWest ? ` (operational slot ${OSPO_SLOT_W[s.sat]}°W)` : ""}</span>
                <strong>{s.latest ? `Hp ${s.latest.hp.toFixed(0)} nT` : "—"}</strong>
                <small>{STATE_TEXT[s.state]} · local time {s.lt !== null ? hhmm(s.lt) : "—"} · lowest dayside Hp in 24 h {s.minDaysideHp !== null ? s.minDaysideHp.toFixed(0) + " nT" : "—"}{s.crossings.length ? ` · ${s.crossings.length} possible crossing${s.crossings.length > 1 ? "s" : ""}` : ""}</small>
              </div>)}
              <div><span>Model vs measurement</span>
                <strong>{r0 !== null ? `Shue r₀ ${r0.toFixed(1)} R_E` : "Model unavailable"}</strong>
                <small>{r0 === null ? "No current measured L1 driver"
                  : crossingNow && r0 >= GEO_RE ? "GOES measures a possible crossing while the model keeps GEO inside: the model is missing something"
                  : !crossingNow && r0 < GEO_RE && dayInside.length ? "Model puts the nose inside GEO, but dayside GOES still measures magnetospheric field (the nose sits near local noon; GOES may be away from it)"
                  : crossingNow ? "Both agree: the boundary reaches geosynchronous orbit"
                  : "Both agree: the magnetopause is outside geosynchronous orbit"}</small></div>
            </div>
            <Trace samples={goes.data.samples} statuses={statuses} now={now} />
            <div className="forecast-legend">
              {statuses.map((s, k) => <span key={s.sat}><i className="enlil-key" style={{ background: k ? "var(--sun)" : "var(--cyan)" }} /> GOES-{s.sat} Hp (bar below = its local daytime)</span>)}
            </div>
            {statuses.flatMap(s => s.crossings.map(c => ({ s, c }))).length > 0 && <ul className="ops-list">
              {statuses.flatMap(s => s.crossings.map(c => <li key={s.sat + "-" + c.start} className="ops-card ops-warning">
                <div className="ops-card-head"><span className="ops-kind">Possible crossing</span><span className="ops-code">GOES-{s.sat}</span></div>
                <p className="ops-times">{fmtUtc(c.start)} → {fmtUtc(c.end)} · {c.minutes} min · min Hp <b>{c.minHp.toFixed(0)} nT</b> · local time {hhmm(c.lt)}</p>
              </li>))}
            </ul>}
            <p className="caveat">Hp is the field component along Earth's spin axis measured at 6.6 R<sub>E</sub>. NOAA notes that dayside Hp dropping to near zero or below may mean the magnetopause has been compressed inside geosynchronous orbit. We flag a <b>possible crossing</b> only for ≥ 2 consecutive dayside (06–18 local time) minutes with Hp &lt; 0, excluding arcjet-thruster samples. Nightside dips are a different phenomenon (e.g. substorms) and are never counted. Longitudes come from NOAA SWPC's satellite list.</p>
          </>}
      </section>
    </div>
  );
}
