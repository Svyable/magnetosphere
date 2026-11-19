/**
 * GitHub Actions-only collection job: pin published NOAA predictions BEFORE
 * their target window, and store later SWPC records separately as observations.
 *
 * Never reconstruct past "forecasts" from today's rolling NOAA JSON. There is
 * no generated historical skill until we have actually saved earlier receipts.
 *
 * Run: bun scripts/collect-kp-ledger.ts /path/to/forecast-ledger-worktree
 */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseKpForecast } from "../src/lib/space/forecast";
import {
  appendKpCapture, blankLedgerMonth, verifyForecasts,
  LEDGER_SOURCE_URL, type LedgerMonth,
} from "../src/lib/space/ledger";

const outRepo=process.argv[2];
if(!outRepo || !path.isAbsolute(outRepo)) throw new Error("Supply absolute destination path to the GitHub forecast-ledger worktree");
const ledgerRoot=path.join(outRepo,"forecast-ledger");
const archiveDir=path.join(ledgerRoot,"archive");
const request=await fetch(LEDGER_SOURCE_URL,{
  cache:"no-store",headers:{accept:"application/json"},
  signal:AbortSignal.timeout(20_000),
});
if(!request.ok)throw new Error("NOAA forecast HTTP "+request.status);
const payload=await request.json();
const forecast=parseKpForecast(payload);
// Only after payload was received and parsed is this the public receipt timestamp.
const capturedAt=Date.now();
const iso=new Date(capturedAt).toISOString();
const filename=iso.slice(0,7)+".json";
await mkdir(archiveDir,{recursive:true});
const monthlyPath=path.join(archiveDir,filename);
let month:LedgerMonth=blankLedgerMonth();
try{
  const existing=JSON.parse(await readFile(monthlyPath,"utf8")) as Partial<LedgerMonth>;
  if(existing.schemaVersion!==1 || !Array.isArray(existing.captures) || !Array.isArray(existing.observations))
    throw new Error("Existing ledger archive has unexpected schema; refuse overwrite");
  month=existing as LedgerMonth;
}catch(err){
  const error=err as NodeJS.ErrnoException;
  if(error.code!=="ENOENT")throw err;
}
const next=appendKpCapture(month,forecast,capturedAt);
await writeFile(monthlyPath,JSON.stringify(next,null,2)+"\n");

const months:LedgerMonth[]=[];
const files=(await readdir(archiveDir)).filter(name=>/^\d{4}-\d{2}\.json$/.test(name)).sort();
for(const name of files){
  const m=JSON.parse(await readFile(path.join(archiveDir,name),"utf8")) as LedgerMonth;
  if(m.schemaVersion!==1||!Array.isArray(m.captures)||!Array.isArray(m.observations))
    throw new Error("Malformed archived ledger month "+name);
  months.push(m);
}
const summary=verifyForecasts(months,capturedAt);
await writeFile(path.join(ledgerRoot,"summary.json"),JSON.stringify(summary,null,2)+"\n");
const readme = ["# Magnetosphere — public NOAA Kp forecast receipts","","This branch contains public NOAA forecast snapshots captured before each target three-hour window and subsequent records marked observed. Scheduled collection runs roughly every six hours, subject to GitHub Actions/network availability. Every Git commit is evidence of when each snapshot existed.","","Data starts ONLY when the collector first runs successfully. Past predictions are never fabricated from the current rolling feed. A retrieval timestamp is the GitHub runner's fetch UTC, NOT NOAA's independently issued timestamp (which this JSON does not supply). Estimated Kp and future observations are excluded from forecast verification.","","Data paths:","- forecast-ledger/archive/YYYY-MM.json: captured predicted Kp and append-only initial and revised NOAA-observed values.","- forecast-ledger/summary.json: descriptive Kp MAE, signed bias, G1+ hits/misses/false alarms and at-capture persistence benchmark, grouped by lead interval.","","No score is reported until later observed target periods exist, and fewer than 20 distinct periods are explicitly preliminary. Multiple forecast horizons may share a target time; their counts are not independent.","","The source-observed Kp values may be revised, are not independent certified ground truth, and their errors are not probabilistic storm confidence or safety guidance.","Official NOAA source: https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json","Methodology: https://github.com/Svyable/magnetosphere/blob/main/src/lib/space/ledger.ts",""].join("\n");
await writeFile(path.join(ledgerRoot,"README.md"),readme);
console.log(JSON.stringify({
  capture:iso,observationsAdded:next.observations.length-month.observations.length,
  forecastCaptureAdded:next.captures.length-month.captures.length,
  allReceipts:summary.captures,verifiedTargetPeriods:summary.verifiedTargetPeriods,
  scoredRows:summary.rows.map(row=>({lead:row.band,n:row.pairedPeriods,mae:row.maeKp})),
},null,2));
