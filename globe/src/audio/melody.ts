import { initialBearing } from "@collector/geo";
import type { LegacySection as Section } from "./form"; // v2 shape until Task 13
import { freqOf, type LegacyChord as Chord } from "./theory"; // v2 shape until Task 13

/** A-natural-minor degrees as semitones above A2, octaves 0–3 (28 entries); index = scale-degree index. */
const DEGREES = [0, 2, 3, 5, 7, 8, 10];
export const NEY_LADDER: number[] = [0, 1, 2, 3].flatMap((o) => DEGREES.map((d) => d + 12 * o));
const TOP = NEY_LADDER.length - 1;

/** A2 = 110 Hz. */
export const ladderFreq = (i: number): number => 110 * 2 ** (NEY_LADDER[i] / 12);

const mod12 = (x: number): number => ((x % 12) + 12) % 12;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
/** Reflects `x` back into [lo, hi] at the bounds (one bounce, then clamped for safety). */
const reflect = (x: number, lo: number, hi: number): number => clamp(x > hi ? 2 * hi - x : x < lo ? 2 * lo - x : x, lo, hi);

/** Ladder index whose pitch is nearest `freq` (used by the ney's grace note). */
export function ladderIndexOf(freq: number): number {
  const semis = 12 * Math.log2(freq / 110);
  let best = 0;
  for (let i = 1; i <= TOP; i++) if (Math.abs(NEY_LADDER[i] - semis) < Math.abs(NEY_LADDER[best] - semis)) best = i;
  return best;
}

export interface NeyState {
  /** ladder index of the last emitted ney note */
  last: number;
  /** cells played in the current phrase (0–3) */
  cell: number;
  /** the ney is silent while `beat < restUntilBeat` (cell in progress or the breath after a cadence) */
  restUntilBeat: number;
}

/** Ladder range [lo, hi] of a section: from its home A upwards. */
export function neyRange(sec: Section): [number, number] {
  const lo = clamp(7 * (sec.neyOct - 2), 0, TOP);
  return [lo, Math.min(TOP, lo + 11)];
}

export const initNey = (sec: Section): NeyState => ({ last: neyRange(sec)[0], cell: 0, restUntilBeat: 0 });

export const IST_LAT = 41.2613;
export const IST_LON = 28.742;
/** Initial great-circle bearing from Istanbul to the far end, degrees in [0, 360). */
export const bearingOf = (farLat: number, farLon: number): number => initialBearing(IST_LAT, IST_LON, farLat, farLon);

export type Contour = "up" | "down" | "arch";

/** Within 30° of due north or south → arch; eastward half → up; westward → down. */
export function contourFor(bearing: number): Contour {
  const b = ((bearing % 360) + 360) % 360;
  const off = (target: number) => {
    const d = Math.abs(b - target);
    return Math.min(d, 360 - d);
  };
  if (off(0) < 30 || off(180) < 30) return "arch";
  return b < 180 ? "up" : "down";
}

export const stepFor = (distKm: number): 1 | 2 | 3 => (distKm < 1500 ? 1 : distKm < 4000 ? 2 : 3);

export interface NeyNote {
  freq: number;
  /** ladder index the note was built from */
  idx: number;
  /** offset in NEY grid slots (eighth notes) from the cell's slot */
  slotOffset: number;
  vel: number;
  grace: boolean;
  long: boolean;
}

export interface NeyEvent {
  distKm: number;
  farLat?: number;
  farLon?: number;
  kind: "dep" | "arr";
}

const chordPcs = (c: Chord, all: boolean): number[] =>
  (all ? [c.root, c.third, c.fifth, c.seventh, c.ninth] : [c.root, c.fifth]).filter((x): x is number => x !== undefined).map(mod12);

/** Ladder index in [lo, hi] with a pitch class in `pcs` nearest to `target` (ties → lower), skipping `avoid`. */
function nearestTone(pcs: number[], target: number, lo: number, hi: number, avoid?: number): number {
  let best = -1;
  for (let i = lo; i <= hi; i++) {
    if (i === avoid || !pcs.includes(mod12(NEY_LADDER[i]))) continue;
    if (best < 0 || Math.abs(i - target) < Math.abs(best - target)) best = i;
  }
  return best < 0 ? clamp(target, lo, hi) : best;
}

const note = (idx: number, slotOffset: number, vel: number, grace = false, long = false): NeyNote => ({
  freq: ladderFreq(idx), idx, slotOffset, vel, grace, long,
});

