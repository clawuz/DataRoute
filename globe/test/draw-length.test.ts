import { describe, expect, it } from "vitest";
import { drawLength } from "../src/personal/flight";

describe("drawLength", () => {
  it("a longer route draws longer notes for the same note and gap", () => {
    const a = drawLength(0, 0.3, 2);
    const b = drawLength(0.5, 0.3, 2);
    const c = drawLength(1, 0.3, 2);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThanOrEqual(2 * 0.92 + 1e-9);
  });
  it("a last note of a long route is still held", () => {
    expect(drawLength(1, 0.2, null)).toBeGreaterThan(drawLength(0, 0.2, null));
  });
});
