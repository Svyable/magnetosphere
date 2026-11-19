import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { use27DayOutlook, useGeomagBulletin } from "@/lib/space/data";
import {
  FORECAST_URLS, forecastPeak, gFromKp, issuanceStatus, outlookAhead, upcomingKp,
  type KpForecastSlot,
} from "@/lib/space/forecast";
import { Overlay, fmtUtc, fmtUtcS, fmtAgo } from "./ui";

interface Props {
  now: number;
  data: KpForecastSlot[] | undefined;
  fetchedAt: number;
  loading: boolean;
  error: boolean;
  ovation: { observed: number; forecast: number } | null;
  onClose: () => void;
  onRefresh: () => void;
}
const dayFmt = (t:number) => new Date(t).toLocaleDateString("en-US",{ timeZone:"UTC",month:"short",day:"numeric" });
const clockFmt = (t:number) => new Date(t).toISOString().slice(11,16) + " UTC";
const elapsed = (now:number, t:number) => now >= t ? fmtAgo(now - t) : "clock ahead";
const KP_GRADES = ["quiet", "unsettled", "active", "storm"];
function grade(kp:number) { return kp >= 5 ? KP_GRADES[3]! : kp>=4 ? KP_GRADES[2]! : kp>=3 ? KP_GRADES[1]! : KP_GRADES[0]!; }

