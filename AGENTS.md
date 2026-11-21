# MAGNETOSPHERE contributor and agent instructions

This repository is the dedicated GitHub source workspace. Its code was migrated from the Lovable project on 2026-11-17. **The dedicated GitHub repository is not yet verified as linked to Lovable.** Do not claim GitHub edits have synchronized to the Lovable editor or public preview without verifying that connection. Do not force-push or rewrite published history.

## Science and integrity
- Never invent "live" satellite measurements, spacecraft ephemerides, magnetic field observations, or warning status.
- Distinguish NOAA in-situ L1 measurements from the estimated Earth arrival; OVATION short-term forecasts from photographs; the Shue magnetopause empirical model from MHD output; IGRF-14 internal field and its secular variation from external storm-time magnetic field.
- The 3D bow shock, plasma sheet, and illustrative field lines are **not measured, traced, or MHD solved**. Keep this transparent in UI, docs, and exports.
- Do not texture the whole globe with GOES or EPIC imagery unless spatial registration and projection are physically justified. NASA Blue Marble and Earth-at-night textures are historical.
- Normalize/validate incoming JSON with timestamp, units, quality and physical-range checks; declare stale and unavailable sources. Preserve 2025–2030 IGRF forecast bounds.
- Use source-linked citations and precise observation/forecast times. Official NOAA, NASA, GFZ and IAGA/NCEI resources are preferred.

## Engineering
- Keep scientific calculations pure and tested in `src/lib/space`; `Scene.tsx` is only a renderer.
- Use `bun install --frozen-lockfile`, `bunx tsc --noEmit`, `bun run test`, `bun run build`.
- Honor reduced motion and low-power requests; disable gratuitous animations on mobile. All overlays need keyboard access and meaningful fallback text.
- Work on a focused branch, create mergeable PRs, prefer objective checks to human review gates, and merge after checks pass where repository rules allow. Commit substantive work.
- Do not commit API keys, access tokens, or private user data.
- Preserve independent licensing/attribution for source imagery and external data.


## Provenance and public-source operations
- Maintain `src/lib/space/health.ts` and `feed-audit.ts` tests when changing parsing, source URLs or freshness thresholds.
- Source-audit workflows are evidence of GitHub runner accessibility only. Do not call source failures a global outage or substitute stale/dummy measurements; distinguish last fetch from acquisition/forecast time.
- Operational checks run in `.github/workflows/feed-health.yml`; attach factual reports as Actions artifacts, not speculative user-facing incident statements.


## GitHub Pages publishing
- The Pages build is **opt-in by environment**: `GITHUB_PAGES=1`. Keep Lovable root-path and Nitro behavior unchanged for all other builds.
- When adding globe textures/assets, use Vite's `import.meta.env.BASE_URL` so project Pages can load them under `/magnetosphere/`.
- The `src/router.tsx` basepath must match the Vite base for deep links. Never claim a Pages URL is live until its deployment check passes.

## Time-domain scientific integrity
- 4D does not mean a uniformly reconstructed magnetic-field movie through geological time.
- IGRF-14: modelled global internal field for 1900–2025, predicted secular variation through 2030 only. Use the bundled coefficients; never extrapolate IGRF-14 beyond 2030.
- Global dipole moment is derived from degree-1 coefficients, in ZAm². Distinguish its decline from local field intensity and pole positions. Five-year mean dipole-vector change is NOT short-time geomagnetic volatility.
- Palaeo event ribbon ages are approximate references from stratigraphy and volcanic rocks, with uneven data density. A polarity reversal rate is NOT intensity. No synthetic value for unknown million-year windows.
- Rendering historic core field must hide modern solar-wind geometry unless specifically annotated as a cross-era comparison; do not mix core epoch with real-time L1 as though an accurate past magnetosphere.
- Link source/licensing and uncertainty, especially for proposed future PINT/gufm1/CALS10k datasets. Never download and redistribute a protected geological collection without checking its data-use rights.

## Scene legibility / science distinction
- The visitor-facing default is **Quiet** (maximum 10 candidate illustrative field lines) so Earth remains visible beneath the overlays. **Balanced** / **Detailed** are explicit user choices (maximum 28 / 80 candidate paths), driven by `src/lib/space/visuals.ts` with tests.
- Treat path count and opacity purely as presentation complexity, NEVER geomagnetic model precision or real sampled field lines. Preserve original high-detail geometry as an opt-in research mode.
- Honor the `detail` share URL and browser saved preference. Keep screenshots and browser CI checking the default clarity mode.

## Forward space-weather predictions are the current product priority
- Prefer **official published** NOAA short-range forecast products and true measurements. Present a recognizable hierarchy: L1 measured observations + estimated propagation → OVATION ~30-minute forecast → official 3-hour Kp and day-scale storm probabilities → separate lower-confidence 27-day outlook.
- Never infer tomorrow's magnetopause shape/field lines from predicted Kp alone. Kp is a ground-derived planetary activity index, not upstream Bz, pressure, solar-wind speed, or full 3D geometry.
- NOAA Kp JSON has a per-slot `observed` provenance flag (`observed`, `estimated`, `predicted`); never combine these under one label, and do not mistake successful browser fetch for source issue time.
- Official 3-day probability bulletin and 27-day outlook have explicit `:Issued:` dates. Reject malformed forecasts and note stale publication; NOAA probabilities are not mechanically derived from storm threshold bar colors.
- Expose uncertainty honestly: no numerical CI or CME arrival time if NOAA did not publish it, and Kp-derived G-levels are **not official watches**. Retain existing historic time atlas; do not spend default enhancement effort expanding deep-time model until requested again.

