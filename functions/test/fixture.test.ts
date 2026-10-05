import { describe, expect, it } from "vitest";
import { makeFixture } from "../scripts/make-fixture.js";

describe("makeFixture", () => {
  const NOW = 1_800_000_000;
  const day = makeFixture(NOW, 42);

  it("is deterministic", () => {
    expect(JSON.stringify(makeFixture(NOW, 42))).toBe(JSON.stringify(day));
  });

  it("has a realistic volume and mix", () => {
    expect(day.stats.flights24h).toBeGreaterThan(1500);
    expect(day.stats.flights24h).toBeLessThan(2300);
    expect(day.stats.airborne).toBeGreaterThan(150);
    expect(day.stats.airborne).toBeLessThan(600);
    const regions = new Set(day.flights.map((f) => f.region));
    for (const r of ["DOM", "EUR", "MEA", "AFR", "ASI", "AME"]) expect(regions.has(r as never)).toBe(true);
  });

  it("samples stay in the window and below FL420", () => {
    for (const f of day.flights) {
      for (const [dt, alt] of f.s) {
        expect(f.dep + dt).toBeLessThanOrEqual(NOW);
        expect(f.dep + dt).toBeGreaterThanOrEqual(NOW - 86400);
        expect(alt).toBeLessThanOrEqual(420);
      }
    }
  });
});
