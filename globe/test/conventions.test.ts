import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { earthRotationRad, subSolarPoint, sunDirection } from "../src/astro";
import { latLonToVec3 } from "../src/geo3d/vec";

const rotY = (v: [number, number, number], a: number) => new Vector3(...v).applyMatrix4(new Matrix4().makeRotationY(a));
const at = (iso: string) => Date.parse(iso) / 1000;

describe("Earth rotation / sphere / sun conventions", () => {
  it("Greenwich rotated by the Earth rotation angle points at (sinθ, 0, cosθ)", () => {
    const t = at("2026-10-06T12:00:00Z");
    const θ = earthRotationRad(t);
    const v = rotY(latLonToVec3(0, 0), θ);
    expect(v.x).toBeCloseTo(Math.sin(θ), 9);
    expect(v.y).toBeCloseTo(0, 9);
    expect(v.z).toBeCloseTo(Math.cos(θ), 9);
  });

  it("east longitudes move toward +x after rotation (the Earth turns eastward)", () => {
    const a = rotY(latLonToVec3(0, 10), 0.1);
    const b = rotY(latLonToVec3(0, 0), 0.1);
    expect(Math.atan2(a.x, a.z)).toBeGreaterThan(Math.atan2(b.x, b.z));
    expect(Math.atan2(b.x, b.z)).toBeCloseTo(0.1, 9); // +θ about +Y carries +z toward +x
  });

  it("the sub-solar surface point, rotated into the inertial frame, lies along the sun direction", () => {
    for (const iso of ["2026-10-06T12:00:00Z", "2026-03-20T03:30:00Z", "2026-07-01T21:15:00Z", "2026-12-21T00:00:00Z"]) {
      const t = at(iso);
      const p = subSolarPoint(t);
      const v = rotY(latLonToVec3(p.latDeg, p.lonDeg), earthRotationRad(t));
      const s = sunDirection(t);
      expect(v.x).toBeCloseTo(s[0], 6);
      expect(v.y).toBeCloseTo(s[1], 6);
      expect(v.z).toBeCloseTo(s[2], 6);
    }
  });

  it("Istanbul is on the sunlit side at 12:00 UTC and in the dark at 00:00 UTC", () => {
    const ist = latLonToVec3(41.26, 28.74);
    const lit = (iso: string) => {
      const t = at(iso);
      const world = rotY(ist, earthRotationRad(t));
      const s = sunDirection(t);
      return world.dot(new Vector3(...s));
    };
    expect(lit("2026-10-06T12:00:00Z")).toBeGreaterThan(0.5);
    expect(lit("2026-10-06T00:00:00Z")).toBeLessThan(-0.5);
  });
});
