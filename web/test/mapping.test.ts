import { describe, expect, it } from "vitest";
import { DEPTH, radiusFor, sampleAt, tunnelXYZ, zFor } from "../src/data/mapping";
import { buildModel } from "../src/data/model";
import { FROM, flight, makeDay } from "./helpers";

describe("mapping", () => {
  it("radiusFor", () => {
    expect(radiusFor(0)).toBe(1);
    expect(radiusFor(410)).toBeCloseTo(0.3, 6);
    expect(radiusFor(900)).toBeCloseTo(0.3, 6);
    expect(radiusFor(-5)).toBe(1);
    expect(radiusFor(205)).toBeCloseTo(0.65, 6);
  });

  it("zFor", () => {
    expect(zFor(5000, 5000)).toBeCloseTo(0, 9);
    expect(zFor(0, 86400)).toBeCloseTo(-DEPTH, 6);
  });

  it("tunnelXYZ puts north up and east right", () => {
    const out = new Float32Array(6);
    tunnelXYZ(0, 0, 90, 0, out, 0);
    expect(out[0]).toBeCloseTo(1, 6);
    expect(out[1]).toBeCloseTo(0, 6);
    tunnelXYZ(0, 410, 0, 43200, out, 3);
    expect(out[3]).toBeCloseTo(0, 6);
    expect(out[4]).toBeCloseTo(0.3, 6);
    expect(out[5]).toBeCloseTo(-120, 4);
  });

  describe("sampleAt", () => {
    const m = buildModel(
      makeDay({
        flights: [
          flight({ dep: FROM + 100, arr: FROM + 400, s: [[0, 0, 0, 179], [100, 200, 2, -179], [300, 300, 4, -178]] }),
          flight({ dep: FROM + 100, arr: null, s: [[0, 50, 0, 0]] }),
        ],
      }),
    );

    it("interpolates between samples (across the antimeridian)", () => {
      const s = sampleAt(m.flights[0], 150)!;
      expect(s.alt).toBeCloseTo(100, 6);
      expect(s.lat).toBeCloseTo(1, 6);
      expect(Math.abs(s.lon)).toBeCloseTo(180, 6);
      expect(s.i).toBe(0);
    });

    it("returns null outside [first sample, end]", () => {
      expect(sampleAt(m.flights[0], 99)).toBeNull();
      expect(sampleAt(m.flights[0], 401)).toBeNull();
    });

    it("holds the last sample until the end", () => {
      expect(sampleAt(m.flights[0], 400)!.alt).toBe(300);
      expect(sampleAt(m.flights[1], 86400)!.alt).toBe(50);
    });
  });
});
