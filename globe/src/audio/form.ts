import { CHORDS, type Chord, type ChordId } from "./harmony";
import type { Instrument } from "./theory";

/** The four sections of the day (spec §4e): Istanbul local hour → tempo, swing, harmony, ensemble, reverb. */
export type SectionId = "NIGHT" | "MORNING" | "DAY" | "EVENING";

/** v3 section: a continuous 16th-step clock (bar = 16 steps) over a jazz progression of `harmony.ts` chord ids. */
export interface Section {
  id: SectionId;
  bpm: number;
  /** delay of odd 16th steps as a fraction of a step */
  swing: number;
  progression: ChordId[];
  barsPerChord: number;
  /** reverb wet gain target */
  wet: number;
  /** octave of the ney's home A (bottom of its window on the chord-scale ladder) */
  neyOct: number;
  /** the ney and the winds that join it (and the scope's lanes until the v3 panel) */
  instruments: ReadonlySet<Instrument>;
  /** v4 rhythm-level range `[min, max]` of the section (spec §4f) */
  levelRange: [number, number];
}

const set = (...xs: Instrument[]): ReadonlySet<Instrument> => new Set(xs);
const NIGHT_INS: Instrument[] = ["NEY", "AME", "PNO", "DOM"];
const MORNING_INS: Instrument[] = [...NIGHT_INS, "EUR", "AFR", "ASI", "CLA"];

export const SECTIONS: Record<SectionId, Section> = {
  NIGHT: {
    id: "NIGHT", bpm: 84, swing: 0.15, progression: ["Dm9", "Bbmaj7", "Gm9", "A7b9"], barsPerChord: 2,
    wet: 0.45, neyOct: 3, instruments: set(...NIGHT_INS), levelRange: [0, 1],
  },
  MORNING: {
    id: "MORNING", bpm: 100, swing: 0.12, progression: ["Dm9", "Bbmaj7", "Gm7", "A7b9", "Dm9", "Bbmaj7", "Em7b5", "A7b9"], barsPerChord: 1,
    wet: 0.35, neyOct: 4, instruments: set(...MORNING_INS), levelRange: [1, 3],
  },
  DAY: {
    id: "DAY", bpm: 116, swing: 0.1, progression: ["Dm9", "Bbmaj7", "Gm9", "C7_9", "Fmaj7", "Bbmaj7", "Em7b5", "A7b9"], barsPerChord: 1,
    wet: 0.25, neyOct: 4, instruments: set(...MORNING_INS, "MEA", "TPT"), levelRange: [2, 4],
  },
  EVENING: {
    id: "EVENING", bpm: 92, swing: 0.12, progression: ["Fmaj7", "Gm9", "Em7b5", "A7b9", "Dm9", "Bbmaj7", "Gm9", "Dm9"], barsPerChord: 1,
    wet: 0.4, neyOct: 4, instruments: set("NEY", "AME", "PNO", "EUR", "MEA", "DOM", "CLA", "SAX"), levelRange: [1, 3],
  },
};

/** Seconds per 16th step. */
export const stepDur = (sec: Section): number => 60 / sec.bpm / 4;

/** Swing: odd 16th steps are late by `swing · stepDur`. */
export const swingDelay = (step: number, sec: Section): number => (Math.abs(step) % 2 === 1 ? sec.swing * stepDur(sec) : 0);

/** Chord of a global 16th step (bar = 16 steps, `barsPerChord` bars a chord, looping; negative steps clamp to 0). */
export function chordAtStep(globalStep: number, sec: Section): Chord {
  const bar = Math.floor(Math.max(0, globalStep) / 16);
  return CHORDS[sec.progression[Math.floor(bar / sec.barsPerChord) % sec.progression.length]];
}

/** The chord one chord-length (16 · barsPerChord steps) after `globalStep`. */
export const nextChordAtStep = (globalStep: number, sec: Section): Chord => chordAtStep(Math.max(0, globalStep) + 16 * sec.barsPerChord, sec);

const mod = (x: number, m: number): number => ((x % m) + m) % m;

/** Istanbul local hour (UTC+3, no DST) in [0, 24) of an absolute Unix time. */
export const istanbulHour = (absUnixSec: number): number => mod(absUnixSec / 3600 + 3, 24);

export function sectionAt(localHour: number): Section {
  const h = mod(localHour, 24);
  if (h < 6) return SECTIONS.NIGHT;
  if (h < 12) return SECTIONS.MORNING;
  if (h < 18) return SECTIONS.DAY;
  return SECTIONS.EVENING;
}

/** Hours until the next section boundary (6, 12, 18, 24); exactly on a boundary → the full 6. */
export function hoursToBoundary(localHour: number): number {
  const h = mod(localHour, 24);
  return (Math.floor(h / 6) + 1) * 6 - h;
}
