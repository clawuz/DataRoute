import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import { HeadSmoother } from "../src/model/head-smoother";
import { HEAD_LIFT, computeHeads, createHeads, headLatLons, type HeadBuffers } from "../src/scene/heads";
import { ARC_BASE_LIFT } from "../src/scene/arcs";
import { altitudeRadius } from "../src/geo3d/vec";
import { REGION_RGB } from "@web/data/palette";
import { altTone } from "../src/scene/alt-tone";
import { FROM, flight, makeDay } from "./helpers";

const model = buildGlobeModel(
  makeDay({
    flights: [
      flight({ id: "a", region: "EUR", dep: FROM + 1000, arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [120, 300, 0, 1]], now: { gs: 480, trk: 90 } }),
      flight({ id: "b", region: "AME", dep: FROM + 1000, arr: FROM + 1060, end: "LAST_CONTACT", s: [[0, 200, 10, 10], [60, 200, 10, 11]] }),
    ],
  }),
);
const buffers = (n = 8): HeadBuffers => ({ pos: new Float32Array(n * 3), color: new Float32Array(n * 3), flight: new Float32Array(n), flag: new Float32Array(n) });

describe("computeHeads", () => {
  it("observed heads carry region colour, flight index and no extrapolation flag", () => {
    const out = buffers();
    const r = computeHeads(model, 1060, 0, null, out);
    expect(r).toEqual({ count: 2, extrapolated: 0 });
    expect(Array.from(out.color.slice(0, 3))).toEqual(altTone(REGION_RGB[1], 300).map(Math.fround));
    expect(Array.from(out.flight.slice(0, 2))).toEqual([0, 1]);
    const len = Math.hypot(out.pos[0], out.pos[1], out.pos[2]);
    expect(len).toBeCloseTo(altitudeRadius(300) + ARC_BASE_LIFT + HEAD_LIFT, 4);
  });

  it("extrapolated heads are flagged and counted; heads past their end disappear", () => {
    const out = buffers();
    const r = computeHeads(model, 1000 + 180, 0, null, out); // a: 60 s past its last sample; b: ended at 1060
    expect(r).toEqual({ count: 1, extrapolated: 1 });
    expect(out.flag[0]).toBe(1);
  });

  it("respects the capacity", () => {
    expect(computeHeads(model, 1060, 0, null, buffers(1), 1).count).toBe(1);
  });

  it("applies the smoother offsets", () => {
    const s = new HeadSmoother();
    s.onSwap(new Map([["a", [5, 5]]]), new Map([["a", [0, 0.5]]]), 10);
    const out = buffers();
    computeHeads(model, 1060, 10, s, out);
    // flight a at cur=1060 is at lon 0.5; offset pulls it towards (5,5) at t0
    const lat = (Math.asin(out.pos[1] / Math.hypot(out.pos[0], out.pos[1], out.pos[2])) * 180) / Math.PI;
    expect(lat).toBeCloseTo(5, 3);
  });
});

describe("headLatLons", () => {
  it("lists airborne heads by flight id", () => {
    const m = headLatLons(model, 1060);
    expect(m.has("a")).toBe(true);
    expect(m.has("b")).toBe(false); // not airborne
    expect(m.get("a")![1]).toBeCloseTo(0.5, 6);
  });
});

describe("createHeads", () => {
  it("sets the draw range from update()", () => {
    const h = createHeads();
    const r = h.update(model, 1060, 0, -1, null);
    expect(r.count).toBe(2);
    expect(h.points.geometry.drawRange.count).toBe(2);
    expect(h.data.count).toBe(2);
    h.dispose();
  });
});
