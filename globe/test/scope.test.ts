import { describe, expect, it } from "vitest";
import {
  DECAY_SEC, INSTRUMENT_COLOR, LANE_ORDER, MAX_TRAILS, PITCH_MAX, PITCH_MIN, laneSample, pitchY, pruneTrails, pushTrail, stepLane,
  trailIdOf, visualHz, type Lane, type Trail,
} from "../src/audio/scope";
import type { NoteEvent } from "../src/audio/notes-bus";
import { freqOf } from "../src/audio/theory";

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

describe("pitchY", () => {
  it("spans A2 (freqOf(2, 0)) to A6 (freqOf(5, 12)) on a log scale, clamped to [0, 1]", () => {
    expect(PITCH_MIN).toBe(freqOf(2, 0));
    expect(PITCH_MAX).toBe(freqOf(5, 12));
    expect(pitchY(PITCH_MIN)).toBe(0);
    expect(pitchY(PITCH_MAX)).toBe(1);
    expect(pitchY(220)).toBeCloseTo(0.25, 12); // one octave of four
    expect(pitchY(20)).toBe(0);
    expect(pitchY(20000)).toBe(1);
  });
  it("is monotone in pitch", () => {
    const fs = [30, 110, 150, 220, 300, 440, 700, 880, 1500, 1760, 5000];
    for (let i = 1; i < fs.length; i++) expect(pitchY(fs[i])).toBeGreaterThanOrEqual(pitchY(fs[i - 1]));
  });
});

describe("trails", () => {
  const note = (o: Partial<NoteEvent> = {}): NoteEvent => ({
    instrument: "EUR", lane: "EUR", freq: 220, pitch: 220, vel: 0.5, kind: "line", key: "IST-FRA", at: 1, lineId: "f1", ...o,
  });

  it("the trail id is the line id; Istanbul notes trail per instrument; groove notes have none", () => {
    expect(trailIdOf(note())).toBe("f1");
    expect(trailIdOf(note({ instrument: "NEY", lane: "NEY", kind: "dep", lineId: undefined }))).toBe("NEY");
    expect(trailIdOf(note({ instrument: "KICK", lane: "KICK", kind: "groove", key: "", lineId: undefined }))).toBeNull();
  });

  it("pushTrail appends {t: at, y: pitchY(pitch)} and keeps the colour and last hit", () => {
    const trails = new Map<string, Trail>();
    pushTrail(trails, note({ at: 1, pitch: 220 }), "#fff");
    pushTrail(trails, note({ at: 2, pitch: 440 }), "#fff");
    const t = trails.get("f1")!;
    expect(t).toEqual({ lineId: "f1", color: "#fff", points: [{ t: 1, y: 0.25 }, { t: 2, y: 0.5 }], lastHit: 2 });
  });

  it("trims each trail to maxPoints (oldest points first)", () => {
    const trails = new Map<string, Trail>();
    for (let i = 0; i < 10; i++) pushTrail(trails, note({ at: i }), "#fff", 4);
    expect(trails.get("f1")!.points.map((p) => p.t)).toEqual([6, 7, 8, 9]);
  });

  it(`keeps at most ${MAX_TRAILS} trails, dropping the one hit longest ago`, () => {
    expect(MAX_TRAILS).toBe(12);
    const trails = new Map<string, Trail>();
    for (let i = 0; i < 12; i++) pushTrail(trails, note({ lineId: `L${i}`, at: 10 + i }), "#fff");
    pushTrail(trails, note({ lineId: "L0", at: 30 }), "#fff"); // L0 is now the freshest
    pushTrail(trails, note({ lineId: "new", at: 31 }), "#fff");
    expect(trails.size).toBe(12);
    expect(trails.has("L1")).toBe(false);
    expect(trails.has("L0")).toBe(true);
    expect(trails.has("new")).toBe(true);
  });

  it("pruneTrails removes trails not hit within the ttl", () => {
    const trails = new Map<string, Trail>();
    pushTrail(trails, note({ lineId: "old", at: 1 }), "#fff");
    pushTrail(trails, note({ lineId: "fresh", at: 8 }), "#fff");
    pruneTrails(trails, 10);
    expect([...trails.keys()]).toEqual(["fresh"]);
    pruneTrails(trails, 100, 200);
    expect(trails.size).toBe(1);
    pruneTrails(trails, 15);
    expect(trails.size).toBe(0);
  });
});

describe("lane palette", () => {
  it("the rhythm strip has the four groove lanes with their visual decays", () => {
    expect(LANE_ORDER).toEqual(["KICK", "SNARE", "HAT", "BASS"]);
    expect(DECAY_SEC).toEqual({ KICK: 0.3, SNARE: 0.2, HAT: 0.08, BASS: 0.5 });
    for (const i of LANE_ORDER) expect(INSTRUMENT_COLOR[i]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  it("every instrument (lines, Istanbul ensemble, groove) has a colour", () => {
    for (const c of Object.values(INSTRUMENT_COLOR)) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(INSTRUMENT_COLOR).toMatchObject({
      EP: "#c9a7ff", BASS: "#f2f4f8", KICK: "#f2f4f8", SNARE: "#d9dce3", HAT: "#b6bcc9", OHAT: "#b6bcc9",
      KEYS: "#c9a7ff", BRASS: "#fff1cf", SAXPAD: "#e8b64a",
    });
    expect(INSTRUMENT_COLOR.NEY).toBe("#E30A17");
    expect(INSTRUMENT_COLOR.EUR).toBe("#3FC8F2");
    expect(INSTRUMENT_COLOR.UNK).toBe("#6B7280");
  });
  it("v4 layer percussion takes its continent's colour; fill/build voices are neutral", () => {
    expect(INSTRUMENT_COLOR).toMatchObject({
      DARBUKA: "#F7C548", CONGA: "#7BD389", TAIKO: "#F2508F", TIMP: "#A98BFF", SHAKER: "#3FC8F2",
      TOM: "#d9dce3", CRASH: "#fff1cf", RISER: "#fff1cf",
    });
    expect([INSTRUMENT_COLOR.DARBUKA, INSTRUMENT_COLOR.CONGA, INSTRUMENT_COLOR.TAIKO, INSTRUMENT_COLOR.TIMP, INSTRUMENT_COLOR.SHAKER]).toEqual([
      INSTRUMENT_COLOR.MEA, INSTRUMENT_COLOR.AFR, INSTRUMENT_COLOR.ASI, INSTRUMENT_COLOR.AME, INSTRUMENT_COLOR.EUR,
    ]);
  });
});
