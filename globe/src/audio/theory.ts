import { REGIONS } from "@web/data/palette";

export const BPM = 96;
export const BEAT_SEC = 60 / BPM;
export const BEATS_PER_CHORD = 16;

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
];

export function chordAtBeat(beat: number): Chord {
  const i = Math.floor(Math.max(0, beat) / BEATS_PER_CHORD) % PROGRESSION.length;
  return PROGRESSION[i];
}
export const chordAtTime = (sec: number): Chord => chordAtBeat(Math.floor(sec / BEAT_SEC));

export type RegionName = (typeof REGIONS)[number];

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
}

export const REGION_MUSIC: Partial<Record<RegionName, RegionMusic>> = {
  DOM: { scale: [], perBeat: 1, swing: 0, octaves: [1, 1], followChord: true },
  EUR: { scale: [0, 3, 5, 7, 10], perBeat: 2, swing: 0, octaves: [3, 5] },
  MEA: { scale: [0, 3, 5, 7, 8], perBeat: 2, swing: 0.25, octaves: [3, 4] },
  AFR: { scale: [0, 3, 5, 7, 10], perBeat: 3, swing: 0, octaves: [4, 5] },
  ASI: { scale: [0, 2, 3, 7, 8], perBeat: 4, swing: 0, octaves: [4, 5] },
  AME: { scale: [0, 5, 7, 10], perBeat: 0.5, swing: 0, octaves: [3, 3] },
};

export const hasMusic = (r: RegionName): boolean => !!REGION_MUSIC[r];

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

export function pickNote(region: RegionName, key: string, distKm: number, chord: Chord, beat: number, kind: "dep" | "arr"): number | null {
  const m = REGION_MUSIC[region];
  if (!m) return null;
  if (m.followChord) return freqOf(m.octaves[0], kind === "arr" || beat % 2 !== 0 ? chord.fifth : chord.root);
  const oct = Math.min(m.octaves[1], Math.max(m.octaves[0], octaveFor(distKm)));
  const f = freqOf(oct, m.scale[routeHash(key) % m.scale.length]);
  return kind === "arr" && f / 2 >= 55 ? f / 2 : f;
}

export const stepSec = (region: RegionName): number => BEAT_SEC / (REGION_MUSIC[region]?.perBeat ?? 1);
export const slotIndex = (sec: number, region: RegionName): number => Math.ceil(sec / stepSec(region) - 1e-9) + 0; // + 0 normalises -0
export function slotTime(region: RegionName, index: number): number {
  const step = stepSec(region);
  const swing = REGION_MUSIC[region]?.swing ?? 0;
  return index * step + (index % 2 !== 0 ? swing * step : 0);
}
