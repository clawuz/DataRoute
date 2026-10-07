import { describe, expect, it } from "vitest";
import { cloudShadowShift, smoothstep } from "../src/scene/light";

describe("light", () => {
  it("smoothstep clamps", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 9);
  });
});

describe("cloudShadowShift", () => {
  const k = 0.02;
  it("sun to the east of a point on the equator shifts the lookup east (+u)", () => {
    const { du, dv } = cloudShadowShift([1, 0, 0], [0, 0, 1], k);
    expect(du).toBeCloseTo(k / (2 * Math.PI), 9);
    expect(dv).toBeCloseTo(0, 9);
  });
  it("sun to the north shifts the lookup north (+v)", () => {
    const { du, dv } = cloudShadowShift([0, 1, 0], [0, 0, 1], k);
    expect(du).toBeCloseTo(0, 9);
    expect(dv).toBeCloseTo(k / Math.PI, 9);
  });
  it("sun straight overhead casts no offset", () => {
    const { du, dv } = cloudShadowShift([0, 0, 1], [0, 0, 1], k);
    expect(du).toBeCloseTo(0, 12);
    expect(dv).toBeCloseTo(0, 12);
  });
  it("stays finite at the poles", () => {
    const r = cloudShadowShift([1, 0, 0], [0, 1, 0], k);
    expect(Number.isFinite(r.du) && Number.isFinite(r.dv)).toBe(true);
  });
});
