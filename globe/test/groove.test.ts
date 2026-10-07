import { describe, expect, it } from "vitest";
import { bassHits, compHits, drumHits, fillAndBuild, layerHits, type GrooveHit, type Voice } from "../src/audio/groove";
import type { Level } from "../src/audio/arrangement";
import type { RegionName } from "../src/audio/theory";
import { CHORDS, type Chord } from "../src/audio/harmony";
import { SECTIONS } from "../src/audio/form";
import { freqOf } from "../src/audio/theory";

const { Dm9, Bbmaj7, Gm9, Gm7, A7b9, C7_9, Fmaj7, Em7b5 } = CHORDS;
const { NIGHT, MORNING, DAY, EVENING } = SECTIONS;
/** pitch class (above A) of a frequency */
const pcOf = (f: number) => ((Math.round(12 * Math.log2(f / 110)) % 12) + 12) % 12;
const semisOf = (f: number) => 12 * Math.log2(f / 110);

// v3 `grooveStep` (fixed section patterns) is gone: the section now only bounds the rhythm level (spec §4f).
// Its chord-degree checks are kept below on the level functions that inherited them.

describe("bass and voicing degrees (inherited from v3, now on the level functions)", () => {
  const bass = (level: Level, s: number, c: Chord, n: Chord) => bassHits(level, 0, s, c, n)[0].freq;
  it("step 11 approaches the next root from a semitone below, or plays the chord's seventh when the root stays", () => {
    for (const level of [2, 3] as Level[]) {
      expect(bass(level, 11, Dm9, Dm9)).toBe(freqOf(1, 15)); // D + 10 = C (♭7)
      expect(bass(level, 11, Gm9, Gm7)).toBe(freqOf(1, 20)); // G + 10 = F (♭7)
      expect(bass(level, 11, Bbmaj7, Bbmaj7)).toBe(freqOf(1, 12)); // Bb + 11 = A (maj7, in the lydian scale)
      expect(bass(level, 11, A7b9, Dm9)).toBe(freqOf(1, 4)); // approach to D: C# (pc 4)
      expect(bass(level, 11, Em7b5, A7b9)).toBe(freqOf(1, 11)); // approach to A: G# (pc 11)
      expect(bass(level, 11, Dm9, Bbmaj7)).toBe(55); // approach to Bb: A1
    }
  });
  it("Em7b5: the bass fifth is the chord's ♭5 (stays in the locrian scale)", () => {
    expect(bass(2, 6, Em7b5, A7b9)).toBe(freqOf(1, 13)); // E + 6 = Bb
    expect(bass(1, 8, Em7b5, A7b9)).toBe(freqOf(1, 19)); // the octave root E2
  });
  it("keys: rootless 3-7-9-5 voicing in octaves 3–4, the 3rd doubling a missing 9th (Em7b5)", () => {
    // Em7b5: 3rd G (10) → 22, 7th D (5) → 29, "9th" = 3rd → 34, 5th Bb (1) → 37 folds to 25
    expect(compHits(2, 7, Em7b5)[0].freqs!.map(semisOf).map((x) => Math.round(x * 1e6) / 1e6)).toEqual([22, 25, 29, 34]);
  });
  it("is deterministic and wraps the step into the bar", () => {
    for (const fn of [(s: number) => drumHits(3, 1, s), (s: number) => bassHits(3, 0, s, C7_9, Fmaj7), (s: number) => compHits(4, s, C7_9)]) {
      expect(fn(6)).toEqual(fn(6));
      expect(fn(16 + 6)).toEqual(fn(6));
      expect(fn(-10)).toEqual(fn(6));
    }
  });
  it("every section's level range plays a groove: NIGHT's quietest bar is a kick, a hat and one long bass note", () => {
    const voices = (level: Level) => Array.from({ length: 16 }, (_, s) => [...drumHits(level, 0, s), ...bassHits(level, 0, s, Dm9, Bbmaj7)]).flat().map((h) => h.voice);
    expect(voices(NIGHT.levelRange[0] as Level).sort()).toEqual(["BASS", "HAT", "KICK"]);
    expect(SECTIONS.DAY.levelRange).toEqual([2, 4]);
    expect([MORNING.levelRange, EVENING.levelRange, DAY.levelRange[0]]).toEqual([[1, 3], [1, 3], 2]);
  });
});

