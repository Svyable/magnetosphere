import {useEffect,useMemo,useState} from "react";
import {MAY_GROUND_END,MAY_GROUND_EXPECTED,MAY_GROUND_START,MAY_GROUND_STATIONS,groundArchiveUrl,groundAtCursor,groundReference,parseGroundArchive,type MayStation,type MayGroundSample} from "@/lib/space/may-2024-ground";
const START=Date.parse(MAY_GROUND_START),END=Date.parse(MAY_GROUND_END);
const W=1000,H=120,STEP=300_000;
function deltaPath(samples:MayGroundSample[],baseline:number,lo:number,hi:number){
 const span=hi-lo||1;
 let previous=-Infinity,d="";
 for(const p of samples){
  const x=(p.t-START)/(END-START)*W,y=H-((p.h-baseline)-lo)/span*H;
  d+=(p.t-previous===STEP?"L":"M")+x.toFixed(1)+","+Math.max(0,Math.min(H,y)).toFixed(1)+" ";
  previous=p.t;
 }
 return d.trim();
}
export default function May2024Ground({cursor}:{cursor:number}){
 const [station,setStation]=useState<MayStation>("FRD");
 const [samples,setSamples]=useState<MayGroundSample[]>([]);
 const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
 const [accessed,setAccessed]=useState("");
 const [rawCount,setRawCount]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  setStatus("loading");setSamples([]);setAccessed("");
  fetch(groundArchiveUrl(station,import.meta.env.BASE_URL),{signal:controller.signal})
   .then(r=>{if(!r.ok)throw new Error("USGS static archive "+r.status);return r.json();})
   .then(json=>{
    if(controller.signal.aborted)return;
    const archive=parseGroundArchive(json,station);
    setSamples(archive.samples);setRawCount(archive.rawCount);
    setAccessed(archive.accessedAtUtc);setStatus("ready");
   })
   .catch(()=>{if(!controller.signal.aborted)setStatus("error");});
  return ()=>controller.abort();
 },[station]);
 const baseline=useMemo(()=>groundReference(samples),[samples]);
 const deltas=useMemo(()=>baseline===null?[]:samples.map(p=>p.h-baseline),[samples,baseline]);
 const min=deltas.length?Math.min(-50,...deltas):-50,max=deltas.length?Math.max(50,...deltas):50;
 const path=useMemo(()=>baseline===null?"":deltaPath(samples,baseline,min,max),[samples,baseline,min,max]);
 const selected=groundAtCursor(samples,cursor);
 const inWindow=cursor>=START&&cursor<END;
 const cursorX=Math.max(0,Math.min(W,(cursor-START)/(END-START)*W));
 const baselineZero=H-(0-min)/(max-min)*H;
 const excursions=baseline===null?null:{min:Math.min(...deltas),max:Math.max(...deltas)};
 const source=MAY_GROUND_STATIONS.find(s=>s.code===station)!;
 return <section className="replay-ground" aria-label="Historical USGS ground magnetometer observations">
  <h4>On the ground · USGS magnetic observatories</h4>
  <p>Three days during the May 2024 storm, from <strong>May 10 to May 13 UTC</strong>. Real USGS <strong>definitive horizontal magnetic intensity (H)</strong> recorded at four observatories. A change at a single location is not the global Kp index, a G-scale storm rating, or a measurement of electrical grid current.</p>
  <div className="replay-ground-stations" role="group" aria-label="Choose a USGS historical ground observatory">
   {MAY_GROUND_STATIONS.map(s=><button type="button" key={s.code} className={"btn"+(station===s.code?" active":"")} aria-pressed={station===s.code} onClick={()=>setStation(s.code)}>{s.name} · {s.code}</button>)}
  </div>
  <p className="replay-kp-foot">{source.context} · {source.region} · horizontal field H in nanotesla</p>
  {status==="loading"?<p role="status">Loading documented USGS observatory samples…</p>
   :status==="error"||baseline===null?<p role="status">Validated ground observations are unavailable for this station. No measurements have been inferred or replaced.</p>:
   <>
    <div className="replay-ground-plot">
     <div className="replay-ground-plot-head"><strong>ΔH · local reference (nT)</strong><small>{max.toFixed(0)} ↕ {min.toFixed(0)}</small></div>
     <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={"USGS "+source.name+" actual five-minute horizontal-field deviations from first-six-hour median; source gaps disconnected"}>
      <line x1={0} y1={baselineZero} x2={W} y2={baselineZero} className="replay-omni-zero"/>
      <path d={path} className="replay-ground-line"/>
      {inWindow&&<line x1={cursorX} x2={cursorX} y1={0} y2={H} className="replay-omni-cursor"/>}
     </svg>
     <div className="replay-clock-ends"><span>May 10 · 00 UTC</span><span>May 13 · 00 UTC</span></div>
    </div>
    <div className="replay-ground-numbers">
     <div><span>H at UTC cursor</span><strong>{!inWindow?"Outside source window":selected?selected.h.toFixed(1)+" nT":"No source reading at cursor"}</strong></div>
     <div><span>ΔH at cursor</span><strong>{selected&&inWindow?(selected.h-baseline).toFixed(1)+" nT":"—"}</strong></div>
     <div><span>Local ΔH range</span><strong>{excursions!.min.toFixed(0)} to {excursions!.max.toFixed(0)} nT</strong></div>
    </div>
    <p className="replay-kp-foot">Archive coverage: {samples.length}/{MAY_GROUND_EXPECTED} actual 5-minute samples, drawn from {rawCount}/4320 valid 1-minute readings. Source retrieved {accessed.replace("T"," ").slice(0,16)} UTC. No gaps filled.</p>
   </>}
  <p className="mlab-inference"><strong>Read this correctly:</strong> ΔH = measured H minus the <em>median of available H during the first six UTC hours of May 10</em> at this observatory. This is a consistent local display reference, <strong>not</strong> a quiet-day baseline or a calibrated geomagnetically induced current estimate. Four stations occupy different latitudes and local time zones, so their amplitudes should not be ranked as universal storm severity.</p>
  <div className="replay-ground-sources">
   <a href={"https://geomag.usgs.gov/ws/data/?"+new URLSearchParams({id:station,elements:"H",sampling_period:"60",type:"definitive",format:"json",starttime:MAY_GROUND_START,endtime:MAY_GROUND_END})} target="_blank" rel="noreferrer">Open original USGS definitive H request ↗</a>
   <a href="https://www.usgs.gov/programs/geomagnetism/science/may-10-2024-magnetic-disturbance-peak-dst-351-nt" target="_blank" rel="noreferrer">USGS May 2024 storm account ↗</a>
  </div>
 </section>;
}
