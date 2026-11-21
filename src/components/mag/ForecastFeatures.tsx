import { useState } from "react";
import type { KpForecastSlot } from "@/lib/space/forecast";
import {
  compareForecastSnapshots, formatForecastTime, makeForecastSnapshot, parseForecastSnapshot,
  stormWindows, FORECAST_SNAPSHOT_KEY, type ForecastSnapshot, type ForecastClock,
} from "@/lib/space/forecast-ux";
import { fmtUtcS } from "./ui";

const readSaved=():ForecastSnapshot|null=>{
  try {
    const s=window.localStorage?.getItem(FORECAST_SNAPSHOT_KEY);
    return s ? parseForecastSnapshot(JSON.parse(s) as unknown) : null;
  } catch {return null;}
};
function forecastAgeStatus(now:number,fetchedAt:number):"current"|"stale"|"unavailable" {
  if(!Number.isFinite(fetchedAt)||fetchedAt<=0||fetchedAt>now+60_000)return "unavailable";
  return now-fetchedAt<=30*60_000?"current":"stale";
}

interface Props {
  data:KpForecastSlot[]|undefined;
  now:number;
  fetchedAt:number;
  clock:ForecastClock;
  selectedStorm:number|null;
  onSelectStorm:(t:number|null)=>void;
}
export default function ForecastFeatures({data,now,fetchedAt,clock,selectedStorm,onSelectStorm}:Props) {
  const [saved,setSaved]=useState<ForecastSnapshot|null>(()=>typeof window!=="undefined"?readSaved():null);
  const [message,setMessage]=useState("");
  const [storageAvailable,setStorageAvailable]=useState(true);
  const windows=stormWindows(data??[],now);
  const sourceStatus=forecastAgeStatus(now,fetchedAt);
  const current=data?makeForecastSnapshot(data,now,fetchedAt):null;
  const diff=saved&&current?compareForecastSnapshots(saved,current):null;
  const save=()=>{
    if(!current){setMessage("No recently fetched, valid NOAA prediction slots available to save.");return;}
    try {
      window.localStorage.setItem(FORECAST_SNAPSHOT_KEY,JSON.stringify(current));
      setSaved(current);setStorageAvailable(true);
      setMessage("Saved a copy of NOAA’s currently predicted Kp slots in this browser.");
    } catch {
      setStorageAvailable(false);
      setMessage("Browser storage is unavailable. No forecast snapshot was saved.");
    }
  };
  const discard=()=>{
    try {window.localStorage.removeItem(FORECAST_SNAPSHOT_KEY);setSaved(null);setMessage("This browser’s comparison snapshot has been cleared.");}
    catch {setStorageAvailable(false);setMessage("Browser storage could not be changed.");}
  };
  const focused=selectedStorm===null?null:windows.find(w=>w.start===selectedStorm)??null;
  return <section className="fc-tools" aria-label="Storm windows and saved forecast changes">
    <div className="fc-storm-head">
      <h3>Predicted storm windows · NOAA Kp</h3>
      <span className={"fc-source-status fc-source-"+sourceStatus}>{sourceStatus==="current"?"Recently fetched":sourceStatus==="stale"?"Old source fetch":"Source unavailable"}</span>
    </div>
    <p className="forecast-explain">Consecutive three-hour periods with <strong>NOAA-predicted Kp ≥5</strong>, grouped by UTC period. These are <em>threshold projections, not issued NOAA watches</em>. The times and intensity can change between forecast updates.</p>
    {selectedStorm!==null&&!focused&&
      <p className="fc-storm-disappeared" role="status">The storm window selected in the shared link is not present in the newest loaded forecast. It may have changed, elapsed or become unavailable. No event has been invented.</p>}
    {!data || sourceStatus==="unavailable" ? <p className="forecast-empty">Waiting for a valid NOAA Kp forecast. No predicted storm windows can be asserted.</p>
    : windows.length===0 ? <p className="fc-storm-none">No predicted Kp ≥5 three-hour storm windows currently appear in this product’s future slots. This is not an official all-clear.</p>
    : <div className="fc-storm-windows">
      {windows.map((w,i)=><button className="fc-storm-window" type="button" key={w.start}
        onClick={()=>onSelectStorm(selectedStorm===w.start?null:w.start)}
        aria-pressed={selectedStorm===w.start} aria-label={"Select predicted storm window "+(i+1)+", "+w.threshold+", starting "+formatForecastTime(w.start,clock)}>
        <span className="fc-window-label">PROJECTED WINDOW {i+1}</span>
        <strong>{w.threshold} <small>threshold</small></strong>
        <span>{formatForecastTime(w.start,clock)} – {formatForecastTime(w.end,clock)}</span>
        <span>Peak Kp {w.peakKp.toFixed(2)} · {w.slots*3} hours in forecast bins</span>
        <em>{selectedStorm===w.start?"Selected · share this window":"Select to share this window"}</em>
      </button>)}
    </div>}
    {sourceStatus==="stale" && <p className="fc-stale" role="status">This fetch is more than 30 minutes old; verify NOAA’s current bulletin before using the projected windows.</p>}
    <div className="fc-revision">
      <div className="fc-revision-title"><h3>What changed since your saved forecast?</h3><span>THIS BROWSER ONLY</span></div>
      <p className="forecast-explain">Save NOAA’s predicted three-hour values now; compare them with what NOAA serves when you return. This is a <strong>forecast revision comparison</strong>, not an accuracy score. The independent public forecast-receipt ledger handles later observations.</p>
      <div className="fc-revision-actions">
        <button type="button" className="btn" onClick={save} disabled={!current}>Save current NOAA forecast</button>
        {saved&&<button type="button" className="btn" onClick={discard}>Clear saved comparison</button>}
      </div>
      {message&&<p role="status" className="fc-saved-message">{message}</p>}
      {!storageAvailable&&<p className="fc-stale">Local storage is blocked. Forecast change tracking cannot persist here.</p>}
      {!saved ? <p className="forecast-empty">No baseline saved on this device. Saving one does not alter the global public forecast ledger.</p> :
        <div className="fc-diff">
          <p className="forecast-source-line">Saved {fmtUtcS(saved.savedAt)} · NOAA feed fetched {fmtUtcS(saved.fetchedAt)} (both retrieval timestamps, not NOAA issuance).</p>
          {!current?<p className="forecast-empty">Current NOAA predictions are missing or too old to compare. Your saved baseline remains intact.</p>
          : <>
            <div className="fc-diff-grid">
              <div><strong>{diff!.commonPeriods}</strong><span>matching 3h periods</span></div>
              <div><strong>{diff!.changedPeriods}</strong><span>changed Kp forecasts</span></div>
              <div><strong>{diff!.increases} ↑ / {diff!.decreases} ↓</strong><span>increases / decreases</span></div>
            </div>
            {current.fetchedAt<=saved.fetchedAt?
              <p className="fc-saved-message">No newer NOAA retrieval is available yet; a saved forecast can’t prove the forecast has changed.</p>
            : diff!.commonPeriods===0?
              <p className="fc-saved-message">There are no overlapping predicted three-hour periods left to compare. The saved window may have elapsed.</p>
            : diff!.changedPeriods===0?
              <p className="fc-saved-message">For matching periods, this retrieval shows no changed predicted Kp values.</p>
            : <div className="fc-diff-list" aria-label="Changed NOAA forecast values">
              {diff!.changes.slice(0,8).map(d=><div key={d.t} className="fc-diff-line">
                <span>{formatForecastTime(d.t,clock)}</span>
                <span>Kp {d.before.toFixed(2)} → {d.after.toFixed(2)}</span>
                <strong className={d.delta>0?"fc-diff-up":"fc-diff-down"}>{d.delta>0?"+":""}{d.delta.toFixed(2)}</strong>
              </div>)}
            </div>}
            <p className="fc-diff-foot">New forecast periods: {diff!.newPeriods} · prior periods no longer included: {diff!.pastOrRemovedPeriods}. Those are not necessarily NOAA cancellations; the rolling horizon moves with time.</p>
          </>}
        </div>}
      <p className="caveat">Browser-saved comparisons are private to this device and can be cleared. No background monitoring or notifications are implied. <a href="https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json" target="_blank" rel="noreferrer">Open original NOAA forecast ↗</a></p>
    </div>
  </section>;
}
