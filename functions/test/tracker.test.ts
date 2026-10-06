import { describe, expect, it } from "vitest";
import type { AircraftState, RouteInfo, TrackedFlight, TrackerState } from "../src/day-schema.js";
import { GAP, RESUME_WINDOW, WINDOW, emptyState, endOf, isLanded, step } from "../src/tracker.js";

const T0 = 1_800_000_000;
const ac = (o: Partial<AircraftState> = {}): AircraftState => ({
  icao24: "abc123",
  cs: "THY1",
  t: T0,
  lat: 41,
  lon: 29,
  alt100: 100,
  onGround: false,
  gs: 300,
  trk: 300,
  ...o,
});

const ESB = { iata: "ESB", country: "TR", lat: 41.01, lon: 29.05 }; // 150 km radius contains (41, 29)
const JFK = { iata: "JFK", country: "US", lat: 40.6398, lon: -73.7789 };
const IST = { iata: "IST", country: "TR", lat: 41.2613, lon: 28.742 };
const toESB: RouteInfo = { origin: IST, destination: ESB };
const toJFK: RouteInfo = { origin: IST, destination: JFK };

describe("tracker.step", () => {
  it("opens a flight for an airborne aircraft", () => {
    const s = step(emptyState(T0), [ac()], T0);
    expect(s.flights).toHaveLength(1);
    expect(s.flights[0]).toMatchObject({ id: `abc123-${T0}`, cs: "THY1", dep: T0, arr: null, end: "AIRBORNE", lastContact: T0 });
    expect(s.flights[0].samples).toEqual([[T0, 100, 41, 29]]);
    expect(s.flights[0].now).toEqual({ gs: 300, trk: 300 });
    expect(s.lastSuccessAt).toBe(T0);
  });

  it("ignores aircraft on ground with no open flight", () => {
    expect(step(emptyState(T0), [ac({ onGround: true })], T0).flights).toHaveLength(0);
  });

  it("appends samples, rounds coords, reuses previous altitude when null", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + 120, alt100: null, lat: 41.123456, lon: 29.987654 })], T0 + 120);
    expect(s.flights[0].samples[1]).toEqual([T0 + 120, 100, 41.1235, 29.9877]);
  });

  it("skips non-advancing timestamps", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac()], T0 + 120);
    expect(s.flights[0].samples).toHaveLength(1);
  });

  it("closes on landing", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + 600, onGround: true })], T0 + 600);
    expect(s.flights[0]).toMatchObject({ arr: T0 + 600, end: "LANDED" });
    expect(s.flights[0].now).toBeUndefined();
  });

  it("starts a new flight after landing and taking off again", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + 600, onGround: true })], T0 + 600);
    s = step(s, [ac({ t: T0 + 3600 })], T0 + 3600);
    expect(s.flights.map((f) => f.arr)).toEqual([T0 + 600, null]);
    expect(s.flights.map((f) => f.end)).toEqual(["LANDED", "AIRBORNE"]);
  });

  it("starts a new flight when the callsign changes", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + 120, cs: "THY2" })], T0 + 120);
    expect(s.flights).toHaveLength(2);
    expect(s.flights[0].arr).toBe(T0);
    expect(s.flights[0].end).toBe("LAST_CONTACT");
    expect(s.flights[1].cs).toBe("THY2");
  });

  it("merges a returning aircraft after a coverage gap into the same flight", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + GAP + 1, lat: 41.2, lon: 29.2 })], T0 + GAP + 1);
    expect(s.flights).toHaveLength(1);
    expect(s.flights[0]).toMatchObject({ arr: null, end: "AIRBORNE" });
    expect(s.flights[0].gaps).toEqual([[T0, T0 + GAP + 1]]);
    expect(s.flights[0].samples).toHaveLength(2);
  });

  it("does not merge across a physically impossible jump", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + GAP + 1, lat: -30, lon: 150 })], T0 + GAP + 1);
    expect(s.flights).toHaveLength(2);
    expect(s.flights[0]).toMatchObject({ end: "LAST_CONTACT", arr: T0 });
    expect(s.flights[1]).toMatchObject({ end: "AIRBORNE", arr: null });
  });

  it("marks silent flights LAST_CONTACT after the gap and keeps them resumable", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [], T0 + GAP);
    expect(s.flights[0].arr).toBeNull();
    s = step(s, [], T0 + GAP + 1);
    expect(s.flights[0]).toMatchObject({ arr: T0, end: "LAST_CONTACT" });
    // reappears 3 h later within reach
    s = step(s, [ac({ t: T0 + 10800, lat: 41.5, lon: 29.5 })], T0 + 10800);
    expect(s.flights).toHaveLength(1);
    expect(s.flights[0]).toMatchObject({ arr: null, end: "AIRBORNE" });
    expect(s.flights[0].gaps).toEqual([[T0, T0 + 10800]]);
  });

  it("does not resume after the 14 h resume window", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [], T0 + GAP + 1);
    const late = T0 + RESUME_WINDOW + 1;
    s = step(s, [ac({ t: late })], late);
    expect(s.flights).toHaveLength(2);
    expect(s.flights[0].end).toBe("LAST_CONTACT");
  });

  it("classifies a silent flight near its destination at low altitude as LANDED", () => {
    let s = step(emptyState(T0), [ac({ alt100: 40 })], T0);
    s.flights[0].route = toESB;
    s = step(s, [], T0 + GAP + 1);
    expect(s.flights[0]).toMatchObject({ end: "LANDED", arr: T0 });
  });

  it("classifies a silent high-altitude flight far from its destination as LAST_CONTACT", () => {
    let s = step(emptyState(T0), [ac({ alt100: 370 })], T0);
    s.flights[0].route = toJFK;
    s = step(s, [], T0 + GAP + 1);
    expect(s.flights[0]).toMatchObject({ end: "LAST_CONTACT", arr: T0 });
  });

  it("a ground sighting of a resumable flight resumes and lands it", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [], T0 + GAP + 1);
    s = step(s, [ac({ t: T0 + 7200, onGround: true, lat: 41.3, lon: 29.3 })], T0 + 7200);
    expect(s.flights).toHaveLength(1);
    expect(s.flights[0]).toMatchObject({ end: "LANDED", arr: T0 + 7200 });
    expect(s.flights[0].gaps).toEqual([[T0, T0 + 7200]]);
  });

  it("prunes flights that landed before the window, trims old samples and gaps", () => {
    const late = T0 + 700 + WINDOW - 60;
    const prev: TrackerState = {
      v: 1,
      collectingSince: T0,
      lastSuccessAt: late,
      flights: [
        { id: "a", icao24: "a", cs: "THY1", dep: T0, arr: T0 + 600, lastContact: T0 + 600, samples: [[T0, 100, 41, 29]] },
        {
          id: "b", icao24: "b", cs: "THY9", dep: T0 + 700, arr: null, lastContact: late,
          samples: [[T0 + 700, 100, 41, 29], [late, 100, 41, 29]],
          gaps: [[T0 + 690, T0 + 700], [late - 200, late - 100]], // first gap ends before the cutoff (T0 + 701)
        },
      ],
    };
    const now = T0 + 701 + WINDOW; // cutoff = T0 + 701
    const s = step(prev, [], now);
    expect(s.flights.map((f) => f.cs)).toEqual(["THY9"]);
    expect(s.flights[0].arr).toBeNull();
    expect(s.flights[0].dep).toBe(T0 + 700);
    expect(s.flights[0].samples).toEqual([[late, 100, 41, 29]]);
    expect(s.flights[0].gaps).toEqual([[late - 200, late - 100]]);
  });

  it("does not mutate the previous state", () => {
    let a = step(emptyState(T0), [ac()], T0);
    a = step(a, [ac({ t: T0 + GAP + 1, lat: 41.2, lon: 29.2 })], T0 + GAP + 1); // creates gaps
    const snapshot = JSON.stringify(a);
    step(a, [ac({ t: T0 + GAP + 121, lat: 41.3, lon: 29.3 })], T0 + GAP + 121);
    expect(JSON.stringify(a)).toBe(snapshot);
  });

  it("preserves collectingSince and route", () => {
    const prev: TrackerState = step(emptyState(T0 - 50), [ac()], T0);
    prev.flights[0].route = null;
    const s = step(prev, [ac({ t: T0 + 120 })], T0 + 120);
    expect(s.collectingSince).toBe(T0 - 50);
    expect(s.flights[0].route).toBeNull();
  });
});

