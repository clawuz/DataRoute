import { describe, expect, it } from "vitest";
import { SECTIONS, chordAtStep, hoursToBoundary, istanbulHour, nextChordAtStep, sectionAt, stepDur, swingDelay, type SectionId } from "../src/audio/form";
import { CHORDS } from "../src/audio/harmony";


describe("form: four sections of the Istanbul day", () => {
  it("sectionAt boundaries (hours wrap mod 24)", () => {
    const at = (h: number) => sectionAt(h).id;
    const cases: [number, SectionId][] = [
      [0, "NIGHT"], [5.99, "NIGHT"], [6, "MORNING"], [11.99, "MORNING"], [12, "DAY"], [17.99, "DAY"],
      [18, "EVENING"], [23.99, "EVENING"], [24, "NIGHT"], [-1, "EVENING"], [30, "MORNING"],
    ];
    for (const [h, id] of cases) expect([h, at(h)]).toEqual([h, id]);
  });
  it("v3 tempo, swing, harmonic rhythm, reverb and ney register per section", () => {
    const pick = (id: SectionId) => {
      const s = SECTIONS[id];
      return [s.id, s.bpm, s.swing, s.barsPerChord, s.progression.length, s.wet, s.neyOct];
    };
    expect(pick("NIGHT")).toEqual(["NIGHT", 84, 0.15, 2, 4, 0.45, 3]);
    expect(pick("MORNING")).toEqual(["MORNING", 100, 0.12, 1, 8, 0.35, 4]);
    expect(pick("DAY")).toEqual(["DAY", 116, 0.1, 1, 8, 0.25, 4]);
    expect(pick("EVENING")).toEqual(["EVENING", 92, 0.12, 1, 8, 0.4, 4]);
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

describe("form: v4 level ranges and section boundaries", () => {
  it("levelRange per section", () => {
    expect(SECTIONS.NIGHT.levelRange).toEqual([0, 1]);
    expect(SECTIONS.MORNING.levelRange).toEqual([1, 3]);
    expect(SECTIONS.DAY.levelRange).toEqual([2, 4]);
    expect(SECTIONS.EVENING.levelRange).toEqual([1, 3]);
  });
  it("hoursToBoundary: hours until the next of 6, 12, 18, 24 (a full 6 exactly on a boundary)", () => {
    expect(hoursToBoundary(5.5)).toBeCloseTo(0.5, 12);
    expect(hoursToBoundary(6)).toBe(6);
    expect(hoursToBoundary(11.9)).toBeCloseTo(0.1, 12);
    expect(hoursToBoundary(23.9)).toBeCloseTo(0.1, 12);
    expect(hoursToBoundary(0)).toBe(6);
    expect(hoursToBoundary(13)).toBe(5);
    expect(hoursToBoundary(24)).toBe(6); // wraps
    expect(hoursToBoundary(-1)).toBe(1); // 23:00
  });
});
