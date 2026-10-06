import { Vector3, type Matrix4, type PerspectiveCamera } from "three";
import { altitudeRadius, latLonToVec3 } from "../geo3d/vec";
import type { GlobeModel } from "../model/globe-model";
import { ARC_BASE_LIFT } from "./arcs";

export const PICK_RADIUS_PX = 12;

export interface PickIndex {
  xyz: Float32Array;
  t: Float32Array;
  flight: Int32Array;
  count: number;
}

/** Earth-fixed positions of every `stride`-th observed sample (and the last one) with its time. */
export function buildPickIndex(m: GlobeModel, stride = 3): PickIndex {
  let cap = 0;
  for (const f of m.flights) cap += Math.ceil(f.t.length / stride) + 1;
  const xyz = new Float32Array(cap * 3);
  const t = new Float32Array(cap);
  const flight = new Int32Array(cap);
  let n = 0;
  m.flights.forEach((f, fi) => {
    const len = f.t.length;
    for (let i = 0; i < len; i += stride) {
      const p = latLonToVec3(f.lat[i], f.lon[i], altitudeRadius(f.alt[i]) + ARC_BASE_LIFT);
      xyz.set(p, n * 3);
      t[n] = f.t[i];
      flight[n++] = fi;
    }
    if ((len - 1) % stride !== 0) {
      const i = len - 1;
      const p = latLonToVec3(f.lat[i], f.lon[i], altitudeRadius(f.alt[i]) + ARC_BASE_LIFT);
      xyz.set(p, n * 3);
      t[n] = f.t[i];
      flight[n++] = fi;
    }
  });
  return { xyz, t, flight, count: n };
}

const v = new Vector3();
const cam = new Vector3();

/**
 * Nearest flight (observed point or head) within `maxPx` of the cursor, ignoring points hidden behind the
 * Earth (a point is visible when dot(p, cameraPosition) > 1 for a unit sphere) and samples in the future.
 */
export function pickFlight(
  idx: PickIndex,
  heads: { pos: Float32Array; flight: Float32Array; count: number } | null,
  cur: number,
  world: Matrix4,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  x: number,
  y: number,
  maxPx = PICK_RADIUS_PX,
): number {
  cam.copy(camera.position);
  let best = -1;
  let bestD = maxPx * maxPx;
  const test = (px: number, py: number, pz: number, flight: number) => {
    v.set(px, py, pz).applyMatrix4(world);
    if (v.dot(cam) < 1.0) return;
    v.project(camera);
    if (v.z < -1 || v.z > 1) return;
    const sx = ((v.x + 1) / 2) * width;
    const sy = ((1 - v.y) / 2) * height;
    const d = (sx - x) ** 2 + (sy - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = flight;
    }
  };
  for (let i = 0; i < idx.count; i++) {
    if (idx.t[i] > cur) continue;
    test(idx.xyz[i * 3], idx.xyz[i * 3 + 1], idx.xyz[i * 3 + 2], idx.flight[i]);
  }
  if (heads) {
    for (let i = 0; i < heads.count; i++) test(heads.pos[i * 3], heads.pos[i * 3 + 1], heads.pos[i * 3 + 2], heads.flight[i]);
  }
  return best;
}
