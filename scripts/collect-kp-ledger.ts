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
const readme=`# Magnetosphere · public NOAA forecast receipts

This branch contains independently archived *copies of NOAA published predictions* and subsequent NOAA-labeled observed planetary Kp. The collector runs around every six hours, subject to GitHub Actions scheduling and public endpoint availability. Each commit is a dated, reviewable evidence trail.

This dataset starts **only when the collector was first successfully deployed**. Past forecasts are NOT reconstructed from the current rolling product. A retrieval timestamp is **our GitHub runner's fetch time**, not NOAA's forecast issuance time (which the Kp JSON does not expose). `estimated` and future observed values are never used to manufacture verification samples.

Data paths:
- `forecast-ledger/archive/YYYY-MM.json`: immutable captured forecast snapshots and append-only first sightings of NOAA's later `observed` Kp, including revisions.
- `forecast-ledger/summary.json`: descriptive MAE, mean signed error, Kp≥5 hit/false-alarm/miss counts, and a same-time **persistence baseline**, by four lead-time buckets.
- The web UI only shows skill once there are source-matched periods; missing pairs or fewer than 20 pairs are **insufficient/preliminary**, never a claim of reliable calibrated accuracy.

An observed product is subject to later SWPC revisions and is not final independent ground truth. Multiple horizon bands can refer to the same verifying period; do not add their counts as if independent. NOAA Kp is a 3-hour planetary index, not a future full-magnetosphere model, an event probability, or an operational warning.

Official source: ${LEDGER_SOURCE_URL}
Repository science implementation: `src/lib/space/ledger.ts` on `main`.
`;
await writeFile(path.join(ledgerRoot,"README.md"),readme);
console.log(JSON.stringify({
  capture:iso,observationsAdded:next.observations.length-month.observations.length,
  forecastCaptureAdded:next.captures.length-month.captures.length,
  allReceipts:summary.captures,verifiedTargetPeriods:summary.verifiedTargetPeriods,
  scoredRows:summary.rows.map(row=>({lead:row.band,n:row.pairedPeriods,mae:row.maeKp})),
},null,2));
