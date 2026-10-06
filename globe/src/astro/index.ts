const DEG = Math.PI / 180;
const mod360 = (x: number) => ((x % 360) + 360) % 360;

/** Wrap an angle in degrees to [-180, 180). */
export const wrap180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

export const julianDay = (unixSec: number) => unixSec / 86400 + 2440587.5;

/** Greenwich mean sidereal angle in degrees [0, 360). */
export function gmstDeg(unixSec: number): number {
  const n = julianDay(unixSec) - 2451545.0;
  return mod360(280.46061837 + 360.98564736629 * n);
}

export interface SunPosition {
  raDeg: number;
  decDeg: number;
}

/** Low-precision (~0.01°) apparent sun position (Astronomical Almanac). */
export function sunPosition(unixSec: number): SunPosition {
  const n = julianDay(unixSec) - 2451545.0;
  const L = mod360(280.46 + 0.9856474 * n);
  const g = mod360(357.528 + 0.9856003 * n) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const epsilon = (23.439 - 4e-7 * n) * DEG;
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  return { raDeg: mod360(ra / DEG), decDeg: dec / DEG };
}

/** Unit vector toward the sun in the inertial frame (Y = polar axis, RA from +z toward +x). */
export function sunDirection(unixSec: number): [number, number, number] {
  const { raDeg, decDeg } = sunPosition(unixSec);
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return [Math.cos(d) * Math.sin(a), Math.sin(d), Math.cos(d) * Math.cos(a)];
}

/** Angle to apply as `earthGroup.rotation.y` (radians). */
export function earthRotationRad(unixSec: number): number {
  return gmstDeg(unixSec) * DEG;
}

export function subSolarPoint(unixSec: number): { latDeg: number; lonDeg: number } {
  const p = sunPosition(unixSec);
  return { latDeg: p.decDeg, lonDeg: wrap180(p.raDeg - gmstDeg(unixSec)) };
}
