# Magnetosphere — public NOAA Kp forecast receipts

This branch contains public NOAA forecast snapshots captured before each target three-hour window and subsequent records marked observed. Scheduled collection runs roughly every six hours, subject to GitHub Actions/network availability. Every Git commit is evidence of when each snapshot existed.

Data starts ONLY when the collector first runs successfully. Past predictions are never fabricated from the current rolling feed. A retrieval timestamp is the GitHub runner's fetch UTC, NOT NOAA's independently issued timestamp (which this JSON does not supply). Estimated Kp and future observations are excluded from forecast verification.

Data paths:
- forecast-ledger/archive/YYYY-MM.json: captured predicted Kp and append-only initial and revised NOAA-observed values.
- forecast-ledger/summary.json: descriptive Kp MAE, signed bias, G1+ hits/misses/false alarms and at-capture persistence benchmark, grouped by lead interval.

No score is reported until later observed target periods exist, and fewer than 20 distinct periods are explicitly preliminary. Multiple forecast horizons may share a target time; their counts are not independent.

The source-observed Kp values may be revised, are not independent certified ground truth, and their errors are not probabilistic storm confidence or safety guidance.
Official NOAA source: https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json
Methodology: https://github.com/Svyable/magnetosphere/blob/main/src/lib/space/ledger.ts
