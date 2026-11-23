import {lazy,Suspense,useEffect,useMemo,useState} from "react";
import {useKp,useMag,useOvation,useWind} from "@/lib/space/data";
import {broadcastSourceState,broadcastStory,canShowMeasurement,observationAge} from "@/lib/space/broadcast";
import {dynamicPressure,freshness,joinL1,kpLabel,laggedSample,propagationSeconds,shue,type Freshness,type L1Sample} from "@/lib/space/model";
import type {LayerKey,Preset} from "./Scene";
const Scene=lazy(()=>import("./Scene"));
const LAYERS:Record<LayerKey,boolean>={saa:false,poles:false,mp:true,bs:true,fl:true,tail:true,wind:true,aurora:true,axes:false,geo:false,labels:false};
const BASE=import.meta.env.BASE_URL;
const fmt=(t:number)=>new Date(t).toISOString().slice(0,19).replace("T"," ")+" UTC";
const safeValue=(n:number|null,state:Freshness,digits=0)=>canShowMeasurement(state,n)?n.toFixed(digits):"—";
const STREAM_SHOTS:Preset[]=["global","earth","tail","arctic"];
function Clock(){
 const [time,setTime]=useState(()=>Date.now());
 useEffect(()=>{const id=window.setInterval(()=>setTime(Date.now()),1000);return ()=>clearInterval(id);},[]);
 return <time dateTime={new Date(time).toISOString()} className="broadcast-clock">{fmt(time)}</time>;
}
function Trace({samples,keyName,label,now,color}:{samples:L1Sample[];keyName:"v"|"bz";label:string;now:number;color:string}){
 const data=samples.filter(s=>s.t>now-4*3600_000&&s.t<=now+60_000);
 const values=data.map(s=>s[keyName]).filter((v):v is number=>v!==null&&Number.isFinite(v));
 if(values.length<3)return <div className="broadcast-trace-missing">Four-hour history unavailable</div>;
 const low=Math.min(...values,keyName==="bz"?0:250),high=Math.max(...values,keyName==="bz"?0:750);
 const range=high-low||1,W=320,H=60;
 let d="",prev=-Infinity;
 for(const row of data){
  const v=row[keyName];
  if(v===null||!Number.isFinite(v)){prev=-Infinity;continue;}
  const x=Math.max(0,Math.min(W,(row.t-(now-4*3600_000))/(4*3600_000)*W));
  const y=H-((v-low)/range)*H;
  d+=(row.t-prev>150_000?"M":"L")+x.toFixed(1)+","+y.toFixed(1)+" ";
  prev=row.t;
 }
 return <svg viewBox="0 0 320 60" preserveAspectRatio="none" role="img" aria-label={label+" over the preceding four hours, source gaps not connected"}>
  <path d={d.trim()} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round"/>
 </svg>;
}
function Reading({label,value,unit,age,source,status,children}:{label:string;value:string;unit:string;age:string;source:string;status:Freshness;children?:React.ReactNode}){
 return <section className="broadcast-reading">
  <div className="broadcast-reading-top"><span>{label}</span><span className={"broadcast-source-state state-"+status}>{status==="live"?"CURRENT":status.toUpperCase()}</span></div>
  <div className="broadcast-reading-number">{value==="—"?<strong className="broadcast-no-reading">NO CURRENT DATA</strong>:<><strong>{value}</strong><small>{unit}</small></>}</div>
  {children}
  <div className="broadcast-reading-foot"><span>{source}</span><span>{age}</span></div>
 </section>;
}
export default function BroadcastApp(){
 const wind=useWind(),mag=useMag(),kp=useKp(),ov=useOvation();
 const [now,setNow]=useState(()=>Date.now());
 const [storyStep,setStoryStep]=useState(0);
 const [reducedMotion,setReducedMotion]=useState(false);
 const [params]=useState(()=>new URLSearchParams(typeof window==="undefined"?"":window.location.search));
 const requestedShot=params.get("shot");
 const shot:Preset=STREAM_SHOTS.includes(requestedShot as Preset)?requestedShot as Preset:"global";
 const motionDisabled=params.get("motion")==="off";
 const lowPower=params.get("quality")==="low";
 const safetyGuide=params.get("safe")==="1";
 useEffect(()=>{
  const clock=window.setInterval(()=>setNow(Date.now()),15_000);
  const stories=window.setInterval(()=>setStoryStep(s=>(s+1)%6),32_000);
  const q=window.matchMedia("(prefers-reduced-motion: reduce)");
  const sync=()=>setReducedMotion(q.matches);
  sync();q.addEventListener("change",sync);
  document.title="MAGNETOSPHERE · LIVE BROADCAST VIEW";
  return ()=>{window.clearInterval(clock);window.clearInterval(stories);q.removeEventListener("change",sync);};
 },[]);
 const joined=useMemo(()=>joinL1(wind.data??[],mag.data??[]),[wind.data,mag.data]);
 const windAt=wind.data?.at(-1)??null,magAt=mag.data?.at(-1)??null,kpAt=kp.data?.at(-1)??null;
 const wState=freshness(windAt?.t??null,now,10*60_000,wind.isError&&!wind.data?.length);
 const mState=freshness(magAt?.t??null,now,10*60_000,mag.isError&&!mag.data?.length);
 const kState=freshness(kpAt?.t??null,now,6*3600_000,kp.isError&&!kp.data?.length);
 const oState=freshness(ov.data?.observed??null,now,30*60_000,ov.isError&&!ov.data);
 const sourceState=broadcastSourceState(wState,mState);
 // The rendered Shue boundary uses upstream observations propagated to an estimated arrival
 // time, not the latest unpropagated L1 value. If the inputs are stale, use a labeled reference.
 const lagged=sourceState==="current"?laggedSample(joined,now):null;
 const expectedArrival=lagged?lagged.t+propagationSeconds(lagged.v)*1000:0;
 const modelInput=lagged&&lagged.bz!==null&&now-expectedArrival<30*60_000&&now-expectedArrival>=-60_000?lagged:null;
 const model=useMemo(()=>modelInput?shue(dynamicPressure(modelInput.n,modelInput.v),modelInput.bz!):shue(2,0),[modelInput]);
 const hasOvation=oState==="live"&&!!ov.data?.points.length;
 const dataBz=canShowMeasurement(mState,magAt?.bz??null)?magAt!.bz:null;
 const dataKp=canShowMeasurement(kState,kpAt?.kp??null)?kpAt!.kp:null;
 const story=broadcastStory(storyStep,dataBz,dataKp);
 const streamLabel=sourceState==="current"?"NOAA INPUTS CURRENT":sourceState==="partial"?"PARTIAL NOAA INPUTS":"NOAA INPUTS UNAVAILABLE";
 const kpSummary=dataKp!==null?kpLabel(dataKp):"Kp unavailable";
 return <main className={"broadcast-screen"+(safetyGuide?" broadcast-safe-guide":"")} aria-label="Magnetosphere continuous live broadcast view">
  <div className="broadcast-scene" aria-hidden="true">
   <Suspense fallback={<div className="broadcast-scene-loading">INITIALIZING EARTH OBSERVATORY</div>}>
    <Scene layers={{...LAYERS,aurora:hasOvation}} r0={model.r0} alpha={model.alpha}
      speed={canShowMeasurement(wState,windAt?.v??null)?windAt!.v:null}
      time={now} aurora={hasOvation?ov.data!.points:null} preset={shot} presetNonce={0}
      cinematic={!motionDisabled} reducedMotion={motionDisabled||reducedMotion}
      lowPower={lowPower} fieldDetail="balanced" baseline={!modelInput} core={null}/>
   </Suspense>
  </div>
  <div className="broadcast-vignette" aria-hidden="true"/>
  <header className="broadcast-header">
   <div className="broadcast-identity"><div className="broadcast-symbol" aria-hidden="true">✳</div><div><div className="broadcast-wordmark">MAGNETOSPHERE</div><div className="broadcast-tagline">EARTH NOW <span> / SPACE WEATHER OBSERVATORY</span></div></div></div>
   <div className="broadcast-timebox"><span className={"broadcast-live-pill "+sourceState}><span className="broadcast-pulse" aria-hidden="true"/> {streamLabel}</span><Clock/></div>
  </header>
  <div className="broadcast-scene-caption"><span className="broadcast-scene-index">VIEW / {shot.toUpperCase()}</span><span className="broadcast-scene-caption-line">{modelInput?"Shue magnetopause · propagated L1 drivers":"REFERENCE MAGNETOSPHERE · CURRENT DRIVERS UNAVAILABLE"}</span></div>
  <aside className="broadcast-left" aria-label="Live NOAA space weather measurements">
   <div className="broadcast-section-title"><span>01 / LIVE TELEMETRY</span><span>NOAA SWPC</span></div>
   <Reading label="SOLAR WIND SPEED" value={safeValue(windAt?.v??null,wState)} unit="km/s"
    status={wState} source="L1 plasma · observed" age={observationAge(now,windAt?.t??null)}>
    <Trace samples={joined} keyName="v" label="Solar wind speed" now={now} color="#f1b778"/>
   </Reading>
   <Reading label="INTERPLANETARY Bz" value={safeValue(magAt?.bz??null,mState,1)} unit="nT"
    status={mState} source="L1 GSM Bz · observed" age={observationAge(now,magAt?.t??null)}>
    <Trace samples={joined} keyName="bz" label="Interplanetary magnetic Bz" now={now} color="#6ae4d7"/>
   </Reading>
   <Reading label="PLANETARY Kp" value={safeValue(kpAt?.kp??null,kState,1)} unit="/ 9"
    status={kState} source="NOAA · 3-hour index" age={observationAge(now,kpAt?.t??null)}>
    <p className="broadcast-kp-context">{kpSummary}</p>
   </Reading>
   <div className="broadcast-model-chip"><span>MODELLED DAYSIDE BOUNDARY</span><strong>{modelInput?model.r0.toFixed(1)+" Rᴇ":"REFERENCE"}</strong><small>Shue 1998 · not measured</small></div>
  </aside>
  <aside className="broadcast-right" aria-label="Space weather science explainer">
   <div className="broadcast-section-title"><span>02 / THE BIG PICTURE</span><span>FIELD NOTES</span></div>
   <article className="broadcast-story" aria-live="off">
    <p className="broadcast-story-eyebrow">{story.eyebrow}</p>
    <h1>{story.title}</h1>
    <p className="broadcast-story-body">{story.body}</p>
    <p className="broadcast-story-credit">{story.credit}</p>
    <div className="broadcast-story-index" aria-label={"Story "+(storyStep+1)+" of 6"}>{Array.from({length:6},(_,i)=><span key={i} className={i===storyStep?"current":""}/>)}</div>
   </article>
   <div className="broadcast-aurora">
    <span>NOAA OVATION AURORA MODEL</span>
    <strong>{hasOvation?"NOWCAST AVAILABLE":"NOWCAST UNAVAILABLE"}</strong>
    <small>{hasOvation&&ov.data?.forecast?"Model target "+fmt(ov.data.forecast):"No validated current aurora overlay"}</small>
   </div>
  </aside>
  <footer className="broadcast-bottom">
   <div className="broadcast-bottom-status"><span className="broadcast-footer-dot"/>NOAA IN-SITU MEASUREMENTS <span>+</span> EMPIRICAL / ILLUSTRATIVE 3D MODEL</div>
   <div className="broadcast-bottom-source">Measurements: NOAA SWPC L1 & Kp · Aurora: NOAA OVATION model · Geometry: Shue 1998 · Not a hazard alert</div>
   <a className="broadcast-open" href={BASE} aria-label="Open interactive Magnetosphere observatory">EXPLORE THE INTERACTIVE OBSERVATORY <span aria-hidden>↗</span></a>
  </footer>
  {safetyGuide&&<div className="broadcast-calibration" aria-hidden="true">5% TITLE-SAFE BOUNDARY · DISABLE ?safe=1 BEFORE STREAMING</div>}
 </main>;
}
