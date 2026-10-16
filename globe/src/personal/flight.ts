const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/** the cruising altitude (ft) of a flight of this length */
export const cruiseFt = (distKm: number): number => (distKm < 300 ? 14000 : distKm < 800 ? 24000 : distKm < 1800 ? 31000 : distKm < 4000 ? 36000 : 39000);

/** altitude (ft) at `p` (0 = take-off … 1 = landing) of a flight of `distKm`: a climb, the cruise, a descent */
export function altitudeFt(p: number, distKm: number): number {
  const c = cruiseFt(distKm);
  const x = clamp(p, 0, 1);
  if (x < 0.18) return Math.round((c * (x / 0.18) ** 0.8) / 100) * 100;
  if (x > 0.82) return Math.round((c * ((1 - x) / 0.18) ** 0.8) / 100) * 100;
  return c;
}

/** How long the music box draws a note: as long as it sounds, until the next note of its route begins (never longer). */
export function drawLength(d: number, gap: number | null): number {
  return gap === null ? d : Math.max(0.05, Math.min(d, gap * 0.92));
}
