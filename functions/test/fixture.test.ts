import { describe, expect, it } from "vitest";
import { initialBearing } from "../src/geo.js";
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

  it("has flights airborne at window start, trimmed samples and UNK flights", () => {
    const from = day.window.from;
    const airborneAtStart = day.flights.filter((f) => f.dep < from && (f.arr === null || f.arr > from)).length;
    expect(airborneAtStart).toBeGreaterThan(100);
    expect(day.flights.some((f) => f.s[0][0] > 0)).toBe(true);
    const unk = day.flights.filter((f) => f.region === "UNK").length;
    expect(unk).toBeGreaterThan(0);
    expect(unk / day.flights.length).toBeLessThan(0.1);
  });

  it("airborne heading follows the path", () => {
    for (const f of day.flights.filter((x) => x.now && x.s.length > 1).slice(0, 50)) {
      const [, , la1, lo1] = f.s[f.s.length - 2];
      const [, , la2, lo2] = f.s[f.s.length - 1];
      const brg = initialBearing(la1, lo1, la2, lo2);
      const d = Math.abs(((f.now!.trk - brg + 540) % 360) - 180);
      expect(d).toBeLessThan(0.2);
    }
  });

  it("publishes airports, flight ends and some coverage gaps", () => {
    expect(day.airports!.IST).toBeDefined();
    expect(Object.keys(day.airports!).length).toBeGreaterThan(40);
    expect(day.flights.every((f) => f.end)).toBe(true);
    expect(day.flights.some((f) => f.end === "LAST_CONTACT")).toBe(true);
    expect(day.flights.some((f) => f.end === "LANDED")).toBe(true);
    expect(day.flights.some((f) => f.gaps && f.gaps.length > 0)).toBe(true);
  });

  it("only airborne flights are AIRBORNE", () => {
    for (const f of day.flights) expect(f.end === "AIRBORNE").toBe(f.arr === null);
  });
});
