import { useEffect, useMemo, useState } from "react";
import { explore, validateTarget, type Target } from "@/lib/space/explorer";
import type { CoreField } from "./Scene";

const fmt = (v: number, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const sgn = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v), d)}`;

export default function FieldExplorer({ core, target, onTarget }: { core: CoreField | null; target: Target | null; onTarget: (t: Target | null) => void }) {
  const [lat, setLat] = useState(target ? String(target.lat) : "");
  const [lon, setLon] = useState(target ? String(target.lon) : "");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (target) { setLat(target.lat.toFixed(2)); setLon(target.lon.toFixed(2)); } }, [target]);
  const res = useMemo(() => (target && core ? explore(target, core.year, core.grid) : null), [target, core]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateTarget(lat, lon);
    if (!v.ok) { setErr(v.error); return; }
    setErr(null); onTarget(v.target);
  };
  const go = (t: Target) => { setErr(null); onTarget(t); };

  return (
    <section aria-label="Surface magnetic field explorer">
      <h2>Field explorer <span className="prov">IGRF-14 model</span></h2>
      <form className="fx-form" onSubmit={submit}>
        <label>Lat °<input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} aria-label="Latitude, −90 to 90" placeholder="−90…90" /></label>
        <label>Lon °<input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} aria-label="Longitude, −180 to 180" placeholder="−180…180" /></label>
        <button className="btn" type="submit">Inspect</button>
      </form>
      {err && <p className="na" role="alert">{err}</p>}
      <div className="fx-quick">
        {core && <button className="chip" onClick={() => go(core.grid.min)}>SAA minimum</button>}
        {core && <button className="chip" onClick={() => go(core.north.now)}>N dip pole</button>}
        {core && <button className="chip" onClick={() => go(core.south.now)}>S dip pole</button>}
        {target && <button className="chip" onClick={() => onTarget(null)}>Clear</button>}
      </div>
      <p className="metric-note">Tip: click the globe to pick a point.</p>
      {res && target && (
        <>
          <table className="fx-table">
            <tbody>
              <tr><th>Total F</th><td>{fmt(res.F)} nT</td><td>{sgn(res.dF, 0)} nT/yr</td></tr>
              <tr><th>Horizontal H</th><td>{fmt(res.H)} nT</td><td /></tr>
              <tr><th>Declination D</th><td>{fmt(Math.abs(res.D), 2)}° {res.D >= 0 ? "E" : "W"}</td><td>{sgn(res.dD * 60, 1)}′/yr</td></tr>
              <tr><th>Inclination I</th><td>{sgn(res.I, 2)}°</td><td>{sgn(res.dI * 60, 1)}′/yr</td></tr>
              <tr><th>X · Y · Z</th><td colSpan={2}>{fmt(res.X)} · {fmt(res.Y)} · {fmt(res.Z)} nT</td></tr>
            </tbody>
          </table>
          <p className="metric-note">
            {res.insideWeak ? "Inside the weak-field (< 32,000 nT) region. " : ""}
            {res.saaKm !== null ? `${fmt(res.saaKm)} km from the modeled SAA minimum. ` : ""}
            Epoch {res.year.toFixed(2)} ({res.epoch === "predicted" ? "predicted secular variation 2025→2030" : res.epoch === "clamped" ? "clamped to model range" : "definitive/IGRF"}). Change vs. one year earlier.
          </p>
          <p className="caveat">IGRF-14 internal core field at geocentric r = 6371.2 km on a spherical Earth: no crustal, ionospheric or magnetospheric contributions; not a live magnetometer. A weak surface field is associated with more trapped-particle exposure in low orbit, but radiation dose depends on altitude, shielding and activity.</p>
        </>
      )}
    </section>
  );
}