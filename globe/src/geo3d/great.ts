import { haversineKm, interpolateGreatCircle } from "@collector/geo";
import { R_EARTH_KM } from "./vec";

const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;

/** Point reached from (lat, lon) travelling `distKm` along the initial bearing on a great circle. */
export function destinationPoint(latDeg: number, lonDeg: number, bearingDeg: number, distKm: number): [number, number] {
  const φ1 = latDeg * DEG;
  const λ1 = lonDeg * DEG;
  const θ = bearingDeg * DEG;
  const δ = distKm / R_EARTH_KM;
  const φ2 = Math.asin(
    Math.max(-1, Math.min(1, Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))),
  );
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [φ2 / DEG, wrap180(λ2 / DEG)];
}

/** Lift above the surface at the middle of a planned arc, in scene units. */
export function plannedLiftPeak(distKm: number): number {
  return 0.004 + 0.049 * Math.min(1, Math.sqrt(distKm / 2500));
}

export interface ArcPoint {
  lat: number;
  lon: number;
  radius: number;
  u: number;
}

/** Great-circle arc with a half-sine altitude profile; `n` points inclusive of both ends. */
export function plannedArc(from: LatLon, to: LatLon, n: number): { points: ArcPoint[]; distKm: number } {
  const distKm = haversineKm(from.lat, from.lon, to.lat, to.lon);
  const peak = plannedLiftPeak(distKm);
  const points: ArcPoint[] = [];
  for (let k = 0; k < n; k++) {
    const u = n > 1 ? k / (n - 1) : 0;
    const [lat, lon] = interpolateGreatCircle(from.lat, from.lon, to.lat, to.lon, u);
    points.push({ lat, lon, radius: 1 + peak * Math.pow(Math.sin(Math.PI * u), 0.6), u });
  }
  return { points, distKm };
}
