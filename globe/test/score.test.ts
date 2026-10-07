import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import { BEAT_SEC, slotIndex, slotTime } from "../src/audio/theory";
import { LOOKAHEAD_SEC, MAX_NOTES_PER_STEP, MAX_RANGE_SEC, eventsBetween, planNotes, velocityFor, type ScoreEvent } from "../src/audio/score";
import { FROM, flight, makeDay } from "./helpers";

// regions: DOM 0, EUR 1, MEA 2, AFR 3, ASI 4, AME 5, UNK 6
const model = () =>
  buildGlobeModel(
    makeDay({
      flights: [
        flight({ from: "IST", to: "JFK", region: "AME", dep: FROM + 1000, arr: FROM + 5000, end: "LANDED", s: [[0, 300, 41, 29], [3000, 370, 45, -20]] }),
        flight({ from: "IST", to: "LHR", region: "EUR", dep: FROM + 2000, arr: null, end: "AIRBORNE", s: [[0, 300, 41, 29], [600, 370, 45, 10]] }),
        flight({ from: "IST", to: "ESB", region: "DOM", dep: FROM + 3000, arr: FROM + 4000, end: "LAST_CONTACT", s: [[0, 300, 41, 29], [900, 100, 40, 33]] }),
      ],
    }),
  );
const ev = (o: Partial<ScoreEvent>): ScoreEvent => ({ kind: "dep", key: "IST-FRA", regionIdx: 1, distKm: 2000, at: 0, ...o });

describe("eventsBetween", () => {
  it("returns departures in (from, to] and arrivals only for landed flights", () => {
    const m = model();
    // windows must be <= MAX_RANGE_SEC (600 s), so each departure gets its own window
    expect(eventsBetween(m, 900, 1500).map((x) => [x.kind, x.key, x.at])).toEqual([["dep", "IST-JFK", 1000]]);
    expect(eventsBetween(m, 1900, 2400).map((x) => [x.kind, x.key, x.at])).toEqual([["dep", "IST-LHR", 2000]]);
    expect(eventsBetween(m, 500, 1100).length).toBe(1);
    const arr = eventsBetween(m, 4500, 5100);
    expect(arr.map((x) => [x.kind, x.key, x.at])).toEqual([["arr", "IST-JFK", 5000]]);
  });
  it("last-contact and airborne flights never produce arrivals", () => {
    expect(eventsBetween(model(), 3500, 4500).some((x) => x.kind === "arr")).toBe(false);
  });
  it("the interval is open at the start and closed at the end", () => {
    const m = model();
    expect(eventsBetween(m, 1000, 1500)).toEqual([]);
    expect(eventsBetween(m, 900, 1000).length).toBe(1);
  });
  it("carries region index and distance; jumps and rewinds produce nothing", () => {
    const m = model();
    expect(eventsBetween(m, 900, 1500)[0]).toMatchObject({ regionIdx: 5, key: "IST-JFK" });
    expect(eventsBetween(m, 900, 1500)[0].distKm).toBeGreaterThan(7000);
    expect(eventsBetween(m, 0, MAX_RANGE_SEC + 1)).toEqual([]);
    expect(eventsBetween(m, 2500, 500)).toEqual([]);
  });
});

describe("velocityFor", () => {
  it("grows with the number of merged events and is capped at 1", () => {
    expect(velocityFor(1)).toBeCloseTo(0.65, 12);
    expect(velocityFor(2)).toBeGreaterThan(velocityFor(1));
    expect(velocityFor(10)).toBe(1);
  });
});

describe("planNotes", () => {
  it("places notes on the region grid, never earlier than now + lookahead", () => {
    const now = 3.1;
    const [n] = planNotes([ev({ regionIdx: 1 })], now);
    const idx = slotIndex(now + LOOKAHEAD_SEC, "EUR");
    expect(n.when).toBeCloseTo(slotTime("EUR", idx), 12);
    expect(n.when).toBeGreaterThanOrEqual(now + LOOKAHEAD_SEC);
    expect(n.region).toBe("EUR");
  });
  it("different regions land on their own grids (polyrhythm)", () => {
    const notes = planNotes([ev({ regionIdx: 1 }), ev({ regionIdx: 3, key: "IST-CAI" }), ev({ regionIdx: 4, key: "IST-NRT" })], 0.01);
    const by = Object.fromEntries(notes.map((n) => [n.region, n.when]));
    expect(by.ASI).toBeLessThan(by.AFR);
    expect(by.AFR).toBeLessThan(by.EUR);
  });
  it("at most MAX_NOTES_PER_STEP notes per region and step; extras raise the velocity", () => {
    const many = Array.from({ length: 5 }, (_, i) => ev({ key: `A${i}-IST`, regionIdx: 1 }));
    const notes = planNotes(many, 0);
    expect(notes).toHaveLength(MAX_NOTES_PER_STEP);
    expect(notes[0].vel).toBeCloseTo(velocityFor(5), 12);
    const single = planNotes([ev({})], 0);
    expect(notes[0].vel).toBeGreaterThan(single[0].vel);
  });
  it("arrivals are softer and an octave lower than departures", () => {
    const [d] = planNotes([ev({ kind: "dep" })], 0);
    const [a] = planNotes([ev({ kind: "arr" })], 0);
    expect(a.freq).toBeCloseTo(d.freq / 2, 9);
    expect(a.vel).toBeCloseTo(d.vel * 0.6, 12);
  });
  it("departures come before arrivals when a step overflows; UNK is silent; empty in, empty out", () => {
    const notes = planNotes([ev({ kind: "arr", key: "Z-IST" }), ev({ kind: "dep", key: "B-IST" }), ev({ kind: "dep", key: "A-IST" })], 0);
    expect(notes.map((n) => n.kind)).toEqual(["dep", "dep"]);
    expect(planNotes([ev({ regionIdx: 6 })], 0)).toEqual([]);
    expect(planNotes([], 0)).toEqual([]);
  });
  it("is deterministic", () => {
    const e = [ev({}), ev({ regionIdx: 2, key: "IST-DXB", distKm: 3000 })];
    expect(planNotes(e, 1.234)).toEqual(planNotes(e, 1.234));
    expect(BEAT_SEC).toBeGreaterThan(0);
  });
});
