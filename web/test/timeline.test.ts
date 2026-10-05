import { describe, expect, it } from "vitest";
import { REGION_HEX, hexToRgb } from "../src/data/palette";
import { buildModel } from "../src/data/model";
import { buildTimeline, flowFor, statsAt, tintFor } from "../src/data/timeline";
import { FROM, flight, makeDay } from "./helpers";

const day = makeDay({
  generatedAt: FROM + 3600,
  flights: [
    flight({ id: "a", from: "IST", to: "JFK", region: "AME", dep: FROM, arr: FROM + 1200, s: [[0, 300, 0, 0], [1200, 0, 0, 1]] }),
    flight({ id: "b", from: "LHR", to: "IST", region: "EUR", dep: FROM + 600, arr: null, s: [[0, 0, 50, 0], [600, 350, 50, 1]] }),
    flight({ id: "c", from: "IST", to: "JFK", region: "AME", dep: FROM - 7200, arr: FROM + 120, s: [[7200, 20, 40, 28]] }),
  ],
});
const m = buildModel(day);
const tl = buildTimeline(m);

describe("timeline", () => {
  it("bucket count", () => {
    expect(tl.buckets).toBe(61);
  });

  it("airborne, flights, destinations over time", () => {
    expect(statsAt(tl, 60)).toMatchObject({ airborne: 2, flights: 2, destinations: 1 }); // a + c in air
    expect(statsAt(tl, 900)).toMatchObject({ airborne: 2, flights: 3, destinations: 2 }); // a + b
    expect(statsAt(tl, 3000)).toMatchObject({ airborne: 1, flights: 3, destinations: 2 }); // b only
  });

  it("region airborne counts", () => {
    const s = statsAt(tl, 900).regionAirborne;
    expect(s[1]).toBe(1); // EUR (b)
    expect(s[5]).toBe(1); // AME (a)
  });

  it("km accumulates by segment end time", () => {
    expect(statsAt(tl, 1199).km).toBeCloseTo(0, 6);
    expect(statsAt(tl, 1200).km).toBeCloseTo(111.19 + 71.47, 0);
  });

  it("departures per hour count only in-window departures", () => {
    expect(tl.depHourly[0]).toBe(2);
    expect(tl.depHourly.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("clamps out-of-range lookups", () => {
    expect(statsAt(tl, -500).flights).toBe(statsAt(tl, 0).flights);
    expect(statsAt(tl, 99999).airborne).toBe(statsAt(tl, 3600).airborne);
  });

  it("flowFor maps airborne count into [0.6, 1.4]", () => {
    expect(tl.minAir).toBe(1);
    expect(tl.maxAir).toBe(2);
    expect(flowFor(tl, 900)).toBeCloseTo(1.4, 6);
    expect(flowFor(tl, 3000)).toBeCloseTo(0.6, 6);
  });

  it("tintFor weights region colours by airborne count", () => {
    expect(tintFor([0, 0, 0, 0, 0, 0, 0])).toEqual([1, 1, 1]);
    expect(tintFor([0, 5, 0, 0, 0, 0, 0])).toEqual(hexToRgb(REGION_HEX.EUR));
    const mix = tintFor([0, 1, 0, 0, 0, 1, 0]);
    expect(mix[0]).toBeCloseTo((hexToRgb(REGION_HEX.EUR)[0] + hexToRgb(REGION_HEX.AME)[0]) / 2, 6);
  });
});
