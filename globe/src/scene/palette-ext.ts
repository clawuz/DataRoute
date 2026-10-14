import { REGION_RGB } from "@web/data/palette";

export type Rgb = [number, number, number];

/** Colours past the seven regions (index 7 and up): the personal globe gives every route its own. */
export const MAX_EXTRA_COLORS = 64;
export const PALETTE_SIZE = 7 + MAX_EXTRA_COLORS;

let extra: Rgb[] = [];

export function setExtraColors(colors: Rgb[]): void {
  extra = colors.slice(0, MAX_EXTRA_COLORS);
}

/** the full palette array the arc shader reads (regions, then the extras, padded with the last region colour) */
export function paletteColors(): Rgb[] {
  const out: Rgb[] = [...REGION_RGB, ...extra];
  while (out.length < PALETTE_SIZE) out.push(REGION_RGB[REGION_RGB.length - 1]);
  return out;
}

export function colorOfIndex(idx: number): Rgb {
  return idx < 7 ? (REGION_RGB[idx] ?? REGION_RGB[6]) : (extra[idx - 7] ?? REGION_RGB[6]);
}
