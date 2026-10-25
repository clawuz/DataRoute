import type { PersonalRoute } from "./routes";

export interface TripView {
  lat: number;
  lon: number;
  /** camera distance from the globe's centre (3.2 is the whole-globe default) */
  dist: number;
  /** a wide trip keeps the slow idle spin; a close one would spin out of the frame */
  spin: boolean;
}

const RAD = Math.PI / 180;
const WHOLE_GLOBE = 3.2;
const CLOSEST = 2.2;
/** half-spread (degrees) up to which the camera is at its closest, and from which it is back at the whole globe */
const NEAR_DEG = 8;
const FAR_DEG = 60;

/** Where the camera looks so that every route of the trip is in the picture: the middle of all end points, closer for a short trip. */
export function tripView(routes: readonly PersonalRoute[]): TripView {
  if (routes.length === 0) return { lat: 20, lon: 30, dist: WHOLE_GLOBE, spin: true };
  let x = 0, y = 0, z = 0;
  const pts: [number, number][] = [];
  for (const r of routes) {
    pts.push([r.fromLat, r.fromLon], [r.toLat, r.toLon]);
  }
  for (const [lat, lon] of pts) {
    x += Math.cos(lat * RAD) * Math.cos(lon * RAD);
    y += Math.cos(lat * RAD) * Math.sin(lon * RAD);
    z += Math.sin(lat * RAD);
  }
  const lat = Math.atan2(z, Math.hypot(x, y)) / RAD;
  const lon = Math.atan2(y, x) / RAD;
  let spread = 0;
  for (const [la, lo] of pts) {
    const c = Math.sin(la * RAD) * Math.sin(lat * RAD) + Math.cos(la * RAD) * Math.cos(lat * RAD) * Math.cos((lo - lon) * RAD);
    spread = Math.max(spread, Math.acos(Math.max(-1, Math.min(1, c))) / RAD);
  }
  const k = Math.max(0, Math.min(1, (spread - NEAR_DEG) / (FAR_DEG - NEAR_DEG)));
  return { lat, lon, dist: CLOSEST + (WHOLE_GLOBE - CLOSEST) * k, spin: spread >= FAR_DEG };
}
