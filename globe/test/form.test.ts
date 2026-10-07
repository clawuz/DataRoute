import { describe, expect, it } from "vitest";
import {
  LEGACY_SECTIONS, SECTIONS, chordAtStep, istanbulHour, legacySectionAt, nextChordAtStep, sectionAt, stepDur, swingDelay, type SectionId,
} from "../src/audio/form";
import { CHORDS } from "../src/audio/harmony";

const A_MINOR = new Set([0, 2, 3, 5, 7, 8, 10]);
const pc = (s: number) => ((s % 12) + 12) % 12;

describe("form: four sections of the Istanbul day", () => {
  it("sectionAt boundaries (hours wrap mod 24)", () => {
    const at = (h: number) => sectionAt(h).id;
    const cases: [number, SectionId][] = [
      [0, "NIGHT"], [5.99, "NIGHT"], [6, "MORNING"], [11.99, "MORNING"], [12, "DAY"], [17.99, "DAY"],
      [18, "EVENING"], [23.99, "EVENING"], [24, "NIGHT"], [-1, "EVENING"], [30, "MORNING"],
    ];
    for (const [h, id] of cases) expect([h, at(h)]).toEqual([h, id]);
  });
  it("v3 tempo, swing, harmonic rhythm, density, reverb and ney register per section", () => {
    const pick = (id: SectionId) => {
      const s = SECTIONS[id];
      return [s.id, s.bpm, s.swing, s.barsPerChord, s.progression.length, s.maxNotes, s.wet, s.neyOct];
    };
    expect(pick("NIGHT")).toEqual(["NIGHT", 84, 0.15, 2, 4, 1, 0.45, 3]);
    expect(pick("MORNING")).toEqual(["MORNING", 100, 0.12, 1, 8, 2, 0.35, 4]);
    expect(pick("DAY")).toEqual(["DAY", 116, 0.1, 1, 8, 2, 0.25, 4]);
    expect(pick("EVENING")).toEqual(["EVENING", 92, 0.12, 1, 8, 2, 0.4, 4]);
  });
  it("v3 progressions (chord ids of the harmony table); the evening resolves on Dm9", () => {
    expect(SECTIONS.NIGHT.progression).toEqual(["Dm9", "Bbmaj7", "Gm9", "A7b9"]);
    expect(SECTIONS.MORNING.progression).toEqual(["Dm9", "Bbmaj7", "Gm7", "A7b9", "Dm9", "Bbmaj7", "Em7b5", "A7b9"]);
    expect(SECTIONS.DAY.progression).toEqual(["Dm9", "Bbmaj7", "Gm9", "C7_9", "Fmaj7", "Bbmaj7", "Em7b5", "A7b9"]);
    expect(SECTIONS.EVENING.progression).toEqual(["Fmaj7", "Gm9", "Em7b5", "A7b9", "Dm9", "Bbmaj7", "Gm9", "Dm9"]);
    for (const s of Object.values(SECTIONS)) for (const id of s.progression) expect(CHORDS[id].id).toBe(id);
  });
  it("Istanbul local hour is UTC+3", () => {
    expect(istanbulHour(0)).toBe(3);
    expect(istanbulHour(21 * 3600)).toBe(0); // 21:00 UTC = 00:00 Istanbul
    expect(istanbulHour(20 * 3600 + 1800)).toBeCloseTo(23.5, 12);
    expect(istanbulHour(-3 * 3600)).toBe(0);
    for (const t of [1_800_000_000, 1_800_012_345, -42]) {
      expect(istanbulHour(t)).toBeGreaterThanOrEqual(0);
      expect(istanbulHour(t)).toBeLessThan(24);
    }
  });
  it("ensembles: night is sparse, the day is full, the winds enter by section", () => {
    const has = (id: SectionId) => (i: string) => SECTIONS[id].instruments.has(i as never);
    const sorted = (id: SectionId) => [...SECTIONS[id].instruments].sort();
    expect(sorted("NIGHT")).toEqual(["AME", "DOM", "NEY", "PNO"]);
    expect(sorted("MORNING")).toEqual(["AFR", "AME", "ASI", "CLA", "DOM", "EUR", "NEY", "PNO"]);
    expect(sorted("DAY")).toEqual(["AFR", "AME", "ASI", "CLA", "DOM", "EUR", "MEA", "NEY", "PNO", "TPT"]);
    expect(sorted("EVENING")).toEqual(["AME", "CLA", "DOM", "EUR", "MEA", "NEY", "PNO", "SAX"]);
    expect(["AFR", "CLA", "SAX", "TPT"].some(has("NIGHT"))).toBe(false);
    expect([has("MORNING")("CLA"), has("MORNING")("SAX"), has("MORNING")("TPT")]).toEqual([true, false, false]);
    expect([has("DAY")("MEA"), has("DAY")("CLA"), has("DAY")("TPT"), has("DAY")("SAX")]).toEqual([true, true, true, false]);
    expect([has("EVENING")("CLA"), has("EVENING")("SAX"), has("EVENING")("TPT")]).toEqual([true, true, false]);
  });
});

