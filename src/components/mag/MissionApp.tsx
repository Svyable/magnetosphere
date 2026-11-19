import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Gallery from "./Gallery";
import FieldExplorer from "./FieldExplorer";
import SolarActivity from "./SolarActivity";
import Guide from "./Guide";
import DataPassport, { type ProvenanceFeed } from "./DataPassport";
import { Overlay } from "./ui";
import { loadPrefs, savePrefs, clearPrefs } from "@/lib/space/prefs";
import { FIELD_DETAIL_CHOICES, parseFieldDetail, type FieldDetail } from "@/lib/space/visuals";
import { validateTarget, type Target } from "@/lib/space/explorer";
import { measuredWindCsv } from "@/lib/space/export";
import { useHp30, useKp, useMag, useOvation, useWind, useXray, useKpForecast, useSwpcAlerts, URLS } from "@/lib/space/data";
import { highestIssuedG, opsStatus } from "@/lib/space/ops";
import { forecastPeak, gFromKp } from "@/lib/space/forecast";
import { estimatedArrival, incomingOutlook } from "@/lib/space/incoming";
import { XRAY_URL } from "@/lib/space/xray";
import {
  bzNear, dynamicPressure, freshness, joinL1, kpLabel, laggedSample, propagationSeconds, shue,
  type Freshness, type L1Sample,
} from "@/lib/space/model";
import type { CoreField, LayerKey, Preset } from "./Scene";
import { coeffsAt, decimalYear, geomagneticPole, intensityGrid, IGRF_LAST, IGRF_SV_END, poleMotion } from "@/lib/space/igrf";

const Scene = lazy(() => import("./Scene"));
const TimeAtlas = lazy(() => import("./TimeAtlas"));
const ForecastCenter = lazy(() => import("./ForecastCenter"));

const LAYERS: { key: LayerKey; name: string; kind: string; hint: string }[] = [
  { key: "saa", name: "Field strength · SAA", kind: "IGRF-14 model", hint: "Surface total field intensity. Warm = below 32,000 nT; the South Atlantic Anomaly is the weak-field dent where the inner radiation belt dips closest to Earth." },
  { key: "poles", name: "Magnetic pole drift", kind: "IGRF-14 model", hint: "Dip-pole positions every 5 years since 1900 (dots) and today (white). Blue ring = geomagnetic (dipole) pole." },
  { key: "mp", name: "Magnetopause", kind: "empirical model", hint: "Shue et al. 1998 boundary driven by L1 pressure and Bz. Not directly observed." },
  { key: "bs", name: "Bow shock", kind: "schematic", hint: "Scaled ~1.32 × magnetopause standoff. Shape is illustrative." },
  { key: "fl", name: "Field lines", kind: "illustrative", hint: "Dipole-inspired lines, compressed on the dayside, stretched into the tail lobes." },
  { key: "tail", name: "Plasma sheet", kind: "schematic", hint: "Approximate location of the magnetotail current/plasma sheet." },
  { key: "wind", name: "Solar wind", kind: "L1 speed, visual", hint: "Particle drift speed scales with measured L1 speed; motion is not to scale." },
  { key: "aurora", name: "Aurora (OVATION)", kind: "model forecast", hint: "NOAA OVATION nowcast probabilities. Shown only in LIVE mode." },
  { key: "geo", name: "Geosynchronous orbit", kind: "reference", hint: "6.6 Earth radii; satellites here can be exposed when r0 < 6.6." },
  { key: "axes", name: "Axes (GSE-like)", kind: "reference", hint: "+X toward the Sun, +Z north, dusk toward +Y (drawn on screen as depth)." },
  { key: "labels", name: "HUD labels", kind: "display", hint: "Floating labels in the scene." },
];
const DEFAULT_ON: LayerKey[] = ["saa", "poles", "mp", "bs", "fl", "tail", "wind", "aurora", "labels"];

