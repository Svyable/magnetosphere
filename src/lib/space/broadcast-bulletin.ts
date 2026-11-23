/** Source-aware NOAA SWPC issued-product summary for a continuously running broadcast.
 * Never manufacture official watches/warnings from Kp or L1 telemetry.
 * Never interpret lack of warnings in a stale feed as an official all-clear.
 */
import {opsStatus,type SwpcMessage} from "./ops";
export type BroadcastBulletin={
 kind:"warning"|"watch"|"recent-alert"|"none"|"offline";
 heading:string;
 message:string;
 issuance:string;
 productId:string|null;
};
const MAX_FETCH_AGE=10*60_000;
function short(s:string,max=105){const normalized=s.replace(/\s+/g," ").trim();return normalized.length>max?normalized.slice(0,max-1).replace(/\s+\S*$/,"")+"…":normalized;}
const issueStamp=(t:number)=>new Date(t).toISOString().slice(0,16).replace("T"," ")+" UTC";
/** dataUpdatedAt is browser retrieval time; issuedAt remains official NOAA issue time. */
export function issuedBroadcastBulletin(messages:SwpcMessage[]|null,now:number,dataUpdatedAt:number|null):BroadcastBulletin{
 if(!messages||!Number.isFinite(now)||dataUpdatedAt===null||!Number.isFinite(dataUpdatedAt)||
    dataUpdatedAt>now+60_000||now-dataUpdatedAt>MAX_FETCH_AGE){
  return {kind:"offline",heading:"NOAA ISSUED-PRODUCT FEED UNAVAILABLE",message:"Watch/warning status cannot be verified.",issuance:"Source check unavailable",productId:null};
 }
 const state=opsStatus(messages,now);
 const warning=[...state.warnings].sort((a,b)=>((b.scale??"").localeCompare(a.scale??""))||b.issuedAt-a.issuedAt)[0];
 if(warning)return {
  kind:"warning",heading:"NOAA WARNING · CURRENT VALIDITY WINDOW",message:short(warning.title),
  issuance:"Issued "+issueStamp(warning.issuedAt)+(warning.validTo?" · Until "+issueStamp(warning.validTo):""),productId:warning.code
 };
 // A watch is a forecast for a specified day, not an observed storm or necessarily
 // current conditions. Use the actual NOAA wording, not computed Kp severity.
 const watch=[...state.watches].sort((a,b)=>b.issuedAt-a.issuedAt)[0];
 if(watch)return {
  kind:"watch",heading:"NOAA WATCH · FORECAST",message:short(watch.title),
  issuance:"Issued "+issueStamp(watch.issuedAt),productId:watch.code
 };
 const recent=state.recentAlerts.find(m=>m.issuedAt>=now-3*3600_000);
 if(recent)return{
  kind:"recent-alert",heading:"RECENT NOAA THRESHOLD ALERT · OBSERVED",message:short(recent.title),
  issuance:"Issued "+issueStamp(recent.issuedAt),productId:recent.code
 };
 return {kind:"none",heading:"NO CURRENT NOAA WATCH/WARNING IN FETCHED FEED",
  message:"No current watch/warning found. Not an all-clear.",
  issuance:"Last checked "+issueStamp(dataUpdatedAt),productId:null};
}
