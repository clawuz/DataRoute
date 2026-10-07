import { describe, expect, it } from "vitest";
import { grooveStep, type GrooveHit, type Voice } from "../src/audio/groove";
import { CHORDS, type Chord } from "../src/audio/harmony";
import { SECTIONS, type Section, type SectionId } from "../src/audio/form";
import { freqOf } from "../src/audio/theory";

const { Dm9, Bbmaj7, Gm9, Gm7, A7b9, C7_9, Fmaj7, Em7b5 } = CHORDS;
const { NIGHT, MORNING, DAY, EVENING } = SECTIONS;
/** pitch class (above A) of a frequency */
const pcOf = (f: number) => ((Math.round(12 * Math.log2(f / 110)) % 12) + 12) % 12;
const semisOf = (f: number) => 12 * Math.log2(f / 110);

const bar = (chord: Chord, next: Chord, sec: Section) => Array.from({ length: 16 }, (_, s) => grooveStep(s, chord, next, sec));
const stepsOf = (voice: Voice, chord: Chord, next: Chord, sec: Section) =>
  bar(chord, next, sec).flatMap((hits, s) => (hits.some((h) => h.voice === voice) ? [s] : []));
const hitAt = (s: number, voice: Voice, chord: Chord, next: Chord, sec: Section): GrooveHit =>
  grooveStep(s, chord, next, sec).find((h) => h.voice === voice)!;

describe("groove: DAY, the full Farandole-spirit groove", () => {
  const at = (v: Voice) => stepsOf(v, Dm9, Bbmaj7, DAY);
  it("drum pattern: syncopated kick, snare on 2 and 4, 16th hats with an open hat on 14", () => {
    expect(at("KICK")).toEqual([0, 6, 10]);
    expect(at("SNARE")).toEqual([4, 12]);
    expect(at("OHAT")).toEqual([14]);
    expect(at("HAT")).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15]); // the open hat replaces the closed one
  });
  it("velocities: kick 1, snare 0.9, hat 0.55 on 8ths / 0.3 on ghost 16ths, open hat 0.5, bass 0.8, keys 0.6, brass 0.8", () => {
    const v = (s: number, voice: Voice) => hitAt(s, voice, Dm9, Bbmaj7, DAY).vel;
    expect([v(0, "KICK"), v(4, "SNARE"), v(2, "HAT"), v(3, "HAT"), v(14, "OHAT"), v(0, "BASS"), v(2, "KEYS"), v(3, "BRASS")]).toEqual([
      1, 0.9, 0.55, 0.3, 0.5, 0.8, 0.6, 0.8,
    ]);
  });
  it("bass ostinato on [0,3,6,8,11,14]: root, root, fifth, octave, approach to the next root, fifth", () => {
    expect(at("BASS")).toEqual([0, 3, 6, 8, 11, 14]);
    const f = (s: number) => hitAt(s, "BASS", Dm9, Bbmaj7, DAY).freq;
    // Dm9 root pc 5 (D) in octave 1: freqOf(1, 5) ≈ 73.42 Hz
    expect(f(0)).toBe(freqOf(1, 5));
    expect(f(3)).toBe(freqOf(1, 5));
    expect(f(6)).toBe(freqOf(1, 12)); // fifth: 5 + 7 = 12 (A)
    expect(f(8)).toBe(freqOf(1, 17)); // octave root (D2)
    expect(f(11)).toBe(freqOf(1, 0)); // next root Bb = pc 1 → semitone below = pc 0 (A1, 55 Hz)
    expect(f(11)).toBe(55);
    expect(f(14)).toBe(freqOf(1, 12));
  });
  it("step 11 plays the chord's seventh when the next chord has the same root", () => {
    expect(hitAt(11, "BASS", Dm9, Dm9, DAY).freq).toBe(freqOf(1, 15)); // D + 10 = C (♭7)
    expect(hitAt(11, "BASS", Gm9, Gm7, DAY).freq).toBe(freqOf(1, 20)); // G + 10 = F (♭7)
    expect(hitAt(11, "BASS", Bbmaj7, Bbmaj7, DAY).freq).toBe(freqOf(1, 12)); // Bb + 11 = A (maj7, in the lydian scale)
    expect(hitAt(11, "BASS", A7b9, Dm9, DAY).freq).toBe(freqOf(1, 4)); // approach to D: C# (pc 4)
    expect(hitAt(11, "BASS", Em7b5, A7b9, DAY).freq).toBe(freqOf(1, 11)); // approach to A: G# (pc 11)
  });
  it("Em7b5: the bass fifth is the chord's ♭5 (stays in the locrian scale)", () => {
    expect(hitAt(6, "BASS", Em7b5, A7b9, DAY).freq).toBe(freqOf(1, 13)); // E + 6 = Bb
  });
  it("keys comp on [2,7,10]: rootless 3-7-9-5 voicing in octaves 3–4", () => {
    expect(at("KEYS")).toEqual([2, 7, 10]);
    const k = hitAt(2, "KEYS", Dm9, Bbmaj7, DAY).freqs!;
    // Dm9: 3rd F (8) → 20, 7th C (3) → 27, 9th E (7) → 31, 5th A (0) → 36
    expect(k.map(semisOf).map((x) => Math.round(x * 1e6) / 1e6)).toEqual([20, 27, 31, 36]);
    const em = hitAt(7, "KEYS", Em7b5, A7b9, DAY).freqs!;
    // Em7b5: 3rd G (10) → 22, 7th D (5) → 29, "9th" = 3rd → 34, 5th Bb (1) → 37 folds to 25
    expect(em.map(semisOf).map((x) => Math.round(x * 1e6) / 1e6)).toEqual([22, 25, 29, 34]);
  });
  it("brass stabs on [3,11]: 3rd, 7th, 9th in octaves 4–5", () => {
    expect(at("BRASS")).toEqual([3, 11]);
    const b = hitAt(3, "BRASS", Dm9, Bbmaj7, DAY).freqs!;
    // Dm9: F (8) → 32, C (3) → 39, E (7) → 43
    expect(b.map(semisOf).map((x) => Math.round(x * 1e6) / 1e6)).toEqual([32, 39, 43]);
  });
  it("no saxophone pad by day", () => {
    expect(at("SAXPAD")).toEqual([]);
  });
});

