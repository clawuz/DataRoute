import { describe, expect, it } from "vitest";
import { starUV } from "../src/scene/star-uv";

describe("starUV", () => {
  it("the celestial poles map to the top/bottom rows", () => {
    expect(starUV([0, 1, 0]).v).toBeCloseTo(1, 9);
    expect(starUV([0, -1, 0]).v).toBeCloseTo(0, 9);
    expect(starUV([0, 0, 1]).v).toBeCloseTo(0.5, 9);
  });
  it("NASA convention: 0 h at the centre, right ascension increases to the left", () => {
    expect(starUV([0, 0, 1]).u).toBeCloseTo(0.5, 9); // RA 0 h
    expect(starUV([1, 0, 0]).u).toBeCloseTo(0.25, 9); // RA 6 h
    expect(starUV([0, 0, -1]).u).toBeCloseTo(0, 9); // RA 12 h (image edge)
    expect(starUV([-1, 0, 0]).u).toBeCloseTo(0.75, 9); // RA 18 h
  });
});
