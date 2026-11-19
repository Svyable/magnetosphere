/**
 * Presentation complexity for *illustrative* field lines.
 * These are not MHD or mapped spacecraft observations. Changing this
 * selection changes only how many schematic paths we draw, not measurements.
 */
export type FieldDetail = "quiet" | "balanced" | "detailed";

export const FIELD_DETAIL: Record<FieldDetail, {
  shells: readonly number[];
  azimuthSamples: number;
  openLatitudes: readonly number[];
  openOffsets: readonly number[];
  closedOpacity: number;
  openOpacity: number;
  closedWidth: number;
  openWidth: number;
}> = {
  quiet: {
    shells: [3, 6.5],
    azimuthSamples: 3,
    openLatitudes: [77],
    openOffsets: [-4, 4],
    closedOpacity: 0.25,
    openOpacity: 0.13,
    closedWidth: 0.9,
    openWidth: 0.65,
  },
  balanced: {
    shells: [2, 3.5, 5.6, 8.2],
    azimuthSamples: 4,
    openLatitudes: [73, 81],
    openOffsets: [-5, 0, 5],
    closedOpacity: 0.38,
    openOpacity: 0.19,
    closedWidth: 0.95,
    openWidth: 0.7,
  },
  detailed: {
    shells: [2, 3, 4.2, 5.6, 7.2, 8.8],
    azimuthSamples: 8,
    openLatitudes: [70, 74, 78, 83],
    openOffsets: [-6, -2, 2, 6],
    closedOpacity: 0.62,
    openOpacity: 0.35,
    closedWidth: 1.1,
    openWidth: 0.8,
  },
};
export const FIELD_DETAIL_CHOICES: readonly FieldDetail[] = ["quiet", "balanced", "detailed"];

export function parseFieldDetail(s: string | null | undefined): FieldDetail | null {
  return s === "quiet" || s === "balanced" || s === "detailed" ? s : null;
}
export function schematicPathUpperBound(detail: FieldDetail): number {
  const p = FIELD_DETAIL[detail];
  // Each open-lobe latitude and offset is duplicated in two hemispheres.
  return p.azimuthSamples * p.shells.length + 2 * p.openLatitudes.length * p.openOffsets.length;
}
