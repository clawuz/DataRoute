import type { Chord, Instrument } from "./theory";

/** The four sections of the day (spec §4c): Istanbul local hour → tempo, harmony, ensemble, density, reverb. */
export type SectionId = "NIGHT" | "MORNING" | "DAY" | "EVENING";

export interface Section {
  id: SectionId;
  bpm: number;
  progression: Chord[];
  beatsPerChord: number;
  /** reverb wet gain target */
  wet: number;
  /** cap of notes per instrument and grid slot */
  maxNotes: number;
  /** octave of the ney's home A (ladder base of the section's range) */
  neyOct: number;
  instruments: ReadonlySet<Instrument>;
}

// Chords as semitones above A, with their colour tones (the table header says "with colour tones").
const AM: Chord = { name: "Am", root: 0, third: 3, fifth: 7, seventh: 10, ninth: 2 };
const AM_ADD9: Chord = { name: "Am(add9)", root: 0, third: 3, fifth: 7, ninth: 2 };
const AM9: Chord = { name: "Am9", root: 0, third: 3, fifth: 7, seventh: 10, ninth: 2 };
const F: Chord = { name: "F", root: 8, third: 0, fifth: 3, seventh: 7 };
const FMAJ7: Chord = { name: "Fmaj7", root: 8, third: 0, fifth: 3, seventh: 7 };
const C: Chord = { name: "C", root: 3, third: 7, fifth: 10, seventh: 2 };
const G: Chord = { name: "G", root: 10, third: 2, fifth: 5 };
const GSUS4: Chord = { name: "Gsus4", root: 10, third: 3, fifth: 5 };
const DM: Chord = { name: "Dm", root: 5, third: 8, fifth: 0, seventh: 3 };

const set = (...xs: Instrument[]): ReadonlySet<Instrument> => new Set(xs);
const NIGHT_INS: Instrument[] = ["NEY", "AME", "PNO", "DOM"];
const MORNING_INS: Instrument[] = [...NIGHT_INS, "EUR", "AFR", "ASI", "CLA"];

export const SECTIONS: Record<SectionId, Section> = {
  NIGHT: { id: "NIGHT", bpm: 72, progression: [AM_ADD9, AM9, FMAJ7, GSUS4], beatsPerChord: 8, wet: 0.45, maxNotes: 1, neyOct: 3, instruments: set(...NIGHT_INS) },
  MORNING: { id: "MORNING", bpm: 84, progression: [AM, F, C, G], beatsPerChord: 8, wet: 0.35, maxNotes: 2, neyOct: 4, instruments: set(...MORNING_INS) },
  DAY: { id: "DAY", bpm: 96, progression: [C, G, AM, F], beatsPerChord: 8, wet: 0.25, maxNotes: 2, neyOct: 4, instruments: set(...MORNING_INS, "MEA", "TPT") },
  EVENING: {
    id: "EVENING", bpm: 80, progression: [DM, AM, F, C, DM, F, G, AM], beatsPerChord: 8, wet: 0.4, maxNotes: 2, neyOct: 4,
    instruments: set("NEY", "AME", "PNO", "EUR", "MEA", "DOM", "CLA", "SAX"),
  },
};

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