// ---------------------------------------------------------------- v4: levels, bar variants, layers, build-up

const ALL = Array.from({ length: 16 }, (_, i) => i);
const EVEN = ALL.filter((x) => x % 2 === 0);
const LEVELS: Level[] = [0, 1, 2, 3, 4];
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const steps = (fn: (s: number) => GrooveHit[], voice: Voice) => ALL.filter((s) => fn(s).some((h) => h.voice === voice));
const drum = (level: Level, b: number) => (v: Voice) => steps((s) => drumHits(level, b, s), v);
const velAt = (hits: GrooveHit[], v: Voice) => hits.filter((h) => h.voice === v).map((h) => r6(h.vel));

describe("v4 drums by level (spec §4f table)", () => {
  it("level 0: kick [0], hat [8]; velocities × 0.5", () => {
    const at = drum(0, 0);
    expect([at("KICK"), at("SNARE"), at("HAT"), at("OHAT"), at("SHAKER"), at("TOM")]).toEqual([[0], [], [8], [], [], []]);
    expect(velAt(drumHits(0, 0, 0), "KICK")).toEqual([0.5]);
    expect(velAt(drumHits(0, 0, 8), "HAT")).toEqual([0.275]); // 0.55 × 0.5
  });
  it("level 1: kick [0,8], soft snare [12], 8th hats; × 0.7", () => {
    const at = drum(1, 0);
    expect([at("KICK"), at("SNARE"), at("HAT"), at("OHAT"), at("SHAKER"), at("TOM")]).toEqual([[0, 8], [12], EVEN, [], [], []]);
    expect(velAt(drumHits(1, 0, 0), "KICK")).toEqual([0.7]);
    expect(velAt(drumHits(1, 0, 12), "SNARE")).toEqual([0.42]); // soft snare 0.6 × 0.7
    expect(velAt(drumHits(1, 0, 2), "HAT")).toEqual([0.385]); // 0.55 × 0.7
  });
  it("level 2: kick [0,6,10], snare [4,12], 16th hats accented on 8ths; × 0.9", () => {
    const at = drum(2, 0);
    expect([at("KICK"), at("SNARE"), at("HAT"), at("OHAT"), at("SHAKER"), at("TOM")]).toEqual([[0, 6, 10], [4, 12], ALL, [], [], []]);
    expect(velAt(drumHits(2, 0, 4), "SNARE")).toEqual([0.81]); // 0.9 × 0.9
    expect(velAt(drumHits(2, 0, 2), "HAT")).toEqual([0.495]); // 0.55 × 0.9
    expect(velAt(drumHits(2, 0, 3), "HAT")).toEqual([0.27]); // 0.3 × 0.9
  });
  it("level 3: level 2 + ghost snares [7,15], open hat [14] (no closed hat there), 16th shaker; × 1", () => {
    const at = drum(3, 0);
    expect([at("KICK"), at("SNARE"), at("OHAT"), at("TOM")]).toEqual([[0, 6, 10], [4, 7, 12, 15], [14], []]);
    expect(at("HAT")).toEqual(ALL.filter((s) => s !== 14));
    expect(at("SHAKER")).toEqual(ALL);
    expect([velAt(drumHits(3, 0, 7), "SNARE"), velAt(drumHits(3, 0, 4), "SNARE"), velAt(drumHits(3, 0, 14), "OHAT")]).toEqual([[0.3], [0.9], [0.5]]);
    expect([velAt(drumHits(3, 0, 0), "SHAKER"), velAt(drumHits(3, 0, 1), "SHAKER")]).toEqual([[0.5], [0.25]]);
    expect(drumHits(3, 0, 5).every((h) => h.offsetSteps === undefined)).toBe(true);
  });
  it("level 4: level 3 + kick [3], 32nd hat doubles, toms on steps 12–15 of odd bars", () => {
    const at = drum(4, 0);
    expect([at("KICK"), at("SNARE"), at("OHAT"), at("TOM")]).toEqual([[0, 3, 6, 10], [4, 7, 12, 15], [14], []]);
    expect(at("SHAKER")).toEqual(ALL);
    for (const s of ALL.filter((x) => x !== 14)) {
      const hats = drumHits(4, 0, s).filter((h) => h.voice === "HAT");
      expect(hats.map((h) => h.offsetSteps ?? 0)).toEqual([0, 0.5]);
      expect(hats.map((h) => r6(h.vel))).toEqual([s % 2 === 0 ? 0.55 : 0.3, 0.3]);
    }
    expect(drumHits(4, 0, 14).filter((h) => h.voice === "HAT")).toEqual([]);
    expect(drum(4, 1)("TOM")).toEqual([12, 13, 14, 15]);
    expect([12, 13, 14, 15].map((s) => velAt(drumHits(4, 1, s), "TOM")[0])).toEqual([0.5, 0.6, 0.75, 0.9]);
    expect(drum(4, 2)("TOM")).toEqual([]);
  });
});

