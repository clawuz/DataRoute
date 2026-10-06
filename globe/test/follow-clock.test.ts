import { describe, expect, it } from "vitest";
import { buildGlobeModel, type GlobeFlight } from "../src/model/globe-model";
import {
  LADDER, atEnd, atLiveHead, cycleSpeed, derivedSpeed, endOf, scrubFollow, startClock, stepFollow,
} from "../src/model/follow-clock";
import { FROM, flight, makeDay } from "./helpers";

const one = (f: Parameters<typeof flight>[0]): GlobeFlight => buildGlobeModel(makeDay({ flights: [flight(f)] })).flights[0];

// span 28 800 s (8 h) → 28 800 / 240 = 120 s of playback → exactly ×240
const long = (o: Partial<Parameters<typeof flight>[0]> = {}) =>
  one({
    dep: FROM, arr: null, end: "AIRBORNE",
    s: [[0, 300, 0, 0], [7200, 370, 0, 20], [14400, 370, 0, 40], [28800, 370, 0, 80]],
    ...o,
  });

describe("follow clock", () => {
  it("derives the playback speed from the flight length (25–240 s of playback)", () => {
    expect(derivedSpeed(long())).toBe(240);
    const short = one({ dep: FROM, arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [3600, 300, 0, 10]] });
    expect(derivedSpeed(short)).toBe(3600 / 25); // 1 h flight is squeezed into 25 s
    const huge = one({ dep: FROM, arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [80000, 300, 0, 100]] });
    expect(derivedSpeed(huge)).toBeCloseTo(80000 / 240, 9); // capped at 4 min of playback
  });

  it("starts at the first sample and advances at the derived speed", () => {
    const f = long();
    const c = startClock(f);
    expect(c).toEqual({ u: 0, speed: null, paused: false });
    expect(stepFollow(c, f, 1).u).toBe(240);
    expect(stepFollow({ ...c, paused: true }, f, 1).u).toBe(0);
  });

  it("an airborne flight stops at its last sample, then runs at ×1 up to the extrapolation limit", () => {
    const f = long();
    let c = stepFollow({ u: 28700, speed: null, paused: false }, f, 1);
    expect(c.u).toBe(28800); // clamped to lastT
    expect(atLiveHead(c, f)).toBe(true);
    c = stepFollow(c, f, 10);
    expect(c.u).toBe(28810); // ×1
    c = stepFollow(c, f, 1000);
    expect(c.u).toBe(28800 + 300);
    expect(atEnd(c, f)).toBe(true);
  });

  it("landed flights stop at the landing time; last-contact flights at the last sample", () => {
    const landed = long({ arr: FROM + 30000, end: "LANDED" });
    expect(endOf(landed)).toBe(30000);
    expect(stepFollow({ u: 29900, speed: 960, paused: false }, landed, 10).u).toBe(30000);
    const lc = long({ arr: FROM + 28800, end: "LAST_CONTACT" });
    expect(endOf(lc)).toBe(28800);
    expect(atEnd({ u: 28800, speed: null, paused: false }, lc)).toBe(true);
  });

  it("scrubs ±5 min within [first sample, end]", () => {
    const f = long();
    expect(scrubFollow({ u: 100, speed: null, paused: false }, f, -300).u).toBe(0);
    expect(scrubFollow({ u: 100, speed: null, paused: false }, f, 300).u).toBe(400);
    expect(scrubFollow({ u: 28700, speed: null, paused: false }, f, 9999).u).toBe(28800 + 300);
  });

  it("steps the speed ladder from the nearest rung and clamps at the ends", () => {
    expect(LADDER).toEqual([60, 120, 240, 480, 960]);
    const f = long();
    const c = startClock(f);
    expect(cycleSpeed(c, f, 1).speed).toBe(480);
    expect(cycleSpeed(c, f, -1).speed).toBe(120);
    expect(cycleSpeed({ ...c, speed: 960 }, f, 1).speed).toBe(960);
    expect(cycleSpeed({ ...c, speed: 60 }, f, -1).speed).toBe(60);
    const short = one({ dep: FROM, arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [3600, 300, 0, 10]] }); // derived 144
    expect(cycleSpeed(startClock(short), short, 1).speed).toBe(240); // nearest rung 120 → next 240
  });
});
