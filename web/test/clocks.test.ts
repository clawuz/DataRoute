import { describe, expect, it } from "vitest";
import { PULSE_PERIOD, TUNNEL_PERIOD, advance } from "../src/render/clocks";

describe("clocks", () => {
  it("exposes the shader periods", () => {
    expect(TUNNEL_PERIOD).toBeCloseTo(4 * Math.PI, 12);
    expect(PULSE_PERIOD).toBeCloseTo(2 * Math.PI, 12);
  });

  it("wraps past the period", () => {
    expect(advance(TUNNEL_PERIOD - 0.1, 0.3, TUNNEL_PERIOD)).toBeCloseTo(0.2, 9);
  });

  it("stays within [0, period)", () => {
    for (const d of [0, 0.016, 0.1, 3, 100]) {
      const v = advance(PULSE_PERIOD - 0.001, d, PULSE_PERIOD);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(PULSE_PERIOD);
    }
  });

  it("10 million small steps stay below the period", () => {
    let v = 0;
    for (let i = 0; i < 10_000_000; i++) v = advance(v, 0.016, TUNNEL_PERIOD);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(TUNNEL_PERIOD);
  });
});
