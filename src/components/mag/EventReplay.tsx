import {useState} from "react";
import {HISTORICAL_WINDOWS} from "@/lib/space/historical-kp";
import {REPLAY_EVENTS,replayPosition} from "@/lib/space/replay";
import {archivesForEvent} from "@/lib/space/event-sources";
import HistoricalKpChart from "./HistoricalKpChart";
import HistoricalOmniChart from "./HistoricalOmniChart";
import May2024Ground from "./May2024Ground";
const PHASES={solar:"SUN / ERUPTION",transit:"INTERPLANETARY TRANSIT",earth:"EARTH / MAGNETOSPHERE",impact:"OBSERVED IMPACT"} as const;
export default function EventReplay(){
 const [eventId,setEventId]=useState(REPLAY_EVENTS[2]!.id);
 const [step,setStep]=useState(0);
 const [cursor,setCursor]=useState(Date.parse(REPLAY_EVENTS[2]!.stages[0]!.at+"T12:00:00Z"));
 const event=REPLAY_EVENTS.find(e=>e.id===eventId)??REPLAY_EVENTS[0]!;
 const stage=event.stages[Math.min(step,event.stages.length-1)]!;
 const dates=HISTORICAL_WINDOWS[event.id]!;
 const from=Date.parse(dates[0]+"T00:00:00Z"),until=Date.parse(dates[1]+"T00:00:00Z")+86_400_000;
 const chooseStep=(i:number)=>{const next=Math.max(0,Math.min(event.stages.length-1,i));setStep(next);setCursor(Date.parse(event.stages[next]!.at+"T12:00:00Z"));};
 return <section className="mlab-pane event-replay" aria-label="Historical Sun to Earth major event replay">
  <h3>Sun → Earth · major event replay</h3>
  <p>Follow the evidence from solar activity through arrival at Earth to documented consequences. This is a <strong>curated historical chronology</strong>, not a continuous instrument recording, simulated CME path, or prediction.</p>
  <label className="replay-picker">Historical event
   <select aria-label="Choose major space weather event" value={event.id} onChange={e=>{const next=REPLAY_EVENTS.find(x=>x.id===e.target.value);if(!next)return;setEventId(next.id);setStep(0);setCursor(Date.parse(next.stages[0]!.at+"T12:00:00Z"));}}>
    {REPLAY_EVENTS.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
   </select>
  </label>
  <p className="replay-summary">{event.summary}</p>
  <div className="replay-track" role="group" aria-label="Event stages">
   {event.stages.map((s,i)=><button type="button" key={event.id+"-"+i} className={"replay-node"+(step===i?" selected":"")} aria-pressed={step===i} onClick={()=>chooseStep(i)} title={s.title} style={{left:(6+88*replayPosition(event,i))+"%"}}><span>{i+1}</span></button>)}
  </div>
  <div className="replay-nav">
   <button type="button" className="btn" disabled={step===0} onClick={()=>chooseStep(step-1)}>← Earlier</button>
   <span>Stage {step+1} of {event.stages.length} · {stage.at} UTC date</span>
   <button type="button" className="btn" disabled={step===event.stages.length-1} onClick={()=>chooseStep(step+1)}>Later →</button>
  </div>
  <article className="replay-detail" aria-live="polite">
   <small>{PHASES[stage.phase]} · {stage.at} UTC</small>
   <h4>{stage.title}</h4>
   <p>{stage.detail}</p>
   <a href={stage.source} target="_blank" rel="noreferrer">Evidence / context: {stage.sourceLabel} ↗</a>
  </article>
  <div className="replay-all" aria-label="Complete event chronology">{event.stages.map((s,i)=><button key={i} className={"replay-entry"+(step===i?" active":"")} onClick={()=>chooseStep(i)} aria-current={step===i?"step":undefined}><time>{s.at}</time><span>{s.title}</span><small>{PHASES[s.phase]}</small></button>)}</div>
  <section className="replay-clock" aria-label="Shared UTC historical observation cursor">
   <label htmlFor="replay-utc-cursor"><strong>Historical observation cursor</strong> · {new Date(cursor).toISOString().slice(0,16).replace("T"," ")} UTC</label>
   <input id="replay-utc-cursor" type="range" min={from} max={until-3_600_000} step={3_600_000} value={cursor} onChange={e=>setCursor(Number(e.target.value))} aria-label="Historical UTC observation time"/>
   <div className="replay-clock-ends"><span>{dates[0]} UTC</span><span>{dates[1]} UTC</span></div>
   <p>Selecting a milestone sets this cursor to <strong>noon UTC</strong> on that date; this is a navigation convention, not a claimed arrival time. Drag to compare actual NASA OMNI and GFZ readings at the same UTC time; for May 2024, also inspect USGS observations at four ground stations.</p>
  </section>
  <HistoricalOmniChart key={event.id+"-omni"} eventId={event.id} cursor={cursor}/>
  <HistoricalKpChart key={event.id} eventId={event.id} selectedDate={stage.at} cursor={cursor}/>
  {event.id==="may-2024"&&<May2024Ground cursor={cursor}/> }
  <section className="replay-archives" aria-label="Historical event source data archives">
   <h4>Find the source data</h4>
   <p>These are official archive entry points with potentially relevant measurements, <strong>not</strong> preloaded or verified event-specific records. Select the historical interval in each archive. Instrument availability and processing levels differ by year.</p>
   <div className="replay-all">{archivesForEvent(event.id).map(a=><div className="replay-entry" key={a.id}>
    <strong>{a.name}</strong><small>{a.provider} · {a.resolution}</small><span>{a.coverage}</span>
    <p>{a.notes}</p><a href={a.url} target="_blank" rel="noreferrer">Open archive ↗</a>
   </div>)}</div>
  </section>
  <p className="mlab-inference"><strong>Interpretation boundary:</strong> {event.scope} Equal-looking stage markers do not imply equally sampled observations or uniform solar-wind travel time. The selected stage does not change the live 3D globe, NOAA telemetry, or present-day storm forecast.</p>
 </section>;
}
