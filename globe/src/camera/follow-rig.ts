import type { Vec3 } from "../geo3d/vec";

export const TRANSITION_SEC = 2.5;
export const MIN_RADIUS = 1.05;
export const CHASE_BACK = 0.35;
export const CHASE_UP = 0.12;
export const LOOK_AHEAD = 0.25;
export const SMOOTH_SEC = 0.6;

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l < 1e-12 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
};

/** Critically damped spring (Unity-style SmoothDamp). Returns [value, velocity]. */
export function smoothDamp(cur: number, target: number, vel: number, smoothTime: number, dt: number): [number, number] {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel + omega * change) * dt;
  return [target + (change + temp) * e, (vel - omega * temp) * e];
}

export interface Damped {
  p: Vec3;
  v: Vec3;
}

export function smoothDampVec(s: Damped, target: Vec3, smoothTime: number, dt: number): Damped {
  const p: Vec3 = [0, 0, 0];
  const v: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) [p[i], v[i]] = smoothDamp(s.p[i], target[i], s.v[i], smoothTime, dt);
  return { p, v };
}

export type CamMode = "GLOBE" | "TO_FOLLOW" | "FOLLOW" | "TO_GLOBE";
/** `k` is the follow weight progress 0..1 (0 = globe camera, 1 = chase camera). */
export interface CamState {
  mode: CamMode;
  k: number;
}

export const initCam = (): CamState => ({ mode: "GLOBE", k: 0 });

export function stepCam(s: CamState, dt: number, wantFollow: boolean, speedScale = 1): CamState {
  const dk = dt / (TRANSITION_SEC / (speedScale > 0 ? speedScale : 1));
  switch (s.mode) {
    case "GLOBE":
      return wantFollow ? { mode: "TO_FOLLOW", k: 0 } : s;
    case "TO_FOLLOW": {
      if (!wantFollow) return { mode: "TO_GLOBE", k: s.k };
      const k = s.k + dk;
      return k >= 1 ? { mode: "FOLLOW", k: 1 } : { mode: "TO_FOLLOW", k };
    }
    case "FOLLOW":
      return wantFollow ? s : { mode: "TO_GLOBE", k: 1 };
    case "TO_GLOBE": {
      if (wantFollow) return { mode: "TO_FOLLOW", k: s.k };
      const k = s.k - dk;
      return k <= 0 ? { mode: "GLOBE", k: 0 } : { mode: "TO_GLOBE", k };
    }
  }
}

export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const followWeight = (s: CamState) => easeInOut(Math.min(1, Math.max(0, s.k)));

export interface Pose {
  pos: Vec3;
  target: Vec3;
  up: Vec3;
}

function slerpDir(a: Vec3, b: Vec3, w: number): Vec3 {
  const d = Math.min(1, Math.max(-1, dot(a, b)));
  const ang = Math.acos(d);
  const s = Math.sin(ang);
  if (s < 1e-6) {
    if (d > 0) return a;
    // antipodal: rotate about any axis perpendicular to `a`
    const axis = norm(Math.abs(a[1]) < 0.9 ? cross(a, [0, 1, 0]) : cross(a, [1, 0, 0]));
    const th = Math.PI * w;
    return add(scale(a, Math.cos(th)), scale(cross(axis, a), Math.sin(th)));
  }
  return add(scale(a, Math.sin((1 - w) * ang) / s), scale(b, Math.sin(w * ang) / s));
}

/** Camera pose between a (w = 0) and b (w = 1): great-circle position blend, radius never below MIN_RADIUS. */
export function blendPose(a: Pose, b: Pose, w: number): Pose {
  const dir = norm(slerpDir(norm(a.pos), norm(b.pos), w));
  const r = Math.max(MIN_RADIUS, len(a.pos) + (len(b.pos) - len(a.pos)) * w);
  return {
    pos: scale(dir, r),
    target: add(scale(a.target, 1 - w), scale(b.target, w)),
    up: norm(add(scale(a.up, 1 - w), scale(b.up, w))),
  };
}
