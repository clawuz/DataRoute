import { interpolateGreatCircle } from "@collector/geo";

export interface TrackPoint {
  t: number;
  alt100: number;
  lat: number;
  lon: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, f: number): number {
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
  );
}

/**
 * Resamples the continuous run of samples [i0..i1] (inclusive) into at most `maxPts` points evenly spaced in
 * time. Position follows the great circle between neighbouring samples; altitude uses a Catmull-Rom spline.
 * Runs that already fit are returned unchanged.
 */
export function resampleRun(
  t: ArrayLike<number>,
  alt: ArrayLike<number>,
  lat: ArrayLike<number>,
  lon: ArrayLike<number>,
  i0: number,
  i1: number,
  maxPts: number,
): TrackPoint[] {
  const n = i1 - i0 + 1;
  if (n <= 0) return [];
  const raw = (i: number): TrackPoint => ({ t: t[i], alt100: alt[i], lat: lat[i], lon: lon[i] });
  if (n === 1) return [raw(i0)];
  const count = Math.max(2, Math.min(maxPts, n));
  if (count === n) {
    const out: TrackPoint[] = [];
    for (let i = i0; i <= i1; i++) out.push(raw(i));
    return out;
  }
  const t0 = t[i0];
  const span = t[i1] - t0;
  const out: TrackPoint[] = [];
  let seg = i0;
  for (let k = 0; k < count; k++) {
    const tk = t0 + (span * k) / (count - 1);
    while (seg < i1 - 1 && t[seg + 1] < tk) seg++;
    const ta = t[seg];
    const tb = t[seg + 1];
    const f = tb > ta ? Math.min(1, Math.max(0, (tk - ta) / (tb - ta))) : 0;
    const [la, lo] = interpolateGreatCircle(lat[seg], lon[seg], lat[seg + 1], lon[seg + 1], f);
    const a = catmullRom(alt[Math.max(seg - 1, i0)], alt[seg], alt[seg + 1], alt[Math.min(seg + 2, i1)], f);
    out.push({ t: tk, alt100: Math.max(0, a), lat: la, lon: lo });
  }
  return out;
}
