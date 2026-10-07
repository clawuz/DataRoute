import { describe, expect, it } from "vitest";
import {
  INSTRUMENT_MUSIC, PATTERNS, REGION_MUSIC, chordAtBeat, euclid, freqOf, hasMusic, isWestNorth, nextActiveSlot, octaveFor, pickNote, routeHash,
  routeKey, slotIndex, slotTime, stepSec, type Chord,
} from "../src/audio/theory";
import { SECTIONS } from "../src/audio/form";

const A_MINOR = new Set([0, 2, 3, 5, 7, 8, 10]); // pitch classes of natural A minor above A
const AM: Chord = { name: "Am", root: 0, third: 3, fifth: 7 };
const BEAT = 60 / 96; // DAY tempo
const T = true;
const F = false;

describe("harmony", () => {
  it("chordAtBeat walks a progression, beatsPerChord beats per chord, looping; negative beats clamp to the start", () => {
    const day = SECTIONS.DAY.progression; // C G Am F
    expect(REGION_MUSIC).toBe(INSTRUMENT_MUSIC);
    const at = (b: number) => chordAtBeat(b, day, 8).name;
    expect(at(0)).toBe("C");
    expect(at(7)).toBe("C");
    expect(at(9)).toBe("G");
    expect([16, 24, 32].map(at)).toEqual(["Am", "F", "C"]);
    expect(at(-5)).toBe("C");
    expect(chordAtBeat(9, SECTIONS.EVENING.progression, 4).name).toBe("F"); // floor(9 / 4) = 2 → Dm Am [F]
  });
  it("every instrument scale stays inside A natural minor; piano, ney and winds have no scale", () => {
    for (const m of Object.values(INSTRUMENT_MUSIC)) for (const s of m!.scale) expect(A_MINOR.has(s)).toBe(true);
    for (const i of ["PNO", "NEY", "CLA", "SAX", "TPT"] as const) expect(INSTRUMENT_MUSIC[i]!.scale).toEqual([]);
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

describe("euclidean rhythms (Bjorklund)", () => {
  it("canonical patterns", () => {
    expect(euclid(5, 8)).toEqual([T, F, T, T, F, T, T, F]);
    expect(euclid(3, 8)).toEqual([T, F, F, T, F, F, T, F]);
    expect(euclid(2, 4)).toEqual([T, F, T, F]);
    expect(euclid(6, 8)).toEqual([T, F, T, T, T, F, T, T]);
  });
  it("always n long with exactly k onsets; k ≥ n all on, k ≤ 0 all off", () => {
    const count = (p: boolean[]) => p.filter(Boolean).length;
    expect([euclid(5, 12).length, count(euclid(5, 12))]).toEqual([12, 5]);
    expect([euclid(5, 16).length, count(euclid(5, 16))]).toEqual([16, 5]);
    expect(euclid(5, 12)).toEqual([T, F, F, T, F, T, F, F, T, F, T, F]);
    expect(euclid(5, 16)).toEqual([T, F, F, T, F, F, T, F, F, T, F, F, T, F, F, F]);
    expect(euclid(4, 4)).toEqual([T, T, T, T]);
    expect(euclid(9, 4)).toEqual([T, T, T, T]);
    expect(euclid(0, 3)).toEqual([F, F, F]);
    expect(euclid(-2, 3)).toEqual([F, F, F]);
    for (let n = 1; n <= 16; n++) for (let k = 0; k <= n; k++) expect([euclid(k, n).length, count(euclid(k, n))]).toEqual([n, k]);
  });
  it("instrument patterns; AME and NEY are free", () => {
    expect(PATTERNS.DOM).toEqual(euclid(2, 4));
    expect(PATTERNS.EUR).toEqual(euclid(5, 8));
    expect(PATTERNS.MEA).toEqual(euclid(3, 8));
    expect(PATTERNS.AFR).toEqual(euclid(5, 12));
    expect(PATTERNS.ASI).toEqual(euclid(5, 16));
    expect(PATTERNS.PNO).toEqual(euclid(6, 8));
    expect(PATTERNS.AME).toBeUndefined();
    expect(PATTERNS.NEY).toBeUndefined();
  });
  it("nextActiveSlot moves to the next onset and wraps with the pattern", () => {
    expect(nextActiveSlot("EUR", 0)).toBe(0);
    expect(nextActiveSlot("EUR", 1)).toBe(2); // x.xx.xx. : step 1 off
    expect(nextActiveSlot("EUR", 7)).toBe(8); // step 7 off → step 0 of the next bar
    expect(nextActiveSlot("EUR", 8)).toBe(8);
    expect(nextActiveSlot("MEA", 4)).toBe(6); // x..x..x.
    expect(nextActiveSlot("ASI", 13)).toBe(16); // ...x..x..x..x... ends with three rests
    expect(nextActiveSlot("DOM", 3)).toBe(4);
    expect(nextActiveSlot("AME", 5)).toBe(5);
    expect(nextActiveSlot("NEY", 7)).toBe(7);
  });
});

describe("rhythm grids take the tempo and are integer fractions of the beat", () => {
  const at = (r: "DOM" | "EUR" | "AFR" | "ASI" | "AME" | "NEY", k: number) => slotTime(r, k, 96);
  it("coincide with whole beats", () => {
    expect(at("DOM", 3)).toBeCloseTo(3 * BEAT, 12);
    expect(at("EUR", 4)).toBeCloseTo(2 * BEAT, 12);
    expect(at("AFR", 6)).toBeCloseTo(2 * BEAT, 12);
    expect(at("ASI", 8)).toBeCloseTo(2 * BEAT, 12);
    expect(at("AME", 1)).toBeCloseTo(2 * BEAT, 12);
    expect(at("NEY", 2)).toBeCloseTo(BEAT, 12); // the ney now runs in eighth notes
  });
  it("step sizes follow the tempo", () => {
    expect(stepSec("EUR", 96)).toBeCloseTo(0.625 / 2, 12);
    expect(stepSec("AFR", 96)).toBeCloseTo(BEAT / 3, 12);
    expect(stepSec("ASI", 96)).toBeCloseTo(BEAT / 4, 12);
    expect(stepSec("AME", 96)).toBeCloseTo(BEAT * 2, 12);
    expect(stepSec("EUR", 72)).toBeCloseTo(60 / 72 / 2, 12);
    for (const w of ["NEY", "CLA", "SAX", "TPT"] as const) expect(stepSec(w, 80)).toBeCloseTo(60 / 80 / 2, 12);
  });
  it("the Middle East swings its off-steps late; others do not", () => {
    expect(slotTime("MEA", 0, 96)).toBe(0);
    expect(slotTime("MEA", 1, 96)).toBeCloseTo(BEAT / 2 + 0.25 * (BEAT / 2), 12);
    expect(slotTime("EUR", 1, 96)).toBeCloseTo(BEAT / 2, 12);
    expect(slotTime("MEA", 1, 72)).toBeCloseTo((60 / 72 / 2) * 1.25, 12);
  });
  it("slotIndex picks the first slot at or after the time", () => {
    expect(slotIndex(0, "EUR", 96)).toBe(0);
    expect(slotIndex(0.01, "EUR", 96)).toBe(1);
    expect(slotIndex(BEAT / 2, "EUR", 96)).toBe(1);
    expect(slotIndex(0.4, "EUR", 72)).toBe(1); // step 0.4167
  });
});

describe("pickNote", () => {
  it("is deterministic and drawn from the region scale at the clamped octave", () => {
    const f = pickNote("EUR", "IST-FRA", 2000, AM, 0, "dep")!;
    expect(pickNote("EUR", "IST-FRA", 2000, AM, 0, "dep")).toBe(f);
    expect(REGION_MUSIC.EUR!.scale.map((s) => freqOf(4, s)).some((x) => Math.abs(x - f) < 1e-9)).toBe(true);
  });
  it("clamps the octave into the region's range (Middle East 3–4, Asia 4–5)", () => {
    const low = pickNote("MEA", "IST-DXB", 9000, AM, 0, "dep")!; // octaveFor = 2 → clamped to 3
    expect(REGION_MUSIC.MEA!.scale.map((s) => freqOf(3, s)).some((x) => Math.abs(x - low) < 1e-9)).toBe(true);
    const hi = pickNote("ASI", "IST-NRT", 200, AM, 0, "dep")!; // octaveFor = 5, allowed
    expect(REGION_MUSIC.ASI!.scale.map((s) => freqOf(5, s)).some((x) => Math.abs(x - hi) < 1e-9)).toBe(true);
  });
  it("landings sound an octave lower when that stays audible", () => {
    const dep = pickNote("EUR", "IST-FRA", 2000, AM, 0, "dep")!;
    expect(pickNote("EUR", "IST-FRA", 2000, AM, 0, "arr")).toBeCloseTo(dep / 2, 9);
  });
  it("domestic follows the chord: root on even beats, fifth on odd beats, landings the fifth", () => {
    expect(pickNote("DOM", "ESB-IST", 350, AM, 0, "dep")).toBeCloseTo(freqOf(1, AM.root), 9);
    expect(pickNote("DOM", "ESB-IST", 350, AM, 1, "dep")).toBeCloseTo(freqOf(1, AM.fifth), 9);
    expect(pickNote("DOM", "ESB-IST", 350, AM, 0, "arr")).toBeCloseTo(freqOf(1, AM.fifth), 9);
  });
  it("piano, ney and the winds have music but are driven by melody.ts, not pickNote", () => {
    for (const i of ["PNO", "NEY", "CLA", "SAX", "TPT"] as const) {
      expect(hasMusic(i)).toBe(true);
      expect(pickNote(i, "IST-FRA", 2000, AM, 0, "dep")).toBeNull();
    }
    for (const i of ["NEY", "CLA", "SAX", "TPT"] as const) expect([INSTRUMENT_MUSIC[i]!.perBeat, INSTRUMENT_MUSIC[i]!.swing]).toEqual([2, 0]);
  });
  it("unknown region is silent", () => {
    expect(hasMusic("UNK")).toBe(false);
    expect(pickNote("UNK", "a-b", 100, AM, 0, "dep")).toBeNull();
  });
});

describe("isWestNorth", () => {
  it("west of 20E or north of 52N", () => {
    expect(isWestNorth(51.5, -0.5)).toBe(true); // London
    expect(isWestNorth(40.4, -3.7)).toBe(true); // Madrid
    expect(isWestNorth(59.6, 18.0)).toBe(true); // Stockholm
    expect(isWestNorth(37.9, 23.7)).toBe(false); // Athens
    expect(isWestNorth(44.4, 26.1)).toBe(false); // Bucharest
    expect(isWestNorth(55.9, 37.4)).toBe(true); // Moscow: lat > 52 (documents the rule)
    expect(isWestNorth(44.8, 20.3)).toBe(false); // Belgrade
  });
});
