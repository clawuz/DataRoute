import { describe, expect, it } from "vitest";
import { hzOfMidi, instrumentOf, noteEventOf, notesBetween, targetTime, type TrackNote } from "../src/audio/day-track";

const n = (t: number, p = 60): TrackNote => ({ t, d: 0.5, p, v: 0.5, k: "IST-JFK", from: "IST", to: "JFK", alt: 30000 });

describe("day track", () => {
  const notes = [n(1), n(2), n(2), n(3), n(5)];
  it("notesBetween returns the onsets in (a, b]", () => {
    expect(notesBetween(notes, 1, 3).map((x) => x.t)).toEqual([2, 2, 3]);
    expect(notesBetween(notes, 0, 1).map((x) => x.t)).toEqual([1]);
    expect(notesBetween(notes, 3, 3)).toEqual([]);
    expect(notesBetween(notes, 4, 9).map((x) => x.t)).toEqual([5]);
  });
  it("maps pitch to a register instrument and Hz", () => {
    expect(instrumentOf(40)).toBe("CELLO");
    expect(instrumentOf(60)).toBe("STR");
    expect(instrumentOf(70)).toBe("VIOLIN");
    expect(instrumentOf(80)).toBe("FLUTE");
    expect(hzOfMidi(69)).toBeCloseTo(440);
  });
  it("builds a scope event keyed by the route", () => {
    const e = noteEventOf(n(1, 69), 100);
    expect(e.key).toBe("IST-JFK");
    expect(e.at).toBe(100);
    expect(e.kind).toBe("line");
    expect(e.vel).toBeGreaterThan(0.3);
  });
  it("targetTime seeks only when the drift is large", () => {
    expect(targetTime(0.5, 180, 90.2)).toEqual({ t: 90, seek: false });
    expect(targetTime(0.5, 180, 80).seek).toBe(true);
    expect(targetTime(2, 180, 0).t).toBe(180);
  });
});