describe("v4 drum bar variants (bar % 4)", () => {
  it("bar % 4 == 1 shifts the ghost snares one step later (15 + 1 wraps to 0)", () => {
    expect(drum(3, 1)("SNARE")).toEqual([0, 4, 8, 12]);
    expect(drum(4, 5)("SNARE")).toEqual([0, 4, 8, 12]);
    expect(velAt(drumHits(3, 1, 8), "SNARE")).toEqual([0.3]);
    expect(drum(2, 1)("SNARE")).toEqual([4, 12]); // no ghosts below level 3
  });
  it("bar % 4 == 3, level ≥ 3: a snare fill on 12–15 with rising velocity", () => {
    expect(drum(3, 3)("SNARE")).toEqual([4, 7, 12, 13, 14, 15]);
    expect([12, 13, 14, 15].map((s) => velAt(drumHits(3, 3, s), "SNARE"))).toEqual([[0.5], [0.6], [0.75], [0.9]]);
    expect(drum(3, 3)("TOM")).toEqual([]);
    expect(drum(4, 3)("SNARE")).toEqual([4, 7, 12, 13, 14, 15]);
    expect(drum(4, 3)("TOM")).toEqual([12, 13, 14, 15]); // odd bar: the level-4 toms too
    expect(drum(3, -1)("SNARE")).toEqual(drum(3, 3)("SNARE"));
  });
  it("bar % 4 == 3, level 2: toms on 14 and 15; levels 0–1 have no fill", () => {
    expect([drum(2, 3)("SNARE"), drum(2, 3)("TOM")]).toEqual([[4, 12], [14, 15]]);
    expect([velAt(drumHits(2, 3, 14), "TOM"), velAt(drumHits(2, 3, 15), "TOM")]).toEqual([[0.675], [0.81]]); // × 0.9
    for (const l of [0, 1] as Level[]) for (const v of ["KICK", "SNARE", "HAT", "TOM"] as Voice[]) expect(drum(l, 3)(v)).toEqual(drum(l, 0)(v));
    expect(drum(2, 2)("TOM")).toEqual([]);
  });
  it("wraps the step into the bar and is deterministic", () => {
    expect(drumHits(4, 3, 16 + 13)).toEqual(drumHits(4, 3, 13));
    expect(drumHits(2, 0, -10)).toEqual(drumHits(2, 0, 6));
  });
});

