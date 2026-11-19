import { useCmeArchive, useEnlil } from "@/lib/space/data";
import {
  ARCHIVE_TREE, CCMC_SCOREBOARD_PAGE, cmeState, ensemble, memberErrors, members, type CmeEvent,
} from "@/lib/space/ccmc";
import { cmeWindows } from "@/lib/space/enlil";
import { fmtAgo, fmtUtc, useNarrow } from "./ui";

const H = 3_600_000;
const dh = (t: number) => new Date(t).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) + " UTC";
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2; };
const signedH = (h: number) => (h >= 0 ? "+" : "−") + Math.abs(h).toFixed(1) + " h";

/** One CME's ensemble on a time strip: each method's call with its stated error bar, the median, now, and NOAA Enlil's tracer window. */
function Strip({ e, now, enlilWins }: { e: CmeEvent; now: number; enlilWins: { start: number; end: number }[] }) {
  const narrow = useNarrow();
  const ens = ensemble(e)!;
  const m = members(e);
  const t0 = Math.min(now, ens.envelopeStart) - 6 * H, t1 = Math.max(now, ens.envelopeEnd) + 6 * H;
  // Method names sit in a left gutter so they never collide with error bars.
  const W = narrow ? 360 : 1000, G = narrow ? 118 : 250, row = narrow ? 20 : 18, top = 24, h = top + m.length * row + 26;
  const x = (t: number) => G + ((t - t0) / (t1 - t0)) * (W - G - 8);
  const clip = (s: string) => (narrow && s.length > 17 ? s.slice(0, 16) + "…" : s);
  const overlap = enlilWins.filter(w => w.end >= t0 && w.start <= t1);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="cme-strip" role="img"
      aria-label={`${ens.n} independent arrival predictions from ${dh(ens.earliest)} to ${dh(ens.latest)}, median ${dh(ens.median)}.`}>
      {overlap.map(w => {
        const a = Math.max(G, x(w.start)), z = Math.min(W - 8, x(w.end));
        return <g key={w.start}>
          <rect x={a} y={0} width={Math.max(2, z - a)} height={h - 22} className="enlil-cme" />
          <text x={z - 3} y={11} className="enlil-cme-label" textAnchor="end">{narrow ? "Enlil" : "NOAA Enlil tracer"}</text>
        </g>;
      })}
      <line x1={x(ens.median)} x2={x(ens.median)} y1={top - 6} y2={h - 22} className="cme-median" />
      <text x={x(ens.median) + 3} y={top - 10} className="cme-median-label">median</text>
      {m.map((p, i) => {
        const y = top + i * row + row / 2;
        return <g key={p.method}>
          <line x1={0} x2={W} y1={y + row / 2} y2={y + row / 2} className="cme-row" />
          <text x={G - 10} y={y + 3.5} className="cme-method" textAnchor="end">{clip(p.method)}<title>{p.method}</title></text>
          <line x1={x(p.arrivalAt - (p.minusH ?? 0) * H)} x2={x(p.arrivalAt + (p.plusH ?? 0) * H)} y1={y} y2={y} className="cme-err" />
          <circle cx={x(p.arrivalAt)} cy={y} r={4} className="cme-dot"><title>{p.method}: {dh(p.arrivalAt)} (−{p.minusH ?? "?"} / +{p.plusH ?? "?"} h){p.kpLo !== null ? ` · Kp ${p.kpLo}–${p.kpHi}` : ""}</title></circle>
        </g>;
      })}
      {e.arrivalAt !== null && <><line x1={x(e.arrivalAt)} x2={x(e.arrivalAt)} y1={0} y2={h - 22} className="cme-observed" /><text x={x(e.arrivalAt) + 3} y={h - 26} className="cme-observed-label">observed shock</text></>}
      {now >= t0 && now <= t1 && <><line x1={x(now)} x2={x(now)} y1={0} y2={h - 22} className="enlil-now" /><text x={x(now) + 3} y={h - 26} className="enlil-now-label">now</text></>}
      <line x1={G} x2={W - 8} y1={h - 22} y2={h - 22} className="enlil-axis" />
      <text x={G} y={h - 6} className="enlil-tick">{narrow ? dh(t0).replace(/, \d\d:\d\d UTC$/, "") : dh(t0)}</text>
      <text x={W - 8} y={h - 6} className="enlil-tick" textAnchor="end">{narrow ? dh(t1).replace(/, \d\d:\d\d UTC$/, "") : dh(t1)}</text>
    </svg>
  );
}

