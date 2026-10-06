import type { Vec3 } from "../geo3d/vec";
import { CHASE_BACK, CHASE_UP, LOOK_AHEAD, add, dot, len, norm, scale, sub, type Pose } from "./follow-rig";

const TANGENT_DT = 45; // flight seconds either side

/** Chase-camera pose (Earth-fixed) for a flight position function; null when no direction is available. */
export function chaseFor(posAt: (u: number) => Vec3 | null, u: number): Pose | null {
  const p = posAt(u);
  const a = posAt(u - TANGENT_DT);
  const b = posAt(u + TANGENT_DT);
  if (!p || !a || !b) return null;
  const up = norm(p);
  let tan = sub(b, a);
  tan = sub(tan, scale(up, dot(tan, up)));
  if (len(tan) < 1e-9) return null;
  tan = norm(tan);
  return {
    pos: add(sub(p, scale(tan, CHASE_BACK)), scale(up, CHASE_UP)),
    target: add(p, scale(tan, LOOK_AHEAD)),
    up,
  };
}