function KpBars({data, now}:{data:KpForecastSlot[];now:number}) {
  const future = upcomingKp(data,now);
  if (!future.length) return <p className="forecast-empty">No valid future 3-hour Kp slots are available from NOAA. We will not extrapolate from the last reading.</p>;
  return <div className="forecast-chart-wrap">
    <div className="forecast-bars" role="img" aria-label="NOAA three-hour planetary Kp estimates and predictions. Bars rise to nine. Blue hatched bars are near-term estimates; teal and orange bars are predictions, with storm thresholds marked at Kp five.">
      <div className="forecast-threshold" aria-hidden="true" style={{bottom:100*5/9+"%"}}><span>Kp 5 · G1 threshold</span></div>
      {future.map(s=><div key={s.t} className="forecast-bar-cell" title={dayFmt(s.t)+" "+clockFmt(s.t)+" – "+clockFmt(s.t+3*3_600_000)+": "+s.status+" Kp "+s.kp.toFixed(2)}>
        <div className={"forecast-bar "+(s.status==="estimated"?"forecast-estimated":"forecast-predicted")+ " forecast-"+grade(s.kp)}
          style={{height:(Math.max(2,100*s.kp/9))+"%"}}/>
      </div>)}
    </div>
    <div className="forecast-bar-foot"><span>{dayFmt(future[0]!.t)} {clockFmt(future[0]!.t)}</span><span>{future.length} × 3h bins · UTC</span><span>{dayFmt(future[future.length-1]!.t)} {clockFmt(future[future.length-1]!.t)}</span></div>
    <div className="forecast-legend"><span><i className="forecast-sample" /> Predicted Kp</span><span><i className="forecast-sample estimated" /> Estimated current Kp</span><span><i className="forecast-sample storm" /> Predicted Kp ≥5</span></div>
  </div>;
}
function OutlookBars({now}:{now:number}) {
  const q=use27DayOutlook(true);
  const rows=q.data?outlookAhead(q.data,now):[];
  const status=issuanceStatus(q.data?.issuedAt??null,now,10*86_400_000);
  return <section aria-label="Lower confidence 27-day geomagnetic outlook">
    <h3>27-day outlook · lower confidence</h3>
    <p className="forecast-explain">This weekly-style outlook is NOAA's estimated <strong>daily largest Kp</strong> and other indices, not 3-hour precision and not a forecast of Earth's magnetic-pole motion. Conditions can change sharply after solar eruptions.</p>
    <p className="forecast-source-line">Published {fmtUtcS(q.data?.issuedAt)} · {status==="current"?"Source publication within 10 days":status==="stale"?"OUTDATED ISSUE · CHECK NOAA":"Source unavailable"}</p>
    {q.isError ? <p className="forecast-empty">NOAA 27-day outlook could not be retrieved or parsed.</p>
      : q.isPending ? <p className="forecast-empty">Loading official longer-range outlook…</p>
      : rows.length ? <>
        <div className="forecast-day-bars" role="img" aria-label="NOAA published daily largest Kp outlook for up to 27 days">
          {rows.map(d=><div key={d.t} className="forecast-day-col" title={dayFmt(d.t)+": daily largest Kp "+d.largestKp+", Ap "+d.ap+", F10.7 "+d.flux107}>
            <div className={"forecast-day-bar "+(d.largestKp>=5?"storm":"")} style={{height:Math.max(5,100*d.largestKp/9)+"%"}} />
          </div>)}
        </div>
        <div className="forecast-bar-foot"><span>{dayFmt(rows[0]!.t)}</span><span>{rows.length} forecast dates</span><span>{dayFmt(rows[rows.length-1]!.t)}</span></div>
        <div className="forecast-forecast-days">
          {rows.map(d=><div key={d.t}><span>{dayFmt(d.t)}</span><strong>Kp {d.largestKp}</strong><small>Ap {d.ap} · F10.7 {d.flux107}</small></div>)}
        </div>
      </> : <p className="forecast-empty">This NOAA bulletin has no future days remaining; no outlook has been invented.</p>}
    <p className="caveat">Daily values are published outlooks without numerical confidence intervals. A Kp threshold is not an official alert or a guaranteed aurora sighting. <a href={FORECAST_URLS.outlook} target="_blank" rel="noreferrer">Read NOAA's original 27-day bulletin ↗</a></p>
  </section>;
}
function NextThreeDays({now,data,fetchedAt,loading,error,ovation}:{now:number;data:KpForecastSlot[]|undefined;fetchedAt:number;loading:boolean;error:boolean;ovation:Props["ovation"]}) {
  const b=useGeomagBulletin(true);
  const next=data?upcomingKp(data,now):[];
  const projected=next.filter(x=>x.status==="predicted");
  const peak=data?forecastPeak(data,now):null;
  const issueState=issuanceStatus(b.data?.issuedAt??null,now,36*3_600_000);
  return <section aria-label="NOAA short range geomagnetic forecasts">
    <div className="forecast-overview">
      <div><span>Highest predicted Kp · 72h</span><strong>{peak?peak.kp.toFixed(2):"—"}</strong><small>{peak?dayFmt(peak.t)+" "+clockFmt(peak.t)+" · 3h slot":"No future prediction in product"}</small></div>
      <div><span>Indicative geomagnetic level</span><strong>{peak ? gFromKp(peak.kp)??"Below G1":"—"}</strong><small>Kp threshold only; not an official NOAA watch</small></div>
      <div><span>Forward 3-hour Kp bins</span><strong>{projected.length}</strong><small>{next.filter(x=>x.status==="estimated").length} estimates shown separately</small></div>
    </div>
    <h3>Planetary Kp · next three days</h3>
    <p className="forecast-explain">Observed Kp, NOAA's near-term <em>estimated</em> Kp, and future <em>predicted</em> Kp are distinct states. The forecast describes expected **global geomagnetic disturbance**, not a prediction of the exact future 3D magnetosphere or magnetic pole positions.</p>
    <div className="forecast-source-line">NOAA Kp feed fetched {fmtUtcS(fetchedAt||null)} · Source issue time not supplied by this JSON · <a href={FORECAST_URLS.kp} target="_blank" rel="noreferrer">original product ↗</a></div>
    {error ? <p className="forecast-empty">The latest Kp forecast could not be loaded. No forecast data has been invented.</p>
      : loading ? <p className="forecast-empty">Loading NOAA's published planetary Kp predictions…</p>
      : <KpBars data={data??[]} now={now}/>}
    <h3>NOAA daily geomagnetic storm probabilities</h3>
    <p className="forecast-source-line">Official bulletin issued {fmtUtcS(b.data?.issuedAt)} · {issueState==="stale"?"STALE ISSUE — use caution":issueState==="current"?"Within 36-hour freshness window":"Awaiting bulletin"} · <a href={FORECAST_URLS.geomag} target="_blank" rel="noreferrer">source bulletin ↗</a></p>
    {b.isError ? <p className="forecast-empty">The NOAA probability bulletin is unavailable; Kp predictions are not converted to fake probabilities.</p>
      : b.isPending ? <p className="forecast-empty">Loading the separately issued probability bulletin…</p>
      : <div className="forecast-prob-scroll"><table className="forecast-prob-table">
          <thead><tr><th>Forecast class</th>{b.data.probabilities.map(p=><th key={p.t}>{dayFmt(p.t)}</th>)}</tr></thead>
          <tbody>{([
            ["Active", "active"],["Minor storm", "minor"],["Moderate storm","moderate"],["Strong–extreme storm","strongExtreme"]
            ] as const).map(([label,key])=><tr key={key}><th>{label}</th>{b.data.probabilities.map(p=><td key={p.t}>{p[key]}%</td>)}</tr>)}</tbody>
        </table></div>}
    <div className="forecast-nowcast">
      <span>0–30 minute aurora forecast · NOAA OVATION</span>
      {ovation ? <p>Model input {fmtUtcS(ovation.observed)} · predicted aurora for {fmtUtcS(ovation.forecast)}. {Math.abs(now-ovation.observed)>45*60_000?"This forecast input is old; check NOAA before relying on it.":"View the globe for modelled auroral oval probability."}</p>
        : <p>No valid live NOAA OVATION forecast currently loaded; the app will not claim aurora visibility.</p>}
    </div>
  </section>;
}
export default function ForecastCenter(p:Props) {
  const [horizon,setHorizon]=useState<"72h"|"27d">("72h");
  const queryClient = useQueryClient();
  return <Overlay title="FORECAST / EARTH AHEAD" onClose={p.onClose} wide>
    <div className="forecast-mission">
      <span className="forecast-mission-kicker">NOAA / OFFICIAL PREDICTIONS</span>
      <h3>What is coming toward Earth?</h3>
      <p>Near-term measured solar wind reaches Earth in roughly an hour. Aurora predictions run tens of minutes ahead; global Kp forecasts extend about three days. A separate 27-day outlook is much less precise. None of these feeds directly measure tomorrow's global 3D magnetic field.</p>
    </div>
    <div className="ev-tabs forecast-tabs" role="tablist" aria-label="Forecast horizon">
      <button role="tab" aria-selected={horizon==="72h"} className={"btn"+(horizon==="72h"?" active":"")} onClick={()=>setHorizon("72h")}>Next 72h · Kp + storms</button>
      <button role="tab" aria-selected={horizon==="27d"} className={"btn"+(horizon==="27d"?" active":"")} onClick={()=>setHorizon("27d")}>Next 27 days · outlook</button>
    </div>
    <div className="forecast-time-horizons" role="list">
      <div role="listitem"><span>~1 hour</span><small>L1 measurement + travel estimate</small></div>
      <div role="listitem"><span>~30 minutes</span><small>OVATION auroral forecast</small></div>
      <div role="listitem"><span>3 days</span><small>NOAA forecaster Kp & storm probabilities</small></div>
      <div role="listitem"><span>27 days</span><small>NOAA daily outlook · less certain</small></div>
    </div>
    {horizon==="72h" ?
      <NextThreeDays now={p.now} data={p.data} fetchedAt={p.fetchedAt} loading={p.loading} error={p.error} ovation={p.ovation}/> :
      <OutlookBars now={p.now}/>}
    <button className="btn forecast-refetch" onClick={() => {p.onRefresh(); void queryClient.invalidateQueries({queryKey:["noaa-geomag-bulletin"]}); void queryClient.invalidateQueries({queryKey:["noaa-27-day-outlook"]});}}>↻ Refresh predictions from NOAA</button>
    <p className="caveat">Forecasts are fallible, especially following CMEs and changing southward IMF Bz. These values are published NOAA products, not our independently generated storm predictions. Kp ≥5 corresponds to G1 threshold, but **a threshold projection is not an issued NOAA watch or warning**. For operational decisions consult <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noreferrer">NOAA SWPC ↗</a>.</p>
  </Overlay>;
}
