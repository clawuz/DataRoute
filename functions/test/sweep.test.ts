import { describe, expect, it } from "vitest";
import type { TrackedFlight, TrackerState } from "../src/day-schema.js";
import { ACTIVE_WINDOW, FULL_SWEEP_EVERY, selectHexes } from "../src/sweep.js";
import { GAP, RESUME_WINDOW, step, emptyState } from "../src/tracker.js";

const NOW = 1_800_000_000;
const fleet = ["aaa001", "aaa002", "aaa003", "aaa004", "aaa005"];
const flight = (o: Partial<TrackedFlight>): TrackedFlight => ({
  id: "x", icao24: "aaa001", cs: "THY1", dep: NOW - 7200, arr: null, end: "AIRBORNE", lastContact: NOW - 60, samples: [], ...o,
});
const state = (o: Partial<TrackerState> = {}): TrackerState => ({
  v: 1, collectingSince: NOW - 99999, lastSuccessAt: NOW - 60, flights: [], seen: { aaa002: NOW - 100 }, lastFullSweepAt: NOW - 60, ...o,
});

describe("selectHexes", () => {
  it("first run (no lastFullSweepAt) is a full sweep", () => {
    expect(selectHexes(fleet, state({ lastFullSweepAt: undefined }), NOW)).toEqual({ hexes: fleet, full: true });
  });
  it("missing or empty seen is a full sweep", () => {
    expect(selectHexes(fleet, state({ seen: undefined }), NOW).full).toBe(true);
    expect(selectHexes(fleet, state({ seen: {} }), NOW).full).toBe(true);
  });
  it("stale full sweep is a full sweep", () => {
    expect(selectHexes(fleet, state({ lastFullSweepAt: NOW - FULL_SWEEP_EVERY }), NOW)).toEqual({ hexes: fleet, full: true });
    expect(selectHexes(fleet, state({ lastFullSweepAt: NOW - FULL_SWEEP_EVERY + 1 }), NOW).full).toBe(false);
  });
  it("recent sweep polls recently seen aircraft only, sorted, within window", () => {
    const s = state({ seen: { aaa004: NOW - 10, aaa002: NOW - ACTIVE_WINDOW, aaa003: NOW - ACTIVE_WINDOW - 1 } });
    expect(selectHexes(fleet, s, NOW)).toEqual({ hexes: ["aaa002", "aaa004"], full: false });
  });
  it("includes open flights and resumable LAST_CONTACT flights, excludes non-fleet hexes", () => {
    const s = state({
      seen: { zzz999: NOW - 5 },
      flights: [
        flight({ icao24: "aaa001" }),
        flight({ id: "y", icao24: "aaa003", arr: NOW - 3600, end: "LAST_CONTACT", lastContact: NOW - RESUME_WINDOW }),
        flight({ id: "z", icao24: "aaa004", arr: NOW - 3600, end: "LAST_CONTACT", lastContact: NOW - RESUME_WINDOW - 1 }),
        flight({ id: "w", icao24: "aaa005", arr: NOW - 3600, end: "LANDED", lastContact: NOW - 3600 }),
        flight({ id: "v", icao24: "qqq111" }),
      ],
    });
    expect(selectHexes(fleet, s, NOW)).toEqual({ hexes: ["aaa001", "aaa003"], full: false });
  });
});

describe("step with partial polling", () => {
  it("a quiet run with only active hexes does not end an open flight", () => {
    const a = { icao24: "aaa001", cs: "THY1", t: NOW, lat: 41, lon: 29, alt100: 300, onGround: false, gs: 400, trk: 90 };
    const s1 = step(emptyState(NOW), [a], NOW);
    const s2 = step(s1, [], NOW + 60);
    expect(s2.flights[0].arr).toBeNull();
    expect(s2.flights[0].end).toBe("AIRBORNE");
    const s3 = step(s2, [], NOW + GAP + 1);
    expect(s3.flights[0].arr).not.toBeNull();
  });
  it("records seen incl. ground reports, keeps max, prunes after 24h, carries lastFullSweepAt", () => {
    const base = { cs: "THY1", lat: 41, lon: 29, alt100: 0, gs: 0, trk: 0 };
    const prev: TrackerState = { ...emptyState(NOW), seen: { old: NOW - 86400 - 1, keep: NOW - 100, aaa002: NOW + 50 }, lastFullSweepAt: NOW - 5 };
    const s = step(prev, [
      { ...base, icao24: "aaa001", t: NOW, onGround: true },
      { ...base, icao24: "aaa002", t: NOW, onGround: true },
    ], NOW);
    expect(s.seen).toEqual({ keep: NOW - 100, aaa001: NOW, aaa002: NOW + 50 });
    expect(s.lastFullSweepAt).toBe(NOW - 5);
  });
  it("loads old state without seen/lastFullSweepAt", () => {
    const s = step({ v: 1, collectingSince: NOW, lastSuccessAt: 0, flights: [] }, [], NOW);
    expect(s.seen).toEqual({});
    expect(s.lastFullSweepAt).toBeUndefined();
  });
});
