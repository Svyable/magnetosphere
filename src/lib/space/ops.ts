/**
 * NOAA SWPC operational products: issued alerts / watches / warnings, and the dated
 * 3-day forecast's S (solar radiation) and R (radio blackout) probabilities.
 *
 * Integrity rules (issue #17):
 * - A NOAA-issued watch or warning is a message with its own validity window. It is never
 *   inferred from Kp predictions; a Kp >= 5 projection stays a "threshold projection".
 * - Extensions supersede the message they extend; cancellations remove it. Watches state
 *   that they supersede all prior watches, so only the newest geomagnetic watch counts.
 * - G, S and R are separate NOAA scales. Kp is never converted into flare/radiation odds.
 */
export const OPS_URLS = {
  alerts: "https://services.swpc.noaa.gov/products/alerts.json",
  threeDay: "https://services.swpc.noaa.gov/text/3-day-forecast.txt",
  alertsPage: "https://www.swpc.noaa.gov/products/alerts-watches-and-warnings",
} as const;

const MONTH: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const DAY = 86_400_000;

function utc(y: number, mo: number, d: number, h = 0, mi = 0): number | null {
  if (![y, mo, d, h, mi].every(Number.isInteger) || y < 1990 || y > 2200 || mo < 0 || mo > 11 || h > 23 || mi > 59) return null;
  const t = Date.UTC(y, mo, d, h, mi);
  const dt = new Date(t);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo && dt.getUTCDate() === d ? t : null;
}

/**
 * NOAA message times appear as "2026 Nov 19 0118 UTC", occasionally without "UTC",
 * and in some issues as ISO-like "2026-05-19T07:01:00" or "2026-05-20 06:00". All are UTC.
 */
export function parseSwpcTime(s: string | undefined | null): number | null {
  if (!s) return null;
  const v = s.trim();
  let m = v.match(/^(\d{4})\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2})(\d{2})(?:\s*UTC)?$/);
  if (m) {
    const mo = MONTH[m[2]!];
    return mo === undefined ? null : utc(+m[1]!, mo, +m[3]!, +m[4]!, +m[5]!);
  }
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:\s*UTC|Z)?$/);
  if (m) return utc(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  return null;
}

export type SwpcKind = "alert" | "warning" | "watch" | "summary" | "other";
export type StormScale = `G${1 | 2 | 3 | 4 | 5}` | `S${1 | 2 | 3 | 4 | 5}` | `R${1 | 2 | 3 | 4 | 5}`;
export interface WatchDay { t: number; level: `G${1 | 2 | 3 | 4 | 5}` | null }
export interface SwpcMessage {
  productId: string;
  /** e.g. WARK04, ALTK05, WATA20. Serial numbers are only unique within a code. */
  code: string;
  serial: number | null;
  issuedAt: number;
  kind: SwpcKind;
  /** e.g. "Geomagnetic K-index of 5 expected" (without the ALERT:/WARNING: prefix) */
  title: string;
  /** The headline exactly as issued, e.g. "EXTENDED WARNING: Geomagnetic K-index of 4 expected" */
  headline: string;
  cancels: number | null;
  extends: number | null;
  continues: number | null;
  validFrom: number | null;
  validTo: number | null;
  thresholdAt: number | null;
  beginAt: number | null;
  scale: StormScale | null;
  watchDays: WatchDay[];
  text: string;
}

const field = (body: string, name: string) => body.match(new RegExp("^" + name + ":[ \\t]*(.*?)[ \\t]*$", "mi"))?.[1] ?? null;
const intField = (body: string, name: string) => {
  const v = field(body, name);
  return v !== null && /^\d+$/.test(v) ? Number(v) : null;
};

function kindOf(code: string, headline: string): SwpcKind {
  const h = headline.toUpperCase();
  if (/^(CANCEL(LED)? |EXTENDED |CONTINUED )?WATCH:/.test(h) || code.startsWith("WAT")) return "watch";
  if (/^(CANCEL(LED)? |EXTENDED |CONTINUED )?WARNING:/.test(h) || code.startsWith("WAR")) return "warning";
  if (/^(CANCEL(LED)? |EXTENDED |CONTINUED )?ALERT:/.test(h) || code.startsWith("ALT")) return "alert";
  if (/^(CANCEL(LED)? )?SUMMARY:/.test(h) || code.startsWith("SUM")) return "summary";
  return "other";
}

