import { useEffect, useState } from "react";
import { GOES, goesImageUrl, goesPageUrl, useEpic, useGoesMeta, type GoesKey } from "@/lib/space/data";
import { EPIC_API, EPIC_SITE, formatAge } from "@/lib/space/epic";
import { fmtAgo, fmtUtcS, Overlay } from "./ui";

type Tab = "epic" | GoesKey;

function EpicTab({ now }: { now: number }) {
  const q = useEpic(true);
  const list = q.data ?? [];
  const [idx, setIdx] = useState<number | null>(null);
  const [imgState, setImgState] = useState<"loading" | "ok" | "error">("loading");
  const i = idx ?? list.length - 1;
  const cur = list[i];
  useEffect(() => setImgState("loading"), [cur?.url]);

  if (q.isLoading) return <div className="ev-empty">Fetching latest EPIC catalogue from NASA…</div>;
  if (q.isError || list.length === 0)
    return (
      <div className="ev-empty">
        <p>NASA EPIC metadata is unavailable right now{q.isError ? ` (${(q.error as Error).message})` : " (no images listed)"}. No image is shown rather than an old or substitute picture.</p>
        <div className="row"><button className="btn" onClick={() => q.refetch()}>Retry</button><a className="btn" href={EPIC_SITE} target="_blank" rel="noreferrer">Open NASA EPIC ↗</a></div>
      </div>
    );
  if (!cur) return null;
  return (
    <div className="ev">
      <div className="ev-frame">
        {imgState !== "ok" && <div className="ev-ph">{imgState === "loading" ? "Loading NASA image…" : "Image file failed to load from NASA."}</div>}
        <img key={cur.url} src={cur.url} alt={`NASA EPIC natural-color full-disk photograph of Earth, acquired ${fmtUtcS(cur.t)}`} onLoad={() => setImgState("ok")} onError={() => setImgState("error")} className={imgState === "ok" ? "" : "ev-hidden"} />
        <span className="ev-badge">Actual photograph · natural color</span>
      </div>
      <div className="ev-nav">
        <button className="btn" disabled={i <= 0} onClick={() => setIdx(i - 1)} aria-label="Previous capture">← Prev</button>
        <span className="ev-count">{i + 1} / {list.length} captures in latest release</span>
        <button className="btn" disabled={i >= list.length - 1} onClick={() => setIdx(i + 1)} aria-label="Next capture">Next →</button>
      </div>
      <dl className="ev-meta">
        <dt>Acquired</dt><dd>{fmtUtcS(cur.t)}</dd>
        <dt>Age</dt><dd className={now - cur.t > 36 * 3600_000 ? "warn" : ""}>{formatAge(now - cur.t)} — EPIC is processed and released with a delay of typically 12–36 h or more; it is never a live feed.</dd>
        <dt>Sub-image point</dt><dd>{cur.lat !== null && cur.lon !== null ? `${cur.lat.toFixed(1)}°, ${cur.lon.toFixed(1)}°` : "—"}</dd>
        <dt>Instrument</dt><dd>NASA EPIC on NOAA DSCOVR, near Sun–Earth L1 (~1.5 million km). Sees the whole sunlit face, ~13 images/day.</dd>
        <dt>Source</dt><dd><a href={cur.url} target="_blank" rel="noreferrer">Full-resolution file ↗</a> · <a href={EPIC_API} target="_blank" rel="noreferrer">metadata API ↗</a></dd>
      </dl>
    </div>
  );
}

function GoesTab({ k, now }: { k: GoesKey; now: number }) {
  const g = GOES[k];
  const meta = useGoesMeta(k, true);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [bust, setBust] = useState(() => Math.floor(Date.now() / 600_000));
  const src = `${goesImageUrl(k)}?v=${bust}`;
  useEffect(() => setState("loading"), [src]);
  const lm = meta.data?.lastModified ?? null;
  return (
    <div className="ev">
      <div className="ev-frame">
        {state !== "ok" && <div className="ev-ph">{state === "loading" ? `Loading ${g.sat} GeoColor…` : `${g.sat} image could not be loaded. Use the official viewer below.`}</div>}
        <img key={src} src={src} alt={`${g.sat} ${g.label} full-disk GeoColor composite`} onLoad={() => setState("ok")} onError={() => setState("error")} className={state === "ok" ? "" : "ev-hidden"} />
        <span className="ev-badge">GeoColor composite · not a pure photo at night</span>
      </div>
      <div className="ev-nav">
        <button className="btn" onClick={() => { setBust(Date.now()); void meta.refetch(); }}>Reload latest</button>
        <a className="btn" href={goesPageUrl(k)} target="_blank" rel="noreferrer">Official NOAA STAR viewer ↗</a>
      </div>
      <dl className="ev-meta">
        <dt>Scan time</dt><dd>Printed in the image banner (UTC). This app does not guess it.</dd>
        <dt>File updated</dt><dd>{lm ? `${fmtUtcS(lm)} (${fmtAgo(now - lm)}, NOAA server Last-Modified)` : meta.isError ? "unavailable" : "checking…"}</dd>
        <dt>Instrument</dt><dd>{g.sat} ({g.label}) ABI, geostationary at {g.lon}, ~35,786 km altitude. Fixed hemisphere view, full disk every ~10 min.</dd>
        <dt>Product</dt><dd>CIRA/NOAA GeoColor: true color by day; by night a multispectral infrared blend with a static city-lights layer.</dd>
      </dl>
    </div>
  );
}

export default function Gallery({ onClose, now, initial = "epic" }: { onClose: () => void; now: number; initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <Overlay title="Eyes on Earth · satellite evidence" onClose={onClose} wide>
      <p className="ev-intro">Real, dated imagery from NASA and NOAA. The 3D globe uses a fixed NASA Blue Marble texture; these are the actual recent views.</p>
      <div className="seg ev-tabs" role="tablist" aria-label="Satellite">
        <button role="tab" aria-selected={tab === "epic"} aria-pressed={tab === "epic"} onClick={() => setTab("epic")}>DSCOVR EPIC · L1</button>
        <button role="tab" aria-selected={tab === "east"} aria-pressed={tab === "east"} onClick={() => setTab("east")}>GOES-East · G19</button>
        <button role="tab" aria-selected={tab === "west"} aria-pressed={tab === "west"} onClick={() => setTab("west")}>GOES-West · G18</button>
      </div>
      {tab === "epic" ? <EpicTab now={now} /> : <GoesTab key={tab} k={tab} now={now} />}
      <p className="caveat">EPIC: whole sunlit Earth from 1.5 million km, delayed hours to days. GOES: one fixed hemisphere from geostationary orbit, near-real-time. Credits: NASA EPIC team / NOAA DSCOVR; NOAA NESDIS STAR, CIRA GeoColor.</p>
    </Overlay>
  );
}