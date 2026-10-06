import { haversineKm, initialBearing } from "@collector/geo";
import { sampleAt } from "@web/data/mapping";
import { destinationPoint } from "../geo3d/great";
import type { GlobeFlight } from "./globe-model";

export const EXTRAPOLATE_MAX_SEC = 300;

export interface HeadState {
  lat: number;
  lon: number;
  alt100: number;
  extrapolated: boolean;
  ageSec: number;
}

const KT_TO_KMH = 1.852;

/**
 * Where the head of a flight is at relative time `cur`. Observed while inside the sampled track; for airborne
 * flights up to EXTRAPOLATE_MAX_SEC beyond the last sample the head is dead-reckoned along the great circle
 * (and flagged `extrapolated`); afterwards it disappears. Non-airborne flights are never extrapolated.
 */
export function headState(f: GlobeFlight, cur: number): HeadState | null {
  if (cur < f.t[0]) return null;
  if (f.status !== "AIRBORNE" || cur <= f.lastT) {
    const s = sampleAt(f, cur);
    return s ? { lat: s.lat, lon: s.lon, alt100: s.alt, extrapolated: false, ageSec: 0 } : null;
  }
  const dt = cur - f.lastT;
  if (dt > EXTRAPOLATE_MAX_SEC) return null;

  const n = f.t.length;
  let gs = f.gs !== undefined && f.gs > 0 ? f.gs : undefined; // knots
  let trk = f.trk;
  if (n >= 2) {
    const dtSeg = f.t[n - 1] - f.t[n - 2];
    if (gs === undefined && dtSeg > 0) {
      gs = haversineKm(f.lat[n - 2], f.lon[n - 2], f.lat[n - 1], f.lon[n - 1]) / (dtSeg / 3600) / KT_TO_KMH;
    }
    if (trk === undefined) trk = initialBearing(f.lat[n - 2], f.lon[n - 2], f.lat[n - 1], f.lon[n - 1]);
  }
  if (gs === undefined || trk === undefined) return null;

  const distKm = (gs * KT_TO_KMH * dt) / 3600;
  const [lat, lon] = destinationPoint(f.lat[n - 1], f.lon[n - 1], trk, distKm);
  return { lat, lon, alt100: f.alt[n - 1], extrapolated: true, ageSec: dt };
}
