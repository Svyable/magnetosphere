import { assessHealth, coverage4h } from "@/lib/space/health";
import type { L1Sample } from "@/lib/space/model";
import { Overlay, fmtUtcS } from "./ui";

export interface ProvenanceFeed {
  id: string;
  title: string;
  producer: string;
  role: "measurement" | "index" | "forecast";
  url: string;
  observedAt: number | null;
  browserUpdatedAt: number | null;
  thresholdMinutes: number;
  count: number;
  failed: boolean;
  note: string;
}
interface Props {
  now: number;
  feeds: ProvenanceFeed[];
  timeline: L1Sample[];
  sample: L1Sample | null;
  estimatedArrival: number | null;
  modelR0: number;
  missingBz: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

function ageText(age: number | null) {
  if (age === null) return "No timestamp";
  if (age < -1) return "Future time · check clocks";
  if (age < 0) return "Clock offset < 1 min";
  return age >= 120 ? (age / 60).toFixed(1) + " hours old" : age.toFixed(1) + " minutes old";
}

/** A data lineage view of source timestamps and modeling assumptions, not an uptime dashboard. */
export default function DataPassport({ now, feeds, timeline, sample, estimatedArrival, modelR0, missingBz, onClose, onRefresh }: Props) {
  const coverage = coverage4h(timeline, now);
  const healthy = feeds.filter((f) => assessHealth({ now, observedAt: f.observedAt, maxAgeMs: f.thresholdMinutes * 60_000, failed: f.failed }).state === "current").length;
  return (
    <Overlay title="Data passport · what is actually live?" onClose={onClose} wide>
      <p className="ev-intro">A feed refreshing successfully is not proof that its underlying <strong>observation</strong> is recent. Each source has its own clock, sampling interval, and scientific meaning. All timestamps below are UTC.</p>
      <div className="passport-hero">
        <div><span className="passport-k">Sources inside recency window</span><strong>{healthy} / {feeds.length}</strong><small>Source-specific windows, not a universal availability score</small></div>
        <div><span className="passport-k">NOAA L1 minutes in last 4 h</span><strong>{coverage.observedMinutes} / {coverage.possibleMinutes}</strong><small>{coverage.percentage}% of minute buckets · {coverage.samples} joined wind records</small></div>
        <div><span className="passport-k">Bz matched to joined wind</span><strong>{coverage.bzMatchedPercentage}%</strong><small>{coverage.bzMatched} records with matched GSM Bz</small></div>
      </div>
      <button className="btn passport-refresh" onClick={onRefresh}>↻ Request fresh source data</button>
      <div className="passport-table-wrap">
        <table className="passport-table">
          <thead><tr><th>Data product</th><th>Last product time (UTC)</th><th>Data age / state</th><th>Browser fetched</th></tr></thead>
          <tbody>{feeds.map((f) => {
            const a = assessHealth({ now, observedAt: f.observedAt, maxAgeMs: f.thresholdMinutes * 60_000, failed: f.failed });
            return (
              <tr key={f.id}>
                <td><a href={f.url} target="_blank" rel="noreferrer">{f.title} ↗</a><div className="passport-sub">{f.producer} · {f.role} · {f.count} records</div><div className="passport-sub">{f.note}</div></td>
                <td>{fmtUtcS(f.observedAt)}</td>
                <td><span className={"passport-state passport-" + a.state}>{a.state}</span><div className="passport-sub">{ageText(a.ageMinutes)} · window ≤{f.thresholdMinutes} min</div></td>
                <td>{fmtUtcS(f.browserUpdatedAt)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <h3>How these measurements become the picture</h3>
      <div className="passport-chain">
        <div><span>1. MEASURED</span><p>NOAA spacecraft near L1</p><strong>{sample ? fmtUtcS(sample.t) : "No suitable input"}</strong><small>Speed and density; GSM Bz {sample && !missingBz ? "paired" : "unavailable / unmatched"}</small></div>
        <div><span>2. ESTIMATED</span><p>Solar-wind travel to Earth</p><strong>{fmtUtcS(estimatedArrival)}</strong><small>1.5 million km / measured speed; timing uncertain</small></div>
        <div><span>3. EMPIRICAL</span><p>Shue magnetopause fit</p><strong>{sample ? modelR0.toFixed(2) + " Earth radii" : "Illustrative baseline"}</strong><small>{missingBz && sample ? "Bz missing: 0 nT assumed only inside model" : "Wind pressure + upstream GSM Bz"}</small></div>
      </div>
      <p className="caveat">Bow shock, magnetotail, and many 3D field lines are schematic, not direct global observations. NOAA OVATION is an aurora <strong>forecast</strong>; IGRF-14 is a long-term internal field <strong>model</strong>. The Earth globe uses historical NASA textures. NASA EPIC and GOES full-disk products are separate, dated images in the Eyes on Earth gallery and only fetched when that gallery is opened.</p>
      <p className="caveat">The 4-hour window is a comparison against nominal one-minute buckets, not an instrument-uptime certification. NOAA or GFZ can revise a dataset after it is delivered. This is an educational/research tool, not a source of operational space-weather alerts.</p>
    </Overlay>
  );
}
