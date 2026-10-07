import { describe, expect, it } from "vitest";
import { REGIONS } from "@web/data/palette";
import {
  BEAT_SEC, BEATS_PER_CHORD, BPM, PROGRESSION, REGION_MUSIC, chordAtBeat, chordAtTime, freqOf, hasMusic, octaveFor,
  pickNote, routeHash, routeKey, slotIndex, slotTime, stepSec,
} from "../src/audio/theory";

const A_MINOR = new Set([0, 2, 3, 5, 7, 8, 10]); // pitch classes of natural A minor above A

describe("clock and harmony", () => {
  it("96 BPM and a four-chord loop of 16 beats each", () => {
    expect(BPM).toBe(96);
    expect(BEAT_SEC).toBeCloseTo(0.625, 12);
    expect(BEATS_PER_CHORD).toBe(16);
    expect(PROGRESSION.map((c) => c.name)).toEqual(["Am", "F", "C", "G"]);
    expect(chordAtBeat(0).name).toBe("Am");
    expect(chordAtBeat(15).name).toBe("Am");
    expect(chordAtBeat(16).name).toBe("F");
    expect(chordAtBeat(32).name).toBe("C");
    expect(chordAtBeat(48).name).toBe("G");
    expect(chordAtBeat(64).name).toBe("Am");
    expect(chordAtBeat(-5).name).toBe("Am");
    expect(chordAtTime(16 * BEAT_SEC + 0.01).name).toBe("F");
  });
  it("every chord tone and every region scale stays inside A natural minor", () => {
    for (const c of PROGRESSION) for (const s of [c.root, c.third, c.fifth]) expect(A_MINOR.has(((s % 12) + 12) % 12)).toBe(true);
    for (const m of Object.values(REGION_MUSIC)) for (const s of m!.scale) expect(A_MINOR.has(s)).toBe(true);
  });
  it("octaves follow the distance buckets", () => {
    expect([7000, 4000, 2000, 500, 6000, 1000].map(octaveFor)).toEqual([2, 3, 4, 5, 3, 4]);
  });
  it("freqOf anchors A2 = 110 Hz", () => {
    expect(freqOf(2, 0)).toBe(110);
    expect(freqOf(3, 0)).toBe(220);
    expect(freqOf(2, 12)).toBeCloseTo(220, 9);
  });
  it("keys are order-independent; hashes are stable", () => {
    expect(routeKey("JFK", "IST", "x")).toBe("IST-JFK");
    expect(routeKey("IST", undefined, "f7")).toBe("f7");
    expect(routeHash("IST-JFK")).toBe(routeHash("IST-JFK"));
  });
});

describe("rhythm grids are integer fractions of the beat, so the polyrhythm never drifts", () => {
  const at = (r: (typeof REGIONS)[number], k: number) => slotTime(r, k);
  it("coincide with whole beats", () => {
    expect(at("DOM", 3)).toBeCloseTo(3 * BEAT_SEC, 12);
    expect(at("EUR", 4)).toBeCloseTo(2 * BEAT_SEC, 12);
    expect(at("AFR", 6)).toBeCloseTo(2 * BEAT_SEC, 12);
    expect(at("ASI", 8)).toBeCloseTo(2 * BEAT_SEC, 12);
    expect(at("AME", 1)).toBeCloseTo(2 * BEAT_SEC, 12);
  });
  it("step sizes", () => {
    expect(stepSec("EUR")).toBeCloseTo(BEAT_SEC / 2, 12);
    expect(stepSec("AFR")).toBeCloseTo(BEAT_SEC / 3, 12);
    expect(stepSec("ASI")).toBeCloseTo(BEAT_SEC / 4, 12);
    expect(stepSec("AME")).toBeCloseTo(BEAT_SEC * 2, 12);
  });
  it("the Middle East swings its off-steps late; others do not", () => {
    expect(slotTime("MEA", 0)).toBe(0);
    expect(slotTime("MEA", 1)).toBeCloseTo(BEAT_SEC / 2 + 0.25 * (BEAT_SEC / 2), 12);
    expect(slotTime("EUR", 1)).toBeCloseTo(BEAT_SEC / 2, 12);
  });
  it("slotIndex picks the first slot at or after the time", () => {
    expect(slotIndex(0, "EUR")).toBe(0);
    expect(slotIndex(0.01, "EUR")).toBe(1);
    expect(slotIndex(BEAT_SEC / 2, "EUR")).toBe(1);
  });
});

describe("pickNote", () => {
  it("is deterministic and drawn from the region scale at the clamped octave", () => {
    const f = pickNote("EUR", "IST-FRA", 2000, PROGRESSION[0], 0, "dep")!;
    expect(pickNote("EUR", "IST-FRA", 2000, PROGRESSION[0], 0, "dep")).toBe(f);
    expect(REGION_MUSIC.EUR!.scale.map((s) => freqOf(4, s)).some((x) => Math.abs(x - f) < 1e-9)).toBe(true);
  });
  it("clamps the octave into the region's range (Middle East 3–4, Asia 4–5)", () => {
    const low = pickNote("MEA", "IST-DXB", 9000, PROGRESSION[0], 0, "dep")!; // octaveFor = 2 → clamped to 3
    expect(REGION_MUSIC.MEA!.scale.map((s) => freqOf(3, s)).some((x) => Math.abs(x - low) < 1e-9)).toBe(true);
    const hi = pickNote("ASI", "IST-NRT", 200, PROGRESSION[0], 0, "dep")!; // octaveFor = 5, allowed
    expect(REGION_MUSIC.ASI!.scale.map((s) => freqOf(5, s)).some((x) => Math.abs(x - hi) < 1e-9)).toBe(true);
  });
  it("landings sound an octave lower when that stays audible", () => {
    const dep = pickNote("EUR", "IST-FRA", 2000, PROGRESSION[0], 0, "dep")!;
    expect(pickNote("EUR", "IST-FRA", 2000, PROGRESSION[0], 0, "arr")).toBeCloseTo(dep / 2, 9);
  });
  it("domestic follows the chord: root on even beats, fifth on odd beats, landings the fifth", () => {
    const am = PROGRESSION[0];
    expect(pickNote("DOM", "ESB-IST", 350, am, 0, "dep")).toBeCloseTo(freqOf(1, am.root), 9);
    expect(pickNote("DOM", "ESB-IST", 350, am, 1, "dep")).toBeCloseTo(freqOf(1, am.fifth), 9);
    expect(pickNote("DOM", "ESB-IST", 350, am, 0, "arr")).toBeCloseTo(freqOf(1, am.fifth), 9);
  });
  it("unknown region is silent", () => {
    expect(hasMusic("UNK")).toBe(false);
    expect(pickNote("UNK", "a-b", 100, PROGRESSION[0], 0, "dep")).toBeNull();
  });
});
