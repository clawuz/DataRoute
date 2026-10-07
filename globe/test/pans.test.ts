import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import { routeMidpoints } from "../src/audio/pans";
import { FROM, flight, makeDay } from "./helpers";

const f = (from: string, to: string, dep: number) =>
  flight({ from, to, region: "EUR", dep: FROM + dep, arr: null, end: "AIRBORNE", s: [[0, 300, 41, 29], [600, 370, 45, 10]] });
const mk = (fl: ReturnType<typeof flight>[]) => buildGlobeModel(makeDay({ flights: fl }));

describe("routeMidpoints", () => {
  it("merges both directions and counts", () => {
    const r = routeMidpoints(mk([f("IST", "JFK", 100), f("JFK", "IST", 200), f("IST", "LHR", 300)]));
    expect(r.find((x) => x.key === "IST-JFK")?.count).toBe(2);
    expect(r.length).toBe(2);
  });
  it("sorts by count desc then key, and honours the limit", () => {
    const m = mk([f("IST", "LHR", 100), f("IST", "ESB", 200), f("IST", "JFK", 300), f("IST", "JFK", 400)]);
    expect(routeMidpoints(m).map((x) => x.key)).toEqual(["IST-JFK", "ESB-IST", "IST-LHR"]);
    expect(routeMidpoints(m, 2).map((x) => x.key)).toEqual(["IST-JFK", "ESB-IST"]);
  });
  it("the IST-JFK midpoint lies between the endpoints", () => {
    const m = mk([f("IST", "JFK", 100)]);
    const pl = m.flights[0].planned!;
    const [r] = routeMidpoints(m);
    expect(r.lat).toBeGreaterThan(Math.min(pl.fromLat, pl.toLat));
    expect(r.lat).toBeLessThan(Math.max(pl.fromLat, pl.toLat) + 30);
    expect(r.lon).toBeGreaterThan(Math.min(pl.fromLon, pl.toLon));
    expect(r.lon).toBeLessThan(Math.max(pl.fromLon, pl.toLon));
  });
  it("skips flights without a planned route", () => {
    const m = mk([flight({ region: "EUR", dep: FROM + 100, arr: null, end: "AIRBORNE", s: [[0, 300, 41, 29], [600, 370, 45, 10]] })]);
    expect(routeMidpoints(m)).toEqual([]);
  });
});
