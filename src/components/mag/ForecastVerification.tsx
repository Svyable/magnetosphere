import { useQuery } from "@tanstack/react-query";
import {
  LEAD_BANDS, PUBLIC_LEDGER_URL, type LedgerSummary, type SkillRow, type LedgerPair,
} from "@/lib/space/ledger";
import { fmtUtcS } from "./ui";

const ARCHIVE_LINK="https://github.com/Svyable/magnetosphere/tree/forecast-ledger/forecast-ledger";
const round=(x:number|null,digits=2)=>x===null?"—":x.toFixed(digits);
const utc=(t:number)=>new Date(t).toISOString().slice(0,16).replace("T"," ")+" UTC";
function validSummary(x:unknown): x is LedgerSummary {
  if(!x || typeof x!=="object" || Array.isArray(x))return false;
  const r=x as Record<string,unknown>;
  if(r["schemaVersion"]!==1 || !Number.isFinite(r["updatedAt"]) ||
    !Number.isInteger(r["captures"]) || !Number.isInteger(r["verifiedTargetPeriods"]) ||
    !Array.isArray(r["rows"]) || r["rows"].length!==LEAD_BANDS.length ||
    !Array.isArray(r["recentPairs"]))return false;
  const rows=r["rows"] as unknown[];
  const isOptionalNumber=(v:unknown)=>v===null || (typeof v==="number" && Number.isFinite(v));
  return rows.every(v=>{
    if(!v || typeof v!=="object" || Array.isArray(v))return false;
    const row=v as Record<string,unknown>;
    return LEAD_BANDS.includes(row["band"] as typeof LEAD_BANDS[number]) &&
      Number.isInteger(row["pairedPeriods"]) &&
      isOptionalNumber(row["maeKp"]) && isOptionalNumber(row["biasKp"]) &&
      isOptionalNumber(row["persistenceMaeKp"]) &&
      Number.isInteger(row["missedStorms"]) && Number.isInteger(row["falseAlarms"]) &&
      Number.isInteger(row["observedStormPeriods"]);
  }) && (r["recentPairs"] as unknown[]).every(v=>{
    if(!v || typeof v!=="object" || Array.isArray(v))return false;
    const p=v as Record<string,unknown>;
    return Number.isFinite(p["targetAt"]) && Number.isFinite(p["fetchedAt"]) &&
      Number.isFinite(p["leadHours"]) && Number.isFinite(p["forecastKp"]) &&
      Number.isFinite(p["observedKp"]) && LEAD_BANDS.includes(p["band"] as typeof LEAD_BANDS[number]);
  });
}
async function getLedger():Promise<LedgerSummary>{
  const resp=await fetch(PUBLIC_LEDGER_URL,{cache:"no-store",signal:AbortSignal.timeout(12_000)});
  if(!resp.ok)throw new Error("Forecast evidence branch not yet accessible: HTTP "+resp.status);
  const payload:unknown=await resp.json();
  if(!validSummary(payload))throw new Error("Forecast ledger has an unexpected schema; no skill claimed");
  return payload;
}
/**
 * Proof, not invented performance. Captures only begin when scheduled collection
 * first succeeds. Strictly future NOAA predicted slots versus later source-labelled
 * observed Kp; no retroactive reconstruction or calibrated confidence numbers.
 */
