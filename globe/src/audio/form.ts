import { CHORDS, type Chord, type ChordId } from "./harmony";
import type { Instrument, LegacyChord } from "./theory";

/** The four sections of the day (spec §4e): Istanbul local hour → tempo, swing, harmony, ensemble, density, reverb. */
export type SectionId = "NIGHT" | "MORNING" | "DAY" | "EVENING";

interface SectionBase {
  id: SectionId;
  /** reverb wet gain target */
  wet: number;
  /** cap of notes per instrument and grid slot */
  maxNotes: number;
  /** octave of the ney's home A (ladder base of the section's range) */
  neyOct: number;
  instruments: ReadonlySet<Instrument>;
}

/** v3 section: a continuous 16th-step clock (bar = 16 steps) over a jazz progression of `harmony.ts` chord ids. */
export interface Section extends SectionBase {
  bpm: number;
  /** delay of odd 16th steps as a fraction of a step */
  swing: number;
  progression: ChordId[];
  barsPerChord: number;
}

/** v2 section (§4c): beat clock over `LegacyChord`s. Legacy: the engine, score and ney/winds code until Task 13. */
export interface LegacySection extends SectionBase {
  bpm: number;
  progression: LegacyChord[];
  beatsPerChord: number;
}

// Legacy v2 chords as semitones above A, with their colour tones (the table header says "with colour tones").
const AM: LegacyChord = { name: "Am", root: 0, third: 3, fifth: 7, seventh: 10, ninth: 2 };
const AM_ADD9: LegacyChord = { name: "Am(add9)", root: 0, third: 3, fifth: 7, ninth: 2 };
const AM9: LegacyChord = { name: "Am9", root: 0, third: 3, fifth: 7, seventh: 10, ninth: 2 };
const F: LegacyChord = { name: "F", root: 8, third: 0, fifth: 3, seventh: 7 };
const FMAJ7: LegacyChord = { name: "Fmaj7", root: 8, third: 0, fifth: 3, seventh: 7 };
const C: LegacyChord = { name: "C", root: 3, third: 7, fifth: 10, seventh: 2 };
const G: LegacyChord = { name: "G", root: 10, third: 2, fifth: 5 };
const GSUS4: LegacyChord = { name: "Gsus4", root: 10, third: 3, fifth: 5 };
const DM: LegacyChord = { name: "Dm", root: 5, third: 8, fifth: 0, seventh: 3 };

const set = (...xs: Instrument[]): ReadonlySet<Instrument> => new Set(xs);
const NIGHT_INS: Instrument[] = ["NEY", "AME", "PNO", "DOM"];
const MORNING_INS: Instrument[] = [...NIGHT_INS, "EUR", "AFR", "ASI", "CLA"];

const BASE: Record<SectionId, SectionBase> = {
  NIGHT: { id: "NIGHT", wet: 0.45, maxNotes: 1, neyOct: 3, instruments: set(...NIGHT_INS) },
  MORNING: { id: "MORNING", wet: 0.35, maxNotes: 2, neyOct: 4, instruments: set(...MORNING_INS) },
  DAY: { id: "DAY", wet: 0.25, maxNotes: 2, neyOct: 4, instruments: set(...MORNING_INS, "MEA", "TPT") },
  EVENING: { id: "EVENING", wet: 0.4, maxNotes: 2, neyOct: 4, instruments: set("NEY", "AME", "PNO", "EUR", "MEA", "DOM", "CLA", "SAX") },
};

export const SECTIONS: Record<SectionId, Section> = {
  NIGHT: { ...BASE.NIGHT, bpm: 84, swing: 0.15, progression: ["Dm9", "Bbmaj7", "Gm9", "A7b9"], barsPerChord: 2 },
  MORNING: { ...BASE.MORNING, bpm: 100, swing: 0.12, progression: ["Dm9", "Bbmaj7", "Gm7", "A7b9", "Dm9", "Bbmaj7", "Em7b5", "A7b9"], barsPerChord: 1 },
  DAY: { ...BASE.DAY, bpm: 116, swing: 0.1, progression: ["Dm9", "Bbmaj7", "Gm9", "C7_9", "Fmaj7", "Bbmaj7", "Em7b5", "A7b9"], barsPerChord: 1 },
  EVENING: { ...BASE.EVENING, bpm: 92, swing: 0.12, progression: ["Fmaj7", "Gm9", "Em7b5", "A7b9", "Dm9", "Bbmaj7", "Gm9", "Dm9"], barsPerChord: 1 },
};

/** Legacy v2 sections (same ensembles, density, reverb and ney register as `SECTIONS`). Removed in Task 13. */
export const LEGACY_SECTIONS: Record<SectionId, LegacySection> = {
  NIGHT: { ...BASE.NIGHT, bpm: 72, progression: [AM_ADD9, AM9, FMAJ7, GSUS4], beatsPerChord: 8 },
  MORNING: { ...BASE.MORNING, bpm: 84, progression: [AM, F, C, G], beatsPerChord: 8 },
  DAY: { ...BASE.DAY, bpm: 96, progression: [C, G, AM, F], beatsPerChord: 8 },
  EVENING: { ...BASE.EVENING, bpm: 80, progression: [DM, AM, F, C, DM, F, G, AM], beatsPerChord: 8 },
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

/** Legacy v2 section of a local hour (the engine/score path until Task 13). */
export const legacySectionAt = (localHour: number): LegacySection => LEGACY_SECTIONS[sectionAt(localHour).id];
