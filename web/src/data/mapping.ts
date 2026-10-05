import type { FlightRec } from "./model";

export const DEPTH = 240; // world units for 24 h
export const WINDOW = 86400;
export const MAX_ALT100 = 410; // FL410
export const CAMERA_Z = 1.2; // camera sits behind the "now" plane at z = 0

export function radiusFor(alt100: number): number {
  const a = Math.min(Math.max(alt100, 0), MAX_ALT100) / MAX_ALT100;
  return 1 - a * 0.7;
}

export function zFor(tRel: number, cur: number): number {
  return -((cur - tRel) / WINDOW) * DEPTH;
}

export function tunnelXYZ(
  tRel: number,
  alt100: number,
  bearingDeg: number,
  cur: number,
  out: Float32Array,
  o = 0,
): void {
  const r = radiusFor(alt100);
  const a = (bearingDeg * Math.PI) / 180;
  out[o] = r * Math.sin(a);
  out[o + 1] = r * Math.cos(a);
  out[o + 2] = zFor(tRel, cur);
}

export interface SampleAt {
  alt: number;
  lat: number;
  lon: number;
  i: number; // index of the segment start
}

/** Flight state at relative time `cur`, or null when it is not in the air then. */
export function sampleAt(f: FlightRec, cur: number): SampleAt | null {
  const { t } = f;
  const n = t.length;
  if (cur < t[0] || cur > f.end) return null;
  if (cur >= t[n - 1]) return { alt: f.alt[n - 1], lat: f.lat[n - 1], lon: f.lon[n - 1], i: n - 1 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= cur) lo = mid;
    else hi = mid;
  }
  const k = (cur - t[lo]) / (t[hi] - t[lo] || 1);
  let dLon = f.lon[hi] - f.lon[lo];
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  let lon = f.lon[lo] + dLon * k;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return {
    alt: f.alt[lo] + (f.alt[hi] - f.alt[lo]) * k,
    lat: f.lat[lo] + (f.lat[hi] - f.lat[lo]) * k,
    lon,
    i: lo,
  };
}
