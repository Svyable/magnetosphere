// Runs on GitHub Actions' network. Checks public endpoints without claiming a worldwide service status.
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { AUDIT_SPECS, evaluateJson, failedAudit, type AuditResult } from "../src/lib/space/feed-audit";
import { assessHealth } from "../src/lib/space/health";

const CHECKED_AT = Date.now();
const RETRIES = 2;

async function requestWithRetry(url: string, method: "GET" | "HEAD" = "GET") {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method, cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: method === "GET" ? { accept: "application/json" } : {},
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response;
    } catch (e) {
      lastError = e;
      if (attempt + 1 < RETRIES) await new Promise(resolve => setTimeout(resolve, 700));
    }
  }
  throw lastError;
}

async function checkFeed(spec: typeof AUDIT_SPECS[number]): Promise<AuditResult> {
  try {
    const response = await requestWithRetry(spec.url);
    const json = await response.json();
    return evaluateJson(spec, json, CHECKED_AT, response.status);
  } catch (e) {
    return failedAudit(spec, CHECKED_AT, e instanceof Error ? e.message : String(e));
  }
}

const GOES = [
  { name: "GOES-East GOES-19 GeoColor", url: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/678x678.jpg" },
  { name: "GOES-West GOES-18 GeoColor", url: "https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/678x678.jpg" },
];
async function checkGoes(g: typeof GOES[number]): Promise<AuditResult> {
  try {
    const response = await requestWithRetry(g.url, "HEAD");
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("image/")) throw new Error("Unexpected Content-Type: " + type);
    const lmText = response.headers.get("last-modified");
    const lmMs = lmText ? Date.parse(lmText) : NaN;
    const serverUpdatedAt = Number.isFinite(lmMs) ? new Date(lmMs).toISOString() : null;
    return { label:g.name, origin:"GeoColor visible/IR composite", url:g.url, required:false,
      status:"image-reachable-unverified", checkedAt:CHECKED_AT, acquiredAt:null, ageMinutes:null,
      validCount:1, responseStatus:response.status,
      note: "Image URL returned " + type + ". Server Last-Modified: " + (serverUpdatedAt ?? "not supplied") + ". This is NOT the image scan time; check NOAA's printed image banner." };
  } catch (e) {
    return { label:g.name, origin:"GeoColor visible/IR composite", url:g.url, required:false,
      status:"disconnected", checkedAt:CHECKED_AT, acquiredAt:null, ageMinutes:null, validCount:0,
      error:e instanceof Error ? e.message : String(e),
      note:"GitHub runner could not reach/validate the image; not a claim of a global NOAA outage." };
  }
}

const results = await Promise.all([...AUDIT_SPECS.map(checkFeed), ...GOES.map(checkGoes)]);
const requiredFailures = results.filter(r => r.required && r.status !== "current");
const status = requiredFailures.length ? "NOAA L1 upstream validation failed from this runner" : "NOAA L1 upstream data validated from this runner";
const outputDir = process.env.OUTPUT_DIR || "artifacts/feed-health";
await mkdir(outputDir, { recursive: true });
const report = { checked_at_utc:new Date(CHECKED_AT).toISOString(), vantage:"GitHub Actions runner, not a global monitoring network", status, required_failures: requiredFailures.map(r=>r.label), results };
await writeFile(outputDir + "/feed-health.json", JSON.stringify(report, null, 2) + "\n");

const time = (ms: number | null) => ms === null ? "—" : new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC";
const mdSafe = (s: string) => s.replaceAll("|", "\\|").replaceAll("\n", " ");
const summary = [
  "# Space-weather public-feed audit",
  "",
  "**" + status + "** · " + time(CHECKED_AT),
  "",
  "This report reflects one GitHub Actions runner's ability to reach and parse the published feeds. It is not proof of a global outage, an operational space-weather warning, or a satellite health assessment.",
  "",
  "| Product | Role | Result | Source time | Measured/source age | Valid records |",
  "| --- | --- | --- | --- | --- | ---: |",
  ...results.map(r => "| [" + mdSafe(r.label) + "](" + r.url + ") | " + mdSafe(r.origin) + " | " + r.status + " | " + time(r.acquiredAt) + " | " + (r.ageMinutes === null ? "—" : r.ageMinutes.toFixed(1) + " min") + " | " + r.validCount + " |"),
  "",
  "## Interpretation",
  "",
  "- **NOAA L1:** source time is an upstream in-situ measurement; arrival at Earth is an *estimated advection time* in the application.",
  "- **NOAA OVATION:** product's source time is forecast input; it is a model, not a camera.",
  "- **Kp:** a ground-derived, three-hour index; not an instant solar-wind sensor.",
  "- **NASA EPIC:** timestamp denotes an actual photograph's acquisition, often released days later. A recent release is not a live Earth camera.",
  "- **NOAA GOES image HEAD:** confirms only image endpoint accessibility. Last-Modified is not guaranteed to be scan acquisition time. Image content and its banner were not visually verified.",
  "",
  "## Diagnostics",
  "",
  ...results.filter(r => r.error).map(r => "- **" + mdSafe(r.label) + ":** " + mdSafe(r.error || "")),
  ...(results.every(r => !r.error) ? ["No transport errors from this runner."] : []),
  "",
];
const markdown = summary.join("\n");
await writeFile(outputDir + "/feed-health.md", markdown);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
if (requiredFailures.length) process.exitCode = 1;
