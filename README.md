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

## Forecast archive (verification record)

NOAA's rolling forecast products overwrite themselves, so nobody can later check how good yesterday's forecast was. The [forecast archive workflow](.github/workflows/forecast-archive.yml) runs hourly and writes to the separate **`forecast-archive` branch** (never `main`):

- every issued NOAA 3-day forecast, 3-day geomagnetic bulletin and 27-day outlook (named by their own `:Issued:` time); each new version of the 72-hour Kp forecast (by content change); WSA–Enlil hourly summaries (when the model content changes); and every NOAA alert, watch and warning (NOAA's own list only spans about 30 days);
- observed planetary Kp by month, to verify forecasts against;
- a validated copy of NASA CCMC's CME Scoreboard for the last 45 days. CCMC's API is not reachable from browsers, so the site reads this copy from `raw.githubusercontent.com`.

Each product is fetched independently; one failure never blocks the others, and nothing is filled in for a failed product (`latest/manifest.json` records per-product success). The script is `scripts/archive-forecasts.ts`. Scoring NOAA's Kp forecasts against observations is the next step once enough issued versions have accumulated.

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
| ~4 days ahead (+ ~2.5 days of hindcast) | **WSA–Enlil modelled solar wind at Earth**: speed, density, dynamic pressure and the model's CME-material tracer, with NOAA's **measured L1 plasma laid over the past part of the run** and a live hindcast error (speed/density bias and MAE). Magnetopause standoff is shown for two stated Bz values (0 and −10 nT), not predicted | [NOAA WSA–Enlil time series](https://services.swpc.noaa.gov/json/enlil_time_series.json) | Physics model output. Enlil does not model CME internal field, so **no Bz forecast is shown**; CME timing depends on forecaster-inserted cones; NOAA rewrites the file every few minutes, so its Last-Modified is shown only as "file last rewritten"; the model run time is not stated in the file |
| Each CME, until it arrives | **CME arrival ensemble**: every independent method's arrival call from NASA CCMC's CME Scoreboard, each with its own error bar, the ensemble median and spread, NOAA Enlil's tracer window on the same strip, and a **track record** scoring each method against the shock actually observed at L1 | [CCMC CME Scoreboard](https://kauai.ccmc.gsfc.nasa.gov/CMEscoreboard/) via our hourly archive | Community predictions as submitted; CCMC's own average/median entries are kept out of the member list; the spread is shown, never collapsed into one "official" time |
| 27 days | Daily highest Kp, Ap and F10.7 outlook with issue timestamp; deliberately separate longer-range tab | [NOAA 27-day outlook](https://services.swpc.noaa.gov/text/27-day-outlook.txt) | Lower-resolution/less reliable outlook, **not** a daily 3D magnetic-field forecast |

If a product fails to load or expires, it is visibly unavailable or marked outdated. There are **no invented forecast values** or assumed confidence intervals. The "G1–G5" indicator is derived from NOAA's **predicted Kp** thresholds and is explicitly *not* an issued official watch or warning. Open [NOAA SWPC](https://www.swpc.noaa.gov/) for safety-critical decisions.

All plots show UTC and source provenance. The 4D historical atlas continues to work, but predicted geomagnetic activity is **not projected onto the 3D Shue magnetopause geometry** without the required forecast wind/IMF inputs. See `src/lib/space/forecast.ts`, `src/lib/space/ops.ts` (issued products and S/R odds), `src/lib/space/enlil.ts` (model parsing, CME windows and hindcast skill), `ForecastCenter.tsx`, `OfficialProducts.tsx`, `SolarWindAhead.tsx` and their unit/browser tests. Parser tests run against real NOAA products saved in `src/lib/space/fixtures/`; the Enlil hindcast score is checked against an independent calculation on the same data.
