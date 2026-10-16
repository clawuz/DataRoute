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

/**
 * How long the music box draws a note of a route: a short route's note stays short, a long route's note is held until its
 * next note begins (rk = the route's length rank 0..1, d = the note's own length, gap = seconds to the route's next note).
 */
export function drawLength(rk: number, d: number, gap: number | null): number {
  const full = gap === null ? Math.max(d, 0.6 + 1.6 * rk) : Math.max(0.05, gap * 0.92);
  const short = Math.min(d, 0.32);
  const w = Math.pow(clamp01(rk), 1.1);
  return Math.max(0.05, Math.min(full, short + (full - short) * w));
}
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
