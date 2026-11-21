// Guarded localStorage preferences. URL params always take priority (handled by caller).
import type { FieldDetail } from "./visuals";
import type { ForecastClock } from "./forecast-ux";
export interface Prefs { lowPower?: boolean; reducedMotion?: boolean; focus?: boolean; tourSeen?: boolean; fieldDetail?: FieldDetail; forecastClock?: ForecastClock }
const KEY = "magnetosphere.prefs.v1";

export function loadPrefs(): Prefs {
  try {
    if (typeof window === "undefined" || !window.localStorage) return {};
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    return v && typeof v === "object" ? (v as Prefs) : {};
  } catch { return {}; }
}
export function savePrefs(p: Prefs) {
  try { window.localStorage?.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}
export function clearPrefs() {
  try { window.localStorage?.removeItem(KEY); } catch { /* ignore */ }
}