import { describe, expect, it } from "vitest";
import { airportSize, createAirports } from "../src/scene/airports";
import { buildGlobeModel } from "../src/model/globe-model";
import { FROM, flight, makeDay } from "./helpers";

describe("airportSize", () => {
  it("hub is largest, others grow with traffic", () => {
    expect(airportSize(0, 10, true)).toBe(14);
    expect(airportSize(1, 10, false)).toBeLessThan(airportSize(9, 10, false));
    expect(airportSize(10, 10, false)).toBeLessThanOrEqual(12);
    expect(airportSize(0, 10, false)).toBeCloseTo(4, 9);
    expect(airportSize(5, 0, false)).toBeCloseTo(4, 9); // maxCount guard
  });
});

describe("createAirports", () => {
  const model = buildGlobeModel(
    makeDay({
      flights: [
        flight({ from: "IST", to: "JFK", s: [[0, 1, 1, 1]] }),
        flight({ from: "LHR", to: "IST", s: [[0, 1, 1, 1]] }),
      ],
    }),
  );

  it("marks every airport with traffic plus the hub, at true positions", () => {
    const a = createAirports(model);
    expect(a.codes.sort()).toEqual(["IST", "JFK", "LHR"]);
    const pos = a.points.geometry.getAttribute("position");
    expect(pos.count).toBe(3);
    a.dispose();
  });

  it("pulse records the wall-clock time on the matching airport only", () => {
    const a = createAirports(model);
    a.pulse("JFK", 123);
    const pulse = a.points.geometry.getAttribute("aPulse");
    const i = a.codes.indexOf("JFK");
    expect(pulse.getX(i)).toBe(123);
    expect(pulse.getX(a.codes.indexOf("IST"))).toBe(-1e9);
    a.pulse("XXX", 5); // unknown code is ignored
    a.dispose();
  });

  it("still marks IST on an empty model", () => {
    const empty = buildGlobeModel(makeDay({ flights: [] }));
    const a = createAirports(empty);
    expect(a.codes).toEqual(["IST"]);
    a.dispose();
  });
});
