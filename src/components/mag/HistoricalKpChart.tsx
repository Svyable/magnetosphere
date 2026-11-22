import {useEffect,useState} from "react";
import {HISTORICAL_WINDOWS,historicalKpUrl,parseHistoricalKp,type HistoricalKp} from "@/lib/space/historical-kp";
export default function HistoricalKpChart({eventId}:{eventId:string}){
 const [data,setData]=useState<HistoricalKp[]>([]);
 const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
 const dates=HISTORICAL_WINDOWS[eventId];
 useEffect(()=>{
  if(!dates){setStatus("error");return;}
  const controller=new AbortController();
  setStatus("loading");setData([]);
  fetch(historicalKpUrl(dates[0],dates[1]),{signal:controller.signal})
   .then(r=>{if(!r.ok)throw new Error("GFZ HTTP "+r.status);return r.json();})
   .then(json=>{if(controller.signal.aborted)return;const rows=parseHistoricalKp(json);setData(rows);setStatus(rows.length?"ready":"error");})
   .catch(()=>{if(!controller.signal.aborted)setStatus("error");});
  return ()=>controller.abort();
 },[eventId,dates?.[0],dates?.[1]]);
 if(!dates)return null;
 const source=historicalKpUrl(dates[0],dates[1]);
 const max=data.length?Math.max(...data.map(d=>d.kp)):0;
 return <section className="replay-kp" aria-label="Archived observed planetary Kp">
  <h4>Earth's response · measured planetary Kp</h4>
  <p>GFZ Potsdam definitive historical Kp, 3-hour bins · {dates[0]} through {dates[1]} UTC. These are observed geomagnetic indices, not forecast predictions or local magnetometer traces.</p>
  {status==="loading"?<p role="status">Retrieving historical observations from GFZ…</p>:status==="error"?<p role="status">Historical Kp could not be retrieved from GFZ. The chart is unavailable; no substitute values are shown.</p>:
   <><div className="replay-kp-bars" role="img" aria-label={"GFZ observed Kp, "+data.length+" three-hour values; maximum Kp "+max.toFixed(2)}>
    {data.map(d=><div key={d.t} className={"replay-kp-bar"+(d.kp>=5?" storm":"")} style={{height:Math.max(2,d.kp/9*100)+"%"}} title={new Date(d.t).toISOString().slice(0,16)+" UTC · Kp "+d.kp.toFixed(2)}/>)}
   </div><p className="replay-kp-foot">Observed maximum in loaded interval: <strong>Kp {max.toFixed(2)}</strong> · {data.length} valid bins; gaps are omitted, not interpolated.</p></>}
  <a href={source} target="_blank" rel="noreferrer">Open GFZ historical JSON source ↗</a>
  <p className="mlab-inference">GFZ attribution: GFZ Helmholtz Centre for Geosciences, Kp index (CC BY 4.0). If direct browser access is restricted by the provider, the source remains available through the link above.</p>
 </section>;
}
