import { describe, expect, it } from "vitest";
import { createPinch } from "../src/app/pinch";

describe("pinch", () => {
  it("one finger is a plain drag", () => {
    const p = createPinch();
    p.down(1, 0, 0);
    expect(p.move(1, 10, 0)).toBeNull();
    expect(p.active).toBe(false);
  });
  it("two fingers report the change of the gap", () => {
    const p = createPinch();
    p.down(1, 0, 0);
    p.down(2, 100, 0);
    expect(p.active).toBe(true);
    expect(p.move(2, 150, 0)).toBeCloseTo(50);
    expect(p.move(2, 120, 0)).toBeCloseTo(-30);
  });
  it("lifting a finger ends the pinch", () => {
    const p = createPinch();
    p.down(1, 0, 0);
    p.down(2, 100, 0);
    p.up(2);
    expect(p.active).toBe(false);
    expect(p.move(1, 5, 5)).toBeNull();
  });
});