## Incoming arrival and science accountability
- The arrival intelligence in `src/lib/space/incoming.ts` is a future **advection of already measured L1 plasma and matched IMF**, not a prediction generated by a heliospheric MHD model. Do not confuse nominal arrival UTC with an observed Earth encounter time.
- Never backfill a missing Bz, not even to render the future Shue magnetopause. Use `null` and disable the 3D preview when paired in-situ GSM Bz is unavailable.
- A screenshot/3D preview of unarrived measurements MUST display **UPSTREAM SCENARIO · NOT YET OBSERVED AT EARTH** and a one-click return to live geometry; hide the unrelated present-day OVATION oval during that preview.
- The displayed 5-minute sampling should not smooth over missing data. CSV exports must retain all qualifying 1-minute observations, their original timestamps, satellite sources, and separate derived quantities.
- Short-lived L1 advection forecasts cannot be used to validate a three-day Kp forecast or to imply probabilistic precision. Forecast verification needs an immutable issuance-time snapshot and later independent observations.
- Browser smoke tests must cover provenance, absent live feeds, preview and return to live. Keep all changes CI-gated, merge only after validated.

## Open forecast accountability data
- `src/lib/space/ledger.ts` is the deterministic archive/verification policy; `scripts/collect-kp-ledger.ts` fetches real NOAA SWPC Kp; `.github/workflows/forecast-ledger.yml` runs only on trusted main/manual/scheduled jobs.
- Source versioning: `forecast-ledger/archive/YYYY-MM.json` stores *pre-event* predicted Kp captures, source retrieval UTC and later SWPC records explicitly marked `observed`. Never reconstruct an archived forecast from the current feed, include estimates as truth, or score a forecast from a snapshot taken after its target began.
- Score by fixed Kp target 3-hour window and lead bucket, one forecast per target/bucket, report paired counts, MAE, bias, G1+ contingency counts and an at-capture persistence baseline. **No invented confidence percentages, backtests or certainty.**
- Source observations may be revised. Keep revisions, Git history and source/provenance links; describe results as measured against NOAA's later *source-labelled* observed Kp, not independent certification.
- The collector stores only public NOAA products on the evidence-only `forecast-ledger` branch. Permission `contents:write` is reserved for this trusted scheduled workflow. Do not give an untrusted PR or external payload a GitHub write token.
- The UI must handle an empty/unavailable archive with zero score claims and show visible collection age and source distinctions. Browser smoke and unit tests protect that behavior.

## Forecast usability contract
- `src/lib/space/forecast-ux.ts` handles four **presentation** enhancements, not a new forecasting model: official Kp storm-threshold windows, explicitly browser-saved predicted revisions, DST-aware timestamp formatting and URL-deep-linked forecast tabs.
- Only NOAA Kp slots with `status="predicted"` enter projected G1+ storm windows. Do not join missing 3-hour periods, call estimated/observed a future prediction, or call a Kp threshold projection an official watch or warning.
- Snapshot revisions must be compared only for the **same target UTC 3-hour period**. A browser-saved baseline is not an immutable global archive and is not a forecast-accuracy backtest. Do not imply push notifications or server monitoring.
- NOAA daily probabilities and 27-day outlook use UTC **days** even if a visitor chooses local display for 3-hour slots. Fetch and issuance provenance stamps should stay explicitly UTC.
- Shared views must restore tab and optional selected projected window without pinning outdated forecast values or inventing an event that no longer appears. Validate clock/horizon/target URL inputs, and preserve all existing 3D camera/layer URL behavior.

## Mission Lab: scientific integrity and public comfort
- The first-party `src/lib/space/mission-lab.ts` models location lookups, **hypothetical** Shue sensitivity and explicit empirical *heuristic* patterns. Do not market any as a new operational NOAA forecast.
- `useOvationGrid(enabled)` fetches NOAA's entire grid only for the local inspector; it must preserve zero-valued cells and keep absent cells distinct. Lookup is geographic, not a calibrated aurora visibility probability. Account for illumination and openly note missing cloud/terrain/light pollution.
- Shue scenario bounds P 0.2–30 nPa and GSM Bz −25 to 25 nT. 3D preview must display **HYPOTHETICAL MODEL · NOT OBSERVED / NOT FORECAST** and must not change NOAA's measured telemetry, assume unmeasured Bz or combine time-disjoint OVATION imagery.
- Upstream pressure-jump and sustained Bz detector relies strictly on **measured L1 data** and requires adequate 1-minute-window sample density. No pattern ⇒ **no detected pattern**, never an all-clear. State the thresholds as heuristic, not scientifically validated storm detection probability.
- Browser-only mission briefs are audit-friendly exports of data actually loaded at generation time. Exclude stale measurements/forecasts; retain source URLs and the measurement/model/forecast distinction. No background watch, claim of historical verification, telemetry upload or automatic notifications.

## Ground receipts (USGS observatory measurements)
- `src/lib/space/ground.ts` strictly parses USGS one-minute horizontal component H (nT) and never fills instrument gaps, missing-value sentinels or future timestamps.
- Ground H variation is site-specific *observed* provisional data. Offset plots use the first valid measurement within the request, not a quiet-day correction; a 60-minute max-minus-min range is not a K-index, dB/dt, geoelectric hazard, or validated storm severity.
- Station measurements cannot independently verify arrival of a specific L1 discontinuity or CME without separate timing/causal analysis. Show source observation time and browser retrieval time distinctly; no false all-clear on stale, failed or CORS-blocked sources.
- Preserve USGS attribution, direct query links and honest unavailable states. Ground data must be an on-demand fetch to minimize load on public USGS infrastructure.
