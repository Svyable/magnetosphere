# MAGNETOSPHERE / EARTH NOW — notes

Live 3D magnetosphere driven by NOAA SWPC real-time L1 solar wind (RTSW 1-min mag + plasma), NOAA planetary Kp and NOAA OVATION aurora nowcast. GFZ Hp30 is attempted but is usually blocked by browser CORS; it is then shown as unavailable.

- Refresh: every 60 s. Freshness: L1 live ≤10 min, Kp ≤6 h, OVATION ≤30 min.
- Model: Shue et al. (1998) magnetopause from P = n·1.6726e-6·v² nPa and Bz (clamped). Bow shock ≈1.32·r0, field lines, tail: schematic.
- Live nowcast uses the newest L1 sample whose flat-delay arrival (1.5e6 km / v) has already occurred. Without enough lookback: "L1 observed, not yet propagated" + illustrative baseline.
- Timeline: last 4 h of measured samples; historical mode hides OVATION (no archive).
- Share URL params: `layers=mp,bs,fl,tail,wind,aurora,geo,axes,labels`, `view=global|earth|tail`, `cine=1`, `t=<epoch ms>`.
- Textures: NASA Blue Marble / Earth at Night (public domain) via three.js examples, served from `public/textures`.
- Inspiration: AEGIS (MIT) and TERRA — implemented independently.
- Tests: `bunx vitest run src/lib/space`.

## Core field (IGRF-14)
- Coefficients bundled in `src/lib/space/igrf14.json` (IAGA IGRF-14 via NOAA NCEI), evaluated in-browser to degree 13.
- South Atlantic Anomaly = minimum surface total intensity (2° grid); warm overlay < 32,000 nT.
- Dip poles found where the field is vertical; speed = distance between the pole now and 1 year earlier. Trails show every 5 years since 1900.
- IGRF-14: historical IGRF models before 1945 are not definitive; DGRF is definitive 1945–2020; the 2025 IGRF model is non-definitive, and its secular variation is forecast 2025–2030. Model values are not live measurements.
- Views: `view=saa`, `view=arctic`; layers `saa`, `poles`.

## 2026-11-17 GitHub release
- This dedicated GitHub repository is the development source of truth; it is not yet verified as linked to the earlier Lovable workspace. Reconcile, do not overwrite newer Lovable changes.
- EPIC, GOES-East/West, NOAA X-ray and IGRF explorer components from Lovable release 2 are now wired into the visible app on this branch.
- Earth-only view hides model layers temporarily without changing their switches. Clicking the geographic globe opens the IGRF inspector. Focus mode, shortcuts, saved preferences, robust PNG export and a short guided science tour were added.
- Browser smoke testing still required against real feed CORS and actual GPU devices; GitHub CI checks typecheck/tests/build on pull requests.
- Dedicated follow-on work adds downloadable measured L1 CSV with clear estimated arrival times; coordinate-specific permalinks and a pick marker; IGRF historical/provisional/forecast labeling tightened against IAGA 2026 reference.


## Source trust audit
- Added 2026-11-17 Data Passport UI (keyboard D): separate source timestamp, browser refresh time and role; 4h measured minute buckets plus matched IMF Bz coverage; pressure/density timeline traces.
- `scripts/audit-public-feeds.ts` + `src/lib/space/feed-audit.ts` let Actions validate NOAA/NASA responses and generate timestamped evidence artifacts every six hours. One runner's network failures do not prove a global provider outage; scheduled failures flag investigation, not operational space-weather alerts.
- EPIC is labelled a released, delayed photograph; GOES HTTP Last-Modified is not a scan timestamp. Upstream NOAA telemetry is not the same as Earth arrival.
