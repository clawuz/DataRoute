import { Matrix4, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import { buildPickIndex, pickFlight } from "../src/scene/picking3d";
import { FROM, flight, makeDay } from "./helpers";

const model = buildGlobeModel(
  makeDay({
    flights: [
      flight({ id: "front", dep: FROM + 100, s: [[0, 0, 0, 0], [120, 0, 0.5, 0.5]] }), // faces the camera (lon 0)
      flight({ id: "back", dep: FROM + 100, s: [[0, 0, 0, 180], [120, 0, 0, 179]] }), // far side
    ],
  }),
);
const camera = () => {
  const c = new PerspectiveCamera(40, 1, 0.05, 50);
  c.position.set(0, 0, 3.2);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
};

describe("buildPickIndex", () => {
  it("indexes samples with stride and always the last sample", () => {
    const idx = buildPickIndex(model, 3);
    expect(idx.count).toBe(4); // each flight: sample 0 and the last (1)
    expect(Array.from(idx.flight)).toEqual([0, 0, 1, 1]);
  });
});

describe("pickFlight", () => {
  const idx = buildPickIndex(model, 1);
  const cur = 1000;

  it("picks the flight under the cursor", () => {
    expect(pickFlight(idx, null, cur, new Matrix4(), camera(), 800, 800, 400, 400)).toBe(0);
  });

  it("ignores points on the far side of the Earth", () => {
    // 'back' projects to the screen centre too, but is hidden behind the globe
    const camBack = camera();
    expect(pickFlight(idx, null, cur, new Matrix4(), camBack, 800, 800, 400, 400)).toBe(0);
  });

  it("returns -1 away from every point and for points in the future", () => {
    expect(pickFlight(idx, null, cur, new Matrix4(), camera(), 800, 800, 20, 20)).toBe(-1);
    expect(pickFlight(idx, null, 50, new Matrix4(), camera(), 800, 800, 400, 400)).toBe(-1); // before dep
  });

  it("also picks heads", () => {
    const heads = { pos: new Float32Array([0, 0, 1.01]), flight: new Float32Array([1]), count: 1 };
    const none = buildPickIndex(model, 1);
    none.count = 0;
    expect(pickFlight(none, heads, cur, new Matrix4(), camera(), 800, 800, 400, 400)).toBe(1);
  });
});