describe("groove: the other sections", () => {
  it("MORNING: kick [0,10], snare [4,12], 8th hats, bass [0,6,8,14], keys [2,10], no brass; velocities × 0.8", () => {
    const at = (v: Voice) => stepsOf(v, Dm9, Bbmaj7, MORNING);
    expect([at("KICK"), at("SNARE"), at("HAT"), at("OHAT"), at("BASS"), at("KEYS"), at("BRASS"), at("SAXPAD")]).toEqual([
      [0, 10], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14], [], [0, 6, 8, 14], [2, 10], [], [],
    ]);
    const v = (s: number, voice: Voice) => hitAt(s, voice, Dm9, Bbmaj7, MORNING).vel;
    expect(v(0, "KICK")).toBeCloseTo(0.8, 12);
    expect(v(4, "SNARE")).toBeCloseTo(0.72, 12);
    expect(v(2, "HAT")).toBeCloseTo(0.44, 12);
    expect(v(0, "BASS")).toBeCloseTo(0.64, 12);
    expect(v(2, "KEYS")).toBeCloseTo(0.48, 12);
    expect(hitAt(8, "BASS", Dm9, Bbmaj7, MORNING).freq).toBe(freqOf(1, 17));
  });
  it("NIGHT: kick [0,8], hats [4,12], one long bass note, keys arpeggio [0,6,10]; velocities × 0.45", () => {
    const at = (v: Voice) => stepsOf(v, Dm9, Bbmaj7, NIGHT);
    expect([at("KICK"), at("SNARE"), at("HAT"), at("OHAT"), at("BASS"), at("KEYS"), at("BRASS"), at("SAXPAD")]).toEqual([
      [0, 8], [], [4, 12], [], [0], [0, 6, 10], [], [],
    ]);
    expect(hitAt(0, "KICK", Dm9, Bbmaj7, NIGHT).vel).toBeCloseTo(0.45, 12);
    expect(hitAt(4, "HAT", Dm9, Bbmaj7, NIGHT).vel).toBeCloseTo(0.55 * 0.45, 12);
    const b = hitAt(0, "BASS", Dm9, Bbmaj7, NIGHT);
    expect([b.freq, b.long, b.vel]).toEqual([freqOf(1, 5), true, 0.8 * 0.45]);
    // arpeggio climbs the voicing one tone at a time: F (20), C (27), E (31)
    const arp = [0, 6, 10].map((s) => hitAt(s, "KEYS", Dm9, Bbmaj7, NIGHT).freq!);
    expect(arp.map(semisOf).map((x) => Math.round(x * 1e6) / 1e6)).toEqual([20, 27, 31]);
  });
  it("EVENING: kick [0,8], snare [12], 8th hats, bass [0,8,11], keys [2,8], a long sax pad on the bar line; × 0.7", () => {
    const at = (v: Voice) => stepsOf(v, Fmaj7, Gm9, EVENING);
    expect([at("KICK"), at("SNARE"), at("HAT"), at("OHAT"), at("BASS"), at("KEYS"), at("BRASS"), at("SAXPAD")]).toEqual([
      [0, 8], [12], [0, 2, 4, 6, 8, 10, 12, 14], [], [0, 8, 11], [2, 8], [], [0],
    ]);
    expect(hitAt(12, "SNARE", Fmaj7, Gm9, EVENING).vel).toBeCloseTo(0.9 * 0.7, 12);
    expect(hitAt(11, "BASS", Fmaj7, Gm9, EVENING).freq).toBe(freqOf(1, 9)); // approach to G (pc 10): F# = pc 9
    const sax = hitAt(0, "SAXPAD", Fmaj7, Gm9, EVENING);
    expect([sax.freq, sax.long]).toEqual([freqOf(3, 0), true]); // 3rd of Fmaj7 = A (pc 0) in octave 3
    expect(hitAt(0, "SAXPAD", Dm9, Bbmaj7, EVENING).freq).toBe(freqOf(3, 8)); // 3rd of Dm9 = F
  });
});