const fmtUtc = (t: number | null | undefined) => (t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");
const fmtTime = (t: number) => new Date(t).toISOString().slice(11, 16);
const fmtAgo = (ms: number) => (ms < 90_000 ? `${Math.round(ms / 1000)} s ago` : ms < 5400_000 ? `${Math.round(ms / 60000)} min ago` : `${(ms / 3600_000).toFixed(1)} h ago`);

function StatusDot({ s }: { s: Freshness }) {
  return <span className={`status status-${s}`}>{s}</span>;
}

function Metric({ label, value, unit, src, note }: { label: string; value: string | null; unit?: string | undefined; src: string; note?: string | undefined }) {
  return (
    <div className="metric">
      <div className="metric-head"><span>{label}</span><span className="prov">{src}</span></div>
      <div className="metric-val">{value ?? <span className="na">no valid data</span>}{value && unit && <small>{unit}</small>}</div>
      {note && <div className="metric-note">{note}</div>}
    </div>
  );
}

function Spark({ data, sel, accessor, color, zero }: { data: L1Sample[]; sel: number | null; accessor: (s: L1Sample) => number | null; color: string; zero?: boolean }) {
  const vals = data.map(accessor);
  const nums = vals.filter((v): v is number => v !== null);
  if (nums.length < 2) return null;
  let lo = Math.min(...nums), hi = Math.max(...nums);
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const span = hi - lo || 1;
  const W = 1000, H = 40;
  let d = ""; let pen = false;
  vals.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    const x = (i / (vals.length - 1)) * W, y = H - ((v - lo) / span) * H;
    d += `${pen ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; pen = true;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="spark" aria-hidden>
      {zero && <line x1="0" x2={W} y1={H - ((0 - lo) / span) * H} y2={H - ((0 - lo) / span) * H} className="spark-zero" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {sel !== null && <line x1={(sel / (vals.length - 1)) * W} x2={(sel / (vals.length - 1)) * W} y1="0" y2={H} className="spark-cursor" />}
    </svg>
  );
}

export default function MissionApp() {
  const mag = useMag(); const wind = useWind(); const kp = useKp(); const ov = useOvation(); const hp = useHp30(); const xr = useXray(); const kpForecast = useKpForecast(); const swpcAlerts = useSwpcAlerts();
  const [now, setNow] = useState(() => Date.now());
  const [initQ] = useState(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search));
  const [savedPrefs] = useState(() => loadPrefs());
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(() => {
    const l = initQ.get("layers");
    const on = l !== null ? l.split(",") : DEFAULT_ON;
    return Object.fromEntries(LAYERS.map((x) => [x.key, on.includes(x.key)])) as Record<LayerKey, boolean>;
  });
  const [preset, setPreset] = useState<Preset>(() => {
    const v = initQ.get("view");
    return v === "global" || v === "earth" || v === "tail" || v === "saa" || v === "arctic" ? v : "earth";
  });
  const [nonce, setNonce] = useState(0);
  const [cinematic, setCinematic] = useState(() => initQ.get("cine") === "1");
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [pendingT, setPendingT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [incomingPreview, setIncomingPreview] = useState<L1Sample | null>(null);
  const [passportOpen, setPassportOpen] = useState(false);
  const [fieldTarget, setFieldTarget] = useState<Target | null>(() => {
    const la = initQ.get("lat"), lo = initQ.get("lon");
    if (la === null || lo === null) return null;
    const input = validateTarget(la, lo);
    return input.ok ? input.target : null;
  });
  const [fieldOpen, setFieldOpen] = useState(() => initQ.get("inspect") === "1");
  const [helpOpen, setHelpOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [focus, setFocus] = useState(() => initQ.has("focus") ? initQ.get("focus") === "1" : savedPrefs.focus ?? false);
  const [earthOnly, setEarthOnly] = useState(() => initQ.get("earth") === "1");
  const [coreYear, setCoreYear] = useState<number | null>(() => {
    const text = initQ.get("coreYear");
    if (text === null || text.trim() === "") return null;
    const v = Number(text);
    return Number.isFinite(v) && v >= 1900 && v <= 2030 ? v : null;
  });
  const [osReduced, setOsReduced] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => savedPrefs.reducedMotion ?? false);
  const [lowPower, setLowPower] = useState(() => savedPrefs.lowPower ?? false);
  const [fieldDetail, setFieldDetail] = useState<FieldDetail>(() => parseFieldDetail(initQ.get("detail")) ?? parseFieldDetail(savedPrefs.fieldDetail) ?? "quiet");
  const [toast, setToast] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLElement>(null);

  // Side panels end where the measured timeline begins, whatever its real height.
  useEffect(() => {
    const root = rootRef.current, tl = timelineRef.current;
    if (!root || !tl || typeof ResizeObserver === "undefined") return;
    const sync = () => root.style.setProperty("--tl-h", `${Math.ceil(tl.getBoundingClientRect().height)}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(tl);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOsReduced(mq.matches);
    const onMq = () => setOsReduced(mq.matches);
    mq.addEventListener("change", onMq);
    if (savedPrefs.lowPower === undefined) setLowPower(window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4);
    const t = Number(initQ.get("t")); if (t > 0) setPendingT(t);
    return () => { clearInterval(id); mq.removeEventListener("change", onMq); };
  }, [initQ, savedPrefs]);

  const motionOff = reducedMotion || osReduced;
  const historicCore = coreYear !== null && Math.abs(coreYear - decimalYear(now)) > 0.75;
  const displayedLayers = useMemo(() => {
    if (earthOnly) return Object.fromEntries(Object.keys(layers).map((k) => [k, false])) as Record<LayerKey, boolean>;
    if (historicCore) {
      // A NOAA solar-wind nowcast is not a reconstruction of 1900 space weather.
      const hidden: LayerKey[] = ["mp", "bs", "fl", "tail", "wind", "aurora"];
      return { ...layers, ...Object.fromEntries(hidden.map(k => [k, false])) } as Record<LayerKey, boolean>;
    }
    return layers;
  }, [earthOnly, historicCore, layers]);

  // Save only accessibility/display preferences; shared URLs override them on arrival.
  useEffect(() => { savePrefs({ focus, lowPower, reducedMotion, fieldDetail }); }, [focus, lowPower, reducedMotion, fieldDetail]);

  useEffect(() => {
    document.title = "MAGNETOSPHERE / EARTH NOW · " + (earthOnly ? "Earth only" : preset.toUpperCase()) + " view";
  }, [preset, earthOnly]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") {
        setGalleryOpen(false); setFieldOpen(false); setHelpOpen(false); setTourOpen(false); setDrawer(false); setPassportOpen(false); setTimeOpen(false); setForecastOpen(false);
        return;
      }
      const t = e.target;
      if (t instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      const views: Record<string, Preset> = { "1": "global", "2": "earth", "3": "tail", "4": "saa", "5": "arctic" };
      if (k === "?" || k === "h") { e.preventDefault(); setHelpOpen((v) => !v); }
      else if (k in views) { setPreset(views[k]!); setNonce((n) => n + 1); }
      else if (k === "l") { setPlaying(false); setSelIdx(null); }
      else if (k === "f") setFocus((v) => !v);
      else if (k === "e") { setEarthOnly((v) => !v); setPreset("earth"); setNonce((n) => n + 1); }
      else if (k === "g") setGalleryOpen(true);
      else if (k === "i") setFieldOpen(true);
      else if (k === "d") setPassportOpen(true);
      else if (k === "t") setTimeOpen(true);
      else if (k === "p") setForecastOpen(true);
      else if (k === "v") setFieldDetail((d) => FIELD_DETAIL_CHOICES[(FIELD_DETAIL_CHOICES.indexOf(d) + 1) % FIELD_DETAIL_CHOICES.length]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  const [core, setCore] = useState<(CoreField & { m1900: number; mNow: number; northSpeed1990: number }) | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      const year = coreYear ?? decimalYear(Date.now());
      const c = coeffsAt(year);
      const g = geomagneticPole(c);
      setCore({
        year, grid: intensityGrid(c, 2), north: poleMotion(year, true), south: poleMotion(year, false), geomag: g,
        m1900: geomagneticPole(coeffsAt(1900)).momentNT, mNow: g.momentNT, northSpeed1990: poleMotion(1990, true).speedKmYr,
      });
    }, 50);
    return () => clearTimeout(id);
  }, [coreYear]);

  const all = useMemo(() => joinL1(wind.data ?? [], mag.data ?? []), [wind.data, mag.data]);
  const latestL1 = all.at(-1) ?? null;
  const inbound = useMemo(() => incomingOutlook(all, now), [all,now]);
  const timeline = useMemo(() => {
    const ref = Math.max(now, latestL1?.t ?? 0);
    return all.filter((s) => s.t >= ref - 4 * 3600_000);
  }, [all, now, latestL1]);

  useEffect(() => {
    if (pendingT === null || timeline.length === 0) return;
    let best = 0;
    timeline.forEach((s, i) => { if (Math.abs(s.t - pendingT) < Math.abs(timeline[best]!.t - pendingT)) best = i; });
    setSelIdx(best); setPendingT(null);
  }, [pendingT, timeline]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setSelIdx((i) => {
        const n = (i ?? 0) + 2;
        if (n >= timeline.length - 1) { setPlaying(false); return null; }
        return n;
      });
    }, 110);
    return () => clearInterval(id);
  }, [playing, timeline.length]);

  const live = selIdx === null;
  const sample: L1Sample | null = live ? laggedSample(all, now) : timeline[selIdx] ?? null;
  const notPropagated = live && !sample && !!latestL1;
  const baseline = !sample;
  const bz = sample ? bzNear(all, sample) : null;
  const P = sample ? dynamicPressure(sample.n, sample.v) : null;
  const model = shue(P ?? 2, bz ?? 0);
  // The preview must be a genuine measured L1 sample with matched Bz that has
  // not yet nominally reached Earth. It does NOT replace measured nowcast metrics.
  const activePreview = live && !historicCore && incomingPreview?.bz !== null && incomingPreview !== null &&
    incomingPreview.t <= now + 60_000 && estimatedArrival(incomingPreview) > now &&
    estimatedArrival(incomingPreview) <= now + 130 * 60_000 ? incomingPreview : null;
  const scenarioModel = activePreview
    ? shue(dynamicPressure(activePreview.n, activePreview.v), activePreview.bz!)
    : model;
  const lagS = sample ? propagationSeconds(sample.v) : null;
  const arrival = sample && lagS ? sample.t + lagS * 1000 : null;
  const sceneTime = live ? now : arrival ?? now;
  const arrivalGap = live && arrival ? now - arrival : 0;

  const prev = useMemo(() => {
    if (!sample) return null;
    for (let i = all.length - 1; i >= 0; i--) if (all[i]!.t <= sample.t - 3600_000) return all[i]!;
    return null;
  }, [all, sample]);
  const prevModel = prev ? shue(dynamicPressure(prev.n, prev.v), bzNear(all, prev) ?? 0) : null;

  const st = {
    wind: freshness(wind.data?.at(-1)?.t ?? null, now, 10 * 60_000, wind.isError && !wind.data?.length),
    mag: freshness(mag.data?.at(-1)?.t ?? null, now, 10 * 60_000, mag.isError && !mag.data?.length),
    kp: freshness(kp.data?.at(-1)?.t ?? null, now, 6 * 3600_000, kp.isError && !kp.data?.length),
    ov: freshness(ov.data?.observed ?? null, now, 30 * 60_000, ov.isError && !ov.data),
    hp: freshness(hp.data?.at(-1)?.t ?? null, now, 2 * 3600_000, hp.isError || (hp.isSuccess && !hp.data.length)),
  };
  const kpLatest = kp.data?.at(-1) ?? null;
  const hpLatest = hp.data?.at(-1) ?? null;
  const ovValid = live && st.ov === "live" && ov.data && ov.data.points.length > 0;
  const lastRefresh = Math.max(wind.dataUpdatedAt, mag.dataUpdatedAt, kp.dataUpdatedAt, ov.dataUpdatedAt);
  const peakKpAhead = forecastPeak(kpForecast.data ?? [], now);
  const ops = swpcAlerts.data ? opsStatus(swpcAlerts.data, now) : null;
  const issuedG = ops ? highestIssuedG(ops, now) : null;
  const leadIssued = ops ? ([...ops.warnings].sort((x, y) => (y.scale ?? "").localeCompare(x.scale ?? ""))[0] ?? ops.watches[0] ?? null) : null;
  const issuedCount = ops ? ops.warnings.length + ops.watches.length : 0;
  const overall: Freshness = st.wind === "disconnected" && st.mag === "disconnected" ? "disconnected" : st.wind === "live" && st.mag === "live" ? "live" : st.wind === "loading" ? "loading" : "stale";
  const feedLines: ProvenanceFeed[] = [
    { id: "wind", title: "Upstream plasma", producer: "NOAA SWPC RTSW", role: "measurement", url: URLS.wind, observedAt: wind.data?.at(-1)?.t ?? null, browserUpdatedAt: wind.dataUpdatedAt || null, thresholdMinutes: 10, count: wind.data?.length ?? 0, failed: wind.isError, note: "In-situ spacecraft speed & proton density near L1" },
    { id: "mag", title: "Upstream magnetic field", producer: "NOAA SWPC RTSW", role: "measurement", url: URLS.mag, observedAt: mag.data?.at(-1)?.t ?? null, browserUpdatedAt: mag.dataUpdatedAt || null, thresholdMinutes: 10, count: mag.data?.length ?? 0, failed: mag.isError, note: "IMF Bz GSM and total field strength near L1" },
    { id: "kp", title: "Planetary Kp", producer: "NOAA SWPC", role: "index", url: URLS.kp, observedAt: kpLatest?.t ?? null, browserUpdatedAt: kp.dataUpdatedAt || null, thresholdMinutes: 360, count: kp.data?.length ?? 0, failed: kp.isError, note: "Ground-derived 3-hour index; not instantaneous" },
    { id: "hp", title: "Planetary Hp30", producer: "GFZ Potsdam", role: "index", url: "https://kp.gfz.de/en/hp30-hp60", observedAt: hpLatest?.t ?? null, browserUpdatedAt: hp.dataUpdatedAt || null, thresholdMinutes: 120, count: hp.data?.length ?? 0, failed: hp.isError, note: "Ground-derived 30-minute index; browser CORS may block GFZ" },
    { id: "ov", title: "Aurora OVATION", producer: "NOAA SWPC", role: "forecast", url: URLS.ovation, observedAt: ov.data?.observed ?? null, browserUpdatedAt: ov.dataUpdatedAt || null, thresholdMinutes: 30, count: ov.data?.points.length ?? 0, failed: ov.isError, note: "Short-term model, forecast target " + fmtUtc(ov.data?.forecast) },
    { id: "xr", title: "GOES X-ray long band", producer: "NOAA SWPC GOES", role: "measurement", url: XRAY_URL, observedAt: xr.data?.long.at(-1)?.t ?? null, browserUpdatedAt: xr.dataUpdatedAt || null, thresholdMinutes: 10, count: xr.data?.long.length ?? 0, failed: xr.isError, note: "Measured 0.1–0.8 nm solar X-ray flux; flare class is derived" },
  ];
  const requestRefresh = () => {
    void Promise.allSettled([wind.refetch(), mag.refetch(), kp.refetch(), hp.refetch(), ov.refetch(), xr.refetch()]);
  };

  // Share URL sync
  useEffect(() => {
    const q = new URLSearchParams();
    q.set("layers", (Object.keys(layers) as LayerKey[]).filter((k) => layers[k]).join(","));
    q.set("view", preset);
    if (cinematic) q.set("cine", "1");
    if (focus) q.set("focus", "1");
    if (earthOnly) q.set("earth", "1");
    q.set("detail", fieldDetail);
    if (coreYear !== null) q.set("coreYear", String(coreYear));
    if (fieldTarget) {
      q.set("lat", String(Number(fieldTarget.lat.toFixed(4))));
      q.set("lon", String(Number(fieldTarget.lon.toFixed(4))));
      if (fieldOpen) q.set("inspect", "1");
    }
    if (!live && sample) q.set("t", String(sample.t));
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }, [layers, preset, cinematic, focus, earthOnly, fieldDetail, coreYear, fieldTarget, fieldOpen, live, sample]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const exportPng = useCallback(() => {
    const c = document.querySelector<HTMLCanvasElement>("#scene-wrap canvas");
    if (!c) return flash("Scene not ready");
    try {
      const url = c.toDataURL("image/png");
      if (!url.startsWith("data:image/png;base64,")) throw new Error("Canvas could not be captured");
      const a = document.createElement("a");
      a.href = url;
      a.download = "magnetosphere-" + new Date().toISOString().slice(0, 16).replace(":", "") + "Z.png";
      a.click();
      flash("3D image exported (on-screen HTML labels not included)");
    } catch { flash("PNG export unavailable: scene not ready or graphics restrictions"); }
  }, []);
  const previewIncoming = (next: L1Sample | null) => {
    setIncomingPreview(next);
    if (!next) return;
    // An in-transit Shue model is a scenario, NEVER a live observation.
    setPlaying(false); setSelIdx(null); setCoreYear(null); setEarthOnly(false);
    setPreset("global"); setNonce(n => n + 1);
  };
  const exportMeasuredCsv = () => {
    if (!timeline.length) { flash("No valid NOAA L1 measurements to export"); return; }
    try {
      const text = measuredWindCsv(timeline);
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "magnetosphere-noaa-l1-" + new Date().toISOString().slice(0, 10) + ".csv";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      flash("Measured NOAA upstream samples exported with estimated arrival times");
    } catch { flash("CSV download is unavailable in this browser"); }
  };
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); flash("View link copied"); } catch { flash(window.location.href); }
  };

  const chooseView = (p: Preset) => { setPreset(p); setNonce((n) => n + 1); };
  const pickGlobe = (lat: number, lon: number) => { setFieldTarget({ lat, lon }); setFieldOpen(true); };
  const resetPrefs = () => {
    clearPrefs(); setFocus(false); setEarthOnly(false); setReducedMotion(false); setFieldDetail("quiet");
    setLowPower(window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4);
    flash("Display preferences reset");
  };

  const changes: string[] = [];
  if (sample && prev && P && prevModel) {
    const dP = ((P - dynamicPressure(prev.n, prev.v)) / dynamicPressure(prev.n, prev.v)) * 100;
    const dr = model.r0 - prevModel.r0;
    changes.push(`Dynamic pressure ${dP >= 0 ? "rose" : "fell"} ${Math.abs(dP).toFixed(0)}% over the past hour, so the modeled dayside boundary ${dr < 0 ? "moved inward" : "moved outward"} by ${Math.abs(dr).toFixed(2)} RE. Higher pressure compresses the magnetosphere.`);
  }
  if (bz !== null) changes.push(bz < -2 ? `Bz is southward (${bz.toFixed(1)} nT): this favors dayside reconnection, letting solar-wind energy couple into the magnetosphere and raising the odds of aurora a while later.` : bz > 2 ? `Bz is northward (${bz.toFixed(1)} nT): dayside reconnection is suppressed, coupling is generally weak.` : `Bz is near zero (${bz.toFixed(1)} nT): weak, variable coupling.`);
  else if (sample) changes.push("Magnetic-field Bz is unavailable for this sample; the Bz term of the model is assumed 0.");
  if (core) changes.push(`Deep inside Earth, the north magnetic pole is drifting ~${core.north.speedKmYr.toFixed(0)} km/yr toward Siberia (vs ~${core.northSpeed1990.toFixed(0)} km/yr in 1990), and the South Atlantic Anomaly keeps the weakest surface field (~${Math.round(core.grid.min.F / 1000)}k nT) — satellites crossing it take more radiation hits. These change over years, not minutes.`);
  if (kpLatest) changes.push(`Latest Kp ${kpLatest.kp.toFixed(2)} (${kpLabel(kpLatest.kp)}) summarizes global geomagnetic disturbance over a 3-hour window — it reacts to, and lags, the solar-wind driving above.`);

  const Toggle = ({ k }: { k: LayerKey }) => {
    const l = LAYERS.find((x) => x.key === k)!;
    return (
      <button type="button" role="switch" aria-checked={layers[k]} className="layer" title={l.hint}
        onClick={() => setLayers((c) => ({ ...c, [k]: !c[k] }))}>
        <span className="layer-sw" aria-hidden />
        <span className="layer-text"><span>{l.name}</span><em>{k === "aurora" && !ovValid && layers.aurora ? "hidden · no valid live nowcast" : l.kind}</em></span>
      </button>
    );
  };

  return (
    <div ref={rootRef} className={"app-root" + (focus ? " focus-mode" : "")}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden />MAGNETOSPHERE <span>/ EARTH NOW</span></div>
        <div className="topbar-meta">
          <span className={live ? "mode mode-live" : "mode mode-hist"}>{live ? "LIVE" : "HISTORICAL"}</span>
          <span>L1 feed <StatusDot s={overall} /></span>
          <span className="hide-sm topbar-refreshed">Refreshed {lastRefresh ? fmtUtc(lastRefresh) : "—"}</span>
          <button className="btn-ghost forecast-topbar" onClick={() => setForecastOpen(true)}>↗ Incoming & future</button>
          <button className="btn-ghost" onClick={() => setGalleryOpen(true)}>◉ Eyes on Earth</button>
          <button className="btn-ghost" onClick={() => setFieldOpen(true)}>⌖ Field explorer</button>
          <button className="btn-ghost" onClick={() => setPassportOpen(true)}>▤ Data passport</button>
          <button className="btn-ghost" onClick={() => setTimeOpen(true)}>◷ 4D Time Atlas</button>
          <button className="btn-ghost" onClick={() => setTourOpen(true)}>Explore tour</button>
          <button className="btn-ghost" aria-pressed={focus} onClick={() => setFocus((v) => !v)}>{focus ? "Exit focus" : "Focus"}</button>
          <button className="btn-ghost" onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts">?</button>
          <button className="btn-ghost" onClick={() => setDrawer(true)}>Sources & method</button>
        </div>
      </header>

      <main className="stage">
        <div className="canvas-area">
          <Suspense fallback={<div className="loading">Initializing scene…</div>}>
            <Scene layers={{ ...displayedLayers, mp: activePreview ? true : displayedLayers.mp, aurora: displayedLayers.aurora && !!ovValid && !activePreview }} r0={scenarioModel.r0} alpha={scenarioModel.alpha} speed={activePreview?.v ?? sample?.v ?? null}
              time={sceneTime} aurora={ovValid ? ov.data!.points : null} preset={preset} presetNonce={nonce} core={core}
              cinematic={cinematic} reducedMotion={motionOff} lowPower={lowPower} fieldDetail={fieldDetail} baseline={baseline && !activePreview} onGlobePick={pickGlobe} selected={fieldTarget} />
          </Suspense>
          {leadIssued && (
            <button type="button" className="issued-pill" onClick={() => setForecastOpen(true)} aria-label={"NOAA " + leadIssued.kind + " in effect: " + leadIssued.title + ". Open forecast"}>
              <b>NOAA {leadIssued.kind}{issuedG ? " · " + issuedG : ""}</b> {leadIssued.title.replace(/^Geomagnetic /, "")}{leadIssued.kind === "warning" && leadIssued.validTo ? " · to " + fmtTime(leadIssued.validTo) + " UTC" : ""}
            </button>
          )}
          <div className="scene-banner">
            {activePreview ? <span className="incoming-preview-banner"><strong>UPSTREAM SCENARIO · NOT YET OBSERVED AT EARTH</strong> · L1 sample {fmtUtc(activePreview.t)} → nominal arrival {fmtUtc(estimatedArrival(activePreview))} · Shue nose {scenarioModel.r0.toFixed(2)} Rₑ · timing uncertain <button type="button" className="btn" onClick={() => setIncomingPreview(null)}>↺ Return live geometry</button></span>
              : earthOnly ? <span>Earth-only geographic view · fixed NASA Blue Marble texture, not a current global satellite photo · click Earth to inspect field</span>
              : historicCore ? <span className="hist">HISTORIC CORE MODEL {coreYear?.toFixed(1)} · IGRF-14 SAA / poles only · present-day NOAA solar-wind geometry hidden (different time clocks)</span> : baseline
              ? <span className="warn">{notPropagated ? "L1 observed, not yet propagated — " : "No live observations — "}geometry is an illustrative baseline (P = 2 nPa, Bz = 0)</span>
              : live
                ? <span>{arrivalGap > 20 * 60_000 ? "STALE model input" : "Estimated Earth arrival"}: L1 sample {fmtUtc(sample!.t)} propagated ~{Math.round(lagS! / 60)} min{bz === null && <b className="warn"> · Bz missing, 0 assumed</b>}{arrivalGap > 20 * 60_000 && <b className="warn"> · data gap, last arrival {fmtAgo(arrivalGap)}</b>}</span>
                : <span className="hist">Historical wind, schematic geometry · L1 obs {fmtUtc(sample!.t)} → est. arrival {fmtUtc(arrival)}</span>}
          </div>
        </div>

        <aside className="panel panel-left" aria-label="Layers and view">
          <h2>Layers</h2>
          <div className="layers">{LAYERS.map((l) => <Toggle key={l.key} k={l.key} />)}</div>
          <h2>Field-line clarity <span className="prov">illustrative</span></h2>
          <div className="seg field-detail-picker" role="group" aria-label="Schematic field line complexity">
            {FIELD_DETAIL_CHOICES.map((d) => (
              <button key={d} type="button" aria-pressed={fieldDetail === d}
                title={d === "quiet" ? "Minimal schematic field lines for a clear Earth view" : d === "balanced" ? "Readable science geometry with 28 possible paths" : "Original research view with up to 80 illustrative paths"}
                onClick={() => setFieldDetail(d)}>{d === "detailed" ? "Detailed" : d === "balanced" ? "Balanced" : "Quiet"}</button>
            ))}
          </div>
          <p className="detail-hint">Visual complexity only, not magnetic-model accuracy. Press V to cycle.</p>
          <h2>View</h2>
          <div className="seg" role="group" aria-label="Camera preset">
            {(["global", "earth", "tail", "saa", "arctic"] as Preset[]).map((p) => (
              <button key={p} aria-pressed={preset === p} onClick={() => { setPreset(p); setNonce((n) => n + 1); }}>{p}</button>
            ))}
          </div>
          <p className="detail-hint" role="note">
            {preset === "global"
              ? "Global keeps relative sizes: Earth is tiny compared with the ~10 Earth-radius dayside magnetopause. Choose Earth for a close-up."
              : preset === "earth"
                ? "Close-up view of Earth's field and aurora. Choose Global to see the full empirical magnetopause at scale."
                : "Drag to orbit · scroll to zoom · Reset camera restores this view."}
          </p>
          <div className="row">
            <button className="btn" onClick={() => setNonce((n) => n + 1)}>Reset camera</button>
            <button className={"btn" + (earthOnly ? " active" : "")} role="switch" aria-checked={earthOnly} onClick={() => { setEarthOnly((v) => !v); chooseView("earth"); }}>{earthOnly ? "Restore science layers" : "Earth only"}</button>
            <button className="btn" role="switch" aria-checked={cinematic} disabled={motionOff} onClick={() => setCinematic((c) => !c)}>{motionOff ? "Orbit off (reduced motion)" : cinematic ? "Cinematic on" : "Cinematic orbit"}</button>
          </div>
          <div className="row">
            <button className="btn" onClick={exportPng}>Export PNG</button>
            <button className="btn" onClick={share}>Copy view link</button>
            <button className="btn" onClick={() => setGalleryOpen(true)}>Latest Earth photos</button>
            <button className="btn" onClick={() => setFieldOpen(true)}>Inspect any location</button>
          </div>
          <div className="legend">
            <div><i className="sw sw-blue" />Magnetopause (empirical)</div>
            <div><i className="sw sw-orange" />Bow shock & solar wind</div>
            <div><i className="sw sw-cyan" />Closed / open field lines</div>
            <div><i className="sw sw-aurora" />OVATION probability</div>
            <div><i className="sw sw-saa" />Weak field &lt; 32,000 nT (SAA)</div>
            <div><i className="sw sw-cyan" />N / <i className="sw sw-orange sw-short" />S dip-pole path 1900→now</div>
          </div>
          <p className="caveat">Only the boundary size is data-driven. Shapes, field lines and the tail are illustrative; distances in Earth radii (R<sub>E</sub>). Sun position approximate (±1°).</p>
        </aside>

        <aside className="panel panel-right" aria-label="Live metrics">
          <section className="forecast-teaser" aria-label="Published NOAA future predictions">
            <button type="button" className="incoming-teaser" onClick={() => setForecastOpen(true)} aria-label="Open incoming L1 observations and nominal Earth arrival scenarios">
              <span>↘ UPSTREAM TO EARTH</span>
              <strong>{inbound.freshness==="current" && inbound.pulses[0] ? "~"+Math.round(inbound.pulses[0].leadMinutes)+" min" : inbound.freshness==="stale"?"Stale source":"Awaiting L1"}</strong>
              <small>{inbound.freshness==="current" && inbound.pulses[0]
                ? "Measured Bz "+(inbound.pulses[0].sample.bz===null?"unavailable":inbound.pulses[0].sample.bz.toFixed(1)+" nT")+" · nominal arrival"
                : "No verified current inbound sample"}</small>
              <span className="incoming-teaser-cta">Inspect incoming stream ↗</span>
            </button>
            <div className="forecast-teaser-heading"><span>◷ NEXT 72 HOURS</span><span className="prov">NOAA PREDICTION</span></div>
            <div className="forecast-teaser-body">
              <strong>{peakKpAhead ? "Kp " + peakKpAhead.kp.toFixed(2) : kpForecast.isError ? "Unavailable" : "Loading forecast"}</strong>
              <span>{peakKpAhead ? (gFromKp(peakKpAhead.kp) ?? "Below G1") + " · projected peak" : "Future slots only; no invented values"}</span>
            </div>
            <div className={"teaser-issued" + (leadIssued ? " on" : "")} role="status">
              {swpcAlerts.isError ? <span>NOAA alerts unavailable · not an all-clear</span>
                : !ops ? <span>Checking NOAA-issued watches & warnings…</span>
                : leadIssued ? <span><b>NOAA {leadIssued.kind.toUpperCase()}{issuedG ? " · " + issuedG : ""}</b> {leadIssued.title}{leadIssued.kind === "warning" && leadIssued.validTo ? " · until " + fmtTime(leadIssued.validTo) + " UTC" : ""}{issuedCount > 1 ? ` · +${issuedCount - 1} more` : ""}</span>
                : <span>No NOAA watch or warning in effect{ops.recentAlerts.length ? ` · ${ops.recentAlerts.length} alert${ops.recentAlerts.length > 1 ? "s" : ""} in last 24 h` : ""}</span>}
            </div>
            <button type="button" className="btn forecast-teaser-cta" onClick={() => setForecastOpen(true)}>See predictions →</button>
          </section>
          <h2>Solar wind at L1 <StatusDot s={st.wind} /></h2>
          <p className="sub">{sample ? `Sample ${fmtUtc(sample.t)} · ${sample.windSource ?? "?"} plasma / ${sample.magSource ?? "?"} mag` : "Awaiting valid propagated sample"}</p>
          <div className="metrics">
            <Metric label="Speed" value={sample ? sample.v.toFixed(0) : null} unit="km/s" src="L1 in-situ" />
            <Metric label="Density" value={sample ? sample.n.toFixed(2) : null} unit="cm⁻³" src="L1 in-situ" />
            <Metric label="Bz (GSM)" value={bz !== null ? bz.toFixed(1) : null} unit="nT" src="L1 in-situ" note={bz !== null ? (bz < 0 ? "southward" : "northward") : undefined} />
            <Metric label="Bt" value={sample?.bt != null ? sample.bt.toFixed(1) : null} unit="nT" src="L1 in-situ" />
            <Metric label="Dyn. pressure" value={P ? P.toFixed(2) : null} unit="nPa" src="derived" />
            <Metric label="L1→Earth lag" value={lagS ? (lagS / 60).toFixed(0) : null} unit="min" src="estimate" note="1.5×10⁶ km ÷ speed" />
          </div>
          <h2>Magnetopause <span className="prov">empirical · Shue 1998</span></h2>
          <div className="metrics">
            <Metric label="Standoff r₀" value={baseline ? null : model.r0.toFixed(2)} unit="R_E" src="model" note={!baseline && model.r0 < 6.6 ? "inside GEO orbit!" : baseline ? "baseline shown" : undefined} />
            <Metric label="Flaring α" value={baseline ? null : model.alpha.toFixed(3)} src="model" note={sample && bz === null ? "Bz absent: boundary assumes 0 nT" : undefined} />
          </div>
          <h2>Core field <span className="prov">IGRF-14 model</span></h2>
          <button className="btn full-inspector" onClick={() => setTimeOpen(true)}>◷ Scrub 1900–2030 core field · explore 500 Myr</button>
          {core ? (
            <>
              <p className="sub">Epoch {core.year.toFixed(2)}{core.year > IGRF_LAST ? ` · extrapolated with official secular variation (valid to ${IGRF_SV_END})` : ""}</p>
              <div className="metrics">
                <Metric label="N dip pole speed" value={core.north.speedKmYr.toFixed(1)} unit="km/yr" src="model" note={`${core.north.now.lat.toFixed(2)}°N ${Math.abs(core.north.now.lon).toFixed(1)}°${core.north.now.lon >= 0 ? "E" : "W"} · heading ${Math.round(core.north.bearing)}°`} />
                <Metric label="S dip pole speed" value={core.south.speedKmYr.toFixed(1)} unit="km/yr" src="model" note={`${Math.abs(core.south.now.lat).toFixed(2)}°S ${Math.abs(core.south.now.lon).toFixed(1)}°${core.south.now.lon >= 0 ? "E" : "W"} · heading ${Math.round(core.south.bearing)}°`} />
                <Metric label="SAA minimum" value={Math.round(core.grid.min.F).toLocaleString("en-US")} unit="nT" src="model" note={`near ${Math.abs(core.grid.min.lat)}°S ${Math.abs(core.grid.min.lon)}°W (2° grid)`} />
                <Metric label="Surface < 32k nT" value={(core.grid.lowFraction * 100).toFixed(1)} unit="%" src="model" note="weak-field area" />
                <Metric label="Dipole since 1900" value={(((core.mNow - core.m1900) / core.m1900) * 100).toFixed(1)} unit="%" src="model" note="change in dipole strength" />
                <Metric label="N pole speed 1990" value={core.northSpeed1990.toFixed(1)} unit="km/yr" src="model" note="for comparison" />
              </div>
            </>
          ) : <p className="sub">Computing field model…</p>}
          <button className="btn full-inspector" onClick={() => { if (core) setFieldTarget({ lat: core.grid.min.lat, lon: core.grid.min.lon }); setFieldOpen(true); }}>Inspect the SAA minimum & surface field</button>
          <h2>Geomagnetic activity</h2>
          <div className="metrics">
            <Metric label={`Kp`} value={kpLatest ? kpLatest.kp.toFixed(2) : null} src="NOAA Kp" note={kpLatest ? `${kpLabel(kpLatest.kp)} · ${fmtUtc(kpLatest.t)}` : st.kp === "disconnected" ? "unavailable" : undefined} />
            <Metric label="Hp30" value={hpLatest ? hpLatest.hp.toFixed(2) : null} src="GFZ Hp30" note={hpLatest ? fmtUtc(hpLatest.t) : hp.isError ? "GFZ unavailable from browser (CORS/network)" : undefined} />
          </div>
          <h2>Aurora <span className="prov">OVATION model</span> <StatusDot s={st.ov} /></h2>
          <p className="sub">{ov.data ? `Obs. input ${fmtUtc(ov.data.observed)} · forecast for ${fmtUtc(ov.data.forecast)}` : "No nowcast available"}{!live && " · hidden in historical mode (no OVATION archive)"}</p>

          <SolarActivity now={now} />
          <h2>What changed</h2>
          <ul className="changes">{changes.length ? changes.map((c, i) => <li key={i}>{c}</li>) : <li>Waiting for valid measurements.</li>}</ul>
          <details className="tip">
            <summary>Uncertainty & causality</summary>
            <p>L1 is ~1.5 million km upstream; structures may evolve or miss Earth. The lag uses a flat-delay estimate (±10–20 min typical). Shue boundary is a statistical fit, accurate to ~1 R<sub>E</sub>. Kp is a 3-hour ground index: a high value is a consequence of earlier driving, not a cause. OVATION is a model forecast, not an observation.</p>
          </details>
        </aside>

        <section ref={timelineRef} className="timeline" aria-label="Measured timeline">
          <div className="tl-controls">
            <button className="btn" onClick={() => { if (playing) setPlaying(false); else { if (selIdx === null || selIdx >= timeline.length - 2) setSelIdx(0); setPlaying(true); } }} disabled={timeline.length < 2} aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
            <button className={live ? "btn btn-live on" : "btn btn-live"} onClick={() => { setPlaying(false); setSelIdx(null); }}>● LIVE</button>
            <button className="btn" disabled={!timeline.length} onClick={exportMeasuredCsv} title="Download observed NOAA L1 measurements and separately labeled estimated Earth arrival UTC">↓ CSV</button>
            <div className="tl-stamp">{live ? (sample ? `Earth arrival of L1 obs ${fmtTime(sample.t)} UTC` : "Live") : sample ? `L1 observation ${fmtUtc(sample.t)}` : ""}</div>
          </div>
          <div className="tl-track">
            <div className="spark-wrap"><span className="spark-lab">Bz</span><Spark data={timeline} sel={selIdx} accessor={(s) => s.bz} color="var(--cyan)" zero /></div>
            <div className="spark-wrap"><span className="spark-lab">V</span><Spark data={timeline} sel={selIdx} accessor={(s) => s.v} color="var(--sun)" /></div>
            <div className="spark-wrap"><span className="spark-lab">N</span><Spark data={timeline} sel={selIdx} accessor={(s) => s.n} color="var(--aurora)" /></div>
            <div className="spark-wrap"><span className="spark-lab">P</span><Spark data={timeline} sel={selIdx} accessor={(s) => dynamicPressure(s.n, s.v)} color="var(--field)" /></div>
            <input type="range" min={0} max={Math.max(timeline.length - 1, 0)} value={selIdx ?? Math.max(timeline.length - 1, 0)} disabled={timeline.length < 2}
              aria-label="Select measured L1 sample" aria-valuetext={sample ? fmtUtc(sample.t) : "live"}
              onChange={(e) => { setPlaying(false); setSelIdx(Number(e.target.value)); }} />
            <div className="tl-axis"><span>{timeline[0] ? fmtTime(timeline[0].t) : "—"} UTC</span><span>{timeline.length} measured samples · last 4 h · NOAA RTSW 1-min</span><span>{timeline.at(-1) ? fmtTime(timeline.at(-1)!.t) : "—"}</span></div>
          </div>
        </section>
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
      {galleryOpen && <Gallery onClose={() => setGalleryOpen(false)} now={now} />}
      {timeOpen && <Suspense fallback={<div className="loading" role="status">Loading temporal evidence…</div>}><TimeAtlas onClose={() => setTimeOpen(false)} coreYear={coreYear} onYear={setCoreYear}/></Suspense>}
      {forecastOpen && <Suspense fallback={<div className="loading" role="status">Loading NOAA predictions…</div>}><ForecastCenter now={now} data={kpForecast.data} fetchedAt={kpForecast.dataUpdatedAt} loading={kpForecast.isPending} error={kpForecast.isError} ovation={ov.data?.observed != null && ov.data.forecast != null ? {observed:ov.data.observed, forecast:ov.data.forecast} : null} onClose={() => setForecastOpen(false)} onRefresh={() => { void kpForecast.refetch(); void wind.refetch(); void mag.refetch(); }} incomingSamples={all} previewedAt={activePreview?.t ?? null} onPreview={previewIncoming}/></Suspense>}
      {passportOpen && <DataPassport now={now} feeds={feedLines} timeline={timeline} sample={sample} estimatedArrival={arrival} modelR0={model.r0} missingBz={bz === null} onClose={() => setPassportOpen(false)} onRefresh={requestRefresh} />}
      {fieldOpen && <Overlay title="Inspect Earth's magnetic field" onClose={() => setFieldOpen(false)} wide><FieldExplorer core={core} target={fieldTarget} onTarget={setFieldTarget} /></Overlay>}
      {tourOpen && <Guide onClose={() => setTourOpen(false)} onView={chooseView} onField={() => { setTourOpen(false); setFieldOpen(true); }} onPhotos={() => { setTourOpen(false); setGalleryOpen(true); }} />}
      {helpOpen && (
        <Overlay title="Controls, comfort & accessibility" onClose={() => setHelpOpen(false)}>
          <p className="guide-copy">Drag the 3D view to orbit, scroll or pinch to zoom. Click the globe to inspect its IGRF-14 field at that geographic position.</p>
          <div className="guide-shortcuts">
            <p><kbd>1</kbd> Global · <kbd>2</kbd> Earth · <kbd>3</kbd> Tail · <kbd>4</kbd> SAA · <kbd>5</kbd> Arctic</p>
            <p><kbd>L</kbd> Live · <kbd>E</kbd> Earth only · <kbd>F</kbd> Focus · <kbd>G</kbd> Satellite photos · <kbd>I</kbd> Field explorer · <kbd>D</kbd> Data passport</p>
            <p><kbd>P</kbd> Future NOAA predictions · <kbd>T</kbd> 4D Time Atlas · <kbd>V</kbd> Cycle field-line detail · <kbd>?</kbd> or <kbd>H</kbd> Help · <kbd>Esc</kbd> Close overlays</p>
          </div>
          <div className="guide-actions">
            <button className="btn" role="switch" aria-checked={lowPower} onClick={() => setLowPower((v) => !v)}>{lowPower ? "✓ Low-power mode" : "Low-power mode"}</button>
            <button className="btn" role="switch" aria-checked={motionOff} onClick={() => setReducedMotion((v) => !v)}>{motionOff ? "✓ Reduce motion" : "Reduce motion"}</button>
            <button className="btn" onClick={resetPrefs}>Reset display settings</button>
          </div>
          <p className="caveat">The operating system's reduced-motion setting is always honored. Only display preferences are saved in this browser. Shared view links can override focus, Earth-only and camera settings.</p>
        </Overlay>
      )}

      {drawer && (
        <div className="drawer-bg" onClick={() => setDrawer(false)}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="Sources and methodology" onClick={(e) => e.stopPropagation()}>
            <button className="btn-ghost close" onClick={() => setDrawer(false)} autoFocus>Close</button>
            <h2>Sources & methodology</h2>
            <h3>Data (fetched in your browser every 60 s)</h3>
            <ul>
              <li><a href={URLS.mag} target="_blank" rel="noreferrer">NOAA SWPC RTSW magnetometer 1-min</a> — Bz GSM, Bt. Active spacecraft preferred. <StatusDot s={st.mag} /></li>
              <li><a href={URLS.wind} target="_blank" rel="noreferrer">NOAA SWPC RTSW plasma 1-min</a> — speed, density. <StatusDot s={st.wind} /></li>
              <li><a href={URLS.kp} target="_blank" rel="noreferrer">NOAA planetary K-index</a> <StatusDot s={st.kp} /></li>
              <li><a href={URLS.ovation} target="_blank" rel="noreferrer">NOAA OVATION aurora nowcast</a> (model) <StatusDot s={st.ov} /></li>
              <li><a href="https://kp.gfz.de/en/hp30-hp60" target="_blank" rel="noreferrer">GFZ Potsdam Hp30</a> (optional; may be blocked by browser CORS) <StatusDot s={st.hp} /></li>
              <li><a href="https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json" target="_blank" rel="noreferrer">NOAA GOES X-ray sensor, 0.1–0.8 nm long band</a> — measured flare flux, not forecast.</li>
              <li><a href="https://epic.gsfc.nasa.gov/" target="_blank" rel="noreferrer">NASA DSCOVR EPIC latest natural-color images</a> — real photographs released after processing, timestamped.</li>
              <li><a href="https://www.star.nesdis.noaa.gov/GOES/fulldisk.php?sat=G19" target="_blank" rel="noreferrer">NOAA GOES-East / GOES-19 GeoColor full disk</a> — daytime true-color / nighttime IR composite.</li>
              <li><a href="https://www.star.nesdis.noaa.gov/GOES/fulldisk.php?sat=G18" target="_blank" rel="noreferrer">NOAA GOES-West / GOES-18 GeoColor full disk</a>.</li>
            </ul>
            <h3>Model</h3>
            <p>P = n · 1.6726×10⁻⁶ · v² nPa. Shue et al. (1998): r₀ = (10.22 + 1.29 tanh(0.184(Bz + 8.14))) · P<sup>−1/6.6</sup>, α = (0.58 − 0.007 Bz)(1 + 0.024 ln P), r(θ) = r₀ (2/(1+cos θ))<sup>α</sup>. Inputs clamped (P 0.1–100 nPa, Bz ±50 nT). Propagation: flat delay 1.5×10⁶ km ÷ v; the live view uses the newest L1 sample whose estimated arrival has already happened. Missing values are dropped, never filled. Bow shock (1.32 × r₀), field lines and tail are schematic.</p>
            <p>Core field: IGRF-14 spherical harmonics (degree 13) on a spherical Earth (r = 6371.2 km; geodetic correction ignored). Dip poles = points where the field is vertical, found by numerical search; speed = great-circle distance between the pole now and one year earlier. SAA = minimum of surface total intensity on a 2° grid. These are model values, not live measurements, and change over years.</p>
            <h3>Citations</h3>
            <ul>
              <li>IAGA Working Group V-MOD, IGRF-14 (2024). <a href="https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field" target="_blank" rel="noreferrer">NOAA NCEI IGRF</a> — coefficients bundled, evaluated to degree 13 in-browser.</li>
              <li>Shue, J.-H. et al. (1998), JGR 103(A8), 17691. <a href="https://doi.org/10.1029/98JA01103" target="_blank" rel="noreferrer">doi:10.1029/98JA01103</a></li>
              <li>Shue, J.-H. et al. (1997), JGR 102(A5), 9497. <a href="https://doi.org/10.1029/97JA00196" target="_blank" rel="noreferrer">doi:10.1029/97JA00196</a></li>
              <li>Newell, P. et al. OVATION Prime — <a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noreferrer">NOAA SWPC</a></li>
              <li>Matzka, J. et al. (2021) Kp & Hpo indices, GFZ — <a href="https://doi.org/10.5880/Hpo.0002" target="_blank" rel="noreferrer">doi:10.5880/Hpo.0002</a></li>
            </ul>
            <h3>Imagery & credits</h3>
            <p>Earth day/night textures: NASA Blue Marble / Earth at Night (public domain), via the three.js examples. Data courtesy of NOAA SWPC and GFZ Potsdam. Conceptual inspiration: <a href="https://github.com/Kracht/AEGIS" target="_blank" rel="noreferrer">AEGIS</a> (MIT) and <a href="https://terra.terryelemans.nl/" target="_blank" rel="noreferrer">TERRA</a>; implemented independently, no code copied.</p>
            <p>IGRF-14 model status: definitive DGRF 1945–2020, earlier historical IGRF non-definitive; 2025 IGRF non-definitive and 2025–2030 secular variation predictive (<a href="https://doi.org/10.1186/s40623-025-02360-0" target="_blank" rel="noreferrer">IAGA IGRF-14 technical description</a>). The field inspector gives internal main field at geocentric radius, not a street-level compass calibration.</p>
            <p className="caveat">Scientific status: NOAA L1/X-ray are measured upstream/sun sensors; Shue, OVATION and IGRF are models or forecasts; the bow shock/field lines are schematic. The Earth texture is historical imagery; EPIC/GOES are dated satellite observations. Not an operational forecast. For official alerts use <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noreferrer">NOAA SWPC</a>.</p>
          </aside>
        </div>
      )}
    </div>
  );
}