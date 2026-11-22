import {useEffect,useMemo,useState} from "react";
import {HISTORICAL_WINDOWS,historicalKpUrl,historicalKpSlots,parseHistoricalKp,type HistoricalKp} from "@/lib/space/historical-kp";
export default function HistoricalKpChart({eventId,selectedDate,cursor}:{eventId:string;selectedDate:string;cursor:number}){
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
 const slots=useMemo(()=>dates?historicalKpSlots(dates[0],dates[1],data):[],[dates?.[0],dates?.[1],data]);
 if(!dates)return null;
 const observed=slots.filter(s=>s.reading!==null);
 const peak=observed.reduce<(typeof observed)[number]|null>((best,s)=>!best||s.reading!.kp>best.reading!.kp?s:best,null);
 const day=slots.filter(s=>new Date(s.t).toISOString().startsWith(selectedDate));
 const dayObserved=day.filter(s=>s.reading!==null);
 const dayPeak=dayObserved.reduce<number|null>((best,s)=>best===null? s.reading!.kp:Math.max(best,s.reading!.kp),null);
 const source=historicalKpUrl(dates[0],dates[1]);
 const cursorBin=slots.find(s=>cursor>=s.t&&cursor<s.t+3*3_600_000)??null;
 return <section className="replay-kp" aria-label="Archived observed planetary Kp">
  <h4>Earth's response · observed planetary Kp</h4>
  <p>GFZ Potsdam definitive historical Kp in 3-hour UTC bins · {dates[0]} through {dates[1]}. This is a planetary geomagnetic index, not a local ground magnetometer or a forecast.</p>
  {status==="loading"?<p role="status">Retrieving historical Kp from GFZ…</p>:status==="error"?<p role="status">Historical Kp is unavailable. The source may be inaccessible from this browser or no validated readings were returned; no substitute measurements are shown.</p>:
   <><div className="replay-kp-bars" role="img" aria-label={"GFZ definitive observed Kp: "+observed.length+" of "+slots.length+" expected three-hour bins, "+(peak?"maximum "+peak.reading!.kp.toFixed(2):"no maximum")}>
    {slots.map(s=><div key={s.t} className={"replay-kp-bar"+(!s.reading?" missing":s.reading.kp>=5?" storm":"")+(new Date(s.t).toISOString().startsWith(selectedDate)?" replay-day":"")+(cursorBin?.t===s.t?" replay-cursor":"")} style={{height:s.reading?Math.max(2,s.reading.kp/9*100)+"%":"100%"}} title={new Date(s.t).toISOString().slice(0,16)+" UTC · "+(s.reading?"definitive Kp "+s.reading.kp.toFixed(2):"missing definitive Kp")}/>)}
   </div><p className="replay-kp-foot">Peak: <strong>{peak?"Kp "+peak.reading!.kp.toFixed(2)+" at "+new Date(peak.t).toISOString().slice(0,16)+" UTC":"not available"}</strong> · coverage {observed.length}/{slots.length} bins</p>
   <p className="replay-kp-foot">Shared cursor: <strong>{new Date(cursor).toISOString().slice(0,16).replace("T"," ")} UTC</strong> · {cursorBin?.reading?"definitive Kp "+cursorBin.reading.kp.toFixed(2)+" (3-hour bin)":"no definitive Kp in the selected bin"}</p>
   <p className="replay-kp-foot">Selected milestone date: <strong>{selectedDate} UTC</strong> · {dayPeak===null?"No definitive Kp in this day's bins":"peak Kp "+dayPeak.toFixed(2)} ({dayObserved.length}/8 bins). The milestone's date is not a precise shock arrival time.</p></>}
  <a href={source} target="_blank" rel="noreferrer">Open GFZ historical JSON source ↗</a>
  <p className="mlab-inference">GFZ Potsdam Kp index (CC BY 4.0). Each reading is dated at the start of its 3-hour interval. Dashed slots indicate missing definitive data, not Kp = 0. Browser cross-origin restrictions may prevent access; the original source link is provided.</p>
 </section>;
}
