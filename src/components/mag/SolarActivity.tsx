import { useXray } from "@/lib/space/data";
import { freshness } from "@/lib/space/model";
import { flareClass, peak, XRAY_URL } from "@/lib/space/xray";
import { fmtUtc, Metric, StatusDot } from "./ui";

export default function SolarActivity({ now }: { now: number }) {
  const q = useXray();
  const long = q.data?.long ?? [], short = q.data?.short ?? [];
  const L = long.at(-1) ?? null, S = short.at(-1) ?? null;
  const pk = peak(long, now - 24 * 3600_000);
  const st = freshness(L?.t ?? null, now, 10 * 60_000, q.isError && !long.length);
  const pts = long.slice(-360);
  let d = "";
  if (pts.length > 1) {
    const t0 = pts[0]!.t, t1 = pts.at(-1)!.t;
    pts.forEach((p, i) => {
      const x = ((p.t - t0) / Math.max(t1 - t0, 1)) * 1000;
      const y = 40 - ((Math.log10(p.flux) + 9) / 6) * 40; // 1e-9 .. 1e-3
      d += `${i ? "L" : "M"}${x.toFixed(1)},${Math.min(40, Math.max(0, y)).toFixed(1)}`;
    });
  }
  return (
    <section aria-label="Solar activity">
      <h2>Solar X-rays <span className="prov">GOES measured</span> <StatusDot s={st} /></h2>
      <p className="sub">{L ? `Sample ${fmtUtc(L.t)} · GOES-${L.satellite ?? "?"} primary · 1-min` : q.isError ? "NOAA X-ray feed unavailable" : "Loading…"}</p>
      <div className="metrics">
        <Metric label="Class now" value={L ? flareClass(L.flux) : null} src="0.1–0.8 nm" note={L ? `${L.flux.toExponential(2)} W/m²` : undefined} />
        <Metric label="Short band" value={S ? S.flux.toExponential(2) : null} unit="W/m²" src="0.05–0.4 nm" />
        <Metric label="24 h peak" value={pk ? flareClass(pk.flux) : null} src="0.1–0.8 nm" note={pk ? fmtUtc(pk.t) : undefined} />
      </div>
      {d && (
        <svg viewBox="0 0 1000 40" preserveAspectRatio="none" className="spark xray-spark" role="img" aria-label="Long-band X-ray flux, last 6 hours, log scale">
          {[1, 2, 3, 4].map((k) => <line key={k} x1="0" x2="1000" y1={40 - ((k + 1) / 6) * 40} y2={40 - ((k + 1) / 6) * 40} className="spark-zero" />)}
          <path d={d} fill="none" stroke="var(--sun)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <p className="metric-note">Grid lines: A, B, C, M class thresholds (log). Class is a measurement label, not a forecast. <a href="https://www.swpc.noaa.gov/products/alerts-watches-and-warnings" target="_blank" rel="noreferrer">Official NOAA alerts ↗</a> · <a href={XRAY_URL} target="_blank" rel="noreferrer">data ↗</a></p>
    </section>
  );
}