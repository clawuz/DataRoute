import { describe, expect, it } from "vitest";
import { REGIONS } from "@web/data/palette";
import {
  BEAT_SEC, BEATS_PER_CHORD, BPM, INSTRUMENT_MUSIC, NEY_MOTIF, PROGRESSION, REGION_MUSIC, chordAtBeat, chordAtTime, freqOf, hasMusic,
  isWestNorth, neyNote, octaveFor, pianoNote, pickNote, routeHash, routeKey, slotIndex, slotTime, snapToChord, stepSec,
} from "../src/audio/theory";

const A_MINOR = new Set([0, 2, 3, 5, 7, 8, 10]); // pitch classes of natural A minor above A

describe("clock and harmony", () => {
  it("96 BPM and an eight-chord loop of 8 beats each (64 beats)", () => {
    expect(BPM).toBe(96);
    expect(BEAT_SEC).toBeCloseTo(0.625, 12);
    expect(BEATS_PER_CHORD).toBe(8);
    expect(PROGRESSION.map((c) => c.name)).toEqual(["Am", "F", "C", "G", "Am", "Dm", "F", "G"]);
    expect(PROGRESSION[5]).toEqual({ name: "Dm", root: 5, third: 8, fifth: 0 });
    expect(REGION_MUSIC).toBe(INSTRUMENT_MUSIC);
    const at = (b: number) => chordAtBeat(b).name;
    expect(at(0)).toBe("Am");
    expect(at(7)).toBe("Am");
    expect([8, 16, 24, 32, 40, 48, 56, 64].map(at)).toEqual(["F", "C", "G", "Am", "Dm", "F", "G", "Am"]);
    expect(at(-5)).toBe("Am");
    expect(chordAtTime(8 * BEAT_SEC + 0.01).name).toBe("F");
  });
  it("every chord tone, instrument scale and the ney motif stay inside A natural minor", () => {
    for (const c of PROGRESSION) for (const s of [c.root, c.third, c.fifth]) expect(A_MINOR.has(((s % 12) + 12) % 12)).toBe(true);
    for (const m of Object.values(INSTRUMENT_MUSIC)) for (const s of m!.scale) expect(A_MINOR.has(s)).toBe(true);
    expect(INSTRUMENT_MUSIC.PNO!.scale).toEqual([]);
    expect(INSTRUMENT_MUSIC.NEY!.scale).toEqual([]);
    expect(NEY_MOTIF).toEqual([0, 3, 2, 0, 7, 10, 0, 5]);
    for (const s of NEY_MOTIF) expect(A_MINOR.has(s)).toBe(true);
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
  it("piano and ney are instruments with music; ney is handled by the score, not pickNote", () => {
    expect(hasMusic("PNO")).toBe(true);
    expect(hasMusic("NEY")).toBe(true);
    expect(pickNote("NEY", "IST-FRA", 2000, PROGRESSION[0], 0, "dep")).toBeNull();
    expect(pickNote("PNO", "LHR-IST", 2000, PROGRESSION[0], 0, "dep")).toBe(pianoNote("LHR-IST", 2000, PROGRESSION[0], "dep"));
  });
  it("unknown region is silent", () => {
    expect(hasMusic("UNK")).toBe(false);
    expect(pickNote("UNK", "a-b", 100, PROGRESSION[0], 0, "dep")).toBeNull();
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

describe("snapToChord (circular pitch-class distance, ties to the lower pitch class)", () => {
  const am = PROGRESSION[0]; // 0, 3, 7
  const f = PROGRESSION[1]; // 8, 0, 3
  it("snaps to the nearest chord tone", () => {
    expect(snapToChord(2, am)).toBe(3); // d(3)=1, d(0)=2
    expect(snapToChord(10, am)).toBe(0); // d(0)=2 (circular), d(7)=3, d(3)=5
    expect(snapToChord(0, am)).toBe(0);
    expect(snapToChord(12 + 7, am)).toBe(7); // wraps mod 12
    expect(snapToChord(-1, am)).toBe(0); // 11 -> A, distance 1
  });
  it("ties go to the lower pitch class", () => {
    expect(snapToChord(5, am)).toBe(3); // d(3)=2, d(7)=2
    expect(snapToChord(10, f)).toBe(0); // d(8)=2, d(0)=2 (circular): pitch class 0 < 8
  });
});

describe("neyNote", () => {
  const am = PROGRESSION[0];
  it("weak beats keep the motif note; landings are an octave (octave 3 vs 4) lower", () => {
    expect(neyNote(1, 1, am, "dep")).toBeCloseTo(freqOf(4, 3), 9);
    expect(neyNote(1, 1, am, "arr")).toBeCloseTo(freqOf(3, 3), 9);
  });
  it("strong beats (beat % 4 === 0) snap to the chord", () => {
    expect(neyNote(5, 4, am, "dep")).toBeCloseTo(freqOf(4, 0), 9); // motif 10 (G) -> A
    expect(neyNote(2, 8, am, "dep")).toBeCloseTo(freqOf(4, 3), 9); // motif 2 (B) -> C
    expect(neyNote(7, 0, PROGRESSION[5], "dep")).toBeCloseTo(freqOf(4, 5), 9); // D stays D over Dm
  });
  it("slots wrap mod 8 and negative slots are safe", () => {
    expect(neyNote(9, 1, am, "dep")).toBe(neyNote(1, 1, am, "dep"));
    expect(neyNote(-1, 1, am, "dep")).toBe(neyNote(7, 1, am, "dep"));
    expect(Number.isFinite(neyNote(-100, 3, am, "arr"))).toBe(true);
  });
});

describe("pianoNote", () => {
  it("is deterministic and one of root, third, fifth, root+12 at the clamped octave", () => {
    const c = PROGRESSION[1];
    const fq = pianoNote("LHR-IST", 2000, c, "dep");
    expect(pianoNote("LHR-IST", 2000, c, "dep")).toBe(fq);
    const ok = [c.root, c.third, c.fifth, c.root + 12].some((t) => Math.abs(freqOf(4, t) - fq) < 1e-9);
    expect(ok).toBe(true);
  });
  it("clamps the octave to 3..5 and sounds landings an octave lower", () => {
    const c = PROGRESSION[0];
    const tones = [c.root, c.third, c.fifth, c.root + 12];
    const far = pianoNote("A-B", 9000, c, "dep"); // octaveFor 2 -> 3
    expect(tones.some((t) => Math.abs(freqOf(3, t) - far) < 1e-9)).toBe(true);
    expect(pianoNote("A-B", 9000, c, "arr")).toBe(far / 2 >= 55 ? far / 2 : far);
    const dep = pianoNote("A-B", 500, c, "dep");
    expect(pianoNote("A-B", 500, c, "arr")).toBeCloseTo(dep / 2, 9);
  });
});
