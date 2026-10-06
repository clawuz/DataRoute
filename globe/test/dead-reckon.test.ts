import { describe, expect, it } from "vitest";
import { buildGlobeModel, type GlobeFlight } from "../src/model/globe-model";
import { EXTRAPOLATE_MAX_SEC, headState } from "../src/model/dead-reckon";
import { FROM, flight, makeDay } from "./helpers";

const one = (f: Parameters<typeof flight>[0]): GlobeFlight => buildGlobeModel(makeDay({ flights: [flight(f)] })).flights[0];

// dep = FROM → relative times start at 0; samples every 120 s along the equator, 1° apart.
const base = { dep: FROM, s: [[0, 300, 0, 0], [120, 300, 0, 1]] as [number, number, number, number][] };

describe("headState", () => {
  it("is null before the first sample", () => {
    expect(headState(one({ ...base, dep: FROM + 500 }), 100)).toBeNull();
  });

  it("interpolates observed positions", () => {
    const h = headState(one({ ...base, arr: null, end: "AIRBORNE" }), 60)!;
    expect(h).toMatchObject({ extrapolated: false, ageSec: 0 });
    expect(h.lon).toBeCloseTo(0.5, 6);
    expect(h.alt100).toBeCloseTo(300, 6);
  });

  it("extrapolates an airborne flight with the last reported speed and track", () => {
    const f = one({ ...base, arr: null, end: "AIRBORNE", now: { gs: 480, trk: 90 } });
    const h = headState(f, 180)!; // 60 s after the last sample
    expect(h.extrapolated).toBe(true);
    expect(h.ageSec).toBe(60);
    // 480 kt = 888.96 km/h → 14.816 km in 60 s → 0.13325° of longitude at the equator
    expect(h.lon).toBeCloseTo(1.13325, 3);
    expect(h.lat).toBeCloseTo(0, 4);
    expect(h.alt100).toBe(300);
  });

  it("falls back to the last segment's speed and bearing when no live report exists", () => {
    const f = one({ ...base, arr: null, end: "AIRBORNE" }); // no `now`
    const h = headState(f, 180)!;
    expect(h.extrapolated).toBe(true);
    expect(h.lon).toBeCloseTo(1.5, 2); // segment speed = 1° / 120 s → 60 s more = 0.5°
  });

  it("stops after EXTRAPOLATE_MAX_SEC", () => {
    const f = one({ ...base, arr: null, end: "AIRBORNE", now: { gs: 480, trk: 90 } });
    expect(EXTRAPOLATE_MAX_SEC).toBe(300);
    expect(headState(f, 120 + 300)).not.toBeNull();
    expect(headState(f, 120 + 301)).toBeNull();
  });

  it("never extrapolates flights that are not airborne", () => {
    const f = one({ ...base, arr: FROM + 120, end: "LAST_CONTACT" });
    expect(headState(f, 60)!.extrapolated).toBe(false);
    expect(headState(f, 121)).toBeNull();
  });

  it("does not head north when the report has unknown speed/track (gs 0, trk 0)", () => {
    const f = one({ ...base, arr: null, end: "AIRBORNE", now: { gs: 0, trk: 0 } });
    const h = headState(f, 180)!;
    expect(h.extrapolated).toBe(true);
    expect(h.lon).toBeGreaterThan(1);
    expect(Math.abs(h.lat)).toBeLessThan(1e-3);
  });
});