/**
 * One Istanbul-end event → a three-note ney cell shaped by the route (bearing → contour, distance → step),
 * or, as the fourth cell of a phrase, a single long cadence note on the chord root/fifth followed by a breath.
 * Pure: the same event stream gives the same melody.
 */
export function neyCell(e: NeyEvent, st: NeyState, chord: Chord, beat: number, sec: Section): { notes: NeyNote[]; state: NeyState } {
  if (beat < st.restUntilBeat) return { notes: [], state: st };
  const [lo, hi] = neyRange(sec);
  if (st.cell === 3) {
    const idx = nearestTone(chordPcs(chord, false), st.last, lo, hi);
    return { notes: [note(idx, 0, 1.0, false, true)], state: { last: idx, cell: 0, restUntilBeat: beat + 2 } };
  }
  const arr = e.kind === "arr";
  const target = arr ? Math.max(lo, st.last - 7) : st.last;
  const n0 = nearestTone(chordPcs(chord, true), target, lo, hi, st.last);
  const bearing = Number.isFinite(e.farLat) && Number.isFinite(e.farLon) ? bearingOf(e.farLat!, e.farLon!) : 90;
  const step = stepFor(e.distKm);
  const dir = arr ? -1 : 1; // arrivals reverse the contour
  const contour = contourFor(bearing);
  let n1: number;
  let n2: number;
  if (contour === "arch") {
    n1 = reflect(n0 + dir * step, lo, hi);
    n2 = reflect(n0 - dir, lo, hi);
  } else {
    const s = (contour === "up" ? 1 : -1) * dir;
    n1 = reflect(n0 + s * step, lo, hi);
    n2 = reflect(n1 + (step >= 2 ? -s : s), lo, hi); // after a leap, one degree back
  }
  const notes = [note(n0, 0, 0.8, beat % 4 === 0), note(n1, 1, 0.9), note(n2, 2, 0.7)];
  // the cell spans three eighth notes (1.5 beats); the ney is monophonic, so the next cell waits two beats
  return { notes, state: { last: n2, cell: st.cell + 1, restUntilBeat: beat + 2 } };
}

export type Wind = "CLA" | "SAX" | "TPT";
export interface WindPart {
  instrument: Wind;
  freq: number;
  slotOffset: number;
  vel: number;
  long: boolean;
}

const windAt = (instrument: Wind, idx: number, slotOffset: number, vel: number, long: boolean): WindPart => {
  const i = reflect(idx, 0, TOP);
  return { instrument, freq: ladderFreq(i), slotOffset, vel, long };
};

/**
 * The wind ensemble derived from one ney cell or cadence: clarinet a diatonic third below each cell note,
 * saxophone a fifth below the cell's first note and the cadence, trumpet an octave above the cadence;
 * each only when the section's ensemble includes it. Phrase rests (empty cells) give no winds.
 */
export function windParts(cell: NeyNote[], _chord: Chord, sec: Section): WindPart[] {
  if (cell.length === 0) return [];
  const cadence = cell.length === 1 && cell[0].long;
  const has = (w: Wind) => sec.instruments.has(w);
  const out: WindPart[] = [];
  if (!cadence && has("CLA")) for (const n of cell) out.push(windAt("CLA", n.idx - 2, n.slotOffset, 0.7 * n.vel, false));
  if (has("SAX")) out.push(windAt("SAX", cell[0].idx - 4, cell[0].slotOffset, 0.6 * cell[0].vel, true));
  if (cadence && has("TPT")) out.push(windAt("TPT", cell[0].idx + 7, 0, 0.9 * cell[0].vel, true));
  return out;
}

export interface PianoState {
  /** position in the arpeggio pattern */
  i: number;
  /** chord (name + progression index) of the last piano note */
  chordKey: string;
}

export const initPiano = (): PianoState => ({ i: 0, chordKey: "" });

/** Flowing piano: root – fifth – third(+8ve) – fifth; the first event on a new chord rolls it open. */
export function pianoNext(
  st: PianoState, chord: Chord, chordKey: string, oct: number,
): { notes: { freq: number; offsetSec: number }[]; state: PianoState } {
  const o = clamp(oct, 3, 5);
  const pattern = [chord.root, chord.fifth, chord.third + 12, chord.fifth];
  if (chordKey !== st.chordKey) {
    const notes = pattern.slice(0, 3).map((t, k) => ({ freq: freqOf(o, t), offsetSec: 0.03 * k }));
    return { notes, state: { i: 3, chordKey } };
  }
  return { notes: [{ freq: freqOf(o, pattern[st.i % 4]), offsetSec: 0 }], state: { i: st.i + 1, chordKey } };
}
