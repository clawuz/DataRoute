import { REGION_RGB as NASA_REGION_RGB, hexToRgb } from "@web/data/palette";

/** the personal build's routes are red, white, orange and blue (domestic, Europe, Middle East, Africa, Asia-Pacific, Americas, other) in red, white, blue and grey */
const NEON_REGION_RGB: [number, number, number][] = ["#f4f8ff", "#4f8dff", "#9aa4b8", "#8fb6ff", "#ff2438", "#ff4a5c", "#6b7488"].map(hexToRgb);
const regionRgb = (): [number, number, number][] => (typeof document !== "undefined" && document.body.classList.contains("personal-build") ? NEON_REGION_RGB : NASA_REGION_RGB);

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
  const reg = regionRgb();
  const out: Rgb[] = [...reg, ...extra];
  while (out.length < PALETTE_SIZE) out.push(reg[reg.length - 1]);
  return out;
}

export function colorOfIndex(idx: number): Rgb {
  const reg = regionRgb();
  return idx < 7 ? (reg[idx] ?? reg[6]) : (extra[idx - 7] ?? reg[6]);
}