describe("v4 bass by level", () => {
  const f = (level: Level, b: number, c: Chord, n: Chord) => ALL.map((s) => bassHits(level, b, s, c, n).map((h) => r6(semisOf(h.freq!) + 12)));
  // semisOf is relative to A2 (110 Hz); +12 → semitones above A1 (freqOf(1, ·))
  it("level 0: one long root; level 1: root and octave on [0,8]; velocities scaled", () => {
    expect(steps((s) => bassHits(0, 0, s, Dm9, Bbmaj7), "BASS")).toEqual([0]);
    const b = bassHits(0, 0, 0, Dm9, Bbmaj7)[0];
    expect([b.freq, b.long, r6(b.vel)]).toEqual([freqOf(1, 5), true, 0.4]);
    expect(steps((s) => bassHits(1, 0, s, Dm9, Bbmaj7), "BASS")).toEqual([0, 8]);
    expect(f(1, 0, Dm9, Bbmaj7).flat()).toEqual([5, 17]);
    expect(bassHits(1, 0, 0, Dm9, Bbmaj7)[0].long).toBeUndefined();
  });
  it("level 2: the ostinato [0,3,6,8,11,14]", () => {
    expect(steps((s) => bassHits(2, 0, s, Dm9, Bbmaj7), "BASS")).toEqual([0, 3, 6, 8, 11, 14]);
    expect(f(2, 0, Dm9, Bbmaj7).flat()).toEqual([5, 5, 12, 17, 0, 12]); // root, root, fifth, octave, approach A1 (to Bb), fifth
    expect(r6(bassHits(2, 0, 0, Dm9, Bbmaj7)[0].vel)).toBe(0.72); // 0.8 × 0.9
  });
  it("level 3: ostinato + passing 16ths on 2 (scale step above the root), 9 (below the octave), 13 (below the fifth)", () => {
    expect(steps((s) => bassHits(3, 0, s, Dm9, Bbmaj7), "BASS")).toEqual([0, 2, 3, 6, 8, 9, 11, 13, 14]);
    // Dm9 (D dorian): D 5, E 7, D, A 12, D 17, C 15, approach A1 0, G 10, A 12
    expect(f(3, 0, Dm9, Bbmaj7).flat()).toEqual([5, 7, 5, 12, 17, 15, 0, 10, 12]);
    // A7b9 (A phrygian dominant) → Dm9: A 0, Bb 1, A, E 7, A 12, G 10, approach C# 4, D 5, E 7
    expect(f(3, 0, A7b9, Dm9).flat()).toEqual([0, 1, 0, 7, 12, 10, 4, 5, 7]);
  });
  it("level 4: a walking 16th run, up on even bars, down on odd bars, ending on the approach to the next root", () => {
    expect(steps((s) => bassHits(4, 0, s, Dm9, Bbmaj7), "BASS")).toEqual(ALL);
    // D dorian ladder in octaves 1–2: 0 2 3 5 7 8 10 | 12 14 15 17 19 20 22; up from D (5), folding down an octave past the top
    expect(f(4, 0, Dm9, Bbmaj7).flat()).toEqual([5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22, 12, 14, 15, 17, 12]);
    // down from the octave D (17), folding up an octave past the bottom; approach A nearest to the last note (5): 0
    expect(f(4, 1, Dm9, Bbmaj7).flat()).toEqual([17, 15, 14, 12, 10, 8, 7, 5, 3, 2, 0, 10, 8, 7, 5, 0]);
    expect(f(4, 2, Dm9, Bbmaj7)).toEqual(f(4, 0, Dm9, Bbmaj7));
    expect(f(4, 0, Dm9, Dm9)[15]).toEqual([16]); // same root: still a semitone below (C#), nearest to 17
  });
});

