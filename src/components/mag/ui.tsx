import type { Freshness } from "@/lib/space/model";

export const fmtUtc = (t: number | null | undefined) => (t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");
export const fmtUtcS = (t: number | null | undefined) => (t ? new Date(t).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—");
export const fmtTime = (t: number) => new Date(t).toISOString().slice(11, 16);
export const fmtAgo = (ms: number) => (ms < 90_000 ? `${Math.round(ms / 1000)} s ago` : ms < 5400_000 ? `${Math.round(ms / 60000)} min ago` : ms < 172800_000 ? `${(ms / 3600_000).toFixed(1)} h ago` : `${(ms / 86400_000).toFixed(1)} days ago`);

export function StatusDot({ s }: { s: Freshness }) {
  return <span className={`status status-${s}`}>{s}</span>;
}

export function Metric({ label, value, unit, src, note }: { label: string; value: string | null; unit?: string | undefined; src: string; note?: string | undefined }) {
  return (
    <div className="metric">
      <div className="metric-head"><span>{label}</span><span className="prov">{src}</span></div>
      <div className="metric-val">{value ?? <span className="na">no valid data</span>}{value && unit && <small>{unit}</small>}</div>
      {note && <div className="metric-note">{note}</div>}
    </div>
  );
}

export function Overlay({ title, onClose, children, side = "right", wide = false }: { title: string; onClose: () => void; children: React.ReactNode; side?: "right" | "center"; wide?: boolean }) {
  return (
    <div className={`drawer-bg ${side === "center" ? "drawer-center" : ""}`} onClick={onClose}>
      <aside className={`drawer ${wide ? "drawer-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button className="btn-ghost close" onClick={onClose} autoFocus>Close · Esc</button>
        <h2>{title}</h2>
        {children}
      </aside>
    </div>
  );
}