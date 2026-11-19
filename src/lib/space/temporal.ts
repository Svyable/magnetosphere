/**
 * Civilisation's geomagnetic time atlas.
 * 1900–2030: IAGA IGRF-14 global internal field model (every 5 years; 2025–2030 forecast).
 * 0–500 Ma: selected published palaeomagnetic intervals; NOT a continuous global-field history.
 * A sample of rock remanence is not a sampled point in a global time series.
 */
import { coeffsAt, IGRF_FIRST, IGRF_LAST, IGRF_SV_END } from "./igrf";

// Gauss dipole coefficient B1 [nT] to geocentric dipole moment [10^21 A m²].
// Dipole equatorial field B = μ0 M / (4π a³); a = 6371.2 km, μ0/(4π) = 1e-7.
const ZAM2_PER_NT = Math.pow(6_371_200, 3) * 1e-23;

export type IgrfEvidence = "historical-model" | "definitive" | "non-definitive" | "forecast";
export interface DipoleEpoch {
  year: number;
  momentZAm2: number;
  strengthNT: number;
  g10: number; g11: number; h11: number;
  evidence: IgrfEvidence;
}
export function igrfEvidence(year: number): IgrfEvidence {
  if (year < IGRF_FIRST || year > IGRF_SV_END) throw new RangeError("outside IGRF-14 year range");
  return year < 1945 ? "historical-model" : year <= 2020 ? "definitive" : year <= IGRF_LAST ? "non-definitive" : "forecast";
}
export function dipoleAt(year: number): DipoleEpoch {
  if (!Number.isFinite(year) || year < IGRF_FIRST || year > IGRF_SV_END) throw new RangeError("outside 1900–2030 IGRF-14");
  const c = coeffsAt(year);
  const g10 = c.g[1]![0]!, g11 = c.g[1]![1]!, h11 = c.h[1]![1]!;
  const strengthNT = Math.hypot(g10, g11, h11);
  return { year, momentZAm2: strengthNT * ZAM2_PER_NT, strengthNT, g10, g11, h11, evidence: igrfEvidence(year) };
}
export function dipoleSeries(): DipoleEpoch[] {
  return Array.from({ length: (IGRF_SV_END - IGRF_FIRST) / 5 + 1 }, (_, i) => dipoleAt(IGRF_FIRST + i * 5));
}
export interface DipoleChange {
  start: number; end: number;
  /** Absolute vector change of the three degree-one Gauss coefficients, averaged over 5 model years. */
  vectorNTPeryear: number;
  /** Signed change in moment, percent per year over same interval. */
  percentPerYear: number;
  predicted: boolean;
}
export function dipoleChanges(samples = dipoleSeries()): DipoleChange[] {
  const results: DipoleChange[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!, b = samples[i]!;
    const years = b.year - a.year;
    results.push({
      start: a.year, end: b.year,
      vectorNTPeryear: Math.hypot(b.g10 - a.g10, b.g11 - a.g11, b.h11 - a.h11) / years,
      percentPerYear: 100 * (b.momentZAm2 - a.momentZAm2) / (a.momentZAm2 * years),
      predicted: b.year > 2025,
    });
  }
  return results;
}
export function percentChange(startYear: number, endYear: number): number {
  return 100 * (dipoleAt(endYear).momentZAm2 / dipoleAt(startYear).momentZAm2 - 1);
}
export function temporalCsv(): string {
  const head = "year,main_field_dipole_zetta_ampere_m2,degree1_amplitude_nanotesla,igrf14_evidence,annual_vector_change_nanotesla_per_year,annual_dipole_percent_change";
  const rates = new Map(dipoleChanges().map(r => [r.end, r]));
  const out = dipoleSeries().map(d => {
    const rate = rates.get(d.year);
    return [d.year, d.momentZAm2.toFixed(4), d.strengthNT.toFixed(3), d.evidence, rate?.vectorNTPeryear.toFixed(4) ?? "", rate?.percentPerYear.toFixed(5) ?? ""].join(",");
  });
  return head + "\n" + out.join("\n") + "\n";
}

