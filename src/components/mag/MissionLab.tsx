import {useMemo,useState} from "react";
import {useOvationGrid,URLS} from "@/lib/space/data";
import {validateTarget,type Target} from "@/lib/space/explorer";
import type {L1Sample,KpValue} from "@/lib/space/model";
import type {KpForecastSlot} from "@/lib/space/forecast";
import {detectL1Patterns,hypotheticalBoundary,localAurora,missionBrief,type ScenarioInput} from "@/lib/space/mission-lab";
import {fmtUtcS} from "./ui";
import GroundTruth from "./GroundTruth";
import EventReplay from "./EventReplay";
type Tab="observer"|"sandbox"|"signals"|"brief"|"ground"|"replay";
interface Props{
 now:number; onClose:()=>void; site:Target|null; onSite:(site:Target|null)=>void;
 onFieldExplorer:()=>void; samples:L1Sample[];
 actual:{pressure:number;bz:number}|null; onScenario:(s:ScenarioInput|null)=>void; scenario:ScenarioInput|null;
 kp:KpValue|null; forecast:KpForecastSlot[]; forecastFetchedAt:number; ovationTarget:number|null;
}
const tUTC=(n:number)=>new Date(n).toISOString().slice(0,16).replace("T"," ")+" UTC";
function downloadBrief(content:string){
 const url=URL.createObjectURL(new Blob([content],{type:"text/markdown;charset=utf-8"}));
 try{
  const a=document.createElement("a");
  a.href=url;a.download="magnetosphere-mission-brief-"+new Date().toISOString().slice(0,10)+".md";a.click();
 }finally{window.setTimeout(()=>URL.revokeObjectURL(url),1600);}
}
export default function MissionLab(p:Props){
 const [tab,setTab]=useState<Tab>("observer");
 const [lat,setLat]=useState(p.site?String(p.site.lat):"");
 const [lon,setLon]=useState(p.site?String(p.site.lon):"");
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [pressure,setPressure]=useState(p.actual?Number(p.actual.pressure.toFixed(1)):2);
 const [bz,setBz]=useState(p.actual?Number(p.actual.bz.toFixed(1)):-5);
 const q=useOvationGrid(tab==="observer");
 const observation=q.data?.observed??null,forecastAt=q.data?.forecast??null;
 const gridFresh=observation!==null && observation<=p.now+60_000 && p.now-observation<=30*60_000 &&
   forecastAt!==null && Math.abs(forecastAt-p.now)<=100*60_000;
 const sampled=useMemo(()=>p.site&&q.data?localAurora(q.data.points,p.site,forecastAt??p.now):null,[q.data,p.site,forecastAt,p.now]);
 const model=useMemo(()=>hypotheticalBoundary({pressure,bz},p.actual),[pressure,bz,p.actual]);
 const events=useMemo(()=>detectL1Patterns(p.samples,p.now),[p.samples,p.now]);
 const latestL1=p.samples.at(-1)??null;
 const freshL1=latestL1&&latestL1.t<=p.now+60_000&&p.now-latestL1.t<=12*60_000;
 const report=useMemo(()=>missionBrief({
   generatedAt:p.now,wind:latestL1,kp:p.kp,forecast:p.forecast,
   forecastFetchedAt:p.forecastFetchedAt,ovationTarget:p.ovationTarget,
 }),[p.now,latestL1,p.kp,p.forecast,p.forecastFetchedAt,p.ovationTarget]);
 const chooseSite=(e:React.FormEvent)=>{
  e.preventDefault();
  const v=validateTarget(lat,lon);
  if(!v.ok){setError(v.error);return;}
  p.onSite(v.target);setError("");setMessage("Coordinate selected and linked to the Earth globe.");
 };
 const preview=()=>{
  if(!model){setMessage("Scenario values must remain inside the defined model demonstration range.");return;}
  p.onScenario({pressure,bz});p.onClose();
 };
 const copy=async()=>{
  try{await navigator.clipboard.writeText(report);setMessage("Evidence brief copied to clipboard.");}
  catch{setMessage("Clipboard unavailable; use Download .md instead.");}
 };
 return <section className="mlab" aria-label="Mission Lab scientific utilities">
   <div className="mlab-lead"><span>THE EARTH FIELD LAB / SCIENCE WITH GUARDRAILS</span>
     <h3>Inspect a location. Stress-test a model. Examine the data.</h3>
     <p>Six tools built around NOAA/USGS measurements and published models. The lab distinguishes a measured upstream pattern, an OVATION model value, and a hypothetical response. Nothing here is an official warning or a new physical forecast.</p>
   </div>
   <div className="mlab-tabs" role="tablist" aria-label="Mission lab utilities">
     <button role="tab" aria-selected={tab==="observer"} className="btn" onClick={()=>setTab("observer")}>Aurora at a point</button>
     <button role="tab" aria-selected={tab==="sandbox"} className="btn" onClick={()=>setTab("sandbox")}>Shue what-if lab</button>
     <button role="tab" aria-selected={tab==="signals"} className="btn" onClick={()=>setTab("signals")}>Upstream event patterns</button>
     <button role="tab" aria-selected={tab==="brief"} className="btn" onClick={()=>setTab("brief")}>Evidence brief</button>
     <button role="tab" aria-selected={tab==="ground"} className="btn" onClick={()=>setTab("ground")}>Earth receipts · ground stations</button>
     <button role="tab" aria-selected={tab==="replay"} className="btn" onClick={()=>setTab("replay")}>Major events · Sun → Earth</button>
   </div>
   {tab==="observer" && <section className="mlab-pane" aria-label="NOAA aurora coordinate inspector">
     <h3>Inspect NOAA OVATION at your coordinates</h3>
     <p>Enter latitude/longitude. The globe marker moves to that location; your coordinates remain in the share URL. No geolocation permission or server account is required.</p>
     <form className="mlab-form" onSubmit={chooseSite}>
       <label>Latitude °<input value={lat} inputMode="decimal" onChange={e=>setLat(e.target.value)} placeholder="−90 to 90" aria-label="Observer latitude"/></label>
       <label>Longitude °<input value={lon} inputMode="decimal" onChange={e=>setLon(e.target.value)} placeholder="−180 to 180" aria-label="Observer longitude"/></label>
       <button type="submit" className="btn">Inspect coordinates</button>
     </form>
     {error&&<p role="alert" className="mlab-warning">{error}</p>}
     <div className="mlab-meta">NOAA model input: {fmtUtcS(observation)} · forecast target: {fmtUtcS(forecastAt)} · <a href={URLS.ovation} target="_blank" rel="noreferrer">Raw OVATION grid ↗</a></div>
     {q.isError?<p className="mlab-warning" role="status">NOAA OVATION full grid is unavailable. No point value has been inferred from Kp.</p>
       :q.isPending?<p className="forecast-empty">Loading full NOAA global OVATION grid, including zero-valued cells…</p>
       :!p.site?<p className="forecast-empty">Enter a location or select one in Field Explorer to inspect the model. No default location is inferred.</p>
       :sampled?<div className="mlab-readings">
         <div><span>Nearest NOAA map cell</span><strong>{sampled.value===null?"Not available":sampled.value.toFixed(0)+" / 100"}</strong><small>{sampled.distanceKm===null?"No nearby valid grid cell":sampled.distanceKm.toFixed(0)+" km to cell center"}</small></div>
         <div><span>Strongest nearby map cell</span><strong>{sampled.peakNearby===null?"—":sampled.peakNearby.toFixed(0)+" / 100"}</strong><small>{sampled.peakDistanceKm===null?"No grid cells within 1,000 km":sampled.peakDistanceKm.toFixed(0)+" km away · up to 1,000 km"}</small></div>
         <div><span>Sun at forecast time</span><strong>{sampled.darkness==="dark"?"Dark":sampled.darkness==="twilight"?"Twilight":"Daylight"}</strong><small>Approx. solar elevation {sampled.sunElevationDeg.toFixed(1)}°</small></div>
       </div>:null}
     {!gridFresh&&<p className="mlab-warning" role="status">This OVATION model run is not currently within the freshness window. Values are historical/stale context, not a current viewing recommendation.</p>}
     <div className="mlab-inference"><strong>Model ≠ visibility forecast.</strong> The map's 0–100 scale is not an independently calibrated probability of seeing aurora from your location. A bright display can be seen toward the horizon from far away; cloud cover, local light pollution, terrain and actual sky darkness are <strong>not</strong> measured here. Sun position is approximate. A zero map cell is a legitimate value, not proof that the sky is aurora-free.</div>
     {p.site&&<button className="btn" onClick={p.onFieldExplorer}>Inspect this location's IGRF magnetic field ↗</button>}
   </section>}
   {tab==="sandbox"&&<section className="mlab-pane" aria-label="Hypothetical Shue magnetopause workbench">
     <h3>Change the drivers. See the modeled response.</h3>
     <p>This is a <strong>hypothetical sensitivity experiment</strong>, not a prediction. Adjust solar-wind dynamic pressure and GSM Bz, then compare the Shue (1998) empirical dayside magnetopause. It does not model bow-shock physics, reconnection rate, ground Kp or auroral intensity.</p>
     <div className="mlab-sliders">
       <label>Dynamic pressure <strong>{pressure.toFixed(1)} nPa</strong><input type="range" min="0.2" max="30" step="0.2" value={pressure} onChange={e=>setPressure(Number(e.target.value))}/></label>
       <label>GSM IMF Bz <strong>{bz.toFixed(1)} nT</strong><input type="range" min="-25" max="25" step="0.5" value={bz} onChange={e=>setBz(Number(e.target.value))}/></label>
     </div>
     <div className="mlab-readings">
       <div><span>Hypothetical Shue nose</span><strong>{model?model.r0.toFixed(2)+" Rₑ":"—"}</strong><small>Subsolar standoff · empirical model</small></div>
       <div><span>Current modeled reference</span><strong>{model?.baselineNose==null?"No current paired Bz":model.baselineNose.toFixed(2)+" Rₑ"}</strong><small>Requires actual fresh NOAA wind + Bz</small></div>
       <div><span>Difference from reference</span><strong>{model?.deltaNose==null?"Not comparable":(model.deltaNose>=0?"+":"")+model.deltaNose.toFixed(2)+" Rₑ"}</strong><small>Illustrates model sensitivity only</small></div>
     </div>
     <div className="mlab-actions"><button className="btn" onClick={preview} disabled={!model}>Preview what-if geometry on globe</button>
       <button className="btn" onClick={()=>{p.onScenario(null);setMessage("Hypothetical globe preview cleared.");}}>Return to observed geometry</button>
     </div>
     <p className="mlab-inference">The 3D scene will visibly state <strong>HYPOTHETICAL MODEL — NOT OBSERVED / NOT FORECAST</strong>. Live NOAA telemetry remains unchanged; the OVATION oval is hidden during hypothetical playback to avoid mixing time domains. The model is valid only as a simplified empirical illustration.</p>
   </section>}
   {tab==="signals"&&<section className="mlab-pane" aria-label="Measured upstream solar wind pattern detector">
     <h3>Detect distinctive upstream patterns</h3>
     <p>A transparent heuristic checks recent 1-minute NOAA L1 measurements for a <strong>sharp pressure increase</strong> (10-minute pressure mean ≥1.6× and ≥1.2 nPa above the previous 10 minutes) or <strong>sustained southward GSM Bz</strong> (at least 8 matched minutes at or below −5 nT). These are measured upstream patterns, not official shock identifications or predictions of geomagnetic storm strength.</p>
     <div className="mlab-meta">Latest upstream sample {fmtUtcS(latestL1?.t)} · {freshL1?"recent source":"stale/missing live input"} · window: last 4 hours</div>
     {!freshL1&&<p className="mlab-warning" role="status">Most recent L1 data is old or missing. This is NOT an all-clear; signals below are historical context.</p>}
     {events.length?<div className="mlab-event-list">
       {events.map(e=><div className="mlab-event" key={e.kind+"-"+e.at}>
         <strong>{e.kind==="pressure-jump"?"Pressure compression pattern":"Sustained southward Bz pattern"}</strong>
         <span>{tUTC(e.at)}</span>
         <p>{e.kind==="pressure-jump"?"10-min mean "+e.metric.toFixed(2)+" nPa vs previous "+e.baseline!.toFixed(2)+" nPa":"Matched southward Bz mean "+e.metric.toFixed(1)+" nT · "+e.count+" minutes"}</p>
       </div>)}
     </div>:<p className="forecast-empty">No complete-window patterns cross the selected exploratory thresholds in these measurements. This is not an official quiet forecast or assurance of safety.</p>}
     <p className="mlab-inference">Instrument changes, data gaps and upstream structure geometry can produce misleading patterns. No shock normal, uncertainty interval, or official NOAA event classification is computed. <a href={URLS.wind} target="_blank" rel="noreferrer">Wind source ↗</a> · <a href={URLS.mag} target="_blank" rel="noreferrer">Magnetic source ↗</a></p>
   </section>}
   {tab==="brief"&&<section className="mlab-pane" aria-label="Downloadable source-linked mission brief">
     <h3>Make a portable evidence brief</h3>
     <p>Snapshot the measurements and forecasts currently loaded in your browser. Includes UTC times, measurement versus prediction distinctions, missing-data notes and direct NOAA source links. It is generated on-device; no account, email or upload.</p>
     <div className="mlab-actions">
       <button className="btn" onClick={()=>{void copy();}}>Copy brief</button>
       <button className="btn" onClick={()=>{downloadBrief(report);setMessage("Markdown evidence brief exported.");}}>Download .md brief</button>
     </div>
     <pre className="mlab-report">{report}</pre>
     <p className="mlab-inference">A downloaded brief describes what this browser had received at its generation time; it does not independently certify NOAA accuracy or imply a future monitoring task.</p>
   </section>}
   {tab==="ground" && <GroundTruth now={p.now}/>}
   {tab==="replay" && <EventReplay/>}
   {message&&<p className="mlab-message" role="status">{message}</p>}
 </section>;
}
