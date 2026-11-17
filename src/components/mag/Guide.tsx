import { useState } from "react";
import type { Preset } from "./Scene";
import { Overlay } from "./ui";

type Step = { title: string; text: string; view: Preset; kind: "view" | "field" | "photos" };
const STEPS: Step[] = [
  { title: "Upstream solar wind", text: "The L1 monitors measure incoming plasma and magnetic field. The Earth-view boundary uses an approximate speed-dependent travel-time estimate; it is not a measured photograph.", view: "global", kind: "view" },
  { title: "Bow shock & magnetopause", text: "The bow shock is a schematic outer shell. The translucent inner shell is a Shue empirical fit driven by wind pressure and Bz. Neither is a global spacecraft scan.", view: "global", kind: "view" },
  { title: "Aurora prediction", text: "Green and pink polar dots come from NOAA OVATION's short-term forecast, not an optical camera. They vanish during historical wind replay because we do not have a matching archived forecast.", view: "earth", kind: "view" },
  { title: "South Atlantic Anomaly", text: "IGRF-14 models a weak patch of Earth's internal magnetic field over South America and the South Atlantic. The surface field is not a satellite radiation dose map.", view: "saa", kind: "field" },
  { title: "The migrating dip poles", text: "The modeled dip poles move differently. Our path and speeds are derived from IGRF-14 model coefficients; the 2025–2030 portion uses forecast secular variation.", view: "arctic", kind: "field" },
  { title: "Actual pictures of Earth", text: "Compare the fixed geographic globe texture with dated NASA EPIC photographs and NOAA GOES GeoColor satellite composites. Their true acquisition age is shown.", view: "earth", kind: "photos" },
];

export default function Guide({ onClose, onView, onField, onPhotos }: { onClose: () => void; onView: (p: Preset) => void; onField: () => void; onPhotos: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index]!;
  const visit = (s: Step) => { onView(s.view); if (s.kind === "field") onField(); if (s.kind === "photos") onPhotos(); };
  return (
    <Overlay title="Explore the magnetosphere · guided tour" onClose={onClose}>
      <div className="guide-count">STOP {index + 1} / {STEPS.length}</div>
      <h3 className="guide-title">{step.title}</h3>
      <p className="guide-copy">{step.text}</p>
      <div className="guide-actions">
        <button className="btn" onClick={() => visit(step)}>Explore this layer</button>
        <button className="btn" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>← Previous</button>
        {index < STEPS.length - 1 ? <button className="btn" onClick={() => setIndex((i) => i + 1)}>Next →</button> : <button className="btn" onClick={onClose}>Finish</button>}
      </div>
      <p className="caveat">No autoplay or inferred measurements. You control the view and can close this tour at any time.</p>
    </Overlay>
  );
}
