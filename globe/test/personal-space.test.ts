import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
import { buildRoutes } from "../src/personal/routes";
import { destinationOf } from "../src/personal/destinations";
import { midLon, panOf, sendOf, wetOf } from "../src/personal/space";

const west = { fromLon: 28.8, toLon: -73.8, distKm: 8000 };
const east = { fromLon: 28.8, toLon: 140.4, distKm: 9000 };

describe("space from the map", () => {
  it("finds the middle of a route the short way round, also over the date line", () => {
    expect(midLon(west)).toBeCloseTo(-22.5, 0);
    expect(Math.abs(Math.abs(midLon({ fromLon: 170, toLon: -170 })) - 180)).toBeLessThan(1);
  });
  it("puts the west on the left and the east on the right, like the map", () => {
    expect(panOf(west, 28.8, "pluck")).toBeLessThan(-0.4);
    expect(panOf(east, 28.8, "pluck")).toBeGreaterThan(0.4);
    expect(Math.abs(panOf(east, 28.8, "pluck"))).toBeLessThanOrEqual(0.8);
  });
  it("keeps the bass and the kick near the centre and the melody wide", () => {
    for (const r of [west, east]) {
      expect(Math.abs(panOf(r, 28.8, "bass"))).toBeLessThan(Math.abs(panOf(r, 28.8, "hook")));
      expect(Math.abs(panOf(r, 28.8, "kick"))).toBeLessThan(Math.abs(panOf(r, 28.8, "pluck")));
    }
  });
  it("gives longer routes more room and the bass less", () => {
    expect(wetOf({ distKm: 9000 }, "pluck")).toBeGreaterThan(wetOf({ distKm: 500 }, "pluck"));
    expect(wetOf({ distKm: 9000 }, "bass")).toBeLessThan(wetOf({ distKm: 9000 }, "pluck"));
    expect(wetOf({ distKm: 20000 }, "pluck")).toBeCloseTo(0.5, 6);
  });
  it("sorts a wet amount into one of three sends", () => {
    expect([sendOf(0.1), sendOf(0.3), sendOf(0.5)]).toEqual([0, 1, 2]);
  });
  it("is on every note of a composed piece, west left, east right", () => {
    const routes = buildRoutes(["JFK", "NRT", "LHR", "DEL"], "IST");
    const p = composePiece("visited", routes);
    const home = destinationOf("IST")!.lon;
    expect(p.notes.every((n) => typeof n.pan === "number" && Math.abs(n.pan) <= 0.8 && typeof n.wet === "number" && n.wet >= 0 && n.wet <= 0.5)).toBe(true);
    const sign = (to: string): number[] => p.notes.filter((n) => routes[n.route].to === to).map((n) => n.pan!);
    expect(Math.min(...sign("JFK"))).toBeLessThan(0);
    expect(Math.max(...sign("JFK"))).toBeLessThanOrEqual(0);
    expect(Math.max(...sign("NRT"))).toBeGreaterThan(0);
    expect(Math.min(...sign("NRT"))).toBeGreaterThanOrEqual(0);
    expect(home).toBeGreaterThan(0);
  });
});
