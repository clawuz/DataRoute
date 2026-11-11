import type { Vec3 } from "../geo3d/vec";
import { CHASE_BACK, CHASE_UP, LOOK_AHEAD, LOOK_DOWN, add, cross, dot, len, norm, scale, sub, type Pose } from "./follow-rig";

const TANGENT_DT = 45; // flight seconds either side

/** Chase-camera pose (Earth-fixed) for a flight position function; null when no direction is available. */
export function chaseFor(posAt: (u: number) => Vec3 | null, u: number): Pose | null {
  const p = posAt(u);
  if (!p) return null;
  const a0 = posAt(u - TANGENT_DT);
  const b0 = posAt(u + TANGENT_DT);
  if (!a0 && !b0) return null;
  const a = a0 ?? p; // one-sided difference when a neighbour is missing
  const b = b0 ?? p;
  const up = norm(p);
  let tan = sub(b, a);
  tan = sub(tan, scale(up, dot(tan, up)));
  if (len(tan) < 1e-9) return null;
  tan = norm(tan);
  return {
    pos: add(sub(p, scale(tan, CHASE_BACK)), scale(up, CHASE_UP)),
    target: sub(add(p, scale(tan, LOOK_AHEAD)), scale(up, LOOK_DOWN)),
    up,
  };
}

/** Where a flight is and which way it flies (Earth-fixed): its position, the unit tangent along the ground and the local up. */
export function headingFor(posAt: (u: number) => Vec3 | null, u: number): { pos: Vec3; tan: Vec3; up: Vec3 } | null {
  const p = posAt(u);
  if (!p) return null;
  const a0 = posAt(u - TANGENT_DT);
  const b0 = posAt(u + TANGENT_DT);
  if (!a0 && !b0) return null;
  const up = norm(p);
  let tan = sub(b0 ?? p, a0 ?? p);
  tan = sub(tan, scale(up, dot(tan, up)));
  if (len(tan) < 1e-9) return null;
  return { pos: p, tan: norm(tan), up };
}

/** Free view round the aeroplane: yaw 0 = straight behind it, positive = to its right; the aeroplane stays in the centre of the picture. */
export interface Orbit {
  yaw: number;
  pitch: number; // above the local horizon
  dist: number;
}
export const ORBIT_PITCH_MIN = 0.03;
export const ORBIT_PITCH_MAX = 1.5;
export const ORBIT_DIST_MIN = 0.12;
export const ORBIT_DIST_MAX = 1.6;
/** the view of the chase camera written as an orbit (the start of a free view) */
export const defaultOrbit = (): Orbit => ({ yaw: 0, pitch: Math.atan2(CHASE_UP, CHASE_BACK), dist: Math.hypot(CHASE_BACK, CHASE_UP) });

export function clampOrbit(o: Orbit): Orbit {
  return {
    yaw: o.yaw,
    pitch: Math.min(ORBIT_PITCH_MAX, Math.max(ORBIT_PITCH_MIN, o.pitch)),
    dist: Math.min(ORBIT_DIST_MAX, Math.max(ORBIT_DIST_MIN, o.dist)),
  };
}

/** Earth-fixed pose of a camera on an orbit round the aeroplane, looking at it; null when no direction is available. */
export function orbitFor(posAt: (u: number) => Vec3 | null, u: number, o: Orbit): Pose | null {
  const h = headingFor(posAt, u);
  if (!h) return null;
  const right = norm(cross(h.tan, h.up));
  const cp = Math.cos(o.pitch);
  const dir = add(add(scale(h.tan, -Math.cos(o.yaw) * cp), scale(right, Math.sin(o.yaw) * cp)), scale(h.up, Math.sin(o.pitch)));
  return { pos: add(h.pos, scale(dir, o.dist)), target: h.pos, up: h.up };
}
