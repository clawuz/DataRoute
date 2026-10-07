import { describe, expect, it } from "vitest";
import { DECAY_SEC, INSTRUMENT_COLOR, LANE_ORDER, laneSample, stepLane, visualHz, type Lane } from "../src/audio/scope";

const TAU = 2 * Math.PI;

describe("visualHz", () => {
  it("is 2 + 2·log2(f/110): A2 → 2 Hz, A3 → 4 Hz", () => {
    expect(visualHz(110)).toBe(2);
    expect(visualHz(220)).toBe(4);
    expect(visualHz(440)).toBe(6);
  });
  it("rises monotonically with pitch and is clamped to [1, 14]", () => {
    const fs = [20, 55, 80, 110, 165, 220, 330, 440, 880, 1760, 7040, 20000];
    const hz = fs.map(visualHz);
    for (let i = 1; i < hz.length; i++) expect(hz[i]).toBeGreaterThanOrEqual(hz[i - 1]);
    expect(visualHz(20)).toBe(1);
    expect(visualHz(20000)).toBe(14);
    expect(Math.min(...hz)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...hz)).toBeLessThanOrEqual(14);
  });
});

describe("stepLane", () => {
  const lane: Lane = { amp: 0.3, phase: 0, hz: 2 };
  it("a hit raises the amplitude to the velocity (never lowers it) and sets the pitch frequency", () => {
    const up = stepLane(lane, 0, 1, { freq: 220, vel: 0.9 });
    expect(up.amp).toBe(0.9);
    expect(up.hz).toBe(4);
    const keep = stepLane({ ...lane, amp: 0.95 }, 0, 1, { freq: 440, vel: 0.5 });
    expect(keep.amp).toBe(0.95);
    expect(keep.hz).toBe(6);
  });
  it("without a hit the amplitude decays exponentially with the time constant", () => {
    expect(Math.abs(stepLane({ ...lane, amp: 1 }, 1.2, 1.2).amp - 1 / Math.E)).toBeLessThan(1e-9);
    // two half steps equal one full step
    const half = stepLane(stepLane({ ...lane, amp: 0.8 }, 0.3, 0.6), 0.3, 0.6);
    expect(Math.abs(half.amp - 0.8 / Math.E)).toBeLessThan(1e-9);
    expect(stepLane(lane, 0.5, 1).hz).toBe(2);
  });
  it("the phase advances 2π·hz·dt and wraps into [0, 2π)", () => {
    expect(stepLane(lane, 0.1, 1).phase).toBeCloseTo(TAU * 2 * 0.1, 12);
    const wrapped = stepLane({ ...lane, phase: 6 }, 0.1, 1).phase;
    expect(wrapped).toBeGreaterThanOrEqual(0);
    expect(wrapped).toBeLessThan(TAU);
    expect(wrapped).toBeCloseTo(6 + TAU * 0.2 - TAU, 12);
    expect(stepLane(lane, 1, 1).phase).toBeCloseTo(0, 9); // two full cycles
  });
  it("is pure: the input lane is not mutated", () => {
    const l = { ...lane };
    stepLane(l, 0.2, 1, { freq: 330, vel: 1 });
    expect(l).toEqual(lane);
  });
});

describe("laneSample", () => {
  it("is amp·sin(phase), bounded by the amplitude", () => {
    expect(laneSample({ amp: 0.5, phase: Math.PI / 2, hz: 2 })).toBeCloseTo(0.5, 12);
    expect(laneSample({ amp: 0.5, phase: 0, hz: 2 })).toBe(0);
    for (let p = 0; p < TAU; p += 0.1) expect(Math.abs(laneSample({ amp: 0.7, phase: p, hz: 3 }))).toBeLessThanOrEqual(0.7);
  });
});

describe("lane palette", () => {
  it("every lane instrument has a colour and a visual decay", () => {
    expect(LANE_ORDER).toEqual(["NEY", "CLA", "SAX", "TPT", "PNO", "EUR", "MEA", "AFR", "ASI", "AME", "DOM"]);
    for (const i of LANE_ORDER) {
      expect(INSTRUMENT_COLOR[i]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(DECAY_SEC[i]).toBeGreaterThan(0);
    }
    expect(INSTRUMENT_COLOR.NEY).toBe("#E30A17");
    expect(INSTRUMENT_COLOR.EUR).toBe("#3FC8F2");
    expect(INSTRUMENT_COLOR.UNK).toBe("#6B7280");
    expect(DECAY_SEC.AME).toBe(2.2);
    expect(DECAY_SEC.DOM).toBe(0.45);
  });
});
