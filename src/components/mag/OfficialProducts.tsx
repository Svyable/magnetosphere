import { useSwpcAlerts, useThreeDayForecast } from "@/lib/space/data";
import { OPS_URLS, opsStatus, THREE_DAY_MAX_AGE_MS, type SwpcMessage } from "@/lib/space/ops";
import { issuanceStatus } from "@/lib/space/forecast";
import { fmtAgo, fmtUtc } from "./ui";

const dayFmt = (t: number) => new Date(t).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const until = (now: number, t: number) => {
  const ms = t - now;
  return ms < 90 * 60_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${(ms / 3_600_000).toFixed(1)} h`;
};

function MessageCard({ m, now, tone }: { m: SwpcMessage; now: number; tone: "warning" | "watch" | "alert" }) {
  const today = Math.floor(now / 86_400_000) * 86_400_000;
  return (
    <li className={"ops-card ops-" + tone}>
      <div className="ops-card-head">
        <span className="ops-kind">{m.headline.split(":")[0]}</span>
        {m.scale && <span className={"ops-scale ops-scale-" + m.scale[0]}>{m.scale}</span>}
        <span className="ops-code">{m.code} #{m.serial ?? "?"}</span>
      </div>
      <strong className="ops-title">{m.title}</strong>
      <p className="ops-times">
        {tone === "warning" && m.validTo && <>Valid {m.validFrom ? fmtUtc(m.validFrom) : ""} → <b>{fmtUtc(m.validTo)}</b> · ends in {until(now, m.validTo)} · </>}
        {tone === "alert" && (m.thresholdAt || m.beginAt) && <>{m.thresholdAt ? "Threshold reached " : "Began "}<b>{fmtUtc(m.thresholdAt ?? m.beginAt)}</b> · </>}
        Issued {fmtUtc(m.issuedAt)}
      </p>
      {tone === "watch" && m.watchDays.length > 0 && (
        <div className="ops-days" role="list" aria-label="Highest storm level predicted by day">
          {m.watchDays.map(d => (
            <span role="listitem" key={d.t} className={(d.level ? "on" : "") + (d.t < today ? " past" : "")}>
              {dayFmt(d.t)} <b>{d.level ?? "Below G1"}</b>
            </span>
          ))}
        </div>
      )}
      <details className="ops-text"><summary>Full NOAA message</summary><pre>{m.text}</pre></details>
    </li>
  );
}

/** What NOAA has actually issued. Never inferred from predicted Kp. */
export function IssuedProducts({ now }: { now: number }) {
  const q = useSwpcAlerts();
  const s = q.data ? opsStatus(q.data, now) : null;
  const newest = q.data?.[0]?.issuedAt ?? null;
  const inEffect = s ? s.warnings.length + s.watches.length : 0;
  return (
    <section className="ops-section" aria-label="NOAA-issued alerts, watches and warnings">
      <h3>Issued by NOAA SWPC · watches, warnings & alerts</h3>
      <p className="forecast-source-line">
        Alerts product fetched {q.dataUpdatedAt ? fmtUtc(q.dataUpdatedAt) : "—"}
        {newest ? ` · newest message issued ${fmtUtc(newest)} (${fmtAgo(Math.max(0, now - newest))})` : ""}
        {" · "}<a href={OPS_URLS.alertsPage} target="_blank" rel="noreferrer">NOAA official list ↗</a>
      </p>
      {q.isError ? (
        <p className="forecast-empty ops-unavailable">NOAA's alerts product could not be loaded or parsed. <b>This is not an all-clear</b> — check NOAA directly.</p>
      ) : q.isPending || !s ? (
        <p className="forecast-empty">Loading NOAA-issued products…</p>
      ) : (
        <>
          {inEffect === 0 ? (
            <p className="ops-clear">No NOAA geomagnetic watch or warning is in effect at {fmtUtc(now)}, according to the alerts product fetched {fmtAgo(Math.max(0, now - q.dataUpdatedAt))}.</p>
          ) : (
            <ul className="ops-list">
              {s.warnings.map(m => <MessageCard key={m.code + m.serial} m={m} now={now} tone="warning" />)}
              {s.watches.map(m => <MessageCard key={m.code + m.serial} m={m} now={now} tone="watch" />)}
            </ul>
          )}
          <h4 className="ops-sub">Thresholds reached · last 24 h <span className="prov">observed events</span></h4>
          {s.recentAlerts.length ? (
            <ul className="ops-list">{s.recentAlerts.map(m => <MessageCard key={m.code + m.serial} m={m} now={now} tone="alert" />)}</ul>
          ) : <p className="ops-clear muted">No NOAA alerts issued in the last 24 hours.</p>}
        </>
      )}
      <p className="caveat">Warnings and watches are NOAA forecaster products with their own validity windows; extended messages replace the ones they extend and cancellations remove them. The Kp bars below are predictions — a predicted Kp ≥ 5 is <em>not</em> a watch until NOAA issues one.</p>
    </section>
  );
}

/** S (radiation) and R (radio blackout) scales from NOAA's dated 3-day forecast. */
export function SolarRadioOdds({ now }: { now: number }) {
  const q = useThreeDayForecast(true);
  const state = issuanceStatus(q.data?.issuedAt ?? null, now, THREE_DAY_MAX_AGE_MS);
  return (
    <section className="ops-section" aria-label="NOAA solar radiation storm and radio blackout probabilities">
      <h3>Solar radiation (S) & radio blackouts (R) · next three days</h3>
      <p className="forecast-explain">Separate NOAA scales from geomagnetic storms (G). Radio blackouts follow X-ray flares; radiation storms follow energetic protons. These probabilities come straight from NOAA's bulletin and are <strong>not</strong> derived from Kp.</p>
      <p className="forecast-source-line">
        Bulletin issued {fmtUtc(q.data?.issuedAt)} · fetched {q.dataUpdatedAt ? fmtUtc(q.dataUpdatedAt) : "—"} ·{" "}
        <span className={state === "stale" ? "warn" : undefined}>{state === "current" ? "current issue (NOAA updates ~00:30 and ~12:30 UTC)" : state === "stale" ? "STALE ISSUE — newer NOAA bulletin expected" : "awaiting bulletin"}</span>
        {" · "}<a href={OPS_URLS.threeDay} target="_blank" rel="noreferrer">source bulletin ↗</a>
      </p>
      {q.isError ? <p className="forecast-empty">NOAA's 3-day forecast could not be loaded or parsed; no probabilities are shown.</p>
        : q.isPending ? <p className="forecast-empty">Loading NOAA's 3-day forecast…</p>
        : (
          <div className="forecast-prob-scroll"><table className="forecast-prob-table">
            <thead><tr><th>NOAA scale</th>{q.data.days.map(d => <th key={d.t}>{dayFmt(d.t)}</th>)}</tr></thead>
            <tbody>
              <tr><th>S1+ radiation storm</th>{q.data.days.map(d => <td key={d.t}>{d.s1}%</td>)}</tr>
              <tr><th>R1–R2 radio blackout</th>{q.data.days.map(d => <td key={d.t}>{d.r12}%</td>)}</tr>
              <tr><th>R3+ radio blackout</th>{q.data.days.map(d => <td key={d.t}>{d.r3}%</td>)}</tr>
            </tbody>
          </table></div>
        )}
      {q.data && (q.data.sRationale || q.data.rRationale) && (
        <ul className="ops-rationale">
          {q.data.sRationale && <li><b>S · NOAA rationale:</b> {q.data.sRationale}</li>}
          {q.data.rRationale && <li><b>R · NOAA rationale:</b> {q.data.rRationale}</li>}
        </ul>
      )}
    </section>
  );
}
