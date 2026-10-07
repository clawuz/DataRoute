import { REGIONS } from "@web/data/palette";

/**
 * v2 chord shape (semitones above A for each chord tone; `seventh`/`ninth` are optional colour tones).
 * Legacy: still used by the v2 engine, score and ney/winds code until Task 13 moves them to `harmony.ts`'s `Chord`.
 */
export interface LegacyChord {
  name: string;
  root: number;
  third: number;
  fifth: number;
  seventh?: number;
  ninth?: number;
}

export function chordAtBeat(beat: number, progression: LegacyChord[], beatsPerChord: number): LegacyChord {
  const i = Math.floor(Math.max(0, beat) / beatsPerChord) % progression.length;
  return progression[i];
}

export type RegionName = (typeof REGIONS)[number];
/** v3 adds the Rhodes (EP, domestic/unknown lines) and the groove voices (colours and scope lanes). */
export type Instrument =
  | RegionName | "PNO" | "NEY" | "CLA" | "SAX" | "TPT"
  | "EP" | "BASS" | "KICK" | "SNARE" | "HAT" | "OHAT" | "KEYS" | "BRASS" | "SAXPAD";

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
  /** driven by the Istanbul ney cell (`melody.ts`), never by `pickNote` */
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
  NEY: { scale: [], perBeat: 2, swing: 0, octaves: [3, 5], melody: true },
  CLA: { scale: [], perBeat: 2, swing: 0, octaves: [3, 4], melody: true },
  SAX: { scale: [], perBeat: 2, swing: 0, octaves: [2, 4], melody: true },
  TPT: { scale: [], perBeat: 2, swing: 0, octaves: [4, 5], melody: true },
};
export const REGION_MUSIC = INSTRUMENT_MUSIC;

/** Bjorklund: `k` onsets spread as evenly as possible over `n` steps, starting on an onset. */
export function euclid(k: number, n: number): boolean[] {
  if (n <= 0) return [];
  if (k <= 0) return Array(n).fill(false);
  if (k >= n) return Array(n).fill(true);
  let a: boolean[][] = Array.from({ length: k }, () => [true]);
  let b: boolean[][] = Array.from({ length: n - k }, () => [false]);
  while (b.length > 1) {
    const m = Math.min(a.length, b.length);
    const paired = a.slice(0, m).map((x, i) => [...x, ...b[i]]);
    const rest = a.length > m ? a.slice(m) : b.slice(m);
    a = paired;
    b = rest;
  }
  return [...a, ...b].flat();
}

export const PATTERNS: Partial<Record<Instrument, boolean[]>> = {
  DOM: euclid(2, 4),
  EUR: euclid(5, 8),
  MEA: euclid(3, 8),
  AFR: euclid(5, 12),
  ASI: euclid(5, 16),
  PNO: euclid(6, 8),
};

/** First slot index ≥ `slot` whose euclidean step is active; instruments without a pattern keep `slot`. */
export function nextActiveSlot(instrument: Instrument, slot: number): number {
  const p = PATTERNS[instrument];
  if (!p || !p.includes(true)) return slot;
  let s = slot;
  while (!p[((s % p.length) + p.length) % p.length]) s++;
  return s;
}

export const hasMusic = (i: Instrument): boolean => !!INSTRUMENT_MUSIC[i];

/** West and north Europe (piano): west of 20°E or north of 52°N. */
export const isWestNorth = (lat: number, lon: number): boolean => lon < 20 || lat > 52;

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

export function pickNote(instrument: Instrument, key: string, distKm: number, chord: LegacyChord, beat: number, kind: "dep" | "arr"): number | null {
  const m = INSTRUMENT_MUSIC[instrument];
  if (!m || m.melody || m.arpeggio) return null;
  if (m.followChord) return freqOf(m.octaves[0], kind === "arr" || beat % 2 !== 0 ? chord.fifth : chord.root);
  const oct = Math.min(m.octaves[1], Math.max(m.octaves[0], octaveFor(distKm)));
  const f = freqOf(oct, m.scale[routeHash(key) % m.scale.length]);
  return kind === "arr" && f / 2 >= 55 ? f / 2 : f;
}

export const stepSec = (inst: Instrument, bpm: number): number => 60 / bpm / (INSTRUMENT_MUSIC[inst]?.perBeat ?? 1);
/** First grid slot at or after `sec` (seconds since the section epoch). */
export const slotIndex = (sec: number, inst: Instrument, bpm: number): number => Math.ceil(sec / stepSec(inst, bpm) - 1e-9) + 0; // + 0 normalises -0
/** Seconds since the section epoch of grid slot `index` (odd steps delayed by the swing). */
export function slotTime(inst: Instrument, index: number, bpm: number): number {
  const step = stepSec(inst, bpm);
  const swing = INSTRUMENT_MUSIC[inst]?.swing ?? 0;
  return index * step + (index % 2 !== 0 ? swing * step : 0);
}
