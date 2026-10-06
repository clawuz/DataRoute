import { describe, expect, it } from "vitest";
import { HeadSmoother, SMOOTH_SEC } from "../src/model/head-smoother";

const m = (...e: [string, [number, number]][]) => new Map<string, [number, number]>(e);

describe("HeadSmoother", () => {
  it("starts at the previous position and converges to the new one", () => {
    const s = new HeadSmoother();
    s.onSwap(m(["a", [10, 20]]), m(["a", [10.2, 20.4]]), 100);
    expect(SMOOTH_SEC).toBe(1.5);
    const [la0, lo0] = s.apply("a", 10.2, 20.4, 100);
    expect(la0).toBeCloseTo(10, 9);
    expect(lo0).toBeCloseTo(20, 9);
    const [laH, loH] = s.apply("a", 10.2, 20.4, 100.75);
    expect(laH).toBeCloseTo(10.1, 6); // smoothstep(0.5) = 0.5
    expect(loH).toBeCloseTo(20.2, 6);
    const [la1, lo1] = s.apply("a", 10.2, 20.4, 101.5);
    expect(la1).toBe(10.2);
    expect(lo1).toBe(20.4);
    expect(s.apply("a", 10.5, 20.5, 101.6)).toEqual([10.5, 20.5]); // offset discarded
  });

  it("passes unknown flights through and ignores flights missing from either side", () => {
    const s = new HeadSmoother();
    s.onSwap(m(["gone", [1, 1]]), m(["new", [2, 2]]), 0);
    expect(s.apply("gone", 1, 1, 0)).toEqual([1, 1]);
    expect(s.apply("new", 2, 2, 0)).toEqual([2, 2]);
  });

  it("takes the short way across the antimeridian", () => {
    const s = new HeadSmoother();
    s.onSwap(m(["a", [0, 179.9]]), m(["a", [0, -179.9]]), 0);
    const [, lo] = s.apply("a", 0, -179.9, 0);
    expect(Math.abs(lo)).toBeCloseTo(179.9, 6);
  });

  it("skips negligible offsets", () => {
    const s = new HeadSmoother();
    s.onSwap(m(["a", [5, 5]]), m(["a", [5, 5]]), 0);
    expect(s.apply("a", 5, 5, 0.1)).toEqual([5, 5]);
  });
});
