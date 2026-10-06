import { Matrix4, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { CAMERA_Z } from "../src/data/mapping";
import { buildModel } from "../src/data/model";
import { collectPickPoints, pickNearest, projectToScreen } from "../src/render/picking";
import { FROM, flight, makeDay } from "./helpers";

function camera() {
  const c = new PerspectiveCamera(90, 1, 0.05, 500);
  c.position.set(0, 0, CAMERA_Z);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}

describe("picking", () => {
  const m = buildModel(
    makeDay({
      flights: [
        flight({ dep: FROM + 100, arr: null, bearing: 90, s: [[0, 0, 0, 0], [100, 100, 0, 1], [200, 200, 0, 2]] }),
        flight({ dep: FROM + 5000, arr: null, s: [[0, 0, 0, 0]] }),
      ],
    }),
  );

  it("collects strided samples up to cur plus the head", () => {
    const p = collectPickPoints(m, 350, 2);
    expect(p.count).toBe(3); // samples 0 and 2, plus the head at 350
    expect(Array.from(p.flight.slice(0, 3))).toEqual([0, 0, 0]);
    expect(p.xyz[2 * 3 + 2]).toBeCloseTo(0, 6); // head sits on the now-plane
  });

  it("projects the view axis to the screen centre", () => {
    const s = projectToScreen([0, 0, -10], new Matrix4(), camera(), 800, 600);
    expect(s.x).toBeCloseTo(400, 3);
    expect(s.y).toBeCloseTo(300, 3);
    expect(s.visible).toBe(true);
  });

  it("picks the nearest point within the radius", () => {
    const cam = camera();
    const p = collectPickPoints(m, 250, 1);
    // points: sample t=100, sample t=200, head at t=250 (index 2)
    const head = projectToScreen([p.xyz[6], p.xyz[7], p.xyz[8]], new Matrix4(), cam, 800, 800);
    expect(pickNearest(p, new Matrix4(), cam, 800, 800, head.x + 5, head.y)).toBe(0);
    expect(pickNearest(p, new Matrix4(), cam, 800, 800, 5, 5)).toBe(-1);
  });

  it("respects the world transform", () => {
    const cam = camera();
    const p = collectPickPoints(m, 250, 1);
    const rot = new Matrix4().makeRotationZ(Math.PI);
    const head = projectToScreen([p.xyz[6], p.xyz[7], p.xyz[8]], rot, cam, 800, 800);
    expect(pickNearest(p, rot, cam, 800, 800, head.x, head.y)).toBe(0);
    expect(head.x).toBeLessThan(400); // bearing 90° (east) rotated by 180° ends up on the left
  });
});