describe("isLanded / endOf", () => {
  const flight = (o: Partial<TrackedFlight>): TrackedFlight => ({
    id: "x", icao24: "x", cs: "THY1", dep: T0, arr: T0 + 100, lastContact: T0 + 100, samples: [[T0 + 100, 40, 41, 29]], ...o,
  });

  it("route known: needs low altitude AND ≤150 km from the destination", () => {
    expect(isLanded(flight({ route: toESB }))).toBe(true);
    expect(isLanded(flight({ route: toJFK }))).toBe(false); // far away
    expect(isLanded(flight({ route: toESB, samples: [[T0, 200, 41, 29]] }))).toBe(false); // too high
  });

  it("no route: only a very low last altitude counts", () => {
    expect(isLanded(flight({ route: null, samples: [[T0, 20, 41, 29]] }))).toBe(true);
    expect(isLanded(flight({ route: undefined, samples: [[T0, 40, 41, 29]] }))).toBe(false);
  });

  it("no samples → not landed", () => {
    expect(isLanded(flight({ samples: [] }))).toBe(false);
  });

  it("endOf honours an explicit end and classifies legacy rows", () => {
    expect(endOf(flight({ end: "LAST_CONTACT", route: toESB }))).toBe("LAST_CONTACT");
    expect(endOf(flight({ arr: null }))).toBe("AIRBORNE");
    expect(endOf(flight({ route: toESB }))).toBe("LANDED"); // legacy, but actually near destination
    expect(endOf(flight({ route: toJFK }))).toBe("LAST_CONTACT");
  });
});