export default function CmeEnsemble({ now }: { now: number }) {
  const q = useCmeArchive();
  const enlil = useEnlil();
  const enlilWins = enlil.data ? cmeWindows(enlil.data.points) : [];
  const events = q.data?.events ?? [];
  const watching = events.filter(e => ensemble(e) && ["incoming", "overdue"].includes(cmeState(e, now)))
    .sort((a, b) => ensemble(a)!.median - ensemble(b)!.median);
  const arrived = events.filter(e => e.arrivalAt !== null && members(e).length > 0).slice(0, 8);
  const medErrs = arrived.map(e => (ensemble(e)!.median - e.arrivalAt!) / H);
  const age = q.data ? now - q.data.fetchedAt : 0;

  return (
    <section className="ops-section" aria-label="CME arrival ensemble from NASA CCMC">
      <h3>CME arrival ensemble · every method, not one guess</h3>
      <p className="forecast-explain">NASA CCMC's <strong>CME Scoreboard</strong> collects arrival-time predictions from independent methods: WSA–Enlil runs at NOAA, NASA and the UK Met Office, drag-based and machine-learning models, and human forecasters. The <strong>spread between them is the real uncertainty</strong>, so we show every call with its own error bar. For past CMEs, each method is scored against the shock actually observed at L1.</p>
      <p className="forecast-source-line">
        {q.data ? <>Archived from CCMC {fmtUtc(q.data.fetchedAt)} ({fmtAgo(Math.max(0, age))}){age > 3 * H ? <b className="warn"> · archive is stale</b> : ""} · </> : null}
        <a href={CCMC_SCOREBOARD_PAGE} target="_blank" rel="noreferrer">CCMC CME Scoreboard ↗</a> · <a href={ARCHIVE_TREE} target="_blank" rel="noreferrer">our hourly archive ↗</a>
      </p>
      {q.isError ? <p className="forecast-empty">The CME ensemble archive could not be loaded or validated. This says nothing about whether a CME is coming; check CCMC directly.</p>
        : q.isPending ? <p className="forecast-empty">Loading the CME arrival ensemble…</p>
        : q.data === null ? <p className="forecast-empty">The hourly archive that brings CCMC predictions to this site hasn't run yet. It starts with the first scheduled run after this release is deployed; until then, use the CCMC link above.</p>
        : <>
          {watching.length === 0
            ? <p className="ops-clear">No CME in CCMC's Scoreboard is currently awaiting arrival at Earth (as of {fmtUtc(q.data.fetchedAt)}).</p>
            : watching.map(e => {
              const ens = ensemble(e)!; const st = cmeState(e, now);
              return <article key={e.id} className={"cme-card cme-" + st}>
                <div className="ops-card-head">
                  <span className="ops-kind">{st === "overdue" ? "Overdue · awaiting analysis" : "Incoming"}</span>
                  <span className="ops-code">CME {dh(e.observedAt)}</span>
                </div>
                <strong className="ops-title">{st === "overdue" ? "All predicted windows have passed; no arrival recorded yet" : `Median arrival ${dh(ens.median)}`}</strong>
                <p className="ops-times">{ens.n} independent method{ens.n > 1 ? "s" : ""} · calls span <b>{dh(ens.earliest)} → {dh(ens.latest)}</b> ({((ens.latest - ens.earliest) / H).toFixed(0)} h) · with error bars {dh(ens.envelopeStart)} → {dh(ens.envelopeEnd)}{ens.kpLo !== null ? ` · predicted max Kp ${ens.kpLo}–${ens.kpHi}` : ""}{ens.meanConfidence !== null ? ` · mean stated confidence ${Math.round(ens.meanConfidence)}%` : ""}</p>
                <Strip e={e} now={now} enlilWins={enlilWins} />
              </article>;
            })}
          <h4 className="ops-sub">Track record · recent arrivals <span className="prov">predicted − observed</span></h4>
          {arrived.length === 0 ? <p className="ops-clear muted">No scored arrivals in the archived window yet.</p> : <>
            <p className="forecast-explain">Across {arrived.length === 1 ? "this CME" : `these ${arrived.length} CMEs`}, the ensemble median missed by a median of <strong>{median(medErrs.map(Math.abs)).toFixed(1)} h</strong>{medErrs.length >= 3 ? ` (median bias ${signedH(median(medErrs))})` : ""}. A small sample; it is shown so you can judge the incoming calls above.</p>
            <div className="forecast-prob-scroll"><table className="forecast-prob-table cme-table">
              <thead><tr><th>CME</th><th>Shock observed</th><th>Methods</th><th>Ensemble median</th><th>Closest method</th></tr></thead>
              <tbody>{arrived.map(e => {
                const errs = memberErrors(e).sort((a, b) => Math.abs(a.errorH) - Math.abs(b.errorH));
                const med = (ensemble(e)!.median - e.arrivalAt!) / H;
                return <tr key={e.id}>
                  <th>{dh(e.observedAt)}</th><td>{dh(e.arrivalAt!)}</td><td>{errs.length}</td>
                  <td>{signedH(med)}</td><td>{errs[0] ? `${errs[0].method} (${signedH(errs[0].errorH)})` : "—"}</td>
                </tr>;
              })}</tbody>
            </table></div>
          </>}
        </>}
      <p className="caveat">Predictions are as submitted to CCMC (latest submission per method; CCMC's own average/median entries are excluded from the member list). Arrival means the shock at L1, about an hour before Earth. Observed arrival times are entered by CCMC analysts and can lag the event. Kp ranges are each method's own estimate, not a NOAA forecast.</p>
    </section>
  );
}
