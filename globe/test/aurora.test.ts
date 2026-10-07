import { describe, expect, it } from "vitest";
import { auroraBand, createAurora } from "../src/scene/aurora";

describe("auroraBand", () => {
  it("lives in the auroral ovals only, symmetric north/south", () => {
    expect(auroraBand(0)).toBe(0);
    expect(auroraBand(45)).toBe(0);
    expect(auroraBand(70)).toBeCloseTo(1, 9);
    expect(auroraBand(-70)).toBeCloseTo(1, 9);
    expect(auroraBand(88)).toBe(0);
  });
  it("fades in and out smoothly", () => {
    expect(auroraBand(62)).toBeGreaterThan(auroraBand(59));
    expect(auroraBand(79)).toBeLessThan(auroraBand(75));
  });
});

describe("createAurora", () => {
  it("is hidden by default and can be shown, timed and disposed", () => {
    const a = createAurora();
    expect(a.mesh.visible).toBe(false);
    a.setVisible(true);
    a.setSun([1, 0, 0]);
    a.setTime(12.5);
    expect(a.mesh.visible).toBe(true);
    expect(() => a.dispose()).not.toThrow();
  });
});
