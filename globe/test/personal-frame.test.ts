import { describe, expect, it } from "vitest";
import { tripView } from "../src/personal/frame";
import { buildRoutes } from "../src/personal/routes";

describe("tripView", () => {
  it("a domestic trip is framed close, at the middle of its routes, without spinning away", () => {
    const v = tripView(buildRoutes(["ESB", "ADB", "AYT"], "IST"));
    expect(v.dist).toBeLessThan(2.6);
    expect(v.lat).toBeGreaterThan(36);
    expect(v.lat).toBeLessThan(42);
    expect(v.lon).toBeGreaterThan(26);
    expect(v.lon).toBeLessThan(34);
    expect(v.spin).toBe(false);
  });
  it("a world trip keeps the whole globe and the idle spin", () => {
    const v = tripView(buildRoutes(["NRT", "LOS", "GRU", "LHR", "DEL", "CAI"], "IST"));
    expect(v.dist).toBeCloseTo(3.2, 5);
    expect(v.spin).toBe(true);
  });
  it("no routes: the default view", () => {
    expect(tripView([]).dist).toBe(3.2);
  });
});