/** "Nov 16:  None (Below G1)   Nov 17:  G1 (Minor)" with the year taken from the issue time. */
function parseWatchDays(body: string, issuedAt: number): WatchDay[] {
  const block = body.match(/Highest Storm Level Predicted by Day:\s*\n([\s\S]*?)(?:\n\s*\n|THIS SUPERSEDES|Comment:|$)/i)?.[1];
  if (!block) return [];
  const issued = new Date(issuedAt);
  const out: WatchDay[] = [];
  for (const m of block.matchAll(/([A-Z][a-z]{2})\s+(\d{1,2}):\s*(None|G([1-5]))/g)) {
    const mo = MONTH[m[1]!];
    if (mo === undefined) continue;
    const year = issued.getUTCFullYear() + (mo < issued.getUTCMonth() - 6 ? 1 : mo > issued.getUTCMonth() + 6 ? -1 : 0);
    const t = utc(year, mo, +m[2]!);
    if (t !== null) out.push({ t, level: m[4] ? (`G${m[4]}` as WatchDay["level"]) : null });
  }
  return out;
}

export function parseSwpcMessage(raw: unknown): SwpcMessage | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["message"] !== "string" || typeof r["product_id"] !== "string") return null;
  const text = r["message"].replace(/\r\n?/g, "\n");
  const body = text.split(/\nNOAA Space Weather Scale descriptions/i)[0]!;
  const code = field(body, "Space Weather Message Code") ?? "";
  const issuedAt = parseSwpcTime(field(body, "Issue Time")) ??
    parseSwpcTime(typeof r["issue_datetime"] === "string" ? r["issue_datetime"] : null);
  if (!code || issuedAt === null) return null;
  const headline = body.match(/^((?:CANCEL(?:LED)? |EXTENDED |CONTINUED )?(?:ALERT|WARNING|WATCH|SUMMARY):.*?)\s*$/m)?.[1]?.trim() ?? "";
  const scaleText = field(body, "NOAA Scale");
  const scale = (scaleText?.match(/^([GSR][1-5])\b/)?.[1] ?? null) as StormScale | null;
  return {
    productId: r["product_id"], code, serial: intField(body, "Serial Number"), issuedAt,
    kind: kindOf(code, headline), headline, title: headline.replace(/^[A-Z ]+:\s*/, ""),
    cancels: intField(body, "Cancel Serial Number"),
    extends: intField(body, "Extension to Serial Number"),
    continues: intField(body, "Continuation of Serial Number"),
    validFrom: parseSwpcTime(field(body, "Valid From")),
    validTo: parseSwpcTime(field(body, "Now Valid Until") ?? field(body, "Valid To")),
    thresholdAt: parseSwpcTime(field(body, "Threshold Reached")),
    beginAt: parseSwpcTime(field(body, "Begin Time")),
    scale, watchDays: parseWatchDays(body, issuedAt), text: text.trim(),
  };
}

export function parseAlerts(raw: unknown): SwpcMessage[] {
  if (!Array.isArray(raw)) throw new Error("NOAA alerts product is not a JSON array");
  const msgs = raw.map(parseSwpcMessage).filter((m): m is SwpcMessage => m !== null);
  if (raw.length > 0 && msgs.length === 0) throw new Error("NOAA alerts product has no recognizable messages");
  return msgs.sort((a, b) => b.issuedAt - a.issuedAt);
}

export const isCancellation = (m: SwpcMessage) => m.cancels !== null || /^CANCEL/i.test(m.headline);
const key = (code: string, serial: number | null) => code + "#" + serial;

export interface OpsStatus {
  /** NOAA-issued warnings whose validity window contains `now`, after extensions/cancellations. */
  warnings: SwpcMessage[];
  /** The newest geomagnetic watch, if it still covers today or later with a G level, plus other active watches. */
  watches: SwpcMessage[];
  /** Threshold alerts issued in the last `recentHours` (events that happened, not predictions). */
  recentAlerts: SwpcMessage[];
}

export function opsStatus(messages: SwpcMessage[], now: number, recentHours = 24): OpsStatus {
  const removed = new Set<string>();
  for (const m of messages) {
    if (isCancellation(m) && m.cancels !== null) removed.add(key(m.code, m.cancels));
    if (m.extends !== null) removed.add(key(m.code, m.extends));
    if (m.continues !== null) removed.add(key(m.code, m.continues));
  }
  const live = messages.filter(m => !isCancellation(m) && !removed.has(key(m.code, m.serial)) && m.issuedAt <= now + 5 * 60_000);
  const warnings = live.filter(m => m.kind === "warning" && m.validTo !== null && m.validTo > now && (m.validFrom === null || m.validFrom <= now));
  const today = Math.floor(now / DAY) * DAY;
  // Each geomagnetic watch (WATA..) "supersedes any/all prior watches in effect".
  const watchFamilies = new Map<string, SwpcMessage>();
  for (const m of live) {
    if (m.kind !== "watch") continue;
    const fam = m.code.startsWith("WATA") ? "geomagnetic" : m.code;
    const prev = watchFamilies.get(fam);
    if (!prev || m.issuedAt > prev.issuedAt) watchFamilies.set(fam, m);
  }
  // A cancelled newest watch must not resurrect an older one.
  const cancelledNewest = messages.filter(m => isCancellation(m) && m.kind === "watch");
  const watches = [...watchFamilies.entries()].filter(([fam, w]) =>
    !cancelledNewest.some(c => (fam === "geomagnetic" ? c.code.startsWith("WATA") : c.code === w.code) && c.issuedAt > w.issuedAt) &&
    w.watchDays.some(d => d.t >= today && d.level !== null)).map(([, w]) => w);
  const recentAlerts = live.filter(m => m.kind === "alert" && m.issuedAt > now - recentHours * 3_600_000)
    .sort((a, b) => b.issuedAt - a.issuedAt);
  return { warnings: warnings.sort((a, b) => (a.validTo ?? 0) - (b.validTo ?? 0)), watches, recentAlerts };
}

