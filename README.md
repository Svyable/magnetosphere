# MAGNETOSPHERE / EARTH NOW

An independent, browser-based **scientific observatory of Earth's changing magnetic environment**. Live upstream solar-wind measurements, an empirical magnetopause, the IGRF-14 internal magnetic field, near-Earth aurora forecasts, and **real dated pictures of Earth** appear together without confusing a simulation with a photograph.

This repository is the dedicated source home for the Magnetosphere project, migrated from [the original Lovable application](https://lovable.dev/projects/f874a3b9-6b9c-4a64-8ce8-84cfa4f9917e) at its November 17, 2026 commit `df734917`. GitHub is now the development source of truth. **Changes here do not automatically appear in Lovable until the repositories are linked or reconciled**.

## Start locally

Requires a current Node.js runtime and network access for dependency installation, live feeds, and satellite image requests.

```bash
bun install --frozen-lockfile
bun run dev
# Follow the local URL printed by Vite
```

For quality checks:

```bash
bunx tsc --noEmit
bun run test
bun run build
```

No NOAA/NASA API key is required for the public data accessed by the browser.

## Exploring

- **New quiet first impression:** only 10 *possible* illustrative field paths (the actual drawn count can be lower due to geometry clipping). Switch between **Quiet** (default), **Balanced** (28 candidates), and **Detailed** (original 80 candidates) under *Field-line clarity* on the left. `V` cycles modes. This adjusts visual density and opacity, not magnetic field resolution, and persists on this browser and in share links (`detail=quiet`).
- **The globe now shows an explicit loading state** until its NASA-origin day/night textures are ready, rather than flashing an empty black WebGL canvas. Browser screenshots wait for this readiness signal.
- **New visitors land on a close-up of Earth**, with the magnetic/auroral overlays available in context. `1` Global reveals the physically much larger magnetopause (Earth appears appropriately small relative to a roughly 10-Earth-radius boundary); `2` Earth restores the close-up. Explicit share links such as `?view=global` retain that camera choice.
- Drag or pinch to orbit/zoom. `1` Global, `2` Earth, `3` Tail, `4` SAA, `5` Arctic.
- `E` toggles **Earth-only mode** (restores your original selected layers when off); `F` toggles an uncluttered focus mode.
- `G` opens the **Eyes on Earth** gallery: NASA DSCOVR EPIC natural-color actual photographs and NOAA GOES-East/West GeoColor full-disk composites, all labeled for their distinct source, cadence, and age. NASA's EPIC release can be days old.
- `I` opens the **IGRF-14 field explorer**. Click the 3D globe or enter latitude/longitude to inspect field strength, compass declination, inclination, annual change, and distance from the modeled South Atlantic Anomaly minimum.
- `L` returns from the 4-hour measured wind timeline to live. `?` displays keyboard shortcuts and accessibility/power settings. `Esc` closes overlays.
- Guided **Explore tour** explains solar-wind pressure, empirical boundaries, the NOAA aurora forecast, pole drift, SAA, and actual Earth imagery.
- Export a PNG of the rendered 3D scene or download the **measured NOAA L1 timeline as CSV**, with estimated Earth-arrival times in a separate column. Copy share links that include layer, camera, focus, replay and optional inspected latitude/longitude. Display preferences are saved locally and can be reset.

### Sources: what is and is not directly observed

| Layer | Public source | Status |
| --- | --- | --- |
| Upstream solar wind (speed, density, IMF Bz/Bt) | [NOAA SWPC real-time solar wind](https://www.swpc.noaa.gov/products/real-time-solar-wind) | L1 spacecraft **measurements**; advection to Earth is an estimate |
| Magnetopause size/shape | [Shue et al. (1998)](https://doi.org/10.1029/98JA01103) | **Empirical statistical fit**, not a global live scan |
| Bow shock, plasma sheet, schematic field lines | Our illustrated 3D geometry | **Illustrative**, not an MHD model or traced measurements |
| Aurora | [NOAA OVATION](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast) | **Short-term model forecast**, not a photo |
| Planetary Kp / Hp30 | [NOAA](https://www.swpc.noaa.gov/products/planetary-k-index) / [GFZ Potsdam](https://kp.gfz.de/en/hp30-hp60) | Ground-derived indices, with different time bins |
| Internal surface field / SAA / dip poles | [IAGA IGRF-14 via NOAA NCEI](https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field) | **Model**, historical/non-definitive IGRF before 1945; definitive DGRF 1945–2020; non-definitive 2025 IGRF; predicted 2025–2030 secular variation |
| Solar X-ray flare class | [NOAA GOES X-rays](https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json) | **Measured** 0.1–0.8 nm long-band flux; not a forecast |
| DSCOVR/EPIC Earth disk | [NASA EPIC](https://epic.gsfc.nasa.gov/) | **Real dated photograph** of the sunlit Earth, delayed by processing |
| GOES-East / GOES-West | [NOAA STAR G19](https://www.star.nesdis.noaa.gov/GOES/fulldisk.php?sat=G19) / [G18](https://www.star.nesdis.noaa.gov/GOES/fulldisk.php?sat=G18) | **Recent geostationary GeoColor composites**, visible/IR mix at night |
| 3D globe day/night imagery | NASA Blue Marble and Earth at Night via [three.js examples](https://github.com/mrdoob/three.js/tree/r160/examples/textures/planets) | **Historical geographic textures**, never labeled as a current satellite camera |

The L1-to-Earth estimate is a simplified ~1.5 million km ÷ wind speed propagation. Real plasma discontinuities and spacecraft position make it uncertain; the app labels stale or missing data rather than inventing observations. SAA weak field does **not** quantify a spacecraft's received radiation dose.

## Project map

- `src/components/mag/MissionApp.tsx`: application controls, status, measured timeline and provenance.
- `src/components/mag/Scene.tsx`: globe, meshes, 3D field/pole/SAA overlays, geographic picking.
- `src/components/mag/Gallery.tsx`: date-stamped NASA/NOAA satellite evidence panel.
- `src/components/mag/FieldExplorer.tsx`: geocentric IGRF surface-field inspection.
- `src/components/mag/SolarActivity.tsx`: NOAA GOES X-ray measurements and flare class.
- `src/lib/space/*.ts`: testable physics, NOAA/NASA parsers, research CSV export, IGRF model and preferences.
- `src/lib/space/*.test.ts`: science/data-integrity tests.
- `.github/workflows/ci.yml`: typecheck, tests, build checks on PRs.

## Attributions & constraints

The implementation uses concepts from [AEGIS](https://github.com/Kracht/AEGIS) (MIT) and [TERRA](https://terra.terryelemans.nl/) without copying TERRA source. Bundled NASA-origin Earth imagery is attributed to NASA via three.js examples; source imagery and external data retain their respective usage terms. Hosting must allow WebGL and browser access to NOAA/NASA sources. A public NOAA/GFZ/NASA feed can be offline or blocked by CORS; the UI falls back to visible unavailability, not fake telemetry.

This is a scientific visualization and educational tool, **not** an operational space-weather warning service. For official alerts, consult [NOAA SWPC](https://www.swpc.noaa.gov/).

## Public-feed audit (GitHub Actions)

The app's live upstream data cannot be validated by unit tests alone. The dedicated [public source audit workflow](.github/workflows/feed-health.yml) runs every six hours and can also run manually. It checks real NOAA RTSW plasma and magnetic-field JSON, NOAA Kp, OVATION forecast metadata, GOES X-ray flux, NASA DSCOVR/EPIC catalogue timestamps, the NOAA alerts/watches/warnings product schema, and whether NOAA GOES-East/West GeoColor image endpoints respond.

Each run writes a UTC, source-attributed **feed-health.json** and a Markdown report as GitHub Actions artifacts (14-day retention) and adds a summary to the run. The core NOAA L1 sources can fail the scheduled workflow if they are unavailable, stale, or incompatible with our parser. Pull-request audits report errors without blocking an otherwise working scientific code change. Check the [Actions tab](https://github.com/Svyable/magnetosphere/actions/workflows/feed-health.yml) for the most recent evidence.

**Interpretation:** This is a check from one GitHub-hosted runner, **not** global service monitoring; an unreachable feed does not prove a worldwide outage. It validates URL availability, JSON shape and source timestamp freshness—not browser CORS, image content, WebGL, physical accuracy of the Shue model, or an operational forecast. A recent NASA EPIC image is labeled **released**, never live; NOAA GOES image HTTP Last-Modified is *not* assumed to be acquisition time. The on-screen **Data Passport** provides a corresponding user-visible source/freshness ledger.

## Public hosting via GitHub Pages

The [Pages workflow](.github/workflows/publish-pages.yml) has a special `GITHUB_PAGES=1` build mode, with the correct `/magnetosphere/` base path and static TanStack Start prerendering. Normal Lovable and local builds retain their original root path and runtime. GitHub Pages was successfully published by [Actions run 44442668882](https://github.com/Svyable/magnetosphere/actions/runs/44442668882). The deployed project address is **https://svyable.github.io/magnetosphere/**. The GitHub Actions workflow (rather than a manually updated `docs/` folder) produces its static artifact and publishes it on successful `main` builds. Check [deployment history](https://github.com/Svyable/magnetosphere/actions/workflows/publish-pages.yml) for newer publish attempts.

To test static output on an installed development machine: `GITHUB_PAGES=1 bun run build`, then inspect `.output/public/index.html` and assets. The workflow also publishes a public `build-info.json` containing the exact Git commit and verifies, *after deployment*, that the Pages CDN serves that commit and the two Earth textures. This guards against the wrong Pages source (for example, a stale branch/`docs` folder) serving an older observatory despite a green build. The deployed site requests public NOAA/NASA feeds directly from browsers; browser CORS and WebGL support still need independent verification. The build route has no private server functions.

## 4D Temporal Observatory — 1900–2030 and 500 million years

Use the **4D Time Atlas** header button or keyboard `T`.

**Modern model (1900–2030)** computes Earth's global dipole moment from the *existing bundled IGRF-14 coefficients* at 5-year epochs and linear interpolation, with a vertical marker at 2012 and an explicitly dashed **2025–2030 forecast**. A second graph plots the degree-one Gauss coefficient vector change per year across each five-year interval (a long-term secular-variation proxy, **not** day-to-day solar-storm volatility). A CSV export contains precise coefficients-derived values, source epoch classifications, and rates.

The modern time slider controls the actual 3D core-field sphere/South Atlantic Anomaly/dip pole positions, **not a fabricated satellite photograph of 1900**. If the selected core epoch is more than 0.75 years from today, the app temporarily hides NOAA-driven magnetopause, wind, tail, aurora and schematic field lines without changing the user's saved layer toggles. Returning to “Current core field” restores them. The NOAA real-time/historical four-hour upstream scrubber is **a separate clock**. Share links can preserve the core year as `coreYear=2012`.

**Deep time (0–500 Ma)** has a separate evidence ribbon and age scrubber. It highlights **published intervals** such as the Cretaceous Normal (roughly 121–84 Ma), Kiaman reversed (318–267 Ma), Ordovician/Moyero reversed (485–463 Ma), Middle Jurassic frequent reversals (171–155 Ma), and recent Brunhes/Laschamp events. At unknown ages it says **“no reliable continuous global model”**, rather than drawing invented field strength. Ancient polarity regimes are **not** measurements of dipole amplitude; no deep-time Earth globe reconstruction is claimed.

External datasets to integrate with appropriate rights and error models in future releases:

- **gufm1**, 1590–1990: historical shipping/land observations, but axial strength is poorly constrained before ~1840 and the original gufm1 model imposed a historical extrapolation. [Published model](https://geomag.colorado.edu/gufm1).
- **CALS10k.2** via GFZ: about 10,000 years of archeomagnetic and sedimentary global paleomagnetic reconstructions with dating uncertainty. [Official GFZ data](https://www.gfz.de/en/section/geomagnetism/data-products-services/mag-models/calsxk-10000-3000-years-bp).
- **GGF100k / LSMOD.2**, up to 100,000 years: global field reconstructions based on sediments and volcanics, not direct measurements. [Review](https://doi.org/10.1029/2019RG000656).
- **PINT v8.2.0**, ~50 ka to 4.2 Ga: 4,854 *local rock* paleointensity site records spanning heterogeneous ages, with reliability scores and serious sampling/dating biases. It is **not** a smooth global field series. [2026 study](https://doi.org/10.1093/gji/ggaf490) (link to source; the dataset is not redistributed in our app).

**Important scientific inference:** From bundled IGRF-14 coefficients, the degree-one dipole declined about **7.6% over 1900–2025** and about **0.61% from 2012–2025**. There is no special abrupt 2012 break in this global moment trend. This does not deny regional anomalies or past changes in magnetic-pole drift speed. The measured/derived/reference meaning of each layer and time axis is shown on screen.

## Earth Ahead — official future forecasts

**The main development priority is real-time measurements and near-future predictions; the historical atlas is retained but not currently being expanded.** The header button **Future forecast**, keyboard `P`, or the **NEXT 72 HOURS** panel in the right sidebar opens the new forecast cockpit.

The app fetches NOAA SWPC's independently published products directly into the browser. It does **not** generate hypothetical tomorrow's Bz, magnetic-pole movement or 3D magnetosphere:

| Lead horizon | What visitors can see | Source | Evidence type |
| --- | --- | --- | --- |
| ~30–90 minutes | Measured L1 solar wind plasma, density, IMF Bz and simple estimated travel to Earth | [NOAA real-time L1](https://www.swpc.noaa.gov/products/real-time-solar-wind) | Actual upstream measurements + uncertain propagation estimate |
| ~30 minutes | OVATION auroral-oval probability and timestamp | [NOAA 30-minute aurora](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast) | Physical/statistical short-term **forecast**, not a real sky camera |
| 3-hour bins, ~3 days | NOAA published Kp values, **explicitly separated into observed / estimated / predicted** | [NOAA Kp forecast JSON](https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json) | Official forecaster product; no issue time in this JSON, only browser fetch time |
| 3 days | NOAA published **daily geomagnetic storm probabilities** (active, minor, moderate, strong–extreme) with **bulletin issue UTC** | [NOAA 3-day geomag bulletin](https://services.swpc.noaa.gov/text/3-day-geomag-forecast.txt) | Official issued probabilities, not probabilities reverse-engineered from Kp |
| In effect now | **NOAA-issued warnings and watches** with validity windows (extensions and cancellations applied; newest geomagnetic watch supersedes older ones), plus threshold **alerts** from the last 24 h. Shown in the sidebar, as a pill on the globe on phones, and at the top of the forecast panel | [NOAA alerts JSON](https://services.swpc.noaa.gov/products/alerts.json) | Official issued messages, never inferred from predicted Kp; a failed fetch reads "not an all-clear" |
| 3 days | **S1+ solar radiation storm** and **R1–R2 / R3+ radio blackout** probabilities with bulletin issue UTC and NOAA's rationale | [NOAA 3-day forecast](https://services.swpc.noaa.gov/text/3-day-forecast.txt) | Separate G/S/R scales; flare and radiation odds are never derived from Kp |
| 27 days | Daily highest Kp, Ap and F10.7 outlook with issue timestamp; deliberately separate longer-range tab | [NOAA 27-day outlook](https://services.swpc.noaa.gov/text/27-day-outlook.txt) | Lower-resolution/less reliable outlook, **not** a daily 3D magnetic-field forecast |

If a product fails to load or expires, it is visibly unavailable or marked outdated. There are **no invented forecast values** or assumed confidence intervals. The "G1–G5" indicator is derived from NOAA's **predicted Kp** thresholds and is explicitly *not* an issued official watch or warning. Open [NOAA SWPC](https://www.swpc.noaa.gov/) for safety-critical decisions.

All plots show UTC and source provenance. The 4D historical atlas continues to work, but predicted geomagnetic activity is **not projected onto the 3D Shue magnetopause geometry** without the required forecast wind/IMF inputs. See `src/lib/space/forecast.ts`, `src/lib/space/ops.ts` (issued products and S/R odds, tested against real NOAA fixtures in `src/lib/space/fixtures/`), `ForecastCenter.tsx`, `OfficialProducts.tsx` and corresponding unit/browser tests.

## Arrival Intelligence: measured solar wind that has not yet reached Earth

The **first tab** of *Incoming & Future* (`P`) is an interactive NOAA L1 → Earth arrival outlook. The dashboard also shows the next predicted arrival prominently alongside official 72-hour Kp forecasts.

- Uses **real 1-minute spacecraft measurements** of solar-wind speed, proton density, and matched GSM IMF Bz. Solar-wind travel time is estimated by `1,500,000 km / measured speed`; each sample gets its own *nominal* Earth-arrival UTC. Only genuinely unarrived samples appear. Input age and independent source links are shown.
- Shows pressure, matched Bz, and an optional **Shue (1998) empirical magnetopause standoff radius** from those measured inputs. **If Bz was not observed, the forecast-mode Shue estimate is absent**, never silently substituted as zero.
- An interactive timeline is time-ordered by estimated arrival, color-coded for measured southward Bz, and sampled into five-minute display buckets. The downloadable CSV preserves **every** eligible one-minute input and evidence/source timestamps.
- Click **Preview** for a scientifically labeled *upstream advection scenario* rendered on the actual 3D magnetopause. The planet's current live telemetry stays unchanged; the aurora nowcast is hidden in preview to avoid mixing times. **Return live geometry** restores the measured/current magnetopause, and a preview ceases automatically once its nominal arrival has passed.
- Freshness gates distinguish live source from stale/missing upstream products. A stale preview cannot be initiated. The advection method does not solve tilted shock fronts, CME propagation, variable L1 spacecraft distance, magnetic-field evolution during transit, or uncertainty-calibrated arrival distributions. Its 130-minute horizon is limited to *already measured* upstream plasma, not a 130-minute speculative solar forecast.

**Important:** This is not NOAA's official CME arrival model, not a future 3D MHD reconstruction, not a valid prediction of ground-level Kp from Bz alone, and not a promise that the nominal arrival will be exact. The broader *next 72 hours* and *27 days* tabs continue to use the actual NOAA-issued forecasts.

## Forecast accountability: immutable public NOAA prediction receipts

**Forecast skill is an experiment, not a marketing confidence number.** The new *Forecast Receipts · Verification* tab in **Incoming & Future** uses a source-linked, publicly auditable forecast ledger, rather than judging yesterday's forecast from today's rolling NOAA graph (which would leak the answer).

A new [GitHub Actions collection workflow](.github/workflows/forecast-ledger.yml) uses a dedicated public [`forecast-ledger` branch](https://github.com/Svyable/magnetosphere/tree/forecast-ledger) to record NOAA Kp predictions **every six hours** (subject to scheduled-run delays and network availability). Each receipt preserves the exact Git commit, our retrieval UTC, the future 3-hour Kp values *then* marked `predicted`, and the latest already-observed Kp known at collection for a **no-change persistence baseline**. Later runs record NOAA rows marked `observed`, **never** interim `estimated` values, append revisions, and match by target three-hour bin.

The publicly accessible [`summary.json`](https://raw.githubusercontent.com/Svyable/magnetosphere/forecast-ledger/forecast-ledger/summary.json) is recomputed from the archive. It reports the NOAA forecast's mean absolute Kp error (MAE), signed bias, Kp≥5 hit/miss/false-alarm counts, persistence benchmark, and example target/forecast/verification receipts for lead-time groups **0–6, 6–24, 24–48 and 48–72 hours**. Each target counts once per lead bucket. The dashboard shows **insufficient evidence** for under 20 verified target periods and no skill until observations mature; the public Git branch ensures a traceable record rather than retroactively selected examples.

**Limits:** The NOAA 3-day Kp JSON does **not** include an independent forecast-issued timestamp. Our GitHub runner **retrieval UTC** is the only issuance proxy, accurately labeled. NOAA's later `observed` rows can be revised and are not independent final ground truth. MAE is *not* a probability; deterministic Kp is not a calibrated storm likelihood. This does not yet verify L1 shock arrival times or CME forecasts. Correlated lead buckets, sparse storm events, and missed GitHub schedule runs constrain conclusions. The ledger needs days to build an initial sample, and the initial empty state is intentional.

The archive job requests write access only to push *public source data* to `forecast-ledger`, not main. It runs only for trusted main pushes, scheduled runs, or explicit owner dispatch; no pull-request code gets a write token.

## Four forecast navigation and decision-support upgrades

These features intentionally sit on top of NOAA-published predictions; they do not create new space-weather forecasts.

1. **Predicted storm windows:** *Incoming & Future → Now → 72h* groups consecutive **NOAA-predicted** three-hour Kp ≥ 5 bins into start/end/peak windows with G1–G5 **threshold mappings**. Estimated and observed slots do not enter this projection. Missing forecast data, gaps between slots, and stale retrievals are reported instead of guessed away. These are **not official NOAA-issued watches or warnings**.
2. **Save/compare a forecast:** a visitor can explicitly save the currently fetched NOAA predicted Kp slots in *this browser* and compare later fetches for the same target three-hour periods. A comparison distinguishes changed, newly introduced, and elapsed/removed slots. It does not calculate actual forecast skill or claim a server-side notification service; use the independent public Forecast Receipts ledger for later Kp observations. Browser storage can be cleared.
3. **UTC / local time:** choose UTC or your browser's local timezone for the detailed three-hour Kp timeline and storm windows; local display uses the browser's real timezone and daylight-saving rules. Daily geomagnetic probabilities and 27-day outlook rows remain **UTC calendar days**; source issue and fetch stamps remain UTC. The preferred display mode is remembered.
4. **Shareable forecast deep links:** *Copy link to forecast view* preserves the camera/layers and opens the same forecast tab via `forecast=incoming|72h|verify|27d`, with optional `storm=<UTC epoch milliseconds>` for a specific selected projected storm window and `clock=local` display mode. A shared event that disappears from the latest source shows a transparent notice rather than inventing it. Links intentionally fetch NOAA again, so the values may change after sharing.

Unit tests cover contiguous and gapped storm windows, provenance, saved snapshots with no overlapping target periods, daylight saving changes, URL parsing and restoration. Real browser smoke validates controls, deep-link reload, saved comparison and unavailable-source behavior.

## Earth Mission Lab — five source-aware public utilities

Use **Mission Lab** in the top bar (or press `M`). The five panes deliberately separate measurements, NOAA models, hypothetical analysis and downloaded evidence.

1. **Aurora at a Point:** provide geographic latitude/longitude or pick the same point in the existing Field Explorer. Fetch the **full** NOAA OVATION grid including genuine zero-valued cells (loaded only when this pane opens); locate the nearest sampled model cell and strongest cell within 1,000 km. Report exact model source/forecast UTC and source freshness. An approximate solar elevation at forecast time distinguishes daylight/twilight/darkness. OVATION grid values are **not** independently calibrated probabilities of a person's seeing aurora, and neither cloud, light pollution, nor mountains are included. NOAA notes bright aurora can be visible from a distance ([product documentation](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast)). Invalid/missing grid never silently becomes a zero.
2. **Shue What-If Lab:** pressure 0.2–30 nPa and GSM Bz −25 to +25 nT feed the published empirical [Shue et al. 1998](https://doi.org/10.1029/98JA01103) subsolar boundary model, with optional comparison against a *recent* fully paired NOAA L1 sample. **Preview what-if geometry** reuses the 3D globe but displays a conspicuous **HYPOTHETICAL MODEL — NOT OBSERVED / NOT FORECAST** banner and an immediate return to measured geometry. No simulated Kp/aurora/CME predictions are claimed.
3. **Upstream Event Patterns:** a transparent exploratory instrument shows NOAA L1 1-minute intervals with a measured 10-minute compression pattern (pressure mean ≥1.6× and ≥1.2 nPa above previous 10 minutes) or at least 8 minutes of matched GSM Bz ≤ −5 nT within a 10-minute interval. Repeated detections are grouped, sample UTC and source freshness remain visible. This **is not an official shock detection or geomagnetic warning**, and no detected pattern or its absence establishes future Kp. Missing/sparse data are not silently interpreted as quiet weather.
4. **Portable Evidence Brief:** produce a browser-only Markdown report with current valid L1 speed/density/Bz, derived pressure, latest source-labelled Kp, highest source-labelled future Kp (only from recent NOAA forecast retrievals), timestamps, explicit missing-data messages and original links. Copy the report or download `.md` with no login, account, server upload or continuous monitoring implied.

5. **Earth Receipts — ground stations:** select **Boulder (BOU), Fredericksburg (FRD), Sitka (SIT), or Honolulu (HON)** to load actual USGS one-minute horizontal magnetic intensity (H, nanotesla) for the past 24 hours, using the [official USGS geomagnetism data service](https://www.usgs.gov/tools/web-service-geomagnetism-data). The plot preserves missing-data gaps and subtracts only its **first valid sample** as a visual reference. Scrub observed minutes or export source-stamped readings as CSV. A last-hour raw H range appears only with adequate minute coverage; current status requires a measurement newer than 20 minutes. These values are **not** quiet-day-corrected, a local K-index, global Kp, geoelectric-field hazard, or an independently verified L1→ground causal connection. USGS variation readings are preliminary and can be revised. Browser CORS or station outages show explicit unavailability with a link to the exact source query; no substitute readings are invented.

**Privacy and science:** No location is inferred or requested from GPS; a visitor enters coordinates manually, which are reflected in the existing globe/Field Explorer share URL. Local NOAA grid sampling is a model lookup, not a real-sky observation. Every tab presents assumptions and direct official-source evidence, with strict scientific unit tests and mobile/browser regression checks.

## Major-event Sun → Earth replay

Mission Lab → **Major events · Sun → Earth** presents curated, source-linked stage-by-stage histories for the March 1989 Québec outage, July 2000 Bastille Day storm, October 2003 Halloween storms, March 2015 St Patrick’s Day storm, February 2022 satellite-drag event, and May 2024 G5 storm. Select an event, advance through dated stages, or jump directly to a phase. Each stage links to NASA or NOAA background and identifies whether it represents solar activity, transit, Earth disturbance, or an observed impact.

**Scientific boundary:** These are historical narrative timelines, not recovered one-minute instrument streams, precise CME propagation calculations, a continuous 3D simulation, or an operational prediction. Some markers are day-resolution, and the 2003 and 2024 episodes involve multiple eruptions. Stage selection intentionally does not alter live telemetry or the present-day globe.

### Historical source-data library

Each replay links to candidate primary data archives rather than fabricating event samples. NASA [OMNIWeb](https://omniweb.gsfc.nasa.gov/ow.html) covers near-Earth solar wind since 1963 (hourly), with [high-resolution OMNI](https://omniweb.gsfc.nasa.gov/ow_min.html) since 1981. [GFZ Kp](https://kp.gfz.de/en/data) spans 1932 onward; [USGS observatory service](https://www.usgs.gov/tools/web-service-geomagnetism-data) offers station-dependent magnetic field readings; [NOAA NCEI flare reports](https://www.ncei.noaa.gov/products/space-weather/legacy-data/solar-flares-events) cover historical flare observations; and [ISGI](https://isgi.unistra.fr/data_download.php/indices_kp.php) provides additional indices with coverage gaps. The application explicitly labels these as **archive discovery links, not downloaded or verified event-specific data**. No continuous historical trace is shown until timestamped measurements are fetched, quality-checked, and accompanied by provenance.


### Synchronized historical near-Earth replay (NASA OMNI + GFZ Kp)

The major-event replay now includes a **shared UTC observation cursor**. Selecting a narrated milestone places the cursor at noon UTC on the milestone's date; visitors can then scrub by hour across the full event interval. Noon is a navigational default, **not a measured CME arrival timestamp**.

NASA's [CDAWeb HAPI](https://cdaweb.gsfc.nasa.gov/hapi) serves two 5-minute historical series: `BZ_GSM` (nT, geocentric solar-magnetospheric coordinates) and `flow_speed` (km/s). For March 1989 the replay requests `OMNI_HRO_5MIN`; for 2000–2024 it requests `OMNI_HRO2_5MIN` (which uses definitive Wind/SWE plasma). HAPI reports a time-series dataset with source-specific fill values; the application validates both metadata and data bounds, respects gaps and rejects invalid samples. The time tags are **solar-wind measurements shifted to the nose of the Earth's bow shock**, not Sun-to-Earth travel times or directly observed solar activity.

The 3-hour definitive **GFZ planetary Kp** chart uses the *same UTC cursor* but maintains its separate cadence. Its six source-verified datasets are committed under `public/data/event-kp/`, because GFZ's historical JSON API does not allow direct cross-origin browser retrieval. OMNI traces never interpolate across missing source records or convert wind readings into Kp. There is no assumed one-to-one CME association, and the 3D globe remains live rather than showing a falsely reconstructed historical magnetosphere.

**Availability / verification:** The unit tests and browser smoke use deterministic fixtures, not fictitious production telemetry. Live-browser HAPI reachability and CORS are separately recorded in CI diagnostics; NASA or GFZ may block cross-origin access or return no valid records. A failure displays an explicit unavailable state with a direct original source link. A true historical data cache or server-side fetch can be added only after provenance and licensing are documented.

Source documentation: [NASA OMNI high-resolution guide](https://omniweb.gsfc.nasa.gov/html/HROdocum.html); [HAPI 2.0 service](https://cdaweb.gsfc.nasa.gov/hapi); [Version 2 OMNI dataset descriptor](https://spase-metadata.org/NASA/NumericalData/OMNI/HighResolutionObservations/Version2/PT5M); [GFZ Kp archive](https://kp.gfz.de/en/data).

### Historical GFZ Kp static receipts and refresh procedure

The replay ships **376 definitive 3-hour Kp bins** across six fixed event windows. These were retrieved on November 22, 2026 from the official [GFZ JSON API](https://kp.gfz.de/en/data) using `scripts/snapshot-event-kp.mjs`. Each JSON file records the original bounded source URL, UTC collection time, CC BY 4.0 attribution, expected coverage, and the UTC start timestamp and Kp for each bin.

A GitHub Actions workflow, `.github/workflows/event-kp-snapshot.yml`, checks the source independently and exports all six records as build artifacts. To refresh, run `bun scripts/snapshot-event-kp.mjs` from a network-enabled environment, review the JSON changes and provenance, and commit them through normal CI. **The workflow does not silently rewrite deployed historical measurements.**

The client uses the site's own `/data/event-kp/<event>.json` assets, strictly verifies the expected event identity, window, source URL, license, timestamp cadence and coverage, and refuses invalid snapshots. No third-party CORS proxy or synthetic fallback is involved. The original GFZ source query remains linked for independent review.

The browser smoke suite includes a deterministic near-complete Kp fixture with an intentionally missing bin, verifying that missing data stays missing; production uses the separately committed actual GFZ records. NASA OMNI continues to load from CDAWeb/HAPI at runtime.


### May 2024 — USGS observatory measurements under the same UTC cursor

The May 2024 replay now adds real **USGS quasi-definitive horizontal magnetic field H** observations for **Boulder (BOU), Fredericksburg (FRD), and Sitka (SIT)** between **May 10 00:00 and May 13 00:00 UTC**. The USGS service is requested with `elements=H`, `sampling_period=60`, `type=quasi-definitive`, and `format=json`. Source files are frozen in `public/data/may-2024-ground/`, each with a complete original source URL, retrieval time, station code, processing level, and observed five-minute samples selected directly from the original one-minute records. The operation is reproduced by `scripts/snapshot-may-2024-ground.mjs` and independently checked in `.github/workflows/may-2024-ground-snapshot.yml`.

**Source-verified coverage (May 10–13, 2024):**
- Boulder: **864/864 five-minute timestamps**, **4320/4320** valid one-minute samples.
- Fredericksburg: **844/864 five-minute timestamps**, **4219/4320** valid one-minute samples; 20 missing five-minute timestamps remain explicit gaps.
- Sitka: **864/864 five-minute timestamps**, **4317/4320** valid one-minute samples. Some other one-minute observations were absent even though the selected five-minute records are complete.

USGS initially returned **no definitive readings** for Boulder during this interval. We verified that its **quasi-definitive** channel instead returns a complete record. Honolulu returned no usable quasi-definitive readings and was excluded rather than presented as an incomplete or differently processed comparison. Data-processing status must remain visible in the interface; quasi-definitive must never be described as definitive.

The displayed **ΔH** is measured H minus the median of the earliest six hours of the *same station's* source record, not a physical zero field, regional quiet-day reference, planetary Kp, Dst, or a measurement of geomagnetically induced current. A five-minute sample here is a **real observed sample** picked from the one-minute series, **not a five-minute average or interpolation**. NASA OMNI, GFZ Kp, and USGS H stay distinct datasets with different physical meanings and time resolution.

Evidence/context: [USGS May 10, 2024 magnetic disturbance](https://www.usgs.gov/programs/geomagnetism/science/may-10-2024-magnetic-disturbance-peak-dst-351-nt); [USGS official data service](https://www.usgs.gov/tools/web-service-geomagnetism-data); [GIC-related observations during the May 2024 storm (Space Weather, 2026)](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2025SW004758).


## 24/7 Space Weather Broadcast · OBS browser source

The observatory now has a **dedicated television-safe presentation mode** for an always-on YouTube stream, digital signage, or a live event backdrop. It runs at the existing site URL and uses the *same official NOAA data providers* without exposing the full interactive dashboard's controls.

**Capture URL:** `https://svyable.github.io/magnetosphere/?broadcast=1`

**OBS setup:** Add a Browser Source, paste the URL, set **width 1920 / height 1080**, choose **30 fps** (60 fps only after confirming GPU stability), then use a standard 1920×1080 canvas. The broadcast mode contains no audio track or copyrighted music; add independently licensed or original sound in OBS if desired. **The page is not itself a YouTube livestream encoder, scheduler, audio engine, or streaming host.** A continuously running OBS/encoder and stable machine/network connection are still required.

The broadcast is laid out for legibility at video resolution rather than for mouse interaction: a slowly orbiting 3D magnetosphere with live NOAA L1 wind speed, GSM Bz, planetary Kp, measurement timestamps and four-hour trend traces; a UTC clock; rotating explanatory science cards; aurora nowcast status; an explicit empirical-model or reference-geometry label; and a direct invitation to explore the full interactive observatory. It is deliberately not an alarm feed, a weather-warning replacement, or a claim that the schematic field lines were measured.

Useful source variants (all stay on the same publicly hosted root URL):

| Query | Production use |
| --- | --- |
| `?broadcast=1` | Primary widescreen, slow rotating global view |
| `?broadcast=1&shot=earth` | Earth close-up for a second OBS Browser Source |
| `?broadcast=1&shot=tail` | Magnetotail overview for a second OBS Browser Source |
| `?broadcast=1&shot=arctic` | High-latitude view (model/reference context) |
| `?broadcast=1&motion=off` | Still-camera / reduced-motion broadcast |
| `?broadcast=1&quality=low` | Lower rendering cost for constrained GPUs |
| `?broadcast=1&safe=1` | Temporary title-safe boundary overlay for crop/OBS calibration; **remove before going live** |

**24/7 safety/operating notes:**

- Wind and magnetic-field readings are reported only if their NOAA source timestamps are within ten minutes of the UTC clock; Kp uses an age window of six hours because it is a three-hour index. Missing or stale data are **not** replaced by the previous number. A source-status pill and each metric's age remain visible.
- The Shue magnetopause uses valid L1 measurements whose estimated propagation has arrived. Without timely drivers it displays a **labeled reference model** rather than pretending the boundary is observed in real time.
- NOAA OVATION is a **probability nowcast**, not a photograph of auroras; if unavailable, the globe layer is hidden and the source state says so.
- Story cards rotate every 32 seconds without audio or alarms. A southward Bz or storm-level Kp may change the relevant card only when the underlying reading is current; a Kp value is **not** represented as an issued SWPC alert.
- Use an OBS/OS watchdog, uninterrupted power where practical, and an external encoder health check. This view is designed to degrade honestly when NOAA data fail, not to guarantee uninterrupted streaming or automatically recover a crashed browser/GPU process.
- Use the browser test screenshots in the GitHub Actions `magnetosphere-browser-smoke` artifact to check 1920×1080 framing and stale-source behavior. The broadcast's graphical orbit is illustrative and its particle drift is **not scaled physical travel**.
