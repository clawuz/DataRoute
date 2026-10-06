export type Vec3 = [number, number, number];

export const R_EARTH_KM = 6371.0088;
export const ALT_EXAG = 30; // visual altitude exaggeration

const DEG = Math.PI / 180;

/** Earth-fixed unit-sphere mapping: lon 0 → +z, east → +x, Y = polar axis. */
export function latLonToVec3(latDeg: number, lonDeg: number, radius = 1): Vec3 {
  const φ = latDeg * DEG;
  const λ = lonDeg * DEG;
  return [radius * Math.cos(φ) * Math.sin(λ), radius * Math.sin(φ), radius * Math.cos(φ) * Math.cos(λ)];
}

export function vec3ToLatLon(v: Vec3): { lat: number; lon: number } {
  const r = Math.hypot(v[0], v[1], v[2]) || 1;
  return { lat: Math.asin(Math.max(-1, Math.min(1, v[1] / r))) / DEG, lon: Math.atan2(v[0], v[2]) / DEG };
}

/** Scene radius for an altitude given in hundreds of feet (ALT_EXAG applied). */
export function altitudeRadius(alt100: number): number {
  const a = Number.isFinite(alt100) ? Math.max(alt100, 0) : 0;
  const km = (a * 100 * 0.3048) / 1000;
  return 1 + (ALT_EXAG * km) / R_EARTH_KM;
}
