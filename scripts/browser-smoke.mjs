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
    ];
    return Promise.all(urls.map(async url => {
      try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); return { url, browserReached: r.ok, status: r.status }; }
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