describe("v4 comping by level", () => {
  const keys = (l: Level) => steps((s) => compHits(l, s, Dm9), "KEYS");
  const brass = (l: Level) => steps((s) => compHits(l, s, Dm9), "BRASS");
  it("keys steps per level; brass only from level 3", () => {
    expect(LEVELS.map(keys)).toEqual([[0, 10], [2, 10], [2, 7, 10], [2, 7, 10], [2, 5, 7, 10, 13]]);
    expect(LEVELS.map(brass)).toEqual([[], [], [], [3, 11], [3, 6, 11, 14]]);
  });
  it("level 0 arpeggiates the voicing one tone a hit; above, the full rootless voicing", () => {
    expect([0, 10].map((s) => r6(semisOf(compHits(0, s, Dm9)[0].freq!)))).toEqual([20, 27]);
    expect(compHits(2, 7, Dm9)[0].freqs!.map((x) => r6(semisOf(x)))).toEqual([20, 27, 31, 36]);
    expect(compHits(4, 6, Dm9)[0].freqs!.map((x) => r6(semisOf(x)))).toEqual([32, 39, 43]);
    expect([r6(compHits(0, 0, Dm9)[0].vel), r6(compHits(3, 3, Dm9)[0].vel)]).toEqual([0.3, 0.8]); // keys 0.6 × 0.5, brass 0.8 × 1
  });
});

describe("v4 region layer percussion", () => {
  const lay = (r: RegionName, b = 0) => (v: Voice) => steps((s) => layerHits(r, s, b), v);
  it("MEA darbuka: euclid(5,8) on the 8th steps", () => {
    expect(lay("MEA")("DARBUKA")).toEqual([0, 4, 6, 10, 12]); // E(5,8) = x.xx.xx. → slots 0,2,3,5,6
    expect(lay("MEA", 7)("DARBUKA")).toEqual([0, 4, 6, 10, 12]);
  });
  it("AFR conga: euclid(7,12) rotated by bar % 3, laid over 16 steps (first step of each 12-grid slot)", () => {
    // E(7,12) = x.xx.x.xx.x. → slots 0,2,3,5,7,8,10; slot → first step: 0→0 1→2 2→3 3→4 4→6 5→7 6→8 7→10 8→11 9→12 10→14 11→15
    expect(lay("AFR", 0)("CONGA")).toEqual([0, 3, 4, 7, 10, 11, 14]);
    expect(lay("AFR", 1)("CONGA")).toEqual([2, 4, 6, 8, 11, 12, 15]); // slots 1,3,4,6,8,9,11
    expect(lay("AFR", 2)("CONGA")).toEqual([0, 3, 6, 7, 10, 12, 14]); // slots 0,2,4,5,7,9,10
    expect(lay("AFR", 3)("CONGA")).toEqual(lay("AFR", 0)("CONGA"));
    for (const b of [0, 1, 2]) expect(lay("AFR", b)("CONGA").length).toBe(7);
  });
  it("ASI taiko: euclid(3,8) on the 8th steps; AME timpani [0,8]; EUR shaker every step", () => {
    expect(lay("ASI")("TAIKO")).toEqual([0, 6, 12]);
    expect(lay("AME")("TIMP")).toEqual([0, 8]);
    expect(lay("EUR")("SHAKER")).toEqual(ALL);
    expect([velAt(layerHits("EUR", 2, 0), "SHAKER"), velAt(layerHits("EUR", 3, 0), "SHAKER")]).toEqual([[0.5], [0.25]]);
  });
  it("DOM and UNK add no percussion; every hit is unpitched and one voice per region", () => {
    for (const s of ALL) expect([...layerHits("DOM", s, 0), ...layerHits("UNK", s, 0)]).toEqual([]);
    const voice: Record<string, Voice> = { MEA: "DARBUKA", AFR: "CONGA", ASI: "TAIKO", AME: "TIMP", EUR: "SHAKER" };
    for (const r of Object.keys(voice) as RegionName[])
      for (const b of [0, 1, 2, 3])
        for (const s of ALL)
          for (const h of layerHits(r, s, b)) {
            expect(h.voice).toBe(voice[r]);
            expect(h.freq).toBeUndefined();
            expect(h.vel).toBeGreaterThan(0);
            expect(h.vel).toBeLessThanOrEqual(1);
          }
  });
});

