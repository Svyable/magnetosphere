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
