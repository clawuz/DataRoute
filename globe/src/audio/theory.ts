import { REGIONS } from "@web/data/palette";

export const BPM = 96;
export const BEAT_SEC = 60 / BPM;
export const BEATS_PER_CHORD = 8;

/** Semitones above A for each chord tone. */
export interface Chord {
  name: string;
  root: number;
  third: number;
  fifth: number;
}

export const PROGRESSION: Chord[] = [
  { name: "Am", root: 0, third: 3, fifth: 7 },
  { name: "F", root: 8, third: 0, fifth: 3 },
  { name: "C", root: 3, third: 7, fifth: 10 },
  { name: "G", root: 10, third: 2, fifth: 5 },
  { name: "Am", root: 0, third: 3, fifth: 7 },
  { name: "Dm", root: 5, third: 8, fifth: 0 },
  { name: "F", root: 8, third: 0, fifth: 3 },
  { name: "G", root: 10, third: 2, fifth: 5 },
];

export function chordAtBeat(beat: number): Chord {
  const i = Math.floor(Math.max(0, beat) / BEATS_PER_CHORD) % PROGRESSION.length;
  return PROGRESSION[i];
}
export const chordAtTime = (sec: number): Chord => chordAtBeat(Math.floor(sec / BEAT_SEC));

export type RegionName = (typeof REGIONS)[number];
export type Instrument = RegionName | "PNO" | "NEY";

export interface RegionMusic {
  /** semitones above A, all inside natural A minor */
  scale: number[];
  /** grid steps per beat (integer fractions of the beat keep the polyrhythm aligned) */
  perBeat: number;
  /** delay of odd steps as a fraction of a step */
  swing: number;
  /** [min, max] octave (110·2^(oct−2) Hz anchors A2); equal = fixed register */
  octaves: [number, number];
  followChord?: boolean;
  /** arpeggiates the current chord (piano) */
  arpeggio?: boolean;
  /** plays the fixed ney motif by time instead of picking by route */
  melody?: boolean;
}

export const INSTRUMENT_MUSIC: Partial<Record<Instrument, RegionMusic>> = {
  DOM: { scale: [], perBeat: 1, swing: 0, octaves: [1, 1], followChord: true },
  EUR: { scale: [0, 3, 5, 7, 10], perBeat: 2, swing: 0, octaves: [3, 5] },
  MEA: { scale: [0, 3, 5, 7, 8], perBeat: 2, swing: 0.25, octaves: [3, 4] },
  AFR: { scale: [0, 3, 5, 7, 10], perBeat: 3, swing: 0, octaves: [4, 5] },
  ASI: { scale: [0, 2, 3, 7, 8], perBeat: 4, swing: 0, octaves: [4, 5] },
  AME: { scale: [0, 5, 7, 10], perBeat: 0.5, swing: 0, octaves: [3, 3] },
  PNO: { scale: [], perBeat: 2, swing: 0, octaves: [3, 5], arpeggio: true },
  NEY: { scale: [], perBeat: 1, swing: 0, octaves: [4, 4], melody: true },
};
export const REGION_MUSIC = INSTRUMENT_MUSIC;

export const hasMusic = (i: Instrument): boolean => !!INSTRUMENT_MUSIC[i];

/** West and north Europe (piano): west of 20°E or north of 52°N. */
export const isWestNorth = (lat: number, lon: number): boolean => lon < 20 || lat > 52;

/** Semitones above A: A C B A E G A D. */
export const NEY_MOTIF = [0, 3, 2, 0, 7, 10, 0, 5];

export function routeKey(from: string | undefined, to: string | undefined, id: string): string {
  return from && to ? (from < to ? `${from}-${to}` : `${to}-${from}`) : id;
}

/** FNV-1a, 32-bit. */
export function routeHash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function octaveFor(distKm: number): 2 | 3 | 4 | 5 {
  if (distKm > 6000) return 2;
  if (distKm >= 3000) return 3;
  if (distKm >= 1000) return 4;
  return 5;
}

export const freqOf = (oct: number, semis: number): number => 110 * 2 ** (oct - 2) * 2 ** (semis / 12);

const mod12 = (x: number): number => ((x % 12) + 12) % 12;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Pitch class of the chord tone nearest (circular distance) to `semis`; ties go to the lower pitch class. */
export function snapToChord(semis: number, chord: Chord): number {
  const s = mod12(semis);
  let best = -1;
  let bestD = Infinity;
  for (const pc of [chord.root, chord.third, chord.fifth].map(mod12)) {
    const raw = Math.abs(pc - s);
    const d = Math.min(raw, 12 - raw);
    if (d < bestD || (d === bestD && pc < best)) {
      best = pc;
      bestD = d;
    }
  }
  return best;
}

export function neyNote(slot: number, beat: number, chord: Chord, kind: "dep" | "arr"): number {
  let semis = NEY_MOTIF[((slot % 8) + 8) % 8];
  if (beat % 4 === 0) semis = snapToChord(semis, chord);
  return freqOf(kind === "arr" ? 3 : 4, semis);
}

export function pianoNote(key: string, distKm: number, chord: Chord, kind: "dep" | "arr"): number {
  const tones = [chord.root, chord.third, chord.fifth, chord.root + 12];
  const oct = clamp(octaveFor(distKm), 3, 5);
  const f = freqOf(oct, tones[routeHash(key) % 4]);
  return kind === "arr" && f / 2 >= 55 ? f / 2 : f;
}

export function pickNote(instrument: Instrument, key: string, distKm: number, chord: Chord, beat: number, kind: "dep" | "arr"): number | null {
  const m = INSTRUMENT_MUSIC[instrument];
  if (!m || m.melody) return null;
  if (m.arpeggio) return pianoNote(key, distKm, chord, kind);
  if (m.followChord) return freqOf(m.octaves[0], kind === "arr" || beat % 2 !== 0 ? chord.fifth : chord.root);
  const oct = Math.min(m.octaves[1], Math.max(m.octaves[0], octaveFor(distKm)));
  const f = freqOf(oct, m.scale[routeHash(key) % m.scale.length]);
  return kind === "arr" && f / 2 >= 55 ? f / 2 : f;
}

export const stepSec = (region: Instrument): number => BEAT_SEC / (INSTRUMENT_MUSIC[region]?.perBeat ?? 1);
export const slotIndex = (sec: number, region: Instrument): number => Math.ceil(sec / stepSec(region) - 1e-9) + 0; // + 0 normalises -0
export function slotTime(region: Instrument, index: number): number {
  const step = stepSec(region);
  const swing = INSTRUMENT_MUSIC[region]?.swing ?? 0;
  return index * step + (index % 2 !== 0 ? swing * step : 0);
}