describe("form: 16th-step clock and chord at step (v3)", () => {
  const { NIGHT, DAY, EVENING } = SECTIONS;
  it("a step is a 16th note: 60 / bpm / 4", () => {
    expect(stepDur(DAY)).toBeCloseTo(60 / 116 / 4, 12); // ≈ 0.1293 s
    expect(stepDur(NIGHT)).toBeCloseTo(60 / 84 / 4, 12);
  });
  it("odd steps are late by swing · stepDur, even steps on time", () => {
    expect(swingDelay(1, DAY)).toBeCloseTo(0.1 * (60 / 116 / 4), 12);
    expect(swingDelay(2, DAY)).toBe(0);
    expect(swingDelay(0, DAY)).toBe(0);
    expect(swingDelay(15, NIGHT)).toBeCloseTo(0.15 * (60 / 84 / 4), 12);
  });
  it("chordAtStep: 16 steps a bar, barsPerChord bars a chord, wrapping", () => {
    expect(chordAtStep(0, DAY).id).toBe("Dm9");
    expect(chordAtStep(15, DAY).id).toBe("Dm9");
    expect(chordAtStep(16, DAY).id).toBe("Bbmaj7");
    expect(chordAtStep(16 * 3 + 5, DAY).id).toBe("C7_9");
    expect(chordAtStep(16 * 8, DAY).id).toBe("Dm9"); // wraps after 8 bars
    expect(chordAtStep(16 * 2, NIGHT).id).toBe("Bbmaj7"); // 2 bars a chord
    expect(chordAtStep(16 * 2 - 1, NIGHT).id).toBe("Dm9");
    expect(chordAtStep(16 * 8, NIGHT).id).toBe("Dm9"); // 4 chords × 2 bars
    expect(chordAtStep(16 * 7, EVENING).id).toBe("Dm9");
    expect(chordAtStep(-5, DAY).id).toBe("Dm9"); // negative steps clamp to the start
  });
  it("nextChordAtStep is the chord one chord-length later", () => {
    expect(nextChordAtStep(0, DAY).id).toBe("Bbmaj7");
    expect(nextChordAtStep(16 * 7 + 11, DAY).id).toBe("Dm9"); // A7b9 → wraps to Dm9
    expect(nextChordAtStep(0, NIGHT).id).toBe("Bbmaj7");
    expect(nextChordAtStep(16, NIGHT).id).toBe("Bbmaj7"); // second bar of Dm9 → 32 steps later: bar 3 = Bbmaj7
    expect(nextChordAtStep(16 * 7, EVENING).id).toBe("Fmaj7");
  });
});

// v2 data kept for the engine/score/ney code until Task 13 migrates it.
describe("form: legacy v2 sections", () => {
  const SECTIONS = LEGACY_SECTIONS;
  it("legacySectionAt mirrors sectionAt and shares the ensemble data", () => {
    for (const h of [0, 7, 13, 19]) {
      expect(legacySectionAt(h)).toBe(LEGACY_SECTIONS[sectionAt(h).id]);
      const [v3, v2] = [sectionAt(h), legacySectionAt(h)];
      expect([v2.wet, v2.maxNotes, v2.neyOct, v2.instruments]).toEqual([v3.wet, v3.maxNotes, v3.neyOct, v3.instruments]);
    }
    expect([SECTIONS.NIGHT.bpm, SECTIONS.MORNING.bpm, SECTIONS.DAY.bpm, SECTIONS.EVENING.bpm]).toEqual([72, 84, 96, 80]);
    for (const s of Object.values(SECTIONS)) expect(s.beatsPerChord).toBe(8);
  });
  it("progressions: 4/4/4/8 chords, the specified names, the evening resolves on Am", () => {
    const names = (id: SectionId) => SECTIONS[id].progression.map((c) => c.name);
    expect(names("NIGHT")).toEqual(["Am(add9)", "Am9", "Fmaj7", "Gsus4"]);
    expect(names("MORNING")).toEqual(["Am", "F", "C", "G"]);
    expect(names("DAY")).toEqual(["C", "G", "Am", "F"]);
    expect(names("EVENING")).toEqual(["Dm", "Am", "F", "C", "Dm", "F", "G", "Am"]);
    const n = SECTIONS.NIGHT.progression;
    expect(n[0]).toEqual({ name: "Am(add9)", root: 0, third: 3, fifth: 7, ninth: 2 });
    expect(n[1]).toEqual({ name: "Am9", root: 0, third: 3, fifth: 7, seventh: 10, ninth: 2 });
    expect(n[2]).toEqual({ name: "Fmaj7", root: 8, third: 0, fifth: 3, seventh: 7 });
    expect(n[3]).toEqual({ name: "Gsus4", root: 10, third: 3, fifth: 5 });
    expect(SECTIONS.EVENING.progression[0]).toEqual({ name: "Dm", root: 5, third: 8, fifth: 0, seventh: 3 });
    expect(SECTIONS.DAY.progression[0]).toEqual({ name: "C", root: 3, third: 7, fifth: 10, seventh: 2 });
  });
  it("every chord tone of every progression lies in A natural minor", () => {
    for (const s of Object.values(SECTIONS))
      for (const c of s.progression)
        for (const t of [c.root, c.third, c.fifth, c.seventh, c.ninth]) if (t !== undefined) expect([s.id, c.name, A_MINOR.has(pc(t))]).toEqual([s.id, c.name, true]);
  });
});
