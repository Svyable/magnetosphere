import { useMemo } from "react";
import { incomingOutlook, incomingCsv, INCOMING_HORIZON_MINUTES } from "@/lib/space/incoming";
import type { L1Sample } from "@/lib/space/model";
import { fmtAgo, fmtUtcS } from "./ui";

interface Props {
  now: number;
  samples: L1Sample[];
  previewedAt: number | null;
  onPreview: (sample: L1Sample | null) => void;
  onClose: () => void;
}
function num(x:number|null, digits=1) { return x===null ? "—" : x.toFixed(digits); }
function time(t:number) {return new Date(t).toISOString().slice(11,16)+" UTC";}
function download(text:string) {
  const url=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
  try {
    const a=document.createElement("a");
    a.href=url; a.download="magnetosphere-incoming-l1-"+new Date().toISOString().slice(0,10)+".csv";
    a.click();
  } finally {window.setTimeout(()=>URL.revokeObjectURL(url),1500);}
}

/** Scientific visualization of *measured upstream* plasma after flat-delay advection.
 * No forecasted Bz or predicted 3D magnetosphere is manufactured.
 */
export default function IncomingConditions({ now,samples,previewedAt,onPreview,onClose }:Props) {
  const o=useMemo(()=>incomingOutlook(samples,now),[samples,now]);
  const first=o.pulses[0]??null;
  const isFresh=o.freshness==="current";
  const maxP=Math.max(5,o.maximumPressureNPa??0);
  return <section className="incoming" aria-label="Incoming measured solar wind, estimated Earth arrival">
    <div className="incoming-identity">
      <div><span className="incoming-eyebrow">NOAA L1 / INCOMING EARTH CONDITIONS</span><h3>Measured upstream. Not yet at Earth.</h3></div>
      <span className={"incoming-status incoming-"+o.freshness}>{o.freshness==="current"?"L1 CURRENT":o.freshness==="stale"?"L1 STALE":"L1 UNAVAILABLE"}</span>
    </div>
    <p className="forecast-explain">An upstream spacecraft measures each plasma and magnetic-field sample; we shift it by <strong>1.5 million km ÷ measured solar-wind speed</strong> to estimate arrival at Earth. This gives a short-horizon *advection scenario*—not an independently issued NOAA forecast, a guaranteed arrival time, or an MHD simulation.</p>
    <div className="incoming-kpis">
      <div><span>Next nominal arrival</span><strong>{first ? "in "+num(first.leadMinutes,0)+" min" : "—"}</strong><small>{first ? fmtUtcS(first.arrivalAt) : "No unarrived valid samples"}</small></div>
      <div><span>Lowest incoming Bz · measured</span><strong>{num(o.minimumBz)} <small>nT</small></strong><small>{o.minimumBz===null?"No matched IMF Bz; no assumption of zero":o.minimumBz < 0?"Southward values may enhance reconnection":"No southward values in available window"}</small></div>
      <div><span>Smallest modeled nose · Shue</span><strong>{num(o.lowestModeledNoseRE,2)} <small>Rₑ</small></strong><small>{o.currentModeledNoseRE===null?"Current model reference unavailable":"Current modeled nose "+num(o.currentModeledNoseRE,2)+" Rₑ"}</small></div>
    </div>
    <p className="forecast-source-line">
      Last L1 measurement {fmtUtcS(o.latestObservationAt)}{o.latestObservationAt ? " · "+fmtAgo(Math.max(0,now-o.latestObservationAt))+" old":""} · {o.sampledCount} valid unarrived 1-min samples · display compressed into nominal 5-min groups
    </p>
    {o.freshness!=="current" && <div className="incoming-notice" role="status">The latest L1 observation is {o.freshness==="missing"?"unavailable":"too old for a current look-ahead"}. Past samples may remain below for context, but future 3D preview is disabled. A stale input is not an all-clear.</div>}
    {o.pulses.length>0 ? <>
      <div className="incoming-plot" role="img" aria-label={"Estimated Earth-arrival pulses from the measured upstream feed, color-coded by measured Bz. First "+time(first!.arrivalAt)+", last "+time(o.pulses[o.pulses.length-1]!.arrivalAt)+". Pressure bar heights are relative only; exact values are listed below."}>
        <div className="incoming-plot-lines">
          {o.pulses.map(p=> <div key={p.observedAt} className={"incoming-pulse "+(p.sample.bz===null?"unknown":p.sample.bz<=-5?"south":p.sample.bz<0?"weak-south":"north")}
            style={{left:Math.min(99,p.leadMinutes/INCOMING_HORIZON_MINUTES*100)+"%",height:Math.min(100,Math.max(9,p.pressureNPa/maxP*100))+"%"}}
            title={time(p.arrivalAt)+" · measured Bz "+(p.sample.bz===null?"unavailable":num(p.sample.bz)+" nT")+" · P "+num(p.pressureNPa,2)+" nPa"}/>)}
          <span className="incoming-now-marker">NOW</span>
        </div>
        <div className="incoming-plot-axis"><span>Now · nominal 0 min</span><span>+30m</span><span>+60m</span><span>+90m</span><span>+130m</span></div>
        <div className="incoming-legend"><span><i className="incoming-south"/>Measured Bz ≤−5 nT</span><span><i className="incoming-north"/>Measured Bz ≥0</span><span><i className="incoming-unknown"/>Bz missing</span></div>
      </div>
      <div className="incoming-table-scroll">
        <table className="incoming-table">
          <thead><tr><th>Nominal arrival · UTC</th><th>Measured at L1</th><th>Speed / density</th><th>Bz · measured</th><th>Pdyn · derived</th><th>Shue nose · empirical</th><th>3D scenario</th></tr></thead>
          <tbody>{o.pulses.slice(0,24).map(p=><tr key={p.observedAt}>
            <td><b>{time(p.arrivalAt)}</b><small>in {num(p.leadMinutes,0)} min</small></td>
            <td>{time(p.observedAt)}</td>
            <td>{num(p.sample.v,0)} km/s<small>{num(p.sample.n,1)} cm⁻³</small></td>
            <td className={p.sample.bz!==null && p.sample.bz<0?"incoming-negative":""}>{p.sample.bz===null?"missing":num(p.sample.bz)+" nT"}</td>
            <td>{num(p.pressureNPa,2)} nPa</td>
            <td>{p.shueNoseRE===null?"insufficient Bz":num(p.shueNoseRE,2)+" Rₑ"}{p.changeFromNowRE!==null&&<small>Δ {p.changeFromNowRE>=0?"+":""}{num(p.changeFromNowRE,2)} Rₑ vs current</small>}</td>
            <td><button type="button" className="btn" disabled={!isFresh || p.shueNoseRE===null} aria-pressed={previewedAt===p.observedAt}
              title={p.shueNoseRE===null?"Requires measured Bz; no zero substitution":!isFresh?"Stale NOAA input cannot preview": "Show this measured-upstream advection scenario on the 3D Earth model"}
              onClick={()=>{onPreview(p.sample);onClose();}}>Preview ↗</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <button className="btn incoming-export" type="button" onClick={()=>download(incomingCsv(o))}>↓ Export every incoming L1 sample + model provenance (CSV)</button>
    </> : <p className="forecast-empty">No not-yet-arrived valid L1 samples are available in this estimated arrival window. That is a data-gap/arrival-state result, not evidence of zero activity.</p>}
    <div className="incoming-integrity">
      <strong>What this can and cannot predict</strong>
      <p>NOAA spacecraft **measured** the plasma and IMF. We estimate a nominal Earth arrival using a flat-speed delay, then optionally calculate an empirical Shue (1998) magnetopause response from measured pressure and paired measured GSM Bz. A field changing during transit, tilted solar-wind fronts, variable spacecraft distance, or shock interactions can shift the arrival—sometimes substantially. The chart is **not** an uncertainty-calibrated probability distribution.</p>
      <p>We do <strong>not</strong> compute a future Shue boundary when Bz is missing, claim tomorrow's Kp from these samples, or treat OVATION aurora nowcasts as future observations. When previewing a pending sample on the globe, the scene is conspicuously labeled <em>scenario · not yet observed at Earth</em>.</p>
      <a href="https://www.swpc.noaa.gov/products/real-time-solar-wind" target="_blank" rel="noreferrer">NOAA SWPC real-time solar wind ↗</a> · <a href="https://doi.org/10.1029/98JA01103" target="_blank" rel="noreferrer">Shue et al. 1998 empirical magnetopause ↗</a>
    </div>
  </section>;
}