// Palaeomagnetic markers describe geological reversal regimes, not exact field strength.
export type DeepTimeEvidence = "magnetic-stripe/stratigraphy" | "volcanic/stratigraphy" | "excursion";
export interface DeepTimeEvent {
  id: string; fromMa: number; toMa: number; label: string; regime: string;
  summary: string; evidence: DeepTimeEvidence;
  source: string; qualifier: string; marker: "stable-normal" | "stable-reversed" | "frequent" | "excursion";
}
export const DEEP_TIME_EVENTS: readonly DeepTimeEvent[] = [
  {
    id: "laschamp", fromMa: 0.041, toMa: 0.043, label: "Laschamp excursion",
    regime: "Short-lived disruption, not a complete enduring reversal",
    summary: "Around 41–42 thousand years ago, the magnetic field weakened and its direction deviated strongly. Estimates and precise timing vary between paleomagnetic reconstructions.",
    evidence: "excursion", marker: "excursion",
    source: "https://doi.org/10.1029/2019RG000656",
    qualifier: "Model-based event, not directly observed; duration and intensity depend on the paleo-field reconstruction.",
  },
  {
    id: "brunhes", fromMa: 0, toMa: 0.78, label: "Brunhes normal chron",
    regime: "Predominantly normal magnetic polarity since the last major reversal",
    summary: "The last major polarity reversal, Matuyama–Brunhes, occurred roughly 773–780 thousand years ago; shorter geomagnetic excursions have occurred since.",
    evidence: "magnetic-stripe/stratigraphy", marker: "stable-normal",
    source: "https://www.ncei.noaa.gov/products/geomagnetism-frequently-asked-questions",
    qualifier: "A chron-scale polarity label, not a claim that field strength stayed constant.",
  },
  {
    id: "jurassic", fromMa: 155, toMa: 171, label: "Middle Jurassic hyperfrequency",
    regime: "Intervals inferred to exceed 10 polarity reversals per million years",
    summary: "Marine magnetic-anomaly and stratigraphic correlations indicate especially frequent reversals around 171–155 Ma.",
    evidence: "magnetic-stripe/stratigraphy", marker: "frequent",
    source: "https://doi.org/10.1029/2024JB030928",
    qualifier: "Approximate rates and boundaries depend on magnetic polarity timescale and the quality of Jurassic marine anomalies.",
  },
  {
    id: "cretaceous", fromMa: 84, toMa: 121, label: "Cretaceous Normal Superchron",
    regime: "About 37 million years with dominantly normal polarity",
    summary: "An extraordinary long-polarity interval inferred from marine crust and stratigraphy. A few very short events are disputed; a lack of reversals does not imply constant field intensity.",
    evidence: "magnetic-stripe/stratigraphy", marker: "stable-normal",
    source: "https://doi.org/10.1029/2024JB030928",
    qualifier: "Often called roughly reversal-free; tiny proposed exceptions and exact boundary ages remain studied.",
  },
  {
    id: "kiaman", fromMa: 267, toMa: 318, label: "Kiaman Reversed Superchron",
    regime: "About 51 million years of mainly reversed polarity",
    summary: "The late Carboniferous to Permian reverse-polarity superchron. Studies still find variation in field intensity inside this long interval.",
    evidence: "volcanic/stratigraphy", marker: "stable-reversed",
    source: "https://doi.org/10.1029/2023JB027550",
    qualifier: "A long-term polarity regime, not an uninterrupted record of globe-wide magnitude.",
  },
  {
    id: "moyero", fromMa: 463, toMa: 485, label: "Ordovician / Moyero Reverse Superchron",
    regime: "Proposed prolonged reverse-polarity regime",
    summary: "Paleomagnetic and stratigraphic evidence suggests an extended reversed interval in the Ordovician, but coverage is patchier than for the Cenozoic.",
    evidence: "volcanic/stratigraphy", marker: "stable-reversed",
    source: "https://doi.org/10.1029/2023JB027550",
    qualifier: "Approximate and less securely constrained boundaries in ancient strata. No complete 500-Ma polarity tape.",
  },
];
export function eventsAtMa(ageMa: number): DeepTimeEvent[] {
  if (!Number.isFinite(ageMa) || ageMa < 0 || ageMa > 500) return [];
  return DEEP_TIME_EVENTS.filter(e => ageMa >= e.fromMa && ageMa <= e.toMa);
}
export const TEMPORAL_REGISTRY = [
  { era: "Four-hour upstream", from: "minutes", until: "hours", source: "NOAA DSCOVR/ACE L1", quality: "Measured spacecraft inputs + estimated Earth arrival", active: true, url: "https://www.swpc.noaa.gov/products/real-time-solar-wind" },
  { era: "Modern global core", from: "1900 CE", until: "2030 CE", source: "IAGA IGRF-14", quality: "Global internal-field model; 2025 provisional, 2025–2030 forecast", active: true, url: "https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field" },
  { era: "Historical navigators", from: "1590 CE", until: "1990 CE", source: "Jackson et al., gufm1", quality: "Global reconstruction; pre-1840 intensity weakly constrained", active: false, url: "https://geomag.colorado.edu/gufm1" },
  { era: "Archaeomagnetic Holocene", from: "10,000 yr BP", until: "present", source: "GFZ CALS10k.2", quality: "Sediment/archaeological reconstruction; dating & sampling uncertainties", active: false, url: "https://www.gfz.de/en/section/geomagnetism/data-products-services/mag-models/calsxk-10000-3000-years-bp" },
  { era: "Late Quaternary", from: "100,000 yr BP", until: "present", source: "GGF100k, LSMOD.2", quality: "Geological global models with considerable uncertainties", active: false, url: "https://doi.org/10.1029/2019RG000656" },
  { era: "Deep-time polarity evidence", from: "500 Ma", until: "present", source: "Published palaeomagnetic stratigraphy", quality: "Selected reversal regimes and evidence gaps, not globe-wide magnitude", active: true, url: "https://doi.org/10.1029/2023JB027550" },
  { era: "Palaeointensity samples", from: "4,200 Ma", until: "50 ka", source: "PINT v8.2.0", quality: "Sparse local rock estimates; quality scores & site/date biases; not a continuous global curve", active: false, url: "https://doi.org/10.1093/gji/ggaf490" },
] as const;
