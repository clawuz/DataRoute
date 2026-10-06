import { describe, expect, it } from "vitest";
import {
  DAMPING_PER_SEC, IDLE_YAW_RATE, INITIAL_PITCH, PITCH_LIMIT, RIG_DISTANCE,
  dragRig, initRig, initialYaw, releaseRig, rigPosition, stepRig,
} from "../src/camera/globe-rig";

describe("globe rig", () => {
  it("constants", () => {
    expect(RIG_DISTANCE).toBe(3.2);
    expect(PITCH_LIMIT).toBe(1.2);
    expect(IDLE_YAW_RATE).toBeCloseTo((0.6 * Math.PI) / 180, 12);
    expect(DAMPING_PER_SEC).toBeCloseTo(0.95 ** 60, 12);
  });

  it("initialYaw faces the given longitude at the given sidereal angle", () => {
    expect(initialYaw(1, 30)).toBeCloseTo(1 + (30 * Math.PI) / 180, 12);
    expect(initRig(2)).toEqual({ yaw: 2, pitch: INITIAL_PITCH, yawVel: 0, pitchVel: 0, dragging: false });
  });

  it("idle drift advances yaw at the idle rate", () => {
    const s = stepRig(initRig(0), 2, IDLE_YAW_RATE);
    expect(s.yaw).toBeCloseTo(2 * IDLE_YAW_RATE, 12);
    expect(stepRig(initRig(0), 2, 0).yaw).toBe(0);
  });

  it("drag inertia decays exponentially after release", () => {
    let s = dragRig(initRig(0), 0.1, 0, 0.1); // 1 rad/s
    expect(s.dragging).toBe(true);
    expect(s.yawVel).toBeCloseTo(1, 9);
    s = releaseRig(s);
    expect(s.dragging).toBe(false);
    const after = stepRig(s, 1, 0);
    expect(after.yaw).toBeCloseTo(0.1 + 1, 9);
    expect(after.yawVel).toBeCloseTo(DAMPING_PER_SEC, 9);
    let t = after;
    for (let i = 0; i < 10; i++) t = stepRig(t, 1, 0);
    expect(Math.abs(t.yawVel)).toBeLessThan(1e-6);
  });

  it("stepRig does nothing while dragging", () => {
    const s = dragRig(initRig(0), 0.1, 0, 0.1);
    expect(stepRig(s, 1, IDLE_YAW_RATE)).toBe(s);
  });

  it("pitch is clamped by drag and by inertia", () => {
    const s = dragRig(initRig(0), 0, 5, 0.1);
    expect(s.pitch).toBe(PITCH_LIMIT);
    const r = stepRig({ yaw: 0, pitch: 1.19, yawVel: 0, pitchVel: 1, dragging: false }, 1, 0);
    expect(r.pitch).toBe(PITCH_LIMIT);
    expect(r.pitchVel).toBe(0);
  });

  it("rigPosition", () => {
    const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
    close(rigPosition({ ...initRig(0), pitch: 0 }), [0, 0, 3.2]);
    close(rigPosition({ ...initRig(Math.PI / 2), pitch: 0 }), [3.2, 0, 0]);
    const p = rigPosition({ ...initRig(0.7), pitch: 0.7 }, 5);
    expect(Math.hypot(...p)).toBeCloseTo(5, 9);
  });
});
