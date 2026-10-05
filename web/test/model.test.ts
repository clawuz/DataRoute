import { describe, expect, it } from "vitest";
import { buildModel } from "../src/data/model";
import { FROM, flight, makeDay } from "./helpers";

describe("buildModel", () => {
  const day = makeDay({
    collectingSince: FROM + 3600,
    flights: [
      flight({ id: "a", from: "IST", to: "JFK", dep: FROM + 500, arr: null, s: [[0, 0, 41, 29], [120, 100, 41.5, 28]], now: { gs: 480, trk: 300 } }),
      flight({ id: "b", from: "JFK", to: "SAW", dep: FROM + 1000, arr: FROM + 1050, s: [[0, 300, 40, 0], [120, 10, 40, 1]] }),
      flight({ id: "c", from: "FRA", to: "ADB", region: "UNK", dep: FROM - 3600, arr: FROM + 7200, s: [[3700, 350, 45, 10]] }),
      flight({ id: "empty", s: [] }),
    ],
  });
  const m = buildModel(day);

  it("header", () => {
    expect(m.from).toBe(FROM);
    expect(m.span).toBe(86400);
    expect(m.replayStart).toBe(3600);
    expect(m.source).toEqual({ name: "adsb.fi", url: "https://adsb.fi" });
    expect(m.flights.map((f) => f.id)).toEqual(["a", "b", "c"]); // empty flight dropped
    expect(m.segments).toBe(2);
  });

  it("relative times and arrays", () => {
    const a = m.flights[0];
    expect(Array.from(a.t)).toEqual([500, 620]);
    expect(Array.from(a.alt)).toEqual([0, 100]);
    expect(a.dep).toBe(500);
    expect(a.airborne).toBe(true);
    expect(a.end).toBe(86400);
    expect(a.gs).toBe(480);
  });

  it("clamps an arrival earlier than the last sample", () => {
    expect(m.flights[1].end).toBe(1120);
  });

  it("tolerates departures before the window and trimmed samples", () => {
    const c = m.flights[2];
    expect(c.dep).toBe(-3600);
    expect(Array.from(c.t)).toEqual([100]);
    expect(c.end).toBe(7200);
  });

  it("other end and region index", () => {
    expect(m.flights.map((f) => f.other)).toEqual(["JFK", "JFK", "ADB"]);
    expect(m.flights[2].regionIdx).toBe(6);
    expect(m.flights[0].regionIdx).toBe(1);
  });

  it("replayStart is clamped into [0, span]", () => {
    expect(buildModel(makeDay({ collectingSince: FROM - 999 })).replayStart).toBe(0);
    expect(buildModel(makeDay({ collectingSince: FROM + 999999 })).replayStart).toBe(86400);
  });
});
