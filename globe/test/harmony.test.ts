import { describe, expect, it } from "vitest";
import { CHORDS, ladderFreq, scaleLadder, snapToScale, snapToTones, type Chord } from "../src/audio/harmony";
import { freqOf } from "../src/audio/theory";

const pc = (s: number) => ((s % 12) + 12) % 12;

describe("harmony: jazz chord table centred on D minor (pitch classes above A)", () => {
  it("has exactly the eight chords with the specified roots, tones, scales and names", () => {
    const table = Object.fromEntries(Object.entries(CHORDS).map(([k, c]) => [k, [c.id, c.name, c.root, c.tones, c.scale]]));
    expect(table).toEqual({
      Dm9: ["Dm9", "Dm9", 5, [5, 8, 0, 3, 7], [5, 7, 8, 10, 0, 2, 3]],
      Bbmaj7: ["Bbmaj7", "Bbmaj7", 1, [1, 5, 8, 0], [1, 3, 5, 7, 8, 10, 0]],
      Gm9: ["Gm9", "Gm9", 10, [10, 1, 5, 8, 0], [10, 0, 1, 3, 5, 7, 8]],
      Gm7: ["Gm7", "Gm7", 10, [10, 1, 5, 8], [10, 0, 1, 3, 5, 7, 8]],
      A7b9: ["A7b9", "A7(b9)", 0, [0, 4, 7, 10, 1], [0, 1, 4, 5, 7, 8, 10]],
      C7_9: ["C7_9", "C7(9)", 3, [3, 7, 10, 1, 5], [3, 5, 7, 8, 10, 0, 1]],
      Fmaj7: ["Fmaj7", "Fmaj7", 8, [8, 0, 3, 7], [8, 10, 0, 2, 3, 5, 7]],
      Em7b5: ["Em7b5", "Em7b5", 7, [7, 10, 1, 5], [7, 8, 10, 0, 1, 3, 5]],
    });
  });
  it("every chord: the root is the first tone, tones ⊂ scale, seven distinct scale pitch classes", () => {
    for (const c of Object.values(CHORDS)) {
      expect([c.id, c.tones[0]]).toEqual([c.id, c.root]);
      for (const t of c.tones) expect([c.id, t, c.scale.includes(t)]).toEqual([c.id, t, true]);
      expect(new Set(c.scale).size).toBe(7);
      for (const s of [...c.tones, ...c.scale]) expect(s === pc(s)).toBe(true);
    }
  });
});

describe("scaleLadder", () => {
  const Dm9 = CHORDS.Dm9;
  it("Dm9 over octaves 3–5: 21 ascending rungs, 12·(oct − 2) + pc", () => {
    // D dorian pcs sorted from A: 0 2 3 5 7 8 10 → octave 3 base 12, octave 4 base 24, octave 5 base 36
    expect(scaleLadder(Dm9)).toEqual([
      12, 14, 15, 17, 19, 20, 22,
      24, 26, 27, 29, 31, 32, 34,
      36, 38, 39, 41, 43, 44, 46,
    ]);
    expect(scaleLadder(Dm9)).toContain(12 + 5); // D3
  });
  it("every chord: strictly ascending, spans three octaves, every rung in the scale, every scale pc in every octave", () => {
    for (const c of Object.values(CHORDS)) {
      const l = scaleLadder(c);
      expect(l.length).toBe(21);
      for (let i = 1; i < l.length; i++) expect(l[i]).toBeGreaterThan(l[i - 1]);
      expect(l[0]).toBeGreaterThanOrEqual(12);
      expect(l.at(-1)!).toBeLessThan(48);
      for (const s of l) expect(c.scale.includes(pc(s))).toBe(true);
      for (const base of [12, 24, 36]) for (const p of c.scale) expect(l).toContain(base + p);
    }
  });
  it("custom octave range", () => {
    expect(scaleLadder(CHORDS.Bbmaj7, 2, 2)).toEqual([0, 1, 3, 5, 7, 8, 10]);
    expect(scaleLadder(CHORDS.Fmaj7, 4, 5).length).toBe(14);
  });
});

describe("snapToTones", () => {
  const { Dm9, Bbmaj7 } = CHORDS;
  it("returns the nearest chord tone (any octave)", () => {
    expect(snapToTones(17, Dm9)).toBe(17); // D is a tone
    expect(snapToTones(14, Dm9)).toBe(15); // B (pc 2): C (15) at 1 vs A (12) at 2
    expect(snapToTones(13, Dm9)).toBe(12); // Bb (pc 1): A (12) at 1 vs C (15) at 2
    expect(snapToTones(16.4, Dm9)).toBe(17); // non-integer input: D at 0.6 vs C at 1.4
  });
  it("ties go to the lower tone", () => {
    expect(snapToTones(18, Dm9)).toBe(17); // Eb (pc 6): D (17) and E (19) both at 1 → 17
    expect(snapToTones(15, Bbmaj7)).toBe(13); // C (pc 3): Bb (13) and D (17) both at 2 → 13
    expect(snapToTones(-2, Dm9)).toBe(-4); // G (pc 10): F (−4) and A (0) both at 2 → −4
    expect(snapToTones(16, Dm9)).toBe(15); // C# (pc 4): C (15) and D (17) both at 1 → 15
  });
  it("always returns a chord tone within 6 semitones", () => {
    const chords: Chord[] = Object.values(CHORDS);
    for (const c of chords)
      for (let s = -5; s < 50; s++) {
        const t = snapToTones(s, c);
        expect(c.tones.includes(pc(t))).toBe(true);
        expect(Math.abs(t - s)).toBeLessThanOrEqual(6);
      }
  });
});

describe("ladderFreq", () => {
  it("anchors A2 = 110 Hz and equals freqOf(2, semis)", () => {
    expect(ladderFreq(0)).toBe(110);
    expect(ladderFreq(12)).toBeCloseTo(220, 9);
    for (const s of [5, 17, 36, 46]) expect(ladderFreq(s)).toBe(freqOf(2, s));
  });
});

describe("snapToScale", () => {
  it("keeps scale pitches and moves others to the nearest scale pitch (ties → lower)", () => {
    const { Bbmaj7, A7b9, Dm9 } = CHORDS;
    expect(snapToScale(27, Bbmaj7)).toBe(27); // C is in Bb lydian
    expect(snapToScale(26, Bbmaj7)).toBe(25); // B: Bb (25) and C (27) tie → lower
    expect(snapToScale(38, Bbmaj7)).toBe(37);
    expect(snapToScale(2, A7b9)).toBe(1); // B → Bb (1 away) rather than C# (2 away)
    expect(snapToScale(3, A7b9)).toBe(4); // C → C# (1 away) rather than Bb (2 away)
    expect(snapToScale(-2, A7b9)).toBe(-2); // G (pc 10), below A2
    for (let s = -12; s <= 60; s++) for (const c of [Bbmaj7, A7b9, Dm9]) {
      const r = snapToScale(s, c);
      expect(c.scale.includes(pc(r))).toBe(true);
      expect(Math.abs(r - s)).toBeLessThanOrEqual(1);
    }
  });
});