/** Highest G level among *issued* products in effect (never derived from Kp predictions). */
export function highestIssuedG(s: OpsStatus, now: number): `G${1 | 2 | 3 | 4 | 5}` | null {
  const today = Math.floor(now / DAY) * DAY;
  const levels = [
    ...s.warnings.map(w => w.scale),
    ...s.watches.flatMap(w => w.watchDays.filter(d => d.t >= today).map(d => d.level)),
  ].filter((v): v is `G${1 | 2 | 3 | 4 | 5}` => typeof v === "string" && v.startsWith("G"));
  return levels.sort().at(-1) ?? null;
}

export interface SrDay { t: number; s1: number; r12: number; r3: number }
export interface ThreeDayForecast { issuedAt: number; days: SrDay[]; sRationale: string | null; rRationale: string | null }

function rangeStart(text: string, heading: string): number | null {
  const m = text.match(new RegExp(heading + "\\s+for\\s+([A-Z][a-z]{2})\\s+(\\d{1,2})\\s*-\\s*([A-Z][a-z]{2})\\s+(\\d{1,2})\\s+(\\d{4})", "i"));
  if (!m) return null;
  const sm = MONTH[m[1]!], em = MONTH[m[3]!];
  if (sm === undefined || em === undefined) return null;
  const endYear = +m[5]!;
  return utc(sm > em ? endYear - 1 : endYear, sm, +m[2]!);
}

function pctRow(text: string, label: RegExp): number[] {
  const m = text.match(label);
  if (!m) throw new Error("NOAA 3-day forecast row missing: " + label.source);
  const v = [m[1], m[2], m[3]].map(Number);
  if (v.some(x => !Number.isInteger(x) || x < 0 || x > 100)) throw new Error("Invalid NOAA probability");
  return v;
}

const rationale = (section: string | undefined) =>
  section?.match(/Rationale:\s*([\s\S]*?)(?:\n\s*\n|$)/)?.[1]?.replace(/\s+/g, " ").trim() ?? null;

/** NOAA's dated 3-day forecast: S1+ radiation storm and R1–R2 / R3+ radio blackout probabilities. */
export function parseThreeDayForecast(text: string): ThreeDayForecast {
  const t = text.replace(/\r\n?/g, "\n");
  const im = t.match(/^:Issued:\s*(\d{4}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4})\s+UTC\s*$/m);
  const issuedAt = parseSwpcTime(im?.[1]);
  if (issuedAt === null) throw new Error("NOAA 3-day forecast has no valid issuance time");
  const sStart = rangeStart(t, "Solar Radiation Storm Forecast");
  const rStart = rangeStart(t, "Radio Blackout Forecast");
  if (sStart === null || rStart === null) throw new Error("NOAA 3-day forecast missing dated S/R tables");
  if (sStart !== rStart) throw new Error("NOAA S and R tables cover different days");
  const s1 = pctRow(t, /^S1 or greater\s+(\d{1,3})%\s+(\d{1,3})%\s+(\d{1,3})%\s*$/m);
  const r12 = pctRow(t, /^R1-R2\s+(\d{1,3})%\s+(\d{1,3})%\s+(\d{1,3})%\s*$/m);
  const r3 = pctRow(t, /^R3 or greater\s+(\d{1,3})%\s+(\d{1,3})%\s+(\d{1,3})%\s*$/m);
  const sections = t.split(/^[ABC]\.\s+NOAA /m);
  return {
    issuedAt,
    days: [0, 1, 2].map(i => ({ t: sStart + i * DAY, s1: s1[i]!, r12: r12[i]!, r3: r3[i]! })),
    sRationale: rationale(sections.find(s => s.startsWith("Solar Radiation"))),
    rRationale: rationale(sections.find(s => s.startsWith("Radio Blackout"))),
  };
}

/** NOAA issues the 3-day forecast twice daily (~00:30 and ~12:30 UTC). */
export const THREE_DAY_MAX_AGE_MS = 18 * 3_600_000;
