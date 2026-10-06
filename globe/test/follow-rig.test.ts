import { describe, expect, it } from "vitest";
import {
  MIN_RADIUS, TRANSITION_SEC, blendPose, easeInOut, followWeight, initCam, len, norm, smoothDamp, smoothDampVec,
  stepCam, type Pose,
} from "../src/camera/follow-rig";

describe("smoothDamp", () => {
  it("converges to the target without overshoot from rest", () => {
    let x = 0;
    let v = 0;
    for (let i = 0; i < 300; i++) {
      [x, v] = smoothDamp(x, 1, v, 0.5, 1 / 60);
      expect(x).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(x).toBeCloseTo(1, 4);
  });

  it("vector form tracks a target", () => {
    let s = { p: [0, 0, 0] as [number, number, number], v: [0, 0, 0] as [number, number, number] };
    for (let i = 0; i < 300; i++) s = smoothDampVec(s, [1, -2, 3], 0.5, 1 / 60);
    expect(s.p[0]).toBeCloseTo(1, 4);
    expect(s.p[1]).toBeCloseTo(-2, 4);
    expect(s.p[2]).toBeCloseTo(3, 4);
  });
});

describe("camera state machine", () => {
  it("GLOBE → TO_FOLLOW → FOLLOW over TRANSITION_SEC", () => {
    expect(TRANSITION_SEC).toBe(2.5);
    let s = initCam();
    expect(s.mode).toBe("GLOBE");
    s = stepCam(s, 0.016, true);
    expect(s.mode).toBe("TO_FOLLOW");
    s = stepCam({ mode: "TO_FOLLOW", k: 0 }, 1.25, true);
    expect(s).toEqual({ mode: "TO_FOLLOW", k: 0.5 });
    s = stepCam(s, 1.25, true);
    expect(s).toEqual({ mode: "FOLLOW", k: 1 });
    expect(stepCam(s, 1, true)).toEqual(s);
  });

  it("leaving FOLLOW goes TO_GLOBE and ends in GLOBE", () => {
    let s = stepCam({ mode: "FOLLOW", k: 1 }, 0.016, false);
    expect(s.mode).toBe("TO_GLOBE");
    s = stepCam({ mode: "TO_GLOBE", k: 1 }, 2.5, false);
    expect(s).toEqual({ mode: "GLOBE", k: 0 });
  });

  it("can reverse a transition midway without a jump", () => {
    const mid = stepCam({ mode: "TO_FOLLOW", k: 0 }, 1.25, true); // k = 0.5
    const back = stepCam(mid, 0, false);
    expect(back).toEqual({ mode: "TO_GLOBE", k: 0.5 });
    expect(stepCam(back, 0, true)).toEqual({ mode: "TO_FOLLOW", k: 0.5 });
  });

  it("reduced motion halves the speed (×2 duration)", () => {
    expect(stepCam({ mode: "TO_FOLLOW", k: 0 }, 2.5, true, 0.5).k).toBeCloseTo(0.5, 9);
  });

  it("easing and weight", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9);
    expect(followWeight({ mode: "FOLLOW", k: 1 })).toBe(1);
    expect(followWeight({ mode: "GLOBE", k: 0 })).toBe(0);
  });
});

describe("blendPose", () => {
  const a: Pose = { pos: [0, 0, 3.2], target: [0, 0, 0], up: [0, 1, 0] };
  const b: Pose = { pos: [1.2, 0.3, 0.5], target: [1, 0, 0], up: [1, 0, 0] };

  it("returns the endpoints at w = 0 and w = 1", () => {
    const p0 = blendPose(a, b, 0);
    const p1 = blendPose(a, b, 1);
    p0.pos.forEach((x, i) => expect(x).toBeCloseTo(a.pos[i], 9));
    p1.pos.forEach((x, i) => expect(x).toBeCloseTo(b.pos[i], 9));
    p1.target.forEach((x, i) => expect(x).toBeCloseTo(b.target[i], 9));
    expect(len(p0.up)).toBeCloseTo(1, 9);
  });

  it("never lets the camera inside the Earth, even between antipodal poses", () => {
    const x: Pose = { pos: [0, 0, 1.0], target: [0, 0, 0], up: [0, 1, 0] };
    const y: Pose = { pos: [0, 0, -1.0], target: [0, 0, 0], up: [0, 1, 0] };
    for (const w of [0.25, 0.5, 0.75]) {
      const p = blendPose(x, y, w);
      expect(Number.isFinite(p.pos[0] + p.pos[1] + p.pos[2])).toBe(true);
      expect(len(p.pos)).toBeGreaterThanOrEqual(MIN_RADIUS - 1e-9);
    }
  });

  it("norm of a zero vector is finite", () => {
    expect(norm([0, 0, 0]).every(Number.isFinite)).toBe(true);
  });
});
