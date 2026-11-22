import {useEffect,useMemo,useState} from "react";
import {HISTORICAL_WINDOWS} from "@/lib/space/historical-kp";
import {OMNI_INTERVAL_MS,omniCoverage,omniDataset,omniReadingNear,omniUrl,parseOmniHapi,type OmniPoint} from "@/lib/space/historical-omni";
const DAY=24*60*60_000;
const W=1000,H=115;
type Key="bz"|"speed";
function linePath(points:OmniPoint[],key:Key,start:number,end:number,min:number,max:number){
 let output="",previous=-Infinity;
 for(const p of points){
  const v=p[key];
  if(v===null){previous=-Infinity;continue;}
  const x=(p.t-start)/(end-start)*W,y=H-(v-min)/(max-min)*H;
  if(x<0||x>W||!Number.isFinite(y))continue;
  output+=(p.t-previous<=OMNI_INTERVAL_MS*1.5?"L":"M")+x.toFixed(2)+","+Math.max(0,Math.min(H,y)).toFixed(2)+" ";
  previous=p.t;
 }
 return output.trim();
}
function Trace({points,metric,start,end,cursor}:{points:OmniPoint[];metric:Key;start:number;end:number;cursor:number}){
 const label=metric==="bz"?"GSM IMF Bz · nT":"Solar-wind speed · km/s";
 const nums=points.map(p=>p[metric]).filter((n):n is number=>n!==null);
 const lo=metric==="bz"?Math.min(-10,...nums):Math.min(250,...nums);
 const hi=metric==="bz"?Math.max(10,...nums):Math.max(700,...nums);
 const span=hi-lo||1;
 const path=useMemo(()=>linePath(points,metric,start,end,lo,hi),[points,metric,start,end,lo,hi]);
 const x=Math.max(0,Math.min(W,(cursor-start)/(end-start)*W));
 const zero=H-(0-lo)/span*H;
 return <div className="replay-omni-trace">
  <div className="replay-omni-trace-title"><strong>{label}</strong><small>{hi.toFixed(0)} ↕ {lo.toFixed(0)}</small></div>
  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label+"; gaps not interpolated; time cursor marked"}>
   {metric==="bz"&&<line x1={0} y1={zero} x2={W} y2={zero} className="replay-omni-zero"/>}
   <path d={path} className={metric==="bz"?"replay-omni-bz":"replay-omni-speed"} />
   <line className="replay-omni-cursor" x1={x} x2={x} y1={0} y2={H}/>
  </svg>
 </div>;
}
export default function HistoricalOmniChart({eventId,cursor}:{eventId:string;cursor:number}){
 const [points,setPoints]=useState<OmniPoint[]>([]);
 const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
 const dates=HISTORICAL_WINDOWS[eventId];
 const start=dates?Date.parse(dates[0]+"T00:00:00Z"):0;
 const end=dates?Date.parse(dates[1]+"T00:00:00Z")+DAY:0;
 useEffect(()=>{
  if(!dates){setStatus("error");setPoints([]);return;}
  const controller=new AbortController();
  setStatus("loading");setPoints([]);
  fetch(omniUrl(eventId),{signal:controller.signal})
   .then(r=>{if(!r.ok)throw new Error("NASA HAPI HTTP "+r.status);return r.json();})
   .then(body=>{if(controller.signal.aborted)return;const p=parseOmniHapi(body,start,end);setPoints(p);setStatus(p.length?"ready":"error");})
   .catch(()=>{if(!controller.signal.aborted)setStatus("error");});
  return ()=>controller.abort();
 },[eventId,start,end]);
 const coverage=useMemo(()=>end>start?omniCoverage(points,start,end):{expected:0,bz:0,speed:0},[points,start,end]);
 if(!dates)return null;
 const selected=omniReadingNear(points,cursor);
 const formatted=new Date(cursor).toISOString().slice(0,16).replace("T"," ")+" UTC";
 return <section className="replay-omni" aria-label="Archived near-Earth solar wind">
  <h4>Arriving at Earth · historical solar wind</h4>
  <p>NASA OMNI {omniDataset(eventId)} · 5-minute definitive magnetic field and plasma data <strong>propagated to the bow-shock nose</strong>. The IMF component is GSM Bz. These are not measurements at the Sun or the original L1 observation times.</p>
  {status==="loading"?<p role="status">Requesting archived solar wind from NASA CDAWeb…</p>
   :status==="error"?<p role="status">Historical NASA OMNI measurements are unavailable in this browser or no valid readings were returned. No replacement measurements or interpolated traces are shown.</p>
   :<><div className="replay-omni-chart">
      <Trace points={points} metric="bz" start={start} end={end} cursor={cursor}/>
      <Trace points={points} metric="speed" start={start} end={end} cursor={cursor}/>
    </div>
    <p className="replay-omni-readout">Cursor: <strong>{formatted}</strong> · GSM Bz: <strong>{selected?.bz==null?"not available":selected.bz.toFixed(1)+" nT"}</strong> · speed: <strong>{selected?.speed==null?"not available":selected.speed.toFixed(0)+" km/s"}</strong></p>
    <p className="replay-omni-foot">Valid 5-minute bins: Bz {coverage.bz}/{coverage.expected}; speed {coverage.speed}/{coverage.expected}. Missing periods remain unconnected.</p>
   </>}
  <a href={omniUrl(eventId)} target="_blank" rel="noreferrer">NASA CDAWeb HAPI data request ↗</a>
  <p className="mlab-inference">NASA/GSFC SPDF OMNI, J. H. King and N. Papitashvili, contributing spacecraft teams. The OMNI time shift is a physical propagation estimate; it does not prove that an identified solar eruption caused a later ground disturbance. Direct browser access depends on NASA service availability and CORS permissions.</p>
 </section>;
}
