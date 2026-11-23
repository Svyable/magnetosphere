/** Pure, deterministic editorial and provenance rules for the 24/7 capture view.
 * The presentation may be live even when the upstream observations are not.
 */
import type {Freshness} from "./model";
export type BroadcastSourceState="current"|"partial"|"offline";
export interface BroadcastStory{eyebrow:string;title:string;body:string;credit:string}
export function broadcastSourceState(wind:Freshness,mag:Freshness):BroadcastSourceState{
 if(wind==="live"&&mag==="live")return "current";
 if(wind==="live"||mag==="live")return "partial";
 return "offline";
}
export function broadcastStory(index:number,liveBz:number|null,kp:number|null):BroadcastStory{
 const stories:BroadcastStory[]=[
  {eyebrow:"01 / THE SHIELD",title:"Earth is inside a magnetic ocean.",body:"The field lines you see are illustrative. The luminous boundary is an empirical magnetopause model, driven by upstream solar-wind conditions when fresh measurements are available.",credit:"Shue et al. (1998) · NOAA RTSW"},
  {eyebrow:"02 / SOLAR WIND",title:"The Sun is always sending something our way.",body:"Spacecraft near L1 measure fast-moving plasma before it reaches Earth. The particles in this scene are a visual metaphor, not a scale drawing of their flight.",credit:"NOAA SWPC · real-time solar wind"},
  {eyebrow:"03 / MAGNETIC ORIENTATION",title:"The direction of Bz matters.",body:"Southward interplanetary magnetic field can favor magnetic reconnection. One Bz reading does not, by itself, predict an aurora or a geomagnetic storm.",credit:"NOAA SWPC · GSM magnetic-field measurements"},
  {eyebrow:"04 / PLANETARY INDEX",title:"Kp describes Earth's global disturbance.",body:"Kp summarizes geomagnetic activity in three-hour intervals. It is not a measurement of the magnetic field at your home, and it cannot identify a unique solar eruption.",credit:"NOAA planetary K-index · three-hour index"},
  {eyebrow:"05 / AURORA OVAL",title:"Auroras reveal energy entering the upper atmosphere.",body:"When the green aurora layer is present, it comes from NOAA's OVATION probability nowcast—not from a camera or a promise that the sky is visible at a location.",credit:"NOAA SWPC OVATION · model output"},
  {eyebrow:"06 / OBSERVATORY",title:"Every live number needs a timestamp.",body:"This view keeps measurement age visible. Missing feeds never become invented values, and a model remains a model even when real measurements drive its shape.",credit:"Magnetosphere · source-aware visualization"},
 ];
 if(index===2&&liveBz!==null&&liveBz<=-5)
  return {eyebrow:"03 / SOUTHWARD IMF OBSERVED",title:"The field at L1 is pointing south.",body:"Measured GSM Bz is "+liveBz.toFixed(1)+" nT. Southward IMF can favor magnetospheric coupling, but this is not an aurora forecast or an issued NOAA alert.",credit:"NOAA SWPC · L1 magnetic-field observation"};
 if(index===3&&kp!==null&&kp>=5)
  return {eyebrow:"04 / PLANETARY Kp",title:"Storm-level geomagnetic activity is indicated.",body:"The latest NOAA planetary Kp is "+kp.toFixed(1)+". This three-hour index is a summary of activity, not a current field reading everywhere on Earth or a formal NOAA warning.",credit:"NOAA SWPC · near-real-time planetary K-index"};
 return stories[((index%stories.length)+stories.length)%stories.length]!;
}
export function canShowMeasurement(state:Freshness,value:number|null):value is number{
 return state==="live"&&value!==null&&Number.isFinite(value);
}
export function observationAge(now:number,observedAt:number|null):string{
 if(observedAt===null||!Number.isFinite(observedAt))return "timestamp unavailable";
 const minutes=Math.floor((now-observedAt)/60000);
 if(minutes<0)return "clock mismatch";
 if(minutes<1)return "<1 min old";
 if(minutes<60)return minutes+" min old";
 return Math.floor(minutes/60)+"h "+minutes%60+"m old";
}
