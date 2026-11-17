// Reproducible export of received NOAA upstream samples. Never fills missing measurements.
import { dynamicPressure, propagationSeconds, type L1Sample } from "./model";

export const EXPORT_COLUMNS = [
  "l1_observed_utc", "estimated_earth_arrival_utc", "solar_wind_speed_km_s",
  "proton_density_cm3", "bz_gsm_nt", "bt_nt", "dynamic_pressure_npa",
  "estimated_propagation_minutes", "bz_quality", "wind_spacecraft", "mag_spacecraft", "provenance",
] as const;

function safeCell(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  // Treat spacecraft names supplied by upstream feeds as untrusted spreadsheet strings.
  const safe = /^[=+@\-\t\r]/.test(s) ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function measuredWindCsv(samples: L1Sample[]): string {
  const lines = [EXPORT_COLUMNS.map(safeCell).join(",")];
  for (const s of [...samples].sort((a, b) => a.t - b.t)) {
    if (!Number.isFinite(s.t) || !Number.isFinite(s.v) || !Number.isFinite(s.n) || s.v <= 0) continue;
    const lag = propagationSeconds(s.v);
    const row: (string | number | null)[] = [
      new Date(s.t).toISOString(), new Date(s.t + lag * 1000).toISOString(),
      s.v, s.n, s.bz, s.bt, Number(dynamicPressure(s.n, s.v).toFixed(4)),
      Number((lag / 60).toFixed(2)), s.bz === null ? "missing" : "measured",
      s.windSource, s.magSource, "NOAA SWPC RTSW L1 in-situ; arrival time estimated",
    ];
    lines.push(row.map(safeCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
