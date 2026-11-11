import { describe, expect, it } from "vitest";
import { clampOrbit, defaultOrbit, orbitFor, chaseFor, ORBIT_DIST_MAX, ORBIT_PITCH_MAX } from "../src/camera/follow-pose";
import type { Vec3 } from "../src/geo3d/vec";

// an aeroplane flying east along the equator at radius 1.01
const posAt = (u: number): Vec3 => {
  const a = u * 0.0001;
  return [1.01 * Math.cos(a), 0, -1.01 * Math.sin(a)];
};
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("follow orbit", () => {
  it("looks at the aeroplane and stays at the orbit distance", () => {
    const o = { yaw: 1.2, pitch: 0.4, dist: 0.3 };
    const pose = orbitFor(posAt, 100, o)!;
    expect(pose.target).toEqual(posAt(100));
    expect(dist(pose.pos, pose.target)).toBeCloseTo(0.3, 6);
  });
  it("the default orbit is the chase camera position", () => {
    const o = orbitFor(posAt, 100, defaultOrbit())!;
    const c = chaseFor(posAt, 100)!;
    expect(dist(o.pos, c.pos)).toBeLessThan(1e-6);
  });
  it("yaw moves the camera to the side", () => {
    const behind = orbitFor(posAt, 100, { ...defaultOrbit(), yaw: 0 })!;
    const side = orbitFor(posAt, 100, { ...defaultOrbit(), yaw: Math.PI / 2 })!;
    expect(dist(behind.pos, side.pos)).toBeGreaterThan(0.1);
    expect(dist(side.pos, side.target)).toBeCloseTo(dist(behind.pos, behind.target), 6);
  });
  it("clamps pitch and distance", () => {
    const c = clampOrbit({ yaw: 9, pitch: 9, dist: 99 });
    expect(c.pitch).toBe(ORBIT_PITCH_MAX);
    expect(c.dist).toBe(ORBIT_DIST_MAX);
    expect(clampOrbit({ yaw: 0, pitch: -1, dist: 0 }).pitch).toBeGreaterThan(0);
  });
});
