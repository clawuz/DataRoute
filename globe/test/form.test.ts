import { describe, expect, it } from "vitest";
import { SECTIONS, istanbulHour, sectionAt, type SectionId } from "../src/audio/form";

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
  it("tempos, density, reverb and ney register per section", () => {
    const pick = (id: SectionId) => {
      const s = SECTIONS[id];
      return [s.id, s.bpm, s.maxNotes, s.wet, s.neyOct, s.beatsPerChord];
    };
    expect(pick("NIGHT")).toEqual(["NIGHT", 72, 1, 0.45, 3, 8]);
    expect(pick("MORNING")).toEqual(["MORNING", 84, 2, 0.35, 4, 8]);
    expect(pick("DAY")).toEqual(["DAY", 96, 2, 0.25, 4, 8]);
    expect(pick("EVENING")).toEqual(["EVENING", 80, 2, 0.4, 4, 8]);
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