describe("v4 build-up and tutti hit", () => {
  it("build: snare and hat every step, riser on step 0 of the first build bar, bass octave pulse on the beats", () => {
    const at = (b: number, amount = 0.5) => (v: Voice) => steps((s) => fillAndBuild("build", amount, s, b, Dm9), v);
    expect([at(0)("SNARE"), at(0)("HAT"), at(0)("RISER"), at(0)("BASS")]).toEqual([ALL, ALL, [0], [0, 4, 8, 12]]);
    expect(at(1)("RISER")).toEqual([]);
    expect([0, 0.5, 1].map((a) => velAt(fillAndBuild("build", a, 5, 0, Dm9), "SNARE")[0])).toEqual([0.3, 0.65, 1]);
    expect([0, 0.5, 1].map((a) => velAt(fillAndBuild("build", a, 5, 0, Dm9), "HAT")[0])).toEqual([0.3, 0.5, 0.7]);
    expect([0, 4, 8, 12].map((s) => fillAndBuild("build", 0.5, s, 0, Dm9).find((h) => h.voice === "BASS")!.freq)).toEqual([
      freqOf(1, 5), freqOf(1, 17), freqOf(1, 5), freqOf(1, 17),
    ]);
  });
  it("hit: crash + kick + the brass full voicing (3rd, 7th, 9th, 5th in octaves 4–5) on step 0 only", () => {
    const h = fillAndBuild("hit", 1, 0, 0, Dm9);
    expect(h.map((x) => x.voice)).toEqual(["CRASH", "KICK", "BRASS"]);
    expect(h.every((x) => x.vel === 1)).toBe(true);
    expect(h[2].freqs!.map((x) => r6(semisOf(x)))).toEqual([32, 39, 43, 48]); // F, C, E, A
    expect(fillAndBuild("hit", 1, 0, 0, Em7b5)[2].freqs!.map((x) => r6(semisOf(x)))).toEqual([34, 37, 41, 46]); // G, Bb, D, G
    for (const s of ALL.slice(1)) expect(fillAndBuild("hit", 1, s, 0, Dm9)).toEqual([]);
  });
  it("none: nothing", () => {
    for (const s of ALL) expect(fillAndBuild("none", 0, s, 0, Dm9)).toEqual([]);
  });
});

describe("v4 invariants over every level, bar and chord", () => {
  const chords = [Dm9, Bbmaj7, Gm9, Gm7, A7b9, C7_9, Fmaj7, Em7b5];
  it("pitched hits stay in the chord scale (bass approach notes excepted) and in their registers; velocities in (0, 1]", () => {
    for (const level of LEVELS)
      for (const b of [0, 1, 2, 3])
        for (const c of chords)
          for (const n of chords)
            for (const s of ALL) {
              const bass = bassHits(level, b, s, c, n);
              const all = [...drumHits(level, b, s), ...bass, ...compHits(level, s, c), ...fillAndBuild("build", 1, s, b, c), ...fillAndBuild("hit", 1, s, b, c)];
              for (const h of all) {
                expect(h.vel).toBeGreaterThan(0);
                expect(h.vel).toBeLessThanOrEqual(1);
                const approach =
                  h.voice === "BASS" && ((level === 4 && s === 15) || (level >= 2 && level <= 3 && s === 11 && n.root !== c.root));
                for (const f of h.freqs ?? (h.freq !== undefined ? [h.freq] : [])) {
                  if (approach) expect(pcOf(f)).toBe((n.root + 11) % 12);
                  else expect([level, b, c.id, s, h.voice, c.scale.includes(pcOf(f))]).toEqual([level, b, c.id, s, h.voice, true]);
                  if (h.voice === "BASS") {
                    expect(f).toBeGreaterThanOrEqual(freqOf(1, 0) - 1e-9);
                    expect(f).toBeLessThan(freqOf(3, 0) - 1e-9);
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
              }
              if (level === 4) expect(bass.length).toBe(1);
            }
  });
});
