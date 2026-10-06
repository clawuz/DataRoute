import { Vector3, type Camera, type Matrix4 } from "three";
import { sampleAt, tunnelXYZ } from "../data/mapping";
import type { Model } from "../data/model";

export const PICK_RADIUS_PX = 12;

export interface PickPoints {
  xyz: Float32Array;
  flight: Int32Array;
  count: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

/** Strided ribbon samples visible at `cur`, plus each flight's head. Positions are in ribbon-group local space. */
export function collectPickPoints(m: Model, cur: number, stride: number, reuse?: PickPoints): PickPoints {
  let cap = 0;
  for (const f of m.flights) cap += Math.ceil(f.t.length / stride) + 1;
  const p =
    reuse && reuse.flight.length >= cap
      ? reuse
      : { xyz: new Float32Array(cap * 3), flight: new Int32Array(cap), count: 0 };
  let n = 0;
  m.flights.forEach((f, fi) => {
    if (f.t[0] > cur) return;
    for (let i = 0; i < f.t.length; i += stride) {
      if (f.t[i] > cur) break;
      tunnelXYZ(f.t[i], f.alt[i], f.bearing, cur, p.xyz, n * 3);
      p.flight[n++] = fi;
    }
    const s = sampleAt(f, cur);
    if (s) {
      tunnelXYZ(cur, s.alt, f.bearing, cur, p.xyz, n * 3);
      p.flight[n++] = fi;
    }
  });
  p.count = n;
  return p;
}

const v = new Vector3();

export function projectToScreen(
  xyz: ArrayLike<number>,
  world: Matrix4,
  camera: Camera,
  width: number,
  height: number,
): ScreenPoint {
  v.set(xyz[0], xyz[1], xyz[2]).applyMatrix4(world).project(camera);
  return {
    x: ((v.x + 1) / 2) * width,
    y: ((1 - v.y) / 2) * height,
    visible: v.z >= -1 && v.z <= 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1,
  };
}

export function pickNearest(
  p: PickPoints,
  world: Matrix4,
  camera: Camera,
  width: number,
  height: number,
  x: number,
  y: number,
  maxPx = PICK_RADIUS_PX,
): number {
  let best = -1;
  let bestD = maxPx * maxPx;
  for (let i = 0; i < p.count; i++) {
    v.set(p.xyz[i * 3], p.xyz[i * 3 + 1], p.xyz[i * 3 + 2]).applyMatrix4(world).project(camera);
    if (v.z < -1 || v.z > 1) continue;
    const sx = ((v.x + 1) / 2) * width;
    const sy = ((1 - v.y) / 2) * height;
    const d = (sx - x) ** 2 + (sy - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p.flight[i];
    }
  }
  return best;
}
