import type { Vec3 } from "../geo3d/vec";

export const CLOUD_SHADOW_K = 0.015; // radians of apparent cloud-to-ground displacement (a visual cue, not physical scale)

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Warm band around the terminator (mirrored in earth.ts and atmosphere.ts GLSL). */
export const twilightAmount = (ndl: number): number => smoothstep(-0.12, 0, ndl) * (1 - smoothstep(0, 0.10, ndl));

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** UV displacement toward the sun used to sample the cloud map for the ground shadow (mirrored in earth.ts GLSL). */
export function cloudShadowShift(sun: Vec3, normal: Vec3, k = CLOUD_SHADOW_K): { du: number; dv: number } {
  const east = norm(cross([0, 1, 0], normal));
  const north = cross(normal, east);
  const d = dot(normal, sun);
  const sunT: Vec3 = [sun[0] - normal[0] * d, sun[1] - normal[1] * d, sun[2] - normal[2] * d];
  const coslat = Math.max(Math.sqrt(Math.max(0, 1 - normal[1] * normal[1])), 0.05);
  return { du: (k * dot(sunT, east)) / coslat / (2 * Math.PI), dv: (k * dot(sunT, north)) / Math.PI };
}
