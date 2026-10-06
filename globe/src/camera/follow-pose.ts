import type { Vec3 } from "../geo3d/vec";
import { CHASE_BACK, CHASE_UP, LOOK_AHEAD, LOOK_DOWN, add, dot, len, norm, scale, sub, type Pose } from "./follow-rig";

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
