import {useState} from "react";
import {REPLAY_EVENTS,replayPosition} from "@/lib/space/replay";
const PHASES={solar:"SUN / ERUPTION",transit:"INTERPLANETARY TRANSIT",earth:"EARTH / MAGNETOSPHERE",impact:"OBSERVED IMPACT"} as const;
export default function EventReplay(){
 const [eventId,setEventId]=useState(REPLAY_EVENTS[2]!.id);
 const [step,setStep]=useState(0);
 const event=REPLAY_EVENTS.find(e=>e.id===eventId)??REPLAY_EVENTS[0]!;
 const stage=event.stages[Math.min(step,event.stages.length-1)]!;
 return <section className="mlab-pane event-replay" aria-label="Historical Sun to Earth major event replay">
  <h3>Sun → Earth · major event replay</h3>
  <p>Follow the evidence from solar activity through arrival at Earth to documented consequences. This is a <strong>curated historical chronology</strong>, not a continuous instrument recording, simulated CME path, or prediction.</p>
  <label className="replay-picker">Historical event
   <select aria-label="Choose major space weather event" value={event.id} onChange={e=>{setEventId(e.target.value);setStep(0);}}>
    {REPLAY_EVENTS.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
   </select>
  </label>
  <p className="replay-summary">{event.summary}</p>
  <div className="replay-track" role="group" aria-label="Event stages">
   {event.stages.map((s,i)=><button type="button" key={event.id+"-"+i} className={"replay-node"+(step===i?" selected":"")} aria-pressed={step===i} onClick={()=>setStep(i)} title={s.title} style={{left:(6+88*replayPosition(event,i))+"%"}}><span>{i+1}</span></button>)}
  </div>
  <div className="replay-nav">
   <button type="button" className="btn" disabled={step===0} onClick={()=>setStep(s=>Math.max(0,s-1))}>← Earlier</button>
   <span>Stage {step+1} of {event.stages.length} · {stage.at} UTC date</span>
   <button type="button" className="btn" disabled={step===event.stages.length-1} onClick={()=>setStep(s=>Math.min(event.stages.length-1,s+1))}>Later →</button>
  </div>
  <article className="replay-detail" aria-live="polite">
   <small>{PHASES[stage.phase]} · {stage.at} UTC</small>
   <h4>{stage.title}</h4>
   <p>{stage.detail}</p>
   <a href={stage.source} target="_blank" rel="noreferrer">Evidence / context: {stage.sourceLabel} ↗</a>
  </article>
  <div className="replay-all" aria-label="Complete event chronology">{event.stages.map((s,i)=><button key={i} className={"replay-entry"+(step===i?" active":"")} onClick={()=>setStep(i)} aria-current={step===i?"step":undefined}><time>{s.at}</time><span>{s.title}</span><small>{PHASES[s.phase]}</small></button>)}</div>
  <p className="mlab-inference"><strong>Interpretation boundary:</strong> {event.scope} Equal-looking stage markers do not imply equally sampled observations or uniform solar-wind travel time. The selected stage does not change the live 3D globe, NOAA telemetry, or present-day storm forecast.</p>
 </section>;
}