export default function ForecastVerification({enabled,now}:{enabled:boolean;now:number}){
  const q=useQuery({
    queryKey:["public-kp-forecast-ledger-v1"],queryFn:getLedger,enabled,
    retry:1,staleTime:15*60_000,refetchInterval:enabled?30*60_000:false,
    refetchOnWindowFocus:true,
  });
  const s=q.data;
  const total=s?.verifiedTargetPeriods??0;
  const latest=s?.latestCaptureAt??null;
  const age=latest===null?null:now-latest;
  const ageStatus=age===null?"unavailable":age<0?"clock mismatch":age<=12*3_600_000?"recent":"collection delayed";
  return <section className="audit-ledger" aria-label="NOAA forecast verification against later observed Kp">
    <div className="audit-ledger-heading">
      <span>OPEN EVIDENCE / FORECAST ACCOUNTABILITY</span>
      <h3>Did the prediction actually come true?</h3>
      <p>This is a publicly versioned experiment, not a confidence meter. Every NOAA Kp prediction is saved <strong>before its target 3-hour period</strong>. Later, we compare it with NOAA's own record marked <em>observed</em>. We also compare with simply persisting the latest already-observed Kp at the time the forecast was saved.</p>
    </div>
    <div className="audit-ledger-kpis">
      <div><span>Captured pre-event forecasts</span><strong>{s?.captures??"—"}</strong><small>Receipts in public Git commits</small></div>
      <div><span>Verified target periods</span><strong>{total || "—"}</strong><small>Unique 3-hour Kp intervals with later observations</small></div>
      <div><span>Last source capture</span><strong>{age===null?"—":ageStatus}</strong><small>{fmtUtcS(latest)} · schedule ~6 h</small></div>
    </div>
    {q.isError ? <div className="audit-ledger-empty" role="status">The open forecast ledger is not yet available or could not be read. This is <strong>not evidence of poor or perfect NOAA forecast skill</strong>. The archive begins with the first successful scheduled collector; no historical accuracy is invented. <a href={ARCHIVE_LINK} target="_blank" rel="noreferrer">Inspect public source branch ↗</a></div>
      : q.isPending || !s ? <div className="audit-ledger-empty">Checking archived forecast receipts…</div>
      : <>
        {total<20 && <div className="audit-ledger-empty" role="status"><strong>Too little evidence for a reliable performance claim.</strong> {total===0?"The archive is collecting predictions. Future observed periods must arrive before any errors can be calculated.":`Only ${total} target 3-hour periods have been paired so far; results are descriptive and preliminary.`} We will not publish a made-up accuracy or confidence percentage.</div>}
        <div className="audit-ledger-skill">
          <h4>Prediction error by lead time</h4>
          <p>Mean absolute error (MAE) is measured in <strong>Kp units</strong>, lower is better. `Persistence` means assuming future Kp will remain equal to the most recent already-observed Kp at capture time. Its sample count can be smaller. Forecast lead windows can reference the same storm period; do not add them together as independent events.</p>
          <div className="audit-ledger-chart" role="group" aria-label="NOAA Kp prediction errors versus a no-change persistence benchmark by forecast lead time">
            {LEAD_BANDS.map(band=>{
              const r=s.rows.find(x=>x.band===band);
              if(!r)return null;
              const max=Math.max(1,r.maeKp??0,r.persistenceMaeKp??0);
              return <div className="audit-ledger-bar-row" key={band}>
                <div className="audit-ledger-bar-head"><b>{band}</b><span>{r.pairedPeriods} matched period{r.pairedPeriods===1?"":"s"}</span></div>
                <div className="audit-ledger-pair-bars">
                  <div title={`NOAA MAE: ${round(r.maeKp)} Kp`}><span>NOAA</span><i style={{width:r.maeKp===null?"0%":Math.max(2,r.maeKp/max*100)+"%"}}/><b>{round(r.maeKp)}</b></div>
                  <div title={`Persistence MAE: ${round(r.persistenceMaeKp)} Kp`}><span>No change</span><i style={{width:r.persistenceMaeKp===null?"0%":Math.max(2,r.persistenceMaeKp/max*100)+"%"}}/><b>{round(r.persistenceMaeKp)}</b></div>
                </div>
                <small>Mean signed NOAA error {round(r.biasKp)} Kp · {r.observedStormPeriods} observed G1+ periods · {r.missedStorms} misses, {r.falseAlarms} false alarms</small>
              </div>;
            })}
          </div>
        </div>
        <h4>Verifiable recent receipts</h4>
        <p className="audit-ledger-explain">Each row has a real forecast snapshot captured *before* the target interval. The verification column is from later NOAA product records marked observed; these are subject to revision and are not independent final planetary Kp.</p>
        {s.recentPairs.length ? <div className="audit-ledger-table-wrap">
          <table className="audit-ledger-table">
            <thead><tr><th>Target period UTC</th><th>Forecast captured UTC</th><th>Lead</th><th>Forecast Kp</th><th>Later observed Kp</th><th>Absolute error</th></tr></thead>
            <tbody>{s.recentPairs.map((p:LedgerPair)=><tr key={p.targetAt+":"+p.band}>
              <td>{utc(p.targetAt)}</td><td>{utc(p.fetchedAt)}</td><td>{round(p.leadHours,1)} h</td>
              <td>{round(p.forecastKp)}</td><td>{round(p.observedKp)}</td><td>{round(Math.abs(p.forecastKp-p.observedKp))}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="audit-ledger-empty">No future-to-observed NOAA Kp pair has matured yet. This is expected when collection has just begun.</p>}
      </>}
    <div className="audit-ledger-method">
      <h4>Public methodology & limits</h4>
      <p>GitHub Actions saves the NOAA Kp product approximately every six hours. Only slots marked <strong>predicted</strong> and dated after the collection timestamp count as forecasts. It later records slots marked <strong>observed</strong>, excluding pending `estimated` Kp, and pairs one prior forecast per lead band and period. The Kp forecast JSON does not expose an independent issuance time, so our immutable Git commit and collection timestamp are the receipt. The first day will have no verifiable score. Missed collection runs create actual evidence gaps; there are no synthetic backfills.</p>
      <p>The observed values are *NOAA's own later source-labelled records*, not independent certified ground truth. Older periods can be revised and are archived when changed. Small samples, imbalanced storm occurrence, overlapping forecasts and changing NOAA procedures limit interpretation. MAE is descriptive; **do not interpret it as probability of a storm, a model confidence score, or an operational warning.**</p>
      <a href={ARCHIVE_LINK} target="_blank" rel="noreferrer">Browse immutable public Git history and archive ↗</a>
      {" · "}<a href="https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json" target="_blank" rel="noreferrer">NOAA original source ↗</a>
    </div>
  </section>;
}
