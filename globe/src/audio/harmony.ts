import { freqOf } from "./theory";

/**
 * Music v3 harmony (spec §4e): jazz chords centred on D minor, each with its chord scale.
 * All values are pitch classes 0..11 relative to A (A = 0, D = 5, F = 8 …).
 */
export interface Chord {
  id: string;
  name: string;
  root: number;
  /** chord tones by position: root, 3rd, 5th, 7th, (9th) */
  tones: number[];
  /** the chord scale (seven pitch classes) every pitch is snapped into */
  scale: number[];
}

export type ChordId = "Dm9" | "Bbmaj7" | "Gm9" | "Gm7" | "A7b9" | "C7_9" | "Fmaj7" | "Em7b5";

const chord = (id: ChordId, name: string, tones: number[], scale: number[]): Chord => ({ id, name, root: tones[0], tones, scale });

export const CHORDS: Record<ChordId, Chord> = {
  Dm9: chord("Dm9", "Dm9", [5, 8, 0, 3, 7], [5, 7, 8, 10, 0, 2, 3]), // D dorian
  Bbmaj7: chord("Bbmaj7", "Bbmaj7", [1, 5, 8, 0], [1, 3, 5, 7, 8, 10, 0]), // Bb lydian
  Gm9: chord("Gm9", "Gm9", [10, 1, 5, 8, 0], [10, 0, 1, 3, 5, 7, 8]), // G dorian
  Gm7: chord("Gm7", "Gm7", [10, 1, 5, 8], [10, 0, 1, 3, 5, 7, 8]), // G dorian
  A7b9: chord("A7b9", "A7(b9)", [0, 4, 7, 10, 1], [0, 1, 4, 5, 7, 8, 10]), // A phrygian dominant
  C7_9: chord("C7_9", "C7(9)", [3, 7, 10, 1, 5], [3, 5, 7, 8, 10, 0, 1]), // C mixolydian
  Fmaj7: chord("Fmaj7", "Fmaj7", [8, 0, 3, 7], [8, 10, 0, 2, 3, 5, 7]), // F lydian
  Em7b5: chord("Em7b5", "Em7b5", [7, 10, 1, 5], [7, 8, 10, 0, 1, 3, 5]), // E locrian
};

const mod12 = (x: number): number => ((x % 12) + 12) % 12;

/** Ascending absolute semitones above A2 of the chord scale over octaves `lowOct..highOct` (12·(oct − 2) + pc). */
export function scaleLadder(c: Chord, lowOct = 3, highOct = 5): number[] {
  const out: number[] = [];
  for (let oct = lowOct; oct <= highOct; oct++) for (const p of c.scale) out.push(12 * (oct - 2) + p);
  return out.sort((a, b) => a - b);
}

/** The chord tone (any octave, absolute semitones) nearest to `semis`; ties go to the lower tone. */
export function snapToTones(semis: number, c: Chord): number {
  let best = NaN;
  let bestD = Infinity;
  for (const t of c.tones) {
    const below = semis - mod12(semis - t);
    for (const cand of [below, below + 12]) {
      const d = Math.abs(cand - semis);
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && cand < best)) {
        best = cand;
        bestD = d;
      }
    }
  }
  return best;
}

/** The pitch (absolute semitones) of the chord scale nearest to `semis`; ties go to the lower pitch. */
export function snapToScale(semis: number, c: Chord): number {
  for (let d = 0; d <= 6; d++) {
    if (c.scale.includes(mod12(semis - d))) return semis - d;
    if (c.scale.includes(mod12(semis + d))) return semis + d;
  }
  return semis;
}

/** Frequency of a ladder value (semitones above A2 = 110 Hz). */
export const ladderFreq = (semis: number): number => freqOf(2, semis);
