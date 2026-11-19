import { useEffect, useMemo, useState } from "react";
import { useEnlil, useWind } from "@/lib/space/data";
import {
  cmeWindows, coverage, earthArrival, ENLIL_INFO_URL, ENLIL_URL, hindcastSkill, hourly, outlook,
  standoffScenarios, type HourBin,
} from "@/lib/space/enlil";
import { fmtAgo, fmtUtc } from "./ui";

const H = 3_600_000;
const GEO_RE = 6.6;
const dayHour = (t: number) => new Date(t).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) + " UTC";
const day = (t: number) => new Date(t).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const signed = (v: number, d = 0) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);

interface Panel { key: "v" | "n" | "r"; label: string; unit: string; lo: number; hi: number }

export default function SolarWindAhead({ now }: { now: number }) {
  const q = useEnlil();
  const wind = useWind();
  const [hoverT, setHoverT] = useState<number | null>(null);
  // Narrow screens get a narrower drawing space so SVG text stays legible (not just scaled down).
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 740px)");
    const on = () => setNarrow(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const d = useMemo(() => {
    if (!q.data) return null;
    const pts = q.data.points;
    const model = hourly(pts);
    const obs = hourly(wind.data ?? [], earthArrival).filter(b => b.count >= 10);
    const cov = coverage(pts, now);
    const wins = cmeWindows(pts);
    const look = outlook(pts, now);
    const skill = wind.data ? hindcastSkill(pts, wind.data, now) : null;
    const r = (b: HourBin) => standoffScenarios(b.p);
    const vMax = Math.max(...model.map(b => b.v), ...obs.map(b => b.v));
    const vMin = Math.min(...model.map(b => b.v), ...obs.map(b => b.v));
    const nMax = Math.max(...model.map(b => b.n), ...obs.map(b => b.n));
    const panels: Panel[] = [
      { key: "v", label: "Speed", unit: "km/s", lo: Math.floor((vMin - 30) / 50) * 50, hi: Math.ceil((vMax + 30) / 50) * 50 },
      { key: "n", label: "Density", unit: "cm⁻³", lo: 0, hi: Math.ceil(nMax * 1.15) },
      { key: "r", label: "Magnetopause r₀", unit: "R_E", lo: 5, hi: 13 },
    ];
    return { model, obs, cov, wins, look, skill, panels, r };
  }, [q.data, wind.data, now]);

  const W = narrow ? 460 : 1000, PH = narrow ? 84 : 92, GAP = 22, TOP = 8;
  const height = TOP + 3 * PH + 2 * GAP + 26;
  const x = (t: number) => d ? ((t - d.cov.start) / (d.cov.end - d.cov.start)) * W : 0;
  const y = (p: Panel, i: number, v: number) => TOP + i * (PH + GAP) + PH - ((Math.min(p.hi, Math.max(p.lo, v)) - p.lo) / (p.hi - p.lo)) * PH;
  const line = (bins: HourBin[], f: (b: HourBin) => number, p: Panel, i: number) =>
    bins.reduce((s, b, k) => s + (k && b.t - bins[k - 1]!.t <= 2 * H ? "L" : "M") + x(b.t + H / 2).toFixed(1) + "," + y(p, i, f(b)).toFixed(1), "");

  const hover = d && hoverT !== null ? {
    m: d.model.find(b => b.t === Math.floor(hoverT / H) * H) ?? null,
    o: d.obs.find(b => b.t === Math.floor(hoverT / H) * H) ?? null,
  } : null;

  return (
    <section className="ops-section enlil" aria-label="WSA–Enlil modelled solar wind at Earth">
      <h3>Solar wind arriving at Earth · 7-day model</h3>
      <p className="forecast-explain">NOAA's <strong>WSA–Enlil</strong> run models the solar wind reaching Earth, including CMEs that forecasters have inserted. The left part of the chart is already in the past, so we lay NOAA's <strong>measured</strong> L1 plasma over it: you can see how well this run is doing before trusting what it says about the days ahead.</p>
      <p className="forecast-source-line">
        Model file updated {fmtUtc(q.data?.fileUpdatedAt)} · fetched {q.dataUpdatedAt ? fmtUtc(q.dataUpdatedAt) : "—"}
        {d ? ` · covers ${dayHour(d.cov.start)} → ${dayHour(d.cov.end)}` : ""}
        {" · "}<a href={ENLIL_INFO_URL} target="_blank" rel="noreferrer">about WSA–Enlil ↗</a> · <a href={ENLIL_URL} target="_blank" rel="noreferrer">data ↗</a>
      </p>
      {q.isError ? <p className="forecast-empty">NOAA's Enlil model output could not be loaded or validated; nothing is drawn in its place.</p>
        : !d ? <p className="forecast-empty">Loading NOAA's WSA–Enlil model output…</p>
        : <>
          <div className="forecast-overview enlil-cards">
            <div>
              <span>Modelled CME material at Earth</span>
              <strong>{d.look.activeCme ? "Now" : d.look.nextCme ? day(d.look.nextCme.start) : "None in run"}</strong>
              <small>{d.look.activeCme ? `In model until ${dayHour(d.look.activeCme.end)}`
                : d.look.nextCme ? `${dayHour(d.look.nextCme.start)} → ${dayHour(d.look.nextCme.end)} · peak tracer ${Math.round(d.look.nextCme.peakCloud * 100)}% · max ${Math.round(d.look.nextCme.maxV)} km/s`
                : "No inserted-CME tracer reaches Earth in this run"}</small>
            </div>
            <div>
              <span>Tightest magnetopause ahead</span>
              <strong>{d.look.tightest.length ? `${d.look.tightest[1]!.r0.toFixed(1)}–${d.look.tightest[0]!.r0.toFixed(1)} R_E` : "—"}</strong>
              <small>{d.look.maxP ? `At peak modelled pressure ${d.look.maxP.p.toFixed(1)} nPa (${dayHour(d.look.maxP.t)}), if Bz were −10 to 0 nT${d.look.tightest[1]!.r0 < GEO_RE ? " · would reach inside geosynchronous orbit" : ""}` : ""}</small>
            </div>
            <div>
              <span>Model check · last {d.skill ? d.skill.hours : 24} h</span>
              <strong>{d.skill ? `${signed(d.skill.speedBias)} km/s` : "Not enough overlap"}</strong>
              <small>{d.skill ? `Speed bias (model − measured), MAE ${d.skill.speedMae.toFixed(0)} km/s · density bias ${signed(d.skill.densityBias, 1)} cm⁻³ · peak pressure ×${d.skill.pressureRatio.toFixed(2)}` : "Needs ≥ 6 matched hours of measured L1 data"}</small>
            </div>
          </div>

          <div className="enlil-chart-wrap">
            <div className="enlil-readout" aria-live="polite">
              {hover && hoverT !== null ? <>
                <b>{dayHour(Math.floor(hoverT / H) * H)}</b>
                {hover.m ? <> · model {hover.m.v.toFixed(0)} km/s, {hover.m.n.toFixed(1)} cm⁻³, {hover.m.p.toFixed(2)} nPa · r₀ {d.r(hover.m)[1]!.r0.toFixed(1)}–{d.r(hover.m)[0]!.r0.toFixed(1)} R_E{hover.m.cloud >= 0.01 ? ` · CME tracer ${Math.round(hover.m.cloud * 100)}%` : ""}</> : " · no model value"}
                {hover.o && <> · <span className="enlil-measured-text">measured {hover.o.v.toFixed(0)} km/s, {hover.o.n.toFixed(1)} cm⁻³</span></>}
              </> : <span>Hover or drag across the chart to read values · UTC</span>}
            </div>
            <svg viewBox={`0 0 ${W} ${height}`} className="enlil-chart" role="img"
              aria-label={`WSA–Enlil modelled speed, density and magnetopause standoff from ${dayHour(d.cov.start)} to ${dayHour(d.cov.end)}, with measured L1 values overlaid on the past. ${d.wins.length} modelled CME interval(s).`}
              onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHoverT(d.cov.start + ((e.clientX - r.left) / r.width) * (d.cov.end - d.cov.start)); }}
              onPointerLeave={() => setHoverT(null)}>
              <rect x={0} y={0} width={Math.max(0, x(now))} height={height - 22} className="enlil-past" />
              {d.wins.map(w => <g key={w.start}>
                <rect x={x(w.start)} y={0} width={Math.max(2, x(w.end) - x(w.start))} height={height - 22} className="enlil-cme" />
                <text x={x(w.start) + 4} y={TOP + 10} className="enlil-cme-label">model CME {Math.round(w.peakCloud * 100)}%</text>
              </g>)}
              {d.panels.map((p, i) => <g key={p.key}>
                <line x1={0} x2={W} y1={TOP + i * (PH + GAP) + PH} y2={TOP + i * (PH + GAP) + PH} className="enlil-axis" />
                <text x={4} y={TOP + i * (PH + GAP) + 10} className="enlil-label">{p.label} · {p.unit}</text>
                <text x={W - 4} y={TOP + i * (PH + GAP) + 10} className="enlil-tick" textAnchor="end">{p.hi}</text>
                <text x={W - 4} y={TOP + i * (PH + GAP) + PH - 3} className="enlil-tick" textAnchor="end">{p.lo}</text>
                {p.key === "r" ? <>
                  <line x1={0} x2={W} y1={y(p, i, GEO_RE)} y2={y(p, i, GEO_RE)} className="enlil-geo" />
                  <text x={W - 34} y={y(p, i, GEO_RE) - 3} className="enlil-tick" textAnchor="end">GEO 6.6</text>
                  <path d={d.model.reduce((s, b, k) => s + (k ? "L" : "M") + x(b.t + H / 2).toFixed(1) + "," + y(p, i, d.r(b)[0]!.r0).toFixed(1), "") +
                    [...d.model].reverse().reduce((s, b) => s + "L" + x(b.t + H / 2).toFixed(1) + "," + y(p, i, d.r(b)[1]!.r0).toFixed(1), "") + "Z"} className="enlil-band" />
                  <path d={line(d.model, b => d.r(b)[0]!.r0, p, i)} className="enlil-model" />
                  <path d={line(d.model, b => d.r(b)[1]!.r0, p, i)} className="enlil-model enlil-south" />
                </> : <>
                  <path d={line(d.model, b => b[p.key as "v" | "n"], p, i)} className="enlil-model" />
                  <path d={line(d.obs, b => b[p.key as "v" | "n"], p, i)} className="enlil-measured" />
                </>}
              </g>)}
              <line x1={x(now)} x2={x(now)} y1={0} y2={height - 22} className="enlil-now" />
              <text x={x(now) + 4} y={height - 26} className="enlil-now-label">now</text>
              {Array.from({ length: 8 }, (_, k) => Math.ceil(d.cov.start / 86_400_000) * 86_400_000 + k * 86_400_000)
                .filter(t => t <= d.cov.end).map(t => <g key={t}>
                  <line x1={x(t)} x2={x(t)} y1={height - 22} y2={height - 16} className="enlil-axis" />
                  {(!narrow || Math.round((t - d.cov.start) / 86_400_000) % 2 === 0) && <text x={x(t)} y={height - 4} className="enlil-tick" textAnchor="middle">{narrow ? day(t).replace(/^[A-Za-z]+ /, "") : day(t)}</text>}
                </g>)}
              {hoverT !== null && <line x1={x(hoverT)} x2={x(hoverT)} y1={0} y2={height - 22} className="enlil-cursor" />}
            </svg>
            <div className="forecast-legend">
              <span><i className="enlil-key model" /> WSA–Enlil model</span>
              <span><i className="enlil-key measured" /> Measured at L1, shifted to Earth arrival</span>
              <span><i className="enlil-key band" /> r₀ if Bz = 0 (upper) to −10 nT (lower)</span>
              <span><i className="enlil-key cme" /> Model CME material ≥ 1%</span>
            </div>
          </div>
          <p className="caveat">
            <b>Not a Bz forecast.</b> Enlil does not model the magnetic field inside a CME, so the magnetopause is shown for two stated Bz values rather than predicted; the real boundary also depends on how southward the field turns. CME tracer timing comes from cones forecasters insert from coronagraph images and often misses by many hours (compare the CME arrival ensemble when it is available). The measured overlay covers the last {Math.round(((wind.data?.at(-1)?.t ?? now) - (wind.data?.[0]?.t ?? now)) / H)} h of NOAA real-time data. Model file updated {q.data?.fileUpdatedAt ? fmtAgo(Math.max(0, now - q.data.fileUpdatedAt)) : "at an unknown time"}; the model run time itself is not stated in this file.
          </p>
        </>}
    </section>
  );
}
