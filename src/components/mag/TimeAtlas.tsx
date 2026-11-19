import { useMemo, useState } from "react";
import { Overlay } from "./ui";
import {
  DEEP_TIME_EVENTS, TEMPORAL_REGISTRY, dipoleAt, dipoleChanges, dipoleSeries,
  eventsAtMa, percentChange, temporalCsv, type DeepTimeEvent,
} from "@/lib/space/temporal";

type Mode = "modern" | "deep";
const W = 720, H = 184, PAD = 34;
const X = (y: number) => PAD + (y - 1900) / 130 * (W - PAD * 2);
const MOMENT = dipoleSeries();
const CHANGES = dipoleChanges();
const Y = (v: number) => 20 + (86 - v) / 12 * 140;
const maxRate = Math.max(...CHANGES.map(r => r.vectorNTPeryear)) * 1.13;
const yrFmt = (v: number) => String(v.toFixed(0));
const num = (v: number, digits = 2) => v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const fmtSource = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };

function saveCsv() {
  const url = URL.createObjectURL(new Blob([temporalCsv()], { type: "text/csv;charset=utf-8" }));
  try {
    const a = document.createElement("a"); a.href = url; a.download = "igrf14-dipole-1900-2030.csv"; a.click();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function DipoleGraph({ year, onYear }: { year: number; onYear: (v: number) => void }) {
  const observed = MOMENT.filter(m => m.year <= 2025);
  const pred = MOMENT.filter(m => m.year >= 2025);
  const pts = (a: typeof MOMENT) => a.map(p => `${X(p.year)},${Y(p.momentZAm2)}`).join(" ");
  return (
    <div className="time-chart-wrap">
      <svg className="time-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="IGRF-14 global dipole moment from 1900 to 2030, with vertical marker at 2012 and dashed forecast after 2025">
        <rect x={X(2025)} y={12} width={X(2030) - X(2025)} height={H - 28} className="time-forecast-zone"/>
        {[76,78,80,82,84].map(v => <g key={v}><line x1={PAD} x2={W - PAD} y1={Y(v)} y2={Y(v)} className="time-guide"/><text x={PAD-6} y={Y(v)+4} textAnchor="end" className="time-axis">{v}</text></g>)}
        {[1900,1925,1950,1975,2000,2012,2025,2030].map(v => <text key={v} x={X(v)} y={H-4} textAnchor="middle" className="time-axis">{v}</text>)}
        <line x1={X(2012)} x2={X(2012)} y1={12} y2={H-20} className="time-2012"/>
        <text x={X(2012)+5} y={23} className="time-annotation">2012</text>
        <polyline points={pts(observed)} className="time-series"/>
        <polyline points={pts(pred)} className="time-series time-prediction"/>
        <line x1={X(year)} x2={X(year)} y1={12} y2={H-20} className="time-selected"/>
        <circle cx={X(year)} cy={Y(dipoleAt(year).momentZAm2)} r={4} className="time-dot"/>
        <text x={PAD+3} y={11} className="time-axis">DIPOLE MOMENT · 10²¹ A m²</text>
        <text x={W-PAD-3} y={11} textAnchor="end" className="time-axis">DASHED = PREDICTED</text>
      </svg>
    </div>
  );
}

function ChangeGraph({ year }: { year: number }) {
  const top = 18, baseline = 122;
  const pts = CHANGES.map(p => ({
    x: X((p.start+p.end)/2), height: p.vectorNTPeryear / maxRate * (baseline-top), rate:p,
  }));
  return (
    <div className="time-chart-wrap">
      <svg className="time-chart time-chart-rate" viewBox={`0 0 ${W} 148`} role="img" aria-label="Magnitude of IGRF-14 five-year vector secular variation in nanotesla per year; not short-term storm volatility">
        {[0,20,40].map(v => <g key={v}><line className="time-guide" x1={PAD} x2={W-PAD} y1={baseline-v/maxRate*(baseline-top)} y2={baseline-v/maxRate*(baseline-top)} /><text className="time-axis" textAnchor="end" x={PAD-7} y={baseline-v/maxRate*(baseline-top)+3}>{v}</text></g>)}
        {pts.map(p => <rect key={p.rate.end} x={p.x-7} y={baseline-p.height} width={14} height={p.height} rx={2} className={p.rate.predicted ? "time-rate predicted" : "time-rate"}/>)}
        <line x1={X(year)} x2={X(year)} y1={top} y2={baseline} className="time-selected"/>
        <text x={PAD} y={11} className="time-axis">DIPOLE-VECTOR CHANGE · nT/YR (5-YR AVERAGES)</text>
        <text x={W-PAD} y={141} textAnchor="end" className="time-axis">NOT DAILY / SOLAR-STORM VOLATILITY</text>
      </svg>
    </div>
  );
}

function Modern({ coreYear, onYear }: { coreYear: number | null; onYear: (y: number | null) => void }) {
  const current = new Date().getUTCFullYear() + (Date.now() - Date.UTC(new Date().getUTCFullYear(),0,1)) / (Date.UTC(new Date().getUTCFullYear()+1,0,1) - Date.UTC(new Date().getUTCFullYear(),0,1));
  const year = coreYear ?? Math.min(2030, Math.max(1900, current));
  const val = dipoleAt(year);
  const changes = dipoleChanges();
  const window = changes.find(s => year > s.start && year <= s.end) ?? changes[0]!;
  const future = year > 2025;
  return (
    <section aria-label="IGRF-14 core field temporal explorer" className="time-model">
      <p className="ev-intro">A real global spatial field model at each year from <strong>1900 to 2030</strong>. IGRF-14 coefficients are specified at five-year epochs and linearly interpolated between them. Drag the year slider to change the South Atlantic Anomaly, internal field, dip poles and paths on the 3D globe.</p>
      <div className="time-kpis">
        <div><span>Selected model year</span><strong>{num(year, 1)}</strong><small>{val.evidence.replaceAll("-", " ")} IGRF-14</small></div>
        <div><span>Dipole moment</span><strong>{num(val.momentZAm2)} <small>ZAm²</small></strong><small>Magnitude of degree-1 Gauss coefficients</small></div>
        <div><span>1900 → 2025</span><strong>{num(percentChange(1900,2025), 2)}%</strong><small>Long-term decline; not uniformly regional</small></div>
      </div>
      <label className="time-slider-label" htmlFor="historic-core-year">Core-field reconstruction: <strong>{num(year, 1)}</strong> CE</label>
      <input id="historic-core-year" type="range" min="1900" max="2030" step="1" value={Math.round(year)}
        onChange={e => onYear(Number(e.target.value))} aria-label="Reconstruct core field for year between 1900 and 2030"/>
      <div className="time-range"><span>1900 · historic model</span><span>2025 · latest IGRF</span><span>2030 · forecast</span></div>
      <div className="time-actions">
        {[1900,1950,2000,2012,2025,2030].map(y => <button key={y} className={"chip"+(Math.round(year)===y?" time-active":"")} onClick={()=>onYear(y)}>{y}</button>)}
        <button className="btn" onClick={()=>onYear(null)}>↺ Current core field</button>
        <button className="btn" onClick={saveCsv}>↓ Download IGRF coefficients-derived CSV</button>
      </div>
      <h3>Magnetic strength: no special collapse after 2012</h3>
      <DipoleGraph year={year} onYear={y=>onYear(y)}/>
      <p className="time-explain">Dipole moment derived from `√(g₁⁰² + g₁¹² + h₁¹²)` with IGRF's geocentric reference radius, shown in ZAm² (10²¹ A·m²). <strong>2012 is simply an interpolated date.</strong> The long-term decline was already underway well before 2012; 2025–2030 is a prediction, not recorded history.</p>
      <h3>Change rate: five-year dipole-vector secular variation</h3>
      <ChangeGraph year={year}/>
      <p className="time-explain">The height of each bar is the five-year change in the three <em>dipole-vector</em> Gauss coefficients divided by five years ({num(window.vectorNTPeryear,1)} nT/year for {window.start}–{window.end}). It includes dipole orientation as well as strength. <strong>It does not measure daily geomagnetic-storm volatility, spatially averaged surface-field volatility, or a reversal probability.</strong></p>
      <p className="time-split"><strong>Two independent clocks:</strong> When you select an earlier core-field year, the globe displays the historic IGRF-14 core/SAA/poles, but the NOAA space-weather layers are temporarily hidden. They are restored with “Current core field” so the simulation never pretends to know 1900 solar wind.</p>
      {future && <p className="time-caveat">Forecast-only segment: 2025–2030 uses published IGRF-14 predictive secular variation. It is not a measured future magnetic field.</p>}
      <p className="caveat">Sources: <a href="https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field" target="_blank" rel="noreferrer">IAGA / NOAA IGRF-14 coefficients</a> and <a href="https://doi.org/10.1186/s40623-025-02360-0" target="_blank" rel="noreferrer">IGRF-14 technical description</a>. Historical (1900–1940) / DGRF definitive (1945–2020) / non-definitive (2020–2025) / predicted (2025–2030). The 3D globe does not reconstruct historical continents, cloud cover, auroral storms or Earth's atmosphere for past epochs.</p>
    </section>
  );
}

function GeologicBar({ age, setAge }: { age: number; setAge: (age: number) => void }) {
  return (
    <div className="deep-chart" role="group" aria-label="500 million years of selected palaeomagnetic evidence, not a continuous intensity curve">
      <div className="deep-chart-ticks">{[500,400,300,200,100,0].map(a=><span key={a}>{a} Ma</span>)}</div>
      <div className="deep-ribbon">
        {DEEP_TIME_EVENTS.filter(e=>e.fromMa>1).map(e=>{
          const left=(500-e.toMa)/5, width=(e.toMa-e.fromMa)/5;
          return <button key={e.id} type="button" title={e.label + ": "+e.fromMa+"–"+e.toMa+" Ma"} onClick={()=>setAge((e.fromMa+e.toMa)/2)}
            className={"deep-span "+e.marker} style={{left:left+"%",width:width+"%"}} aria-label={e.label + " interval"} />;
        })}
        <div className="deep-cursor" style={{left:(500-age)/5+"%"}} aria-hidden/>
      </div>
      <div className="deep-chart-key"><span><i className="deep-key-norm"/> Prolonged normal polarity</span><span><i className="deep-key-reverse"/> Prolonged reversed polarity</span><span><i className="deep-key-fast"/> Fast reversals</span></div>
    </div>
  );
}

function DeepTime() {
  const [age, setAge] = useState(100);
  const [selectedId, setSelectedId] = useState<string | null>("cretaceous");
  const focused = useMemo(()=>DEEP_TIME_EVENTS.find(e=>e.id===selectedId)||null,[selectedId]);
  const matching = eventsAtMa(age);
  const setYear = (v: number) => {setAge(v);setSelectedId(null)};
  const selectEvent = (e: DeepTimeEvent) => {setAge((e.fromMa+e.toMa)/2);setSelectedId(e.id)};
  const showing = focused ?? matching.find(e=>e.id!=="brunhes") ?? matching[0] ?? null;
  return (
    <section aria-label="500 million years palaeomagnetic time atlas" className="time-geologic">
      <p className="ev-intro">Earth's magnetic history goes vastly deeper than modern instruments. But here we show **documented magnetic polarity regimes**, not a fictional 500-million-year video or continuous strength graph. Individual rock measurements are sparse and vary in dating precision and reliability.</p>
      <div className="time-kpis"><div><span>Selected deep-time age</span><strong>{num(age,1)} <small>Ma</small></strong><small>Million years before present</small></div><div><span>Available model</span><strong>Evidence atlas</strong><small>Not a globe-wide intensity field</small></div><div><span>Oldest magnetic evidence</span><strong>~4.2 Ga</strong><small>Individual PINT rock estimates, not a continuous time series</small></div></div>
      <GeologicBar age={age} setAge={setYear} />
      <label className="time-slider-label" htmlFor="geologic-age">Scrub geological time: <strong>{num(age,1)} million years before present</strong></label>
      <input type="range" id="geologic-age" min="0" max="500" step="0.1" value={age} onChange={e=>setYear(Number(e.target.value))} aria-label="Geological age in millions of years before present"/>
      <div className="time-actions">{DEEP_TIME_EVENTS.filter(e=>e.fromMa>1).map(e=><button key={e.id} className={"chip"+(showing?.id===e.id?" time-active":"")} onClick={()=>selectEvent(e)}>{e.label}</button>)}</div>
      {showing ? <div className="deep-event"><span className="deep-event-period">~{showing.fromMa}–{showing.toMa} million years ago · {showing.evidence.replaceAll("-", " ")}</span><h3>{showing.label}</h3><strong>{showing.regime}</strong><p>{showing.summary}</p><p className="caveat">{showing.qualifier}</p><a href={showing.source} target="_blank" rel="noreferrer">Read the underlying research ↗</a></div>
        : <div className="deep-unknown"><strong>No reliable continuous global field model at {num(age,1)} Ma.</strong><p>This is an evidence gap, not evidence of a steady or zero magnetic field. The selected age may have individual local paleointensity measurements in published datasets; these cannot be converted into a trustworthy global movie without additional geochronology and modeling.</p></div>}
      <h3>What does civilization actually possess?</h3>
      <div className="time-sources">{TEMPORAL_REGISTRY.map(s=><div className="time-source" key={s.era}>
        <span className={"time-source-flag "+(s.active?"integrated":"linked")}>{s.active?"IN APP":"EXTERNAL SOURCE"}</span><div><b>{s.era}</b><small>{s.from} → {s.until} · {s.quality}</small><a href={s.url} rel="noreferrer" target="_blank">{s.source} ↗</a></div>
      </div>)}</div>
      <p className="time-split"><strong>Do not mix these quantities:</strong> a reversal-rate record is the frequency of north/south polarity changes, not an absolute intensity graph. Paleointensity samples represent local ancient rocks, with orientation/age and alteration uncertainties. They do not give us a coherent global field value at every age from 0–500 Ma.</p>
      <p className="caveat">Research reference points: <a href="https://doi.org/10.1029/2023JB027550" target="_blank" rel="noreferrer">superchron definitions</a>; <a href="https://doi.org/10.1029/2024JB030928" target="_blank" rel="noreferrer">Jurassic reversal rates</a>; <a href="https://doi.org/10.1093/gji/ggaf490" target="_blank" rel="noreferrer">2026 PINT v8.2.0 data compilation</a>. PINT dataset is curated externally; its rock records are not yet redistributed or plotted here.</p>
    </section>
  );
}

export default function TimeAtlas({ onClose, coreYear, onYear }: {onClose:()=>void;coreYear:number|null;onYear:(year:number|null)=>void}) {
  const [mode, setMode] = useState<Mode>("modern");
  return <Overlay title="Temporal Observatory · Earth's magnetic history" onClose={onClose} wide>
    <div className="ev-tabs time-tabs" role="tablist" aria-label="Magnetic history timescale">
      <button className={"btn"+(mode==="modern"?" active":"")} role="tab" aria-selected={mode==="modern"} onClick={()=>setMode("modern")}>1900–2030 · Magnetic field model</button>
      <button className={"btn"+(mode==="deep"?" active":"")} role="tab" aria-selected={mode==="deep"} onClick={()=>setMode("deep")}>0–500 million years · Deep-time evidence</button>
    </div>
    {mode==="modern"?<Modern coreYear={coreYear} onYear={onYear}/>:<DeepTime/>}
  </Overlay>;
}