describe("groove: invariants over every chord and section", () => {
  const ids: SectionId[] = ["NIGHT", "MORNING", "DAY", "EVENING"];
  const chords = [Dm9, Bbmaj7, Gm9, Gm7, A7b9, C7_9, Fmaj7, Em7b5];
  it("pitched voices stay in the chord scale (except the approach note) and in their registers", () => {
    for (const id of ids)
      for (const c of chords)
        for (const n of chords)
          for (let s = 0; s < 16; s++)
            for (const h of grooveStep(s, c, n, SECTIONS[id])) {
              const fs = h.freqs ?? (h.freq !== undefined ? [h.freq] : []);
              const approach = h.voice === "BASS" && s === 11 && n.root !== c.root;
              for (const f of fs) {
                if (approach) expect(pcOf(f)).toBe((n.root + 11) % 12);
                else expect([id, c.id, s, h.voice, c.scale.includes(pcOf(f))]).toEqual([id, c.id, s, h.voice, true]);
                if (h.voice === "BASS") {
                  expect(f).toBeGreaterThanOrEqual(freqOf(1, 0));
                  expect(f).toBeLessThan(freqOf(3, 0));
                }
                if (h.voice === "KEYS") {
                  expect(f).toBeGreaterThanOrEqual(freqOf(3, 0) - 1e-9);
                  expect(f).toBeLessThanOrEqual(freqOf(5, 0) + 1e-9);
                }
                if (h.voice === "BRASS") {
                  expect(f).toBeGreaterThanOrEqual(freqOf(4, 0) - 1e-9);
                  expect(f).toBeLessThanOrEqual(freqOf(6, 0) + 1e-9);
                }
              }
              if (h.voice === "KEYS" && h.freqs) expect(h.freqs.length).toBe(4);
              expect(h.vel).toBeGreaterThan(0);
              expect(h.vel).toBeLessThanOrEqual(1);
            }
  });
  it("brass only by day, the sax pad only in the evening on step 0", () => {
    for (const id of ids)
      for (let s = 0; s < 16; s++) {
        const voices = grooveStep(s, Dm9, Bbmaj7, SECTIONS[id]).map((h) => h.voice);
        if (id !== "DAY") expect(voices).not.toContain("BRASS");
        expect(voices.includes("SAXPAD")).toBe(id === "EVENING" && s === 0);
      }
  });
  it("is deterministic and wraps the step into the bar", () => {
    expect(grooveStep(6, C7_9, Fmaj7, DAY)).toEqual(grooveStep(6, C7_9, Fmaj7, DAY));
    expect(grooveStep(16 + 6, C7_9, Fmaj7, DAY)).toEqual(grooveStep(6, C7_9, Fmaj7, DAY));
    expect(grooveStep(-10, C7_9, Fmaj7, DAY)).toEqual(grooveStep(6, C7_9, Fmaj7, DAY));
  });
});
