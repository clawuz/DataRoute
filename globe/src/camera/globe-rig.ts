const DEG = Math.PI / 180;

export const RIG_DISTANCE = 3.2;
export const PITCH_LIMIT = 1.2;
export const IDLE_YAW_RATE = 0.6 * DEG; // rad/s
export const DAMPING_PER_SEC = Math.pow(0.95, 60); // 0.95 per frame at 60 fps
export const INITIAL_PITCH = 0.35;

export interface RigState {
  yaw: number;
  pitch: number;
  yawVel: number;
  pitchVel: number;
  dragging: boolean;
}

const clampPitch = (p: number) => Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, p));

/** Camera yaw (inertial frame) that faces longitude `lonDeg` when the Earth's sidereal angle is `gmstRad`. */
export const initialYaw = (gmstRad: number, lonDeg: number) => gmstRad + lonDeg * DEG;

export const initRig = (yaw: number): RigState => ({ yaw, pitch: INITIAL_PITCH, yawVel: 0, pitchVel: 0, dragging: false });

export function dragRig(s: RigState, dYaw: number, dPitch: number, dt: number): RigState {
  const pitch = clampPitch(s.pitch + dPitch);
  return {
    yaw: s.yaw + dYaw,
    pitch,
    yawVel: dt > 0 ? dYaw / dt : 0,
    pitchVel: dt > 0 ? (pitch - s.pitch) / dt : 0,
    dragging: true,
  };
}

export const releaseRig = (s: RigState): RigState => ({ ...s, dragging: false });

export function stepRig(s: RigState, dt: number, idleRate: number): RigState {
  if (s.dragging) return s;
  const decay = Math.pow(DAMPING_PER_SEC, dt);
  const pitch = s.pitch + s.pitchVel * dt;
  const clamped = clampPitch(pitch);
  return {
    yaw: s.yaw + (s.yawVel + idleRate) * dt,
    pitch: clamped,
    yawVel: s.yawVel * decay,
    pitchVel: clamped !== pitch ? 0 : s.pitchVel * decay,
    dragging: false,
  };
}

export function rigPosition(s: RigState, dist = RIG_DISTANCE): [number, number, number] {
  return [dist * Math.cos(s.pitch) * Math.sin(s.yaw), dist * Math.sin(s.pitch), dist * Math.cos(s.pitch) * Math.cos(s.yaw)];
}
