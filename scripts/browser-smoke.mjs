// Browser-level test of the real bundled app; live feeds may be inaccessible from a runner.
// Run with: BROWSER_BASE_URL=http://127.0.0.1:4173 bun scripts/browser-smoke.mjs
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.BROWSER_BASE_URL || "http://127.0.0.1:4173/";
const out = "artifacts/browser-smoke";
await mkdir(out, { recursive: true });
const checks = [], pageErrors = [], externalFailures = [];
let browser = null;
async function check(title, fn) {
  try { await fn(); checks.push({ title, status: "passed" }); console.log("PASS", title); }
  catch (e) { const error = e instanceof Error ? e.message : String(e); checks.push({ title, status: "failed", error }); console.error("FAIL", title, error); }
}
async function closeOverlay(page) {
  const btn = page.getByRole("button", { name: /Close · Esc/ });
  if (await btn.count()) await btn.first().click();
}
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  page.on("pageerror", err => pageErrors.push(err.message));
  page.on("requestfailed", request => {
    if (/services\.swpc\.noaa\.gov|epic\.gsfc\.nasa\.gov|nesdis\.noaa\.gov|kp\.gfz\.de/.test(request.url())) {
      externalFailures.push({ url: request.url(), error: request.failure()?.errorText || "failed" });
    }
  });
  await check("Home route and observable header", async () => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35_000 });
    await page.locator(".topbar").waitFor({ timeout: 20_000 });
    const h = await page.locator(".brand").innerText();
    if (!h.includes("MAGNETOSPHERE")) throw new Error("Missing observatory brand");
    const views = page.getByRole("group", { name: "Camera preset" });
    const earth = views.getByRole("button", { name: "earth", exact: true });
    const global = views.getByRole("button", { name: "global", exact: true });
    if (await earth.getAttribute("aria-pressed") !== "true") throw new Error("New visitors should see the Earth close-up camera");
    await global.click();
    if (await global.getAttribute("aria-pressed") !== "true") throw new Error("Global scale view unavailable");
    await earth.click();
    if (await earth.getAttribute("aria-pressed") !== "true") throw new Error("Earth camera did not restore");
  });
  await check("3D WebGL canvas is present and sized", async () => {
    await page.locator("#scene-wrap canvas").waitFor({ state:"attached", timeout: 25_000 });
    await page.locator('#scene-wrap[data-globe-ready="true"]').waitFor({ timeout: 25_000 });
    const box = await page.locator("#scene-wrap canvas").boundingBox();
    if (!box || box.width < 400 || box.height < 300) throw new Error("3D canvas has invalid dimensions: " + JSON.stringify(box));
  });
  await page.screenshot({ path: out + "/desktop.png", fullPage: true });

  await check("Curated field-line detail controls preserve scientific layers and share links", async () => {
    const quiet = page.getByRole("button", { name: "Quiet", exact: true });
    const research = page.getByRole("button", { name: "Detailed", exact: true });
    const balanced = page.getByRole("button", { name: "Balanced", exact: true });
    if (await quiet.getAttribute("aria-pressed") !== "true") throw new Error("Default field-line detail is not quiet");
    await quiet.click();
    if (await quiet.getAttribute("aria-pressed") !== "true") throw new Error("Quiet view did not activate");
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("detail") === "quiet", { timeout: 5000 });
    await page.screenshot({ path: out + "/quiet-magnetosphere.png", fullPage: true });
    await research.click();
    if (await research.getAttribute("aria-pressed") !== "true") throw new Error("Detailed view did not activate");
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("detail") === "detailed", { timeout: 5000 });
    await balanced.click();
    if (await balanced.getAttribute("aria-pressed") !== "true") throw new Error("Balanced view did not restore");
  });
  await check("Data passport shows NOAA/GOES/GFZ source details", async () => {
    await page.getByRole("button", { name: /Data passport/i }).click();
    await page.getByRole("dialog", { name: /Data passport/i }).waitFor();
    const count = await page.locator(".passport-table tbody tr").count();
    if (count < 6) throw new Error("Expected 6 provenance sources, found " + count);
    await closeOverlay(page);
  });
  await check("Satellite gallery has EPIC and two GOES controls", async () => {
    await page.getByRole("button", { name: /Eyes on Earth/i }).click();
    await page.getByRole("dialog", { name: /Eyes on Earth/i }).waitFor();
    const count = await page.getByRole("tab").count();
    if (count < 3) throw new Error("Satellite tabs missing");
    await closeOverlay(page);
  });
  await check("IGRF field inspector accepts geographic coordinates", async () => {
    await page.getByRole("button", { name: /Field explorer/i }).click();
    await page.getByRole("dialog", { name: /Inspect Earth's magnetic field/i }).waitFor();
    await page.getByRole("textbox", { name: /Latitude/i }).fill("40");
    await page.getByRole("textbox", { name: /Longitude/i }).fill("-105.25");
    await page.getByRole("button", { name: "Inspect", exact: true }).click();
    await page.locator(".fx-table").waitFor({ timeout: 15_000 });
    if (!(await page.locator(".fx-table").innerText()).includes("Total F")) throw new Error("Model field values absent");
    await closeOverlay(page);
  });
  await check("Incoming L1 advection separates measured upstream data from future 3D scenario", async () => {
    await page.getByRole("button", { name: /Incoming & future/i }).click();
    await page.getByRole("dialog", { name: /FORECAST \/ EARTH AHEAD/i }).waitFor();
    await page.getByRole("tab", { name: /Incoming L1/i }).waitFor();
    await page.getByText(/Measured upstream\. Not yet at Earth\./i).waitFor();
    await page.getByText(/not an independently issued NOAA forecast/i).waitFor();
    await page.getByRole("tab", { name: /Now.*72h/i }).click();
    await page.getByRole("heading", { name: /Planetary Kp · next three days/i }).waitFor();
    await page.getByRole("tab", { name: /Incoming L1/i }).click();
    // A real feed may have no future arrivals; the interface must then show a data gap.
    const pulse = page.locator(".incoming-table tbody tr");
    if (await pulse.count() === 0) await page.getByText(/No not-yet-arrived valid L1 samples/i).waitFor();
    else {
      const csv = page.getByRole("button", { name: /Export every incoming L1 sample/i });
      await csv.waitFor();
      const enabledPreview = page.locator(".incoming-table tbody button:not([disabled])").first();
      if (await enabledPreview.count()) {
        await enabledPreview.click();
        await page.getByText(/UPSTREAM SCENARIO · NOT YET OBSERVED AT EARTH/).waitFor();
        await page.getByRole("button", { name: /Return live geometry/i }).click();
      }
    }
    await closeOverlay(page);
  });
  await check("Real NOAA future forecast center distinguishes 72h predictions from 27-day outlook", async () => {
    await page.getByRole("button", { name: /Incoming & future/i }).click();
    await page.getByRole("dialog", { name: /FORECAST \/ EARTH AHEAD/i }).waitFor({ timeout: 15_000 });
    await page.getByRole("tab", { name: /Now.*72h/i }).click();
    await page.getByRole("heading", { name: /Planetary Kp · next three days/i }).waitFor();
    await page.getByText(/NOAA daily geomagnetic storm probabilities/i).waitFor();
    await page.getByText(/0–30 minute aurora forecast/i).waitFor();
    // Issued NOAA products and S/R scales are separate sections; a feed failure must render as "not an all-clear".
    await page.getByRole("region", { name: /NOAA-issued alerts, watches and warnings/i }).waitFor();
    await page.getByRole("region", { name: /solar radiation storm and radio blackout probabilities/i }).waitFor();
    await page.locator(".ops-clear, .ops-list, .ops-unavailable").first().waitFor({ timeout: 20_000 });
    await page.getByRole("tab", { name: /Next 27 days/i }).click();
    await page.getByRole("heading", { name: /27-day outlook/i }).waitFor();
    await page.getByRole("tab", { name: /72h · NOAA warnings/i }).click();
    await closeOverlay(page);
  });
  await check("Four forecast utilities: storm windows, revisions, local time and deep links", async () => {
    await page.getByRole("button", { name: /Incoming & future/i }).click();
    await page.getByRole("dialog", { name: /FORECAST.*EARTH AHEAD/i }).waitFor();
    await page.getByRole("tab", { name: /Now.*72h/i }).click();
    await page.getByRole("heading", { name: /Predicted storm windows/i }).waitFor();
    await page.getByRole("heading", { name: /What changed since your saved forecast/i }).waitFor();
    const utc = page.getByRole("button", { name: "UTC", exact: true });
    const local = page.getByRole("button", { name: "My local time", exact: true });
    await local.click();
    if (await local.getAttribute("aria-pressed") !== "true") throw new Error("Local timezone mode not selected");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("clock") === "local");
    const save = page.getByRole("button", { name: /Save current NOAA forecast/i });
    if (await save.isEnabled()) {
      await save.click();
      await page.getByRole("button", { name: /Clear saved comparison/i }).waitFor();
      await page.getByText(/matching 3h periods/i).waitFor();
    } else await page.getByText(/No recently fetched|No valid NOAA|No baseline saved/i).first().waitFor();
    const windows = page.locator(".fc-storm-window");
    if (await windows.count()) {
      await windows.first().click();
      await page.waitForFunction(() => new URL(location.href).searchParams.has("storm"));
      if (await windows.first().getAttribute("aria-pressed") !== "true") throw new Error("Storm window not selected");
    }
    await page.getByRole("button", { name: /Copy link to forecast view/i }).click();
    await page.getByText(/Forecast view link copied|Clipboard unavailable/i).waitFor();
    await page.getByRole("tab", { name: /Forecast receipts/i }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("forecast") === "verify");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("dialog", { name: /FORECAST.*EARTH AHEAD/i }).waitFor({ timeout: 20000 });
    if (await page.getByRole("tab", { name: /Forecast receipts/i }).getAttribute("aria-selected") !== "true")
      throw new Error("Shared forecast tab did not restore on reload");
    await utc.click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has("clock"));
    await closeOverlay(page);
    await page.waitForFunction(() => !new URL(location.href).searchParams.has("forecast"));
  });
  await check("Mission Lab local aurora, Shue what-if, L1 event patterns and evidence brief", async () => {
    await page.getByRole("button", { name: /Mission Lab/i }).click();
    await page.getByRole("dialog", { name: /Earth Mission Lab/i }).waitFor({ timeout: 20000 });
    await page.getByRole("tab", { name: /Aurora at a point/i }).waitFor();
    await page.getByRole("textbox", { name: /Observer latitude/i }).fill("69.65");
    await page.getByRole("textbox", { name: /Observer longitude/i }).fill("18.96");
    await page.getByRole("button", { name: /Inspect coordinates/i }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("lat") === "69.65");
    await page.getByText(/Model ≠ visibility forecast/i).waitFor();
    await page.getByRole("tab", { name: /Shue what-if lab/i }).click();
    await page.getByRole("heading", { name: /Change the drivers/i }).waitFor();
    await page.getByRole("button", { name: /Preview what-if geometry/i }).click();
    await page.getByText(/HYPOTHETICAL MODEL · NOT OBSERVED \/ NOT FORECAST/i).waitFor();
    await page.getByRole("button", { name: /Return observed geometry/i }).click();
    await page.keyboard.press("m");
    await page.getByRole("dialog", { name: /Earth Mission Lab/i }).waitFor();
    await page.getByRole("tab", { name: /Upstream event patterns/i }).click();
    await page.getByRole("heading", { name: /Detect distinctive upstream patterns/i }).waitFor();
    await page.getByRole("tab", { name: /Evidence brief/i }).click();
    await page.getByRole("heading", { name: /Make a portable evidence brief/i }).waitFor();
    const text = await page.locator(".mlab-report").innerText();
    if (!text.includes("NOAA") || !text.includes("Science limits")) throw new Error("Source-linked evidence brief incomplete");
    await page.getByRole("button", { name: /Download .md brief/i }).click();
    await page.getByText(/Markdown evidence brief exported/i).waitFor();
    await page.getByRole("tab", { name: /Earth receipts · ground stations/i }).click();
    await page.getByRole("heading", { name: /Space weather, measured underfoot/i }).waitFor();
    await page.getByRole("button", { name: /Sitka.*Alaska/i }).click();
    await page.getByText(/Sitka \(SIT\)/).waitFor();
    await page.getByText(/Ground truth is local, not a global storm diagnosis/i).waitFor();
    // USGS access can fail or be CORS-blocked: never turn a failed fetch into synthetic numbers.
    await page.locator(".ground-stations button[aria-pressed='true']").waitFor();
    // Deterministic archive fixture exercises actual UI/chart wiring without assuming GFZ CORS.
    const archiveRoute = u => u.pathname.includes("/data/event-kp/") && u.pathname.endsWith(".json");
    await page.route(archiveRoute, async route => {
      const id = new URL(route.request().url()).pathname.split("/").at(-1)?.replace(".json","");
      const dates = id === "may-2024" ? ["2024-05-08","2024-05-14"] :
                    id === "quebec-1989" ? ["1989-03-06","1989-03-15"] : null;
      if (!dates) throw new Error("Unrecognized archived event fixture: "+id);
      const [start,end] = dates;
      const begin = Date.parse(start+"T00:00:00Z");
      const count = (Date.parse(end+"T00:00:00Z")+86400000-begin)/10800000;
      const readings = Array.from({length:count},(_,i)=>i===1?null:{
        utc:new Date(begin+i*10800000).toISOString().replace(".000Z","Z"),kp:i%8
      }).filter(Boolean);
      const q = new URLSearchParams({start:start+"T00:00:00Z",end:end+"T23:59:59Z",index:"Kp",status:"def"});
      const receipt = {schemaVersion:1,eventId:id,source:"GFZ definitive planetary Kp",
        sourceUrl:"https://kp.gfz.de/app/json/?"+q.toString(),license:"CC BY 4.0",
        accessedAtUtc:"2026-11-22T13:59:54Z",timeBasis:"UTC start of three-hour Kp interval",
        expectedBins:count,readings};
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(receipt)});
    });
    const omniDataRoute = u => u.hostname === "cdaweb.gsfc.nasa.gov" && u.pathname === "/hapi/data";
    await page.route(omniDataRoute, async route => {
      const params = new URL(route.request().url()).searchParams;
      const start = params.get("time.min")?.slice(0,10);
      if (!start) throw new Error("Missing NASA HAPI date range");
      await route.fulfill({ status:200, contentType:"application/json", headers:{"access-control-allow-origin":"*"},
        body: JSON.stringify({
          HAPI:"2.0",status:{code:1200,message:"OK"},
          parameters:[{name:"Time",type:"isotime"},{name:"BZ_GSM",type:"double",fill:"9999.99"},{name:"flow_speed",type:"double",fill:"99999.9"}],
          data:[[start+"T12:00:00.000Z",-17.5,650],[start+"T12:05:00.000Z",-21,790],[start+"T12:10:00.000Z",9999.99,99999.9]]
        })});
    });
    await page.getByRole("tab", { name: /Major events · Sun/i }).click();
    await page.getByRole("heading", { name: /major event replay/i }).waitFor();
    await page.getByRole("heading", { name: /observed planetary Kp/i }).waitFor();
    await page.getByText(/coverage 55\/56 bins/).waitFor();
    await page.getByText(/Valid 5-minute bins: Bz 2\/2016; speed 2\/2016/).waitFor();
    if (await page.getByRole("slider", { name: /Historical UTC observation time/i }).inputValue() !== String(Date.parse("2024-05-08T12:00:00Z"))) throw new Error("Milestone did not initialize the shared cursor");
    await page.getByText(/GSM Bz:.*-17\.5 nT/).waitFor();
    await page.getByText(/speed:.*650 km\/s/).waitFor();
    await page.locator(".replay-kp-bar.missing").first().waitFor();
    await page.getByRole("button", { name: /Later/i }).click();
    await page.getByText(/Selected milestone date:.*2024-05-10/).waitFor();
    // Unlike mocked OMNI and Kp, these are actual committed 2024 USGS source receipts.
    await page.getByRole("heading", { name: /USGS magnetic observatories/i }).waitFor();
    await page.getByText(/Archive coverage: 844\/864 actual 5-minute samples/).waitFor();
    await page.getByRole("button", { name: /Boulder · BOU/i }).click();
    await page.getByText(/Archive coverage: 864\/864 actual 5-minute samples, drawn from 4320\/4320/).waitFor();
    await page.getByRole("button", { name: /Sitka · SIT/i }).click();
    await page.getByText(/Archive coverage: 864\/864 actual 5-minute samples, drawn from 4317\/4320/).waitFor();
    if (await page.getByRole("button", { name: /Sitka · SIT/i }).getAttribute("aria-pressed")!=="true") throw new Error("USGS station comparison did not switch");

    await page.getByRole("combobox", { name: /Choose major space weather event/i }).selectOption("quebec-1989");
    await page.getByText(/coverage 79\/80 bins/).waitFor();
    await page.unroute(archiveRoute);
    await page.unroute(omniDataRoute);
    await closeOverlay(page);
  });
  await check("Forecast receipts never claim accuracy without archived, later observed NOAA pairs", async () => {
    await page.getByRole("button", { name: /Incoming & future/i }).click();
    await page.getByRole("dialog", { name: /FORECAST \/ EARTH AHEAD/i }).waitFor();
    await page.getByRole("tab", { name: /Forecast receipts/i }).click();
    await page.getByRole("heading", { name: /Did the prediction actually come true/i }).waitFor();
    await page.getByText(/Every NOAA Kp prediction is saved/i).waitFor();
    await page.getByRole("heading", { name: /Public methodology/i }).waitFor();
    // A newly created public archive may legitimately return 404 until collector runs;
    // the UI must not manufacture a historical score while that happens.
    await closeOverlay(page);
  });
  await check("4D Time Atlas reconstructs 2012 core field and opens 500 Ma evidence", async () => {
    await page.getByRole("button", { name: /4D Time Atlas/i }).click();
    await page.getByRole("dialog", { name: /Temporal Observatory/i }).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: "2012", exact: true }).click();
    await page.getByText(/Epoch 2012\.00/).waitFor({ timeout: 20_000 });
    await page.getByRole("tab", { name: /500 million years/i }).click();
    await page.locator(".deep-ribbon").waitFor();
    await page.getByText(/Cretaceous Normal Superchron/).first().waitFor();
    await closeOverlay(page);
  });
  await check("Earth-only and keyboard help work", async () => {
    await page.keyboard.press("e");
    await page.getByText(/Earth-only geographic view/).waitFor();
    await page.keyboard.press("h");
    await page.getByRole("dialog", { name: /Controls, comfort/i }).waitFor();
    await closeOverlay(page);
    await page.keyboard.press("e");
  });

  // CORS and network are recorded, never silently represented as current data.
  const browserCors = await page.evaluate(async () => {
    const urls = [
      "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json",
      "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json",
      "https://epic.gsfc.nasa.gov/api/natural",
      "https://kp.gfz.de/app/json/?start=2024-05-10T00:00:00Z&end=2024-05-11T23:59:59Z&index=Kp&status=def",
      "https://cdaweb.gsfc.nasa.gov/hapi/info?id=OMNI_HRO2_5MIN",
      "https://cdaweb.gsfc.nasa.gov/hapi/data?id=OMNI_HRO2_5MIN&parameters=BZ_GSM,flow_speed&time.min=2024-05-10T00%3A00%3A00Z&time.max=2024-05-10T01%3A00%3A00Z&format=json",
    ];
    return Promise.all(urls.map(async url => {
      try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!url.includes("/hapi/data")) return { url, browserReached:r.ok, status:r.status };
        const data = r.ok ? await r.json() : null;
        return {url,browserReached:r.ok,status:r.status,hasTimeAndVariables:Array.isArray(data?.parameters)&&data.parameters.some(p=>p.name==="BZ_GSM")&&data.parameters.some(p=>p.name==="flow_speed"),rowCount:Array.isArray(data?.data)?data.data.length:0};
      }
      catch (e) { return { url, browserReached: false, error: String(e) }; }
    }));
  });
  console.log("CORS/Browser access:", JSON.stringify(browserCors));

  await page.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce", isMobile: true, hasTouch: true });
  mobile.on("pageerror", err => pageErrors.push("mobile: " + err.message));
  await check("Mobile controls, canvas and provenance", async () => {
    await mobile.goto(url, { waitUntil: "domcontentloaded", timeout: 35_000 });
    await mobile.locator("#scene-wrap canvas").waitFor({ state:"attached", timeout: 25_000 });
    await mobile.locator('#scene-wrap[data-globe-ready="true"]').waitFor({ timeout: 25_000 });
    await mobile.getByRole("button", { name: /Data passport/i }).click();
    await mobile.getByRole("dialog", { name: /Data passport/i }).waitFor();
    await closeOverlay(mobile);
  });
  await mobile.screenshot({ path: out + "/mobile.png", fullPage: true });
  await mobile.close();

  const report = {
    checkAtUtc: new Date().toISOString(), url, tests: checks, pageErrors,
    browserCors, externalFailures,
    interpretation: "Headless Chromium/SwiftShader runner, not a visual quality sign-off or worldwide feed status.",
  };
  await writeFile(out + "/report.json", JSON.stringify(report, null, 2) + "\n");
  const fail = checks.filter(x => x.status === "failed").length + pageErrors.length;
  console.log("Browser smoke:", checks.length - checks.filter(x => x.status === "failed").length + "/" + checks.length + " checks passed; " + pageErrors.length + " JS page errors");
  if (fail) process.exitCode = 1;
} catch (e) {
  const message = e instanceof Error ? e.stack || e.message : String(e);
  console.error("Browser harness failed:", message);
  await writeFile(out + "/harness-error.txt", message + "\n");
  process.exitCode = 1;
} finally { await browser?.close(); }
